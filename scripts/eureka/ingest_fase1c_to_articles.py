#!/usr/bin/env python3
"""Sprint A2 Fase 1C — ingesta de 33 docs EUREKA pendientes.

Categorías procesadas (confirmadas en recon_fase1c.json):
  - Procedimientos y Procesos        (3 items)
  - Manuales, Guías y Programas      (5 items)
  - Conceptos y Problemas Jurídicos  (7 items)
  - Documentos Estratégicos          (18 items)
Total: 33 items.

Flujo por cada doc:
  1. Fetch detail URL del recon → extraer primer inline PDF de ANLA.
  2. Si el item ya tiene PDF en recon.sample_probes, reutilizar.
     Si no, fetch detail y parsear <a href="/eureka/images/…pdf">.
  3. Download PDF → pypdf extract_text.
  4. INSERT en `normative_sources` con:
     - norm_type='otra'
     - corpus_source='fase1c'
     - issuing_body=ANLA (default)
     - summary con categoría + subcategoría EUREKA
     - source_url apuntando al PDF.
  5. Intentar regex de artículos (con fix SA-DEUDA-7 IGNORECASE); si
     <2 artículos → fallback a chunk único 'Documento completo'.
  6. Embed + INSERT en normative_articles.

Flags: --dry-run, --limit N.
"""
from __future__ import annotations
import argparse, json, math, os, re, sys, time
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
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

BASE = "https://www.anla.gov.co"
RECON_JSON = HERE / "recon_fase1c.json"
REPORT_JSON = HERE / "ingest_fase1c_report.json"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.5
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
EMBEDDING_BATCH_SIZE = 100
OPENAI_PRICE_PER_1M_TOKENS = 0.02
ARTICLES_INSERT_BATCH = 200

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "es-CO,es;q=0.9"})


def sb_post(p, payload): return requests.post(f"{SUPABASE_URL}/rest/v1{p}", headers=REST_HEADERS, json=payload, timeout=60)


def check_existing_source(slug):
    """Retorna id si existe normative_source con content_hash del slug fase1c."""
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                     headers=REST_HEADERS,
                     params={"select": "id", "content_hash": f"eq.fase1c:{slug}"}, timeout=30)
    if r.status_code == 200 and r.json(): return r.json()[0]["id"]
    return None


def infer_norm_number_year(slug, title):
    """Extrae un año del title/slug si hay (fase1c docs no tienen número canónico)."""
    m = re.search(r"\b(19|20)\d{2}\b", title or "")
    year = int(m.group(0)) if m else None
    return None, year


PDF_HREF_RE = re.compile(r"\.pdf(\?|$)", re.I)


def fetch_detail_pdf(detail_url):
    """Fetch detail HTML → primer PDF inline (de /eureka/images/ o anla.gov.co .pdf).
    Retorna (pdf_url, doc_title)."""
    r = SESSION.get(detail_url, timeout=60)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    main = (soup.find(attrs={"itemprop": "articleBody"})
            or soup.find("article") or soup.find("main") or soup)
    pdf_url = None
    for a in main.find_all("a", href=True):
        href = a["href"].strip()
        if not href: continue
        if href.startswith("/eureka/images/") or href.startswith("/images/"):
            pdf_url = BASE + href; break
        if href.startswith("http") and "anla.gov.co" in urlparse(href).netloc and PDF_HREF_RE.search(href):
            pdf_url = href; break
    doc_title = None
    for h in soup.find_all(["h1", "h2"]):
        t = h.get_text(strip=True)
        if t and "temas relacionados" not in t.lower() and "autoridad nacional" not in t.lower():
            doc_title = t; break
    return pdf_url, doc_title


def fetch_pdf_text(pdf_url):
    r = SESSION.get(pdf_url, timeout=120)
    r.raise_for_status()
    reader = PdfReader(BytesIO(r.content))
    return "\n".join((p.extract_text() or "") for p in reader.pages), len(reader.pages)


ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?(\d{1,4}(?:\.\d+)*[A-Za-z]?)[°º\.\s]",
    re.IGNORECASE | re.MULTILINE)


