#!/usr/bin/env python3
"""Sprint A2 Fase 2D-jur — ingesta de sentencias Corte Constitucional.

Estrategia:
  - Solo procesa hosts www.corteconstitucional.gov.co (114 docs) + suin (1).
  - Fetch HTML (charset windows-1252), extrae body.
  - Split por secciones semánticas: preamble + ANTECEDENTES +
    CONSIDERACIONES/FUNDAMENTOS + DECISIÓN/RESUELVE.
  - Si no hay secciones → chunk único "Documento completo".
  - Embedding text-embedding-3-small con truncación 24k → 12k.
  - Inserta en jurisprudence_articles con jur_id FK → jurisprudence_sources.

Non-Corte docs (sinchi, cortesuprema, sin URL) van a corpus_gaps.
"""
from __future__ import annotations
import argparse, json, math, os, re, sys, time
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
if any(not os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY")):
    sys.exit("[FATAL] env vars missing")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
from openai import OpenAI, BadRequestError, APIError  # noqa: E402
OPENAI_CLIENT = OpenAI()

REPORT_JSON = HERE / "ingest_jurisprudence_report.json"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
EMBEDDING_BATCH_SIZE = 100
OPENAI_PRICE_PER_1M_TOKENS = 0.02
ARTICLES_INSERT_BATCH = 200

TARGET_HOSTS = ("www.corteconstitucional.gov.co", "www.suin-juriscol.gov.co")

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def sb_get(p, params=None): return requests.get(f"{SUPABASE_URL}/rest/v1{p}", headers=REST_HEADERS, params=params, timeout=30)
def sb_post(p, payload): return requests.post(f"{SUPABASE_URL}/rest/v1{p}", headers=REST_HEADERS, json=payload, timeout=60)


def load_candidates():
    out = []; PAGE = 1000; start = 0
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+PAGE-1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_sources", headers=h,
                         params={"select": "id,slug,radicado,corte,primary_source_url,primary_source_host"},
                         timeout=30)
        r.raise_for_status(); rows = r.json()
        if not rows: break
        out.extend(rows)
        if len(rows) < PAGE: break
        start += PAGE
    return out


def count_articles(jid):
    h = dict(REST_HEADERS); h["Prefer"] = "count=exact"; h["Range"] = "0-0"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_articles", headers=h,
                     params={"select": "id", "jur_id": f"eq.{jid}"}, timeout=30)
    r.raise_for_status()
    return int(r.headers.get("content-range", "0-0/0").split("/")[-1])


SECTION_RE = re.compile(
    r'\n\s*(?:(?:I{1,3}V?|IV|V|VI{1,3})\.?\s+)?'
    r'(ANTECEDENTES|'
    r'CONSIDERACIONES\s+DE\s+LA\s+CORTE|'
    r'CONSIDERACIONES\s+Y\s+FUNDAMENTOS|'
    r'CONSIDERACIONES|'
    r'FUNDAMENTOS\s+DE\s+LA\s+DECISI[ÓO]N|'
    r'FUNDAMENTOS|'
    r'DECISI[ÓO]N|'
    r'RESUELVE)\s*\n',
    re.IGNORECASE
)


def classify(header: str) -> tuple[str, str]:
    """(section_key, section_label). key = antecedentes|considerandos|decision."""
    h = header.upper()
    if "ANTECEDENTES" in h:
        return "antecedentes", "Antecedentes"
    if "FUNDAMENTO" in h or "CONSIDERA" in h:
        return "considerandos", "Considerandos / Fundamentos"
    if "DECISI" in h or "RESUELVE" in h:
        return "decision", "Decisión / Resuelve"
    return "otros", header.strip().title()


