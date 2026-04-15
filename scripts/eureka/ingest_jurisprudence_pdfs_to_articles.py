#!/usr/bin/env python3
"""Sprint A2 Fase 2D-jur-pdfs — ingesta de 4 sentencias no-Corte Constitucional
con fuente PDF accesible. Las 5 non-Corte están catalogadas en
corpus_gaps.json sección jurisprudence_non_corte; 1 queda fuera (STC-3872/2020,
URL es nota de prensa, no la sentencia).

Docs procesados (jur_id ya existente en jurisprudence_sources):
  - CE-2007-00383 — Consejo de Estado — anla.gov.co/eureka/images PDF
  - CE-2019-00262 — Consejo de Estado — anla.gov.co/eureka/images PDF
  - STC-4360/2018 — Corte Suprema — sinchi.org.co PDF
  - T-038/2019    — Tribunal Superior Medellín — anla.gov.co/eureka/images PDF

Flujo por doc:
  1. Download PDF → pypdf.
  2. Intentar split semántico SECTION_RE (igual que scraper Corte);
     si no hay secciones → chunk único 'Documento completo'.
  3. Embed + INSERT en jurisprudence_articles.
"""
from __future__ import annotations
import argparse, json, math, os, re, sys, time
from io import BytesIO
from pathlib import Path
import requests
from dotenv import load_dotenv
from pypdf import PdfReader

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
if any(not os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY")):
    sys.exit("[FATAL] env vars missing")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
from openai import OpenAI, BadRequestError, APIError  # noqa: E402
OPENAI_CLIENT = OpenAI()

REPORT_JSON = HERE / "ingest_jurisprudence_pdfs_report.json"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.5
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
OPENAI_PRICE_PER_1M_TOKENS = 0.02

# Radicados objetivo (4 viables). Filtra desde jurisprudence_sources.
TARGET_RADICADOS = ("CE-2007-00383", "CE-2019-00262", "STC-4360/2018", "T-038/2019")

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def sb_post(p, payload): return requests.post(f"{SUPABASE_URL}/rest/v1{p}", headers=REST_HEADERS, json=payload, timeout=60)


def load_targets():
    params = {"select": "id,slug,radicado,corte,primary_source_url",
              "radicado": f"in.({','.join(TARGET_RADICADOS)})"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_sources",
                     headers=REST_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def count_articles(jid):
    h = dict(REST_HEADERS); h["Prefer"] = "count=exact"; h["Range"] = "0-0"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_articles", headers=h,
                     params={"select": "id", "jur_id": f"eq.{jid}"}, timeout=30)
    r.raise_for_status()
    return int(r.headers.get("content-range", "0-0/0").split("/")[-1])


SECTION_RE = re.compile(
    r'\n\s*(?:(?:I{1,3}V?|IV|V|VI{1,3})\.?\s+)?'
    r'(ANTECEDENTES|'
    r'CONSIDERACIONES\s+DE\s+LA\s+CORTE|CONSIDERACIONES\s+Y\s+FUNDAMENTOS|CONSIDERACIONES|'
    r'FUNDAMENTOS\s+DE\s+LA\s+DECISI[ÓO]N|FUNDAMENTOS|'
    r'DECISI[ÓO]N|RESUELVE|'
    r'HECHOS)\s*\n',
    re.IGNORECASE
)


def classify_key(header):
    h = header.upper()
    if "HECHO" in h or "ANTECEDENTE" in h: return "antecedentes", "Antecedentes / Hechos"
    if "FUNDAMENTO" in h or "CONSIDERA" in h: return "considerandos", "Considerandos / Fundamentos"
    if "DECISI" in h or "RESUELVE" in h: return "decision", "Decisión / Resuelve"
    return "otros", header.strip().title()


def split_sections(text):
    matches = list(SECTION_RE.finditer(text))
    if not matches:
        return [{
            "section_key": "documento_completo",
            "section_label": "Documento completo",
            "content": text, "order_index": 1,
        }]
    chunks = []
    preamble = text[:matches[0].start()].strip()
    if len(preamble) >= 200:
        chunks.append({"section_key": "preambulo", "section_label": "Preámbulo / Encabezado",
                       "content": preamble, "order_index": 1})
    groups = {}
    for i, m in enumerate(matches):
        key, _ = classify_key(m.group(1))
        start = m.start(); end = matches[i+1].start() if i+1 < len(matches) else len(text)
        groups.setdefault(key, []).append(text[start:end].strip())
    order = ["preambulo", "antecedentes", "considerandos", "decision", "otros"]
    idx = len(chunks) + 1
    labels = {"antecedentes": "Antecedentes / Hechos",
              "considerandos": "Considerandos / Fundamentos",
              "decision": "Decisión / Resuelve", "otros": "Otros"}
    for k in order:
        if k == "preambulo" or k not in groups: continue
        merged = "\n\n".join(groups[k]).strip()
        if len(merged) < 100: continue
        chunks.append({"section_key": k, "section_label": labels[k],
                       "content": merged, "order_index": idx})
        idx += 1
    return chunks


def fetch_pdf_text(url):
    r = SESSION.get(url, timeout=120, allow_redirects=True)
    r.raise_for_status()
    reader = PdfReader(BytesIO(r.content))
    return "\n".join((p.extract_text() or "") for p in reader.pages), len(reader.pages)


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


def insert_chunks(jid, chunks, *, dry_run, stats):
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    texts = [c["content"] for c in chunks]
    embs, tokens, err = embed_batch(texts, dry_run=dry_run)
    stats["embedding_tokens_total"] += tokens
    if err:
        stats["errors"].append({"stage": "embed", "jur_id": jid, "error": err})
        for _ in chunks: stats["embeddings_failed"] += 1
        embs = [None]*len(chunks)
    else:
        for e in embs:
            if e is None: stats["embeddings_failed"] += 1
            else: stats["embeddings_generated"] += 1
    if dry_run:
        stats["would_insert_articles"] += len(chunks); return
    rows = []
    for c, e in zip(chunks, embs):
        rows.append({
            "jur_id": jid, "section_key": c["section_key"],
            "section_label": c["section_label"], "title": None,
            "content": c["content"],
            "content_tokens": math.ceil(len(c["content"])/4),
            "order_index": c["order_index"],
            "embedding": emb_lit(e),
            "embedding_model": EMBEDDING_MODEL if e is not None else None,
            "embedding_generated_at": now if e is not None else None,
        })
    try:
        r = sb_post("/jurisprudence_articles", rows)
        if r.status_code in (200, 201):
            stats["articles_inserted"] += len(r.json())
        else:
            stats["errors"].append({"stage": "insert", "jur_id": jid,
                                    "status": r.status_code, "error": r.text[:400]})
            stats["articles_insert_failed"] += len(rows)
    except Exception as e:
        stats["errors"].append({"stage": "insert", "jur_id": jid, "error": str(e)})
        stats["articles_insert_failed"] += len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    print("="*78); print(f"  {'DRY RUN ON' if args.dry_run else 'DRY RUN OFF — ' + SUPABASE_URL}"); print("="*78)

    targets = load_targets()
    print(f"[info] sentencias resueltas: {len(targets)}/{len(TARGET_RADICADOS)}")
    for t in targets: print(f"  - {t['radicado']} | {t['corte']} | {t['primary_source_url']}")

    stats = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "dry_run": args.dry_run,
             "total": len(targets), "skipped_existing": 0, "fetch_failed": 0,
             "empty_pdf": 0, "chunks_created": 0,
             "articles_inserted": 0, "articles_insert_failed": 0,
             "embeddings_generated": 0, "embeddings_failed": 0,
             "embedding_tokens_total": 0,
             "errors": [], "would_insert_articles": 0, "per_doc": []}

    print(f"\n[pasada 1] Download PDF → split → embed → INSERT (delay {FETCH_DELAY}s)")
    t0 = time.time()
    for idx, t in enumerate(targets, 1):
        jid = t["id"]; rad = t["radicado"]; url = t["primary_source_url"]
        if idx > 1: time.sleep(FETCH_DELAY)
        print(f"  [{idx}/{len(targets)}] {rad}")
        print(f"         URL: {url}")
        if not args.dry_run and count_articles(jid) > 0:
            stats["skipped_existing"] += 1
            print(f"         [skip] ya tiene artículos"); continue

        try:
            text, pages = fetch_pdf_text(url)
        except Exception as e:
            stats["fetch_failed"] += 1
            stats["errors"].append({"stage": "fetch", "radicado": rad, "url": url, "error": str(e)})
            print(f"         ERROR fetch: {e}"); continue

        if len(text) < 200:
            stats["empty_pdf"] += 1
            stats["errors"].append({"stage": "empty", "radicado": rad, "pages": pages, "chars": len(text)})
            print(f"         WARN pdf vacío ({len(text)} chars, {pages} pp)"); continue

        chunks = split_sections(text)
        stats["chunks_created"] += len(chunks)
        stats["per_doc"].append({
            "radicado": rad, "corte": t["corte"], "url": url,
            "pages": pages, "chars": len(text),
            "chunks": len(chunks),
            "sections": [c["section_key"] for c in chunks],
        })
        print(f"         pages={pages} chars={len(text)} chunks={len(chunks)} "
              f"keys={[c['section_key'] for c in chunks]}")
        insert_chunks(jid, chunks, dry_run=args.dry_run, stats=stats)

    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN"); print("="*78)
    for k in ["total","skipped_existing","fetch_failed","empty_pdf","chunks_created",
              "articles_inserted","embeddings_generated","embedding_tokens_total","elapsed_seconds"]:
        print(f"  {k}: {stats[k]}")
    print(f"  openai_cost_usd: ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  errores: {len(stats['errors'])}")
    print("="*78)
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try: sys.exit(main())
    except KeyboardInterrupt: print("\n[INTERRUMPIDO]"); sys.exit(130)
