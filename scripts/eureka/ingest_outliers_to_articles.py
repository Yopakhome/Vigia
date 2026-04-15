#!/usr/bin/env python3
"""Sprint A2 Fase 2D-outliers — 5 docs con hosts singleton.

Tratamiento: chunk único por doc ('Documento completo') con
article_number='DOC' y embedding del texto completo (truncado a 24k).

Cada outlier tiene su propio fetcher por la naturaleza distinta de cada URL:
  - un.org HTML (Declaración de Río 1992)  → BeautifulSoup body
  - un.org HTML (Declaración Estocolmo 1972) → BeautifulSoup body
  - un.org PDF directo (DRIPS Pueblos Indígenas) → pypdf
  - cancilleria.gov.co .htm (Directiva Pres 10/2013) → BeautifulSoup body
  - ica.gov.co .aspx (Res 1442/2008) → probablemente PDF, autodetectar Content-Type
"""
from __future__ import annotations
import argparse, json, math, os, re, sys, time
from io import BytesIO
from pathlib import Path
from typing import Any
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

METADATA_JSON = HERE / "metadata_full.json"
REPORT_JSON = HERE / "ingest_outliers_report.json"
PDF_CACHE = HERE / "samples" / "outliers"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
OPENAI_PRICE_PER_1M_TOKENS = 0.02

# Hosts a procesar y sus configuraciones
OUTLIER_HOSTS = ("un.org", "cancilleria.gov.co", "ica.gov.co")

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def sb_post(p, payload): return requests.post(f"{SUPABASE_URL}/rest/v1{p}", headers=REST_HEADERS, json=payload, timeout=60)
def sb_patch(p, params, payload): return requests.patch(f"{SUPABASE_URL}/rest/v1{p}", headers=REST_HEADERS, params=params, json=payload, timeout=30)


def load_norm_dict():
    out = {}; PAGE = 1000; start = 0
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+PAGE-1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/eureka_sources_metadata", headers=h,
                         params={"select": "source_id,metadata", "source_type": "eq.norma"}, timeout=30)
        r.raise_for_status(); rows = r.json()
        if not rows: break
        for row in rows:
            s = (row.get("metadata") or {}).get("slug")
            if s: out[s] = row["source_id"]
        if len(rows) < PAGE: break
        start += PAGE
    return out


def count_articles(nid):
    h = dict(REST_HEADERS); h["Prefer"] = "count=exact"; h["Range"] = "0-0"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_articles", headers=h,
                     params={"select": "id", "norm_id": f"eq.{nid}"}, timeout=30)
    r.raise_for_status()
    return int(r.headers.get("content-range", "0-0/0").split("/")[-1])


def fetch_text_smart(url: str) -> tuple[str, str]:
    """Devuelve (text, kind). kind='html'|'pdf'. Auto-detecta Content-Type
    o extensión. Para .aspx puede redirigir a PDF."""
    r = SESSION.get(url, timeout=60, allow_redirects=True)
    r.raise_for_status()
    ct = (r.headers.get("Content-Type") or "").lower()
    is_pdf = "pdf" in ct or url.lower().endswith(".pdf") or r.content[:5] == b"%PDF-"
    if is_pdf:
        reader = PdfReader(BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return text, "pdf"
    # HTML — usar charset reportado o utf-8 default
    soup = BeautifulSoup(r.text, "html.parser")
    container = soup.find("main") or soup.find("article") or soup.find("body") or soup
    return container.get_text(separator="\n", strip=True), "html"


def embed_one(text, *, dry_run):
    if dry_run:
        return None, max(1, min(len(text), EMBEDDING_MAX_CHARS_PRIMARY) // 4), None
    truncated = text[:EMBEDDING_MAX_CHARS_PRIMARY]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        return r.data[0].embedding, r.usage.total_tokens, None
    except BadRequestError as e:
        if "maximum context length" not in str(e).lower() and "token" not in str(e).lower():
            return None, 0, f"bad_request:{e}"
    except APIError as e: return None, 0, f"api:{e}"
    except Exception as e: return None, 0, f"unexpected:{type(e).__name__}:{e}"
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=text[:EMBEDDING_MAX_CHARS_RETRY])
        return r.data[0].embedding, r.usage.total_tokens, None
    except Exception as e:
        return None, 0, f"retry_failed:{e}"


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def insert_chunk(nid, text, embedding, *, dry_run, stats):
    """Inserta 1 chunk único 'Documento completo'."""
    row = {
        "norm_id": nid,
        "article_number": None,
        "article_label": "Documento completo",
        "title": None,
        "content": text,
        "content_tokens": math.ceil(len(text) / 4),
        "order_index": 1,
        "chapter": None,
        "section": None,
        "embedding": emb_lit(embedding),
        "embedding_model": EMBEDDING_MODEL if embedding is not None else None,
        "embedding_generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z") if embedding is not None else None,
    }
    if dry_run:
        stats["would_insert_articles"] += 1
        return
    try:
        r = sb_post("/normative_articles", [row])
        if r.status_code in (200, 201):
            stats["articles_inserted"] += 1
        else:
            stats["errors"].append({"stage": "insert", "norm_id": nid,
                                    "status": r.status_code, "error": r.text[:400]})
            stats["articles_insert_failed"] += 1
    except Exception as e:
        stats["errors"].append({"stage": "insert", "norm_id": nid, "error": str(e)})
        stats["articles_insert_failed"] += 1