def parse_articles(text):
    norm = text.replace("\r", "").replace("\t", " ")
    matches = [(m.start() + len(m.group(1)), f"{m.group(2).strip()} {m.group(3)}".strip(), m.group(3))
               for m in ARTICLE_RE.finditer(norm)]
    if not matches: return []
    out = []
    for i, (s, label, num) in enumerate(matches):
        e = matches[i+1][0] if i+1 < len(matches) else len(norm)
        chunk = norm[s:e].strip()
        out.append({"article_number": num, "article_label": label,
                    "title": None, "content": chunk})
    return out


def dedup(arts):
    by = {}
    for a in arts:
        k = a["article_number"]
        if k not in by or len(a["content"]) > len(by[k]["content"]):
            by[k] = a
    out = list(by.values())
    for i, a in enumerate(out, 1):
        a["order_index"] = i
        a["content_tokens"] = math.ceil(len(a["content"]) / 4)
    return out


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


def insert_source(item, pdf_url, doc_title, pages, chars, *, dry_run, stats):
    """Inserta normative_sources. Retorna id o None."""
    _, year = infer_norm_number_year(item["slug"], doc_title or item.get("title"))
    title = (doc_title or item.get("title") or item["slug"]).strip()[:500]
    cat_name = item["_category_name"]
    subcat = item["subcategory_slug"]
    payload = {
        "norm_type": "otra",
        "norm_title": title,
        "norm_number": None,
        "norm_year": year,
        "issuing_body": "AUTORIDAD NACIONAL DE LICENCIAS AMBIENTALES (ANLA)",
        "source_url": pdf_url,
        "publication_source": f"EUREKA / {cat_name} / {subcat}",
        "summary": f"Documento EUREKA categoría '{cat_name}' subcategoría '{subcat}'. "
                   f"PDF {pages}pp, {chars} chars extraídos.",
        "status": "published",
        "corpus_source": "fase1c",
        "content_hash": f"fase1c:{item['slug']}",
        "parser_method": "regex",
    }
    if dry_run:
        stats["would_insert_sources"] += 1
        return "DRY-RUN-ID"
    try:
        r = sb_post("/normative_sources", [payload])
        if r.status_code in (200, 201):
            stats["sources_inserted"] += 1
            return r.json()[0]["id"]
        stats["errors"].append({"stage": "insert_source", "slug": item["slug"],
                                "status": r.status_code, "error": r.text[:400]})
        return None
    except Exception as e:
        stats["errors"].append({"stage": "insert_source", "slug": item["slug"], "error": str(e)})
        return None