def split_sections(text: str) -> list[dict]:
    """Devuelve lista de dicts con section_key, section_label, content, order_index."""
    matches = list(SECTION_RE.finditer(text))
    if not matches:
        return [{
            "section_key": "documento_completo",
            "section_label": "Documento completo",
            "content": text,
            "order_index": 1,
        }]

    chunks = []
    # Preamble = 0 → primer match
    first = matches[0].start()
    preamble = text[:first].strip()
    if len(preamble) >= 200:
        chunks.append({
            "section_key": "preambulo",
            "section_label": "Preámbulo / Síntesis",
            "content": preamble,
            "order_index": 1,
        })

    # Agrupar matches por section_key (puede haber múltiples headers)
    # Estrategia: cada match inicia un chunk hasta el siguiente match
    groups: dict[str, list[str]] = {}
    order_keys = ["preambulo", "antecedentes", "considerandos", "decision", "otros"]

    for i, m in enumerate(matches):
        key, label = classify(m.group(1))
        start = m.start()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        body = text[start:end].strip()
        groups.setdefault(key, []).append(body)

    # Merge por key en orden canónico
    idx = len(chunks) + 1
    for k in order_keys:
        if k == "preambulo": continue
        if k not in groups: continue
        merged = "\n\n".join(groups[k]).strip()
        if len(merged) < 100: continue
        key_labels = {
            "antecedentes": "Antecedentes",
            "considerandos": "Considerandos / Fundamentos",
            "decision": "Decisión / Resuelve",
            "otros": "Otros",
        }
        chunks.append({
            "section_key": k,
            "section_label": key_labels[k],
            "content": merged,
            "order_index": idx,
        })
        idx += 1

    return chunks


def fetch_html_text(url: str, retries: int = 2) -> str:
    last_exc = None
    for attempt in range(retries + 1):
        try:
            r = SESSION.get(url, timeout=180, allow_redirects=True)
            r.raise_for_status()
            break
        except (requests.ConnectionError, requests.Timeout) as e:
            last_exc = e
            if attempt < retries:
                time.sleep(15 * (attempt + 1))
            else:
                raise
    # Auto-detect charset from meta/header
    raw = r.content
    ct = (r.headers.get("Content-Type") or "").lower()
    enc = None
    m = re.search(rb'charset=[\"\']?([a-zA-Z0-9-]+)', raw[:3000])
    if m:
        enc = m.group(1).decode("ascii", "ignore").lower()
    elif "charset=" in ct:
        enc = ct.split("charset=")[1].split(";")[0].strip()
    for try_enc in (enc, "windows-1252", "utf-8", "latin-1"):
        if not try_enc: continue
        try:
            text = raw.decode(try_enc)
            break
        except Exception:
            continue
    else:
        text = raw.decode("latin-1", errors="replace")
    soup = BeautifulSoup(text, "html.parser")
    body = soup.find("body") or soup
    return body.get_text(separator="\n", strip=True)