def patch_norm(nid, *, dry_run, stats):
    patch = {"parser_quality": "manual_review_needed", "parser_method": "manual"}
    if dry_run: stats["would_patch_norms"] += 1; return
    try:
        r = sb_patch("/normative_sources", params={"id": f"eq.{nid}"}, payload=patch)
        if r.status_code in (200, 204): stats["norms_patched"] += 1
        else:
            stats["errors"].append({"stage": "patch", "norm_id": nid, "status": r.status_code, "error": r.text[:300]})
            stats["norms_patch_failed"] += 1
    except Exception as e:
        stats["errors"].append({"stage": "patch", "norm_id": nid, "error": str(e)})
        stats["norms_patch_failed"] += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    if args.dry_run: print("="*78); print("  DRY RUN ON"); print("="*78)
    else: print("="*78); print(f"  DRY RUN OFF — {SUPABASE_URL}"); print("="*78)

    data = json.loads(METADATA_JSON.read_text())
    candidates = []
    for r in data["records"]:
        host = (r.get("primary_source_host") or "").lower()
        # endswith para evitar substring matches falsos
        # (ej. "ica.gov.co" no debe matchear "funcionpublica.gov.co")
        if any(host == h or host.endswith("." + h) for h in OUTLIER_HOSTS):
            candidates.append(r)
    print(f"[info] Outliers (un.org + cancilleria + ica): {len(candidates)}")
    if args.limit: candidates = candidates[:args.limit]

    print("\n[pasada 0] Cargando {slug: norm_id}…")
    slug_map = load_norm_dict()
    print(f"  {len(slug_map)} normas EUREKA indexadas")

    resolved = []
    for r in candidates:
        nid = slug_map.get(r["slug"])
        if not nid: continue
        if not args.dry_run and count_articles(nid) > 0:
            print(f"  [skip] {r['slug'][:60]} — ya tiene artículos"); continue
        resolved.append({**r, "norm_id": nid})
    print(f"  resueltos: {len(resolved)}")

    stats = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "dry_run": args.dry_run,
             "total_candidates": len(candidates), "total_resolved": len(resolved),
             "fetch_failed": 0, "articles_inserted": 0, "articles_insert_failed": 0,
             "embeddings_generated": 0, "embeddings_failed": 0, "embedding_tokens_total": 0,
             "norms_patched": 0, "norms_patch_failed": 0, "errors": [],
             "would_insert_articles": 0, "would_patch_norms": 0, "per_doc": []}

    print(f"\n[pasada 1] Fetch + chunk único + embed + INSERT…")
    t0 = time.time()
    for idx, r in enumerate(resolved, 1):
        slug = r["slug"]; nid = r["norm_id"]; url = r["primary_source_url"]
        if idx > 1: time.sleep(FETCH_DELAY)
        print(f"  [{idx}/{len(resolved)}] {slug[:60]}")
        print(f"         URL: {url}")
        try:
            text, kind = fetch_text_smart(url)
        except Exception as e:
            stats["fetch_failed"] += 1
            stats["errors"].append({"stage": "fetch", "slug": slug, "url": url, "error": str(e)})
            print(f"         ERROR fetch: {e}"); continue

        if len(text) < 100:
            stats["errors"].append({"stage": "empty_text", "slug": slug, "kind": kind, "chars": len(text)})
            print(f"         ERROR: texto demasiado corto ({len(text)} chars, kind={kind})"); continue

        emb, tokens, err = embed_one(text, dry_run=args.dry_run)
        stats["embedding_tokens_total"] += tokens
        if err:
            stats["errors"].append({"stage": "embed", "slug": slug, "error": err})
            stats["embeddings_failed"] += 1
            print(f"         WARN embed: {err}")
        else:
            if emb is not None or args.dry_run:
                stats["embeddings_generated"] += 1
            else:
                stats["embeddings_failed"] += 1

        stats["per_doc"].append({"slug": slug, "url": url, "kind": kind, "chars": len(text), "tokens": tokens})
        print(f"         kind={kind} chars={len(text)} tokens={tokens}")
        insert_chunk(nid, text, emb, dry_run=args.dry_run, stats=stats)
        patch_norm(nid, dry_run=args.dry_run, stats=stats)

    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN FINAL"); print("="*78)
    for k in ["total_candidates","total_resolved","fetch_failed","articles_inserted",
              "embeddings_generated","norms_patched","embedding_tokens_total","elapsed_seconds"]:
        print(f"  {k}: {stats[k]}")
    print(f"  openai_cost_usd: ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  errores: {len(stats['errors'])}")
    print("="*78)
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try: sys.exit(main())
    except KeyboardInterrupt: print("\n[INTERRUMPIDO]"); sys.exit(130)