def insert_articles(nid, arts, *, dry_run, stats):
    if not arts: return
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    emap = {}
    for i in range(0, len(arts), EMBEDDING_BATCH_SIZE):
        batch = arts[i:i+EMBEDDING_BATCH_SIZE]
        texts = [a["content"] for a in batch]
        embs, tokens, err = embed_batch(texts, dry_run=dry_run)
        stats["embedding_tokens_total"] += tokens
        if err:
            stats["errors"].append({"stage": "embed", "norm_id": nid, "error": err})
            for j in range(len(batch)): emap[i+j] = None
            stats["embeddings_failed"] += len(batch)
        else:
            for j, e in enumerate(embs):
                emap[i+j] = e
                if e is None: stats["embeddings_failed"] += 1
                else: stats["embeddings_generated"] += 1
    if dry_run:
        stats["would_insert_articles"] += len(arts); return
    rows = []
    for idx, a in enumerate(arts):
        e = emap.get(idx)
        rows.append({
            "norm_id": nid,
            "article_number": a.get("article_number"),
            "article_label": a.get("article_label"),
            "title": a.get("title"),
            "content": a["content"],
            "content_tokens": a.get("content_tokens"),
            "order_index": a["order_index"],
            "chapter": None, "section": None,
            "embedding": emb_lit(e),
            "embedding_model": EMBEDDING_MODEL if e is not None else None,
            "embedding_generated_at": now if e is not None else None,
        })
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i+ARTICLES_INSERT_BATCH]
        try:
            r = sb_post("/normative_articles", chunk)
            if r.status_code in (200, 201):
                stats["articles_inserted"] += len(r.json())
            else:
                stats["errors"].append({"stage": "insert_article", "norm_id": nid,
                                        "status": r.status_code, "error": r.text[:400]})
                stats["articles_insert_failed"] += len(chunk)
        except Exception as e:
            stats["errors"].append({"stage": "insert_article", "norm_id": nid, "error": str(e)})
            stats["articles_insert_failed"] += len(chunk)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    print("="*78); print(f"  {'DRY RUN ON' if args.dry_run else 'DRY RUN OFF — ' + SUPABASE_URL}"); print("="*78)

    recon = json.loads(RECON_JSON.read_text())
    items = []
    for cat in recon["categories"]:
        for it in cat.get("items", []):
            it = {**it, "_category_name": cat["category_name"],
                  "_category_path": cat["category_path"]}
            items.append(it)
    print(f"[info] items totales en recon: {len(items)}")
    if args.limit: items = items[:args.limit]

    stats = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "dry_run": args.dry_run,
             "total": len(items), "skipped_existing": 0,
             "fetch_failed": 0, "pdf_not_found": 0, "empty_pdf": 0,
             "sources_inserted": 0, "articles_inserted": 0,
             "articles_insert_failed": 0,
             "embeddings_generated": 0, "embeddings_failed": 0,
             "embedding_tokens_total": 0,
             "errors": [], "would_insert_sources": 0, "would_insert_articles": 0,
             "per_doc": []}

    print(f"\n[pasada 1] Fetch detail → PDF → parse → embed → INSERT (delay {FETCH_DELAY}s)…")
    t0 = time.time()
    for idx, it in enumerate(items, 1):
        slug = it["slug"]
        if idx > 1: time.sleep(FETCH_DELAY)
        print(f"  [{idx}/{len(items)}] {it['_category_path']} :: {slug[:55]}")

        if not args.dry_run:
            existing = check_existing_source(slug)
            if existing:
                stats["skipped_existing"] += 1
                print(f"         [skip] ya existe (id={existing[:8]}…)")
                continue

        try:
            pdf_url, doc_title = fetch_detail_pdf(it["url"])
        except Exception as e:
            stats["fetch_failed"] += 1
            stats["errors"].append({"stage": "fetch_detail", "slug": slug, "error": str(e)})
            print(f"         ERROR detail: {e}"); continue

        if not pdf_url:
            stats["pdf_not_found"] += 1
            stats["errors"].append({"stage": "no_pdf", "slug": slug, "detail_url": it["url"]})
            print(f"         WARN: no inline PDF encontrado"); continue

        time.sleep(1.0)
        try:
            text, pages = fetch_pdf_text(pdf_url)
        except Exception as e:
            stats["fetch_failed"] += 1
            stats["errors"].append({"stage": "fetch_pdf", "slug": slug, "pdf_url": pdf_url, "error": str(e)})
            print(f"         ERROR pdf: {e}"); continue

        if len(text) < 100:
            stats["empty_pdf"] += 1
            stats["errors"].append({"stage": "empty_pdf", "slug": slug,
                                    "pdf_url": pdf_url, "chars": len(text), "pages": pages})
            print(f"         WARN pdf vacío (chars={len(text)}, pages={pages})"); continue

        nid = insert_source(it, pdf_url, doc_title, pages, len(text),
                            dry_run=args.dry_run, stats=stats)
        if not nid:
            print(f"         ERROR insert_source"); continue

        raw = parse_articles(text)
        arts = dedup(raw)
        if len(arts) < 2:
            arts = [{"article_number": None, "article_label": "Documento completo",
                     "title": None, "content": text, "order_index": 1,
                     "content_tokens": math.ceil(len(text)/4)}]
            chunking = "fallback_doc_completo"
        else:
            chunking = f"{len(arts)}_articulos"

        stats["per_doc"].append({
            "slug": slug, "category": it["_category_path"],
            "subcat": it["subcategory_slug"],
            "pdf_url": pdf_url, "pages": pages, "chars": len(text),
            "chunking": chunking, "arts": len(arts),
        })
        print(f"         pdf={pages}pp chars={len(text)} chunking={chunking}")
        insert_articles(nid, arts, dry_run=args.dry_run, stats=stats)

    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN FASE 1C"); print("="*78)
    for k in ["total","skipped_existing","fetch_failed","pdf_not_found","empty_pdf",
              "sources_inserted","articles_inserted","embeddings_generated",
              "embedding_tokens_total","elapsed_seconds"]:
        print(f"  {k}: {stats[k]}")
    print(f"  openai_cost_usd: ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  errores: {len(stats['errors'])}")
    print("="*78)
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try: sys.exit(main())
    except KeyboardInterrupt: print("\n[INTERRUMPIDO]"); sys.exit(130)