def embed_batch(texts, *, dry_run):
    if dry_run:
        return [None]*len(texts), sum(max(1, min(len(t), EMBEDDING_MAX_CHARS_PRIMARY)//4) for t in texts), None
    truncated = [t[:EMBEDDING_MAX_CHARS_PRIMARY] for t in texts]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        embs = [None]*len(texts)
        for d in r.data: embs[d.index] = d.embedding
        return embs, r.usage.total_tokens, None
    except BadRequestError as e:
        if "maximum context length" not in str(e).lower() and "token" not in str(e).lower():
            return [None]*len(texts), 0, f"bad_request:{e}"
    except APIError as e: return [None]*len(texts), 0, f"api:{e}"
    except Exception as e: return [None]*len(texts), 0, f"unexpected:{type(e).__name__}:{e}"
    embs = []; total = 0
    for t in texts:
        try:
            rr = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=t[:EMBEDDING_MAX_CHARS_RETRY])
            embs.append(rr.data[0].embedding); total += rr.usage.total_tokens
        except Exception: embs.append(None)
    return embs, total, None


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def embed_insert(jid, chunks, *, dry_run, stats):
    if not chunks: return
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    emap: dict[int, list[float] | None] = {}
    for i in range(0, len(chunks), EMBEDDING_BATCH_SIZE):
        batch = chunks[i:i+EMBEDDING_BATCH_SIZE]
        texts = [c["content"] or "" for c in batch]
        embs, tokens, err = embed_batch(texts, dry_run=dry_run)
        stats["embedding_tokens_total"] += tokens
        if err:
            stats["errors"].append({"stage": "embed", "jur_id": jid, "error": err})
            for j in range(len(batch)): emap[i+j] = None
            stats["embeddings_failed"] += len(batch)
        else:
            for j, e in enumerate(embs):
                emap[i+j] = e
                if e is None: stats["embeddings_failed"] += 1
                else: stats["embeddings_generated"] += 1
    if dry_run:
        stats["would_insert_articles"] += len(chunks); return
    rows = []
    for idx, c in enumerate(chunks):
        e = emap.get(idx)
        rows.append({
            "jur_id": jid,
            "section_key": c["section_key"],
            "section_label": c["section_label"],
            "title": None,
            "content": c["content"],
            "content_tokens": math.ceil(len(c["content"]) / 4),
            "order_index": c["order_index"],
            "embedding": emb_lit(e),
            "embedding_model": EMBEDDING_MODEL if e is not None else None,
            "embedding_generated_at": now if e is not None else None,
        })
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i+ARTICLES_INSERT_BATCH]
        try:
            r = sb_post("/jurisprudence_articles", chunk)
            if r.status_code not in (200, 201):
                stats["errors"].append({"stage": "insert", "jur_id": jid,
                                        "status": r.status_code, "error": r.text[:400]})
                stats["articles_insert_failed"] += len(chunk)
            else:
                stats["articles_inserted"] += len(r.json())
        except Exception as e:
            stats["errors"].append({"stage": "insert", "jur_id": jid, "error": str(e)})
            stats["articles_insert_failed"] += len(chunk)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--only-missing", action="store_true", default=True)
    args = ap.parse_args()
    if args.dry_run: print("="*78); print("  DRY RUN ON"); print("="*78)
    else: print("="*78); print(f"  DRY RUN OFF — {SUPABASE_URL}"); print("="*78)

    all_rows = load_candidates()
    print(f"[info] jurisprudence_sources total: {len(all_rows)}")
    candidates = [r for r in all_rows
                  if (r.get("primary_source_host") or "").lower() in TARGET_HOSTS
                  and r.get("primary_source_url")]
    print(f"[info] con URL en hosts permitidos: {len(candidates)}")
    if args.limit: candidates = candidates[:args.limit]

    resolved = []
    for r in candidates:
        jid = r["id"]
        if args.only_missing and not args.dry_run and count_articles(jid) > 0:
            continue
        resolved.append(r)
    print(f"  resueltos (sin artículos): {len(resolved)}")

    stats = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "dry_run": args.dry_run,
             "total_candidates": len(candidates), "total_resolved": len(resolved),
             "fetch_failed": 0, "chunks_created": 0,
             "articles_inserted": 0, "articles_insert_failed": 0,
             "embeddings_generated": 0, "embeddings_failed": 0, "embedding_tokens_total": 0,
             "errors": [], "would_insert_articles": 0, "per_doc": []}

    print(f"\n[pasada 1] Fetch HTML + split + embed + INSERT (delay {FETCH_DELAY}s)…")
    t0 = time.time()
    for idx, r in enumerate(resolved, 1):
        slug = r["slug"]; jid = r["id"]; url = r["primary_source_url"]; rad = r["radicado"]
        if idx > 1: time.sleep(FETCH_DELAY)
        print(f"  [{idx}/{len(resolved)}] {rad} — {slug[:60]}")
        print(f"         URL: {url}")
        try:
            text = fetch_html_text(url)
        except Exception as e:
            stats["fetch_failed"] += 1
            stats["errors"].append({"stage": "fetch", "slug": slug, "url": url, "error": str(e)})
            print(f"         ERROR fetch: {e}"); continue

        if len(text) < 200:
            stats["errors"].append({"stage": "empty", "slug": slug, "chars": len(text)})
            print(f"         ERROR: texto corto ({len(text)})"); continue

        chunks = split_sections(text)
        stats["chunks_created"] += len(chunks)
        stats["per_doc"].append({
            "slug": slug, "radicado": rad, "chars": len(text),
            "chunks": len(chunks),
            "sections": [c["section_key"] for c in chunks],
        })
        print(f"         chars={len(text)} chunks={len(chunks)} "
              f"keys={[c['section_key'] for c in chunks]}")
        embed_insert(jid, chunks, dry_run=args.dry_run, stats=stats)

    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN FINAL"); print("="*78)
    for k in ["total_candidates","total_resolved","fetch_failed","chunks_created",
              "articles_inserted","embeddings_generated","embedding_tokens_total","elapsed_seconds"]:
        print(f"  {k}: {stats[k]}")
    print(f"  openai_cost_usd: ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  errores: {len(stats['errors'])}")
    print("="*78)
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try: sys.exit(main())
    except KeyboardInterrupt: print("\n[INTERRUMPIDO]"); sys.exit(130)
