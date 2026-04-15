#!/usr/bin/env python3
"""Sprint A2 Fase 2D-minambiente-pdf — ingesta de 5 resoluciones MinAmbiente
publicadas directamente como PDF en /wp-content/uploads/.

Flujo en 3 pasadas (equivalente a inline-anla, con download previo):
  Pasada 0 — Pre-carga {slug → normative_source.id}.
  Pasada 1 — Por cada doc: GET PDF (delay 2s) → pypdf extract → regex
    artículos con IGNORECASE → dedup → embed inline → INSERT + PATCH.

Flags: --dry-run, --limit N.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from pypdf import PdfReader

HERE = Path(__file__).parent
ENV_PATH = HERE / ".env.local"
load_dotenv(ENV_PATH)

REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
_missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
if _missing:
    sys.exit(f"[FATAL] Faltan env vars en {ENV_PATH}: {', '.join(_missing)}")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

from openai import OpenAI, BadRequestError, APIError  # noqa: E402
OPENAI_CLIENT = OpenAI()

METADATA_JSON = HERE / "metadata_full.json"
REPORT_JSON = HERE / "ingest_minambiente_report.json"
PDF_CACHE_DIR = HERE / "samples" / "minambiente"

USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
DOWNLOAD_DELAY = 2.0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
EMBEDDING_BATCH_SIZE = 100
OPENAI_PRICE_PER_1M_TOKENS = 0.02
ARTICLES_INSERT_BATCH = 200

REST_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


# ----- Supabase helpers -----
def sb_get(path: str, params=None):
    return requests.get(f"{SUPABASE_URL}/rest/v1{path}", headers=REST_HEADERS, params=params, timeout=30)

def sb_post(path: str, payload):
    return requests.post(f"{SUPABASE_URL}/rest/v1{path}", headers=REST_HEADERS, json=payload, timeout=60)

def sb_patch(path: str, params, payload):
    return requests.patch(f"{SUPABASE_URL}/rest/v1{path}", headers=REST_HEADERS, params=params, json=payload, timeout=30)


def load_eureka_norm_dict() -> dict[str, str]:
    out: dict[str, str] = {}
    PAGE = 1000
    start = 0
    while True:
        headers = dict(REST_HEADERS)
        headers["Range"] = f"{start}-{start + PAGE - 1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/eureka_sources_metadata",
                         headers=headers,
                         params={"select": "source_id,metadata", "source_type": "eq.norma"},
                         timeout=30)
        r.raise_for_status()
        rows = r.json()
        if not rows:
            break
        for row in rows:
            slug = (row.get("metadata") or {}).get("slug")
            if slug:
                out[slug] = row["source_id"]
        if len(rows) < PAGE:
            break
        start += PAGE
    return out


def count_existing_articles(norm_id: str) -> int:
    headers = dict(REST_HEADERS)
    headers["Prefer"] = "count=exact"
    headers["Range"] = "0-0"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_articles",
                     headers=headers,
                     params={"select": "id", "norm_id": f"eq.{norm_id}"},
                     timeout=30)
    r.raise_for_status()
    return int(r.headers.get("content-range", "0-0/0").split("/")[-1])


# ----- Parser (misma lógica que inline-anla + scraper SUIN) -----
ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)"
    r"[\s\u00A0]+(?:N[°º]?\s*)?"
    r"(\d{1,4}(?:\.\d+)*[A-Za-z]?)"
    r"[°º\.\s]",
    re.IGNORECASE | re.MULTILINE,
)
CHAPTER_RE = re.compile(
    r"\n\s*(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N)\s+[A-Z0-9IVXLCDM][^\n]{0,120}",
    re.IGNORECASE,
)


def parse_articles(text: str) -> list[dict]:
    norm = text.replace("\r", "").replace("\t", " ")
    chapters: list[tuple[int, str]] = []
    for m in CHAPTER_RE.finditer("\n" + norm):
        chapters.append((m.start(), m.group(0).strip()))

    def chapter_at(pos: int) -> str | None:
        last: str | None = None
        for idx, label in chapters:
            if idx < pos:
                last = label
            else:
                break
        return last

    matches: list[tuple[int, str, str]] = []
    for m in ARTICLE_RE.finditer(norm):
        idx = m.start() + len(m.group(1))
        label = f"{m.group(2).strip()} {m.group(3)}".strip()
        matches.append((idx, label, m.group(3)))
    if not matches:
        return []

    articles: list[dict] = []
    for i, (start, label, num) in enumerate(matches):
        end = matches[i + 1][0] if i + 1 < len(matches) else len(norm)
        chunk = norm[start:end].strip()
        first_nl = chunk.find("\n")
        first_line = (chunk[:first_nl] if first_nl > 0 else chunk[:200]).strip()
        after_label = re.sub(
            r"^(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?"
            r"\d{1,4}(?:\.\d+)*[A-Za-z]?[°º\.\s]*",
            "", first_line, flags=re.IGNORECASE,
        ).strip()
        title = after_label if (0 < len(after_label) < 160
                                and re.search(r"[.:]$", after_label)) else None
        if title:
            title = title.rstrip(".:").strip()
        articles.append({
            "article_number": num,
            "article_label": label,
            "title": title,
            "content": chunk,
            "chapter": chapter_at(start),
        })
    return articles


def dedup_articles(articles: list[dict]) -> list[dict]:
    by_key: dict[tuple[str, str | None], dict] = {}
    for a in articles:
        key = (a["article_number"], a["chapter"])
        existing = by_key.get(key)
        if existing is None or len(a["content"]) > len(existing["content"]):
            by_key[key] = a
    out = list(by_key.values())
    for i, a in enumerate(out, 1):
        a["order_index"] = i
        a["content_tokens"] = math.ceil(len(a["content"]) / 4)
    return out


def evaluate_parser_quality(text_len: int, n_articles: int, arts: list[dict]) -> str:
    if n_articles == 0:
        return "manual_review_needed"
    avg = sum(len(a["content"]) for a in arts) / max(n_articles, 1)
    if n_articles < 5 and text_len > 10_000:
        return "low"
    if avg > 5000:
        return "low"
    if 5 <= n_articles <= 500 and 150 <= avg <= 4000:
        return "high"
    return "medium"


# ----- PDF download + extract -----
def download_pdf(url: str, dest: Path) -> bytes:
    """Download con cache local (skip si ya existe)."""
    if dest.exists() and dest.stat().st_size > 500:
        return dest.read_bytes()
    r = SESSION.get(url, timeout=60, stream=True)
    r.raise_for_status()
    data = r.content
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data


def extract_pdf_text(data: bytes) -> tuple[str, int]:
    reader = PdfReader(BytesIO(data))
    pages = len(reader.pages)
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    return text, pages


# ----- Embeddings -----
def embed_texts_batch(texts, *, dry_run: bool):
    if dry_run:
        est = sum(max(1, min(len(t), EMBEDDING_MAX_CHARS_PRIMARY) // 4) for t in texts)
        return [None] * len(texts), est, None
    truncated = [t[:EMBEDDING_MAX_CHARS_PRIMARY] for t in texts]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        embs = [None] * len(texts)
        for d in r.data:
            embs[d.index] = d.embedding
        return embs, r.usage.total_tokens, None
    except BadRequestError as e:
        if "maximum context length" not in str(e).lower() and "token" not in str(e).lower():
            return [None] * len(texts), 0, f"openai_bad_request:{e}"
    except APIError as e:
        return [None] * len(texts), 0, f"openai_api_error:{e}"
    except Exception as e:
        return [None] * len(texts), 0, f"openai_unexpected:{type(e).__name__}:{e}"
    embs = []
    total_tokens = 0
    for t in texts:
        try:
            rr = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=t[:EMBEDDING_MAX_CHARS_RETRY])
            embs.append(rr.data[0].embedding)
            total_tokens += rr.usage.total_tokens
        except Exception:
            embs.append(None)
    return embs, total_tokens, None


def embedding_to_pgvector(emb):
    return None if emb is None else "[" + ",".join(f"{f:.7f}" for f in emb) + "]"


def embed_and_insert_articles(norm_id: str, articles: list[dict], *, dry_run: bool, stats: dict):
    if not articles:
        return
    embeddings_map: dict[int, list[float] | None] = {}
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    for i in range(0, len(articles), EMBEDDING_BATCH_SIZE):
        batch = articles[i:i + EMBEDDING_BATCH_SIZE]
        texts = [a["content"] or "" for a in batch]
        embs, tokens, err = embed_texts_batch(texts, dry_run=dry_run)
        stats["embedding_tokens_total"] += tokens
        if err:
            stats["errors"].append({"stage": "embed", "norm_id": norm_id, "error": err})
            for j in range(len(batch)):
                embeddings_map[i + j] = None
            stats["embeddings_failed"] += len(batch)
        else:
            for j, emb in enumerate(embs):
                embeddings_map[i + j] = emb
                if emb is None:
                    stats["embeddings_failed"] += 1
                else:
                    stats["embeddings_generated"] += 1
    if dry_run:
        stats["would_insert_articles"] += len(articles)
        return
    rows = []
    for idx, a in enumerate(articles):
        emb = embeddings_map.get(idx)
        rows.append({
            "norm_id": norm_id,
            "article_number": a.get("article_number"),
            "article_label": a.get("article_label"),
            "title": a.get("title"),
            "content": a["content"],
            "content_tokens": a.get("content_tokens"),
            "order_index": a["order_index"],
            "chapter": a.get("chapter"),
            "section": None,
            "embedding": embedding_to_pgvector(emb),
            "embedding_model": EMBEDDING_MODEL if emb is not None else None,
            "embedding_generated_at": now_iso if emb is not None else None,
        })
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i + ARTICLES_INSERT_BATCH]
        try:
            r = sb_post("/normative_articles", chunk)
            if r.status_code not in (200, 201):
                stats["errors"].append({"stage": "insert", "norm_id": norm_id,
                                        "status": r.status_code, "error": r.text[:400]})
                stats["articles_insert_failed"] += len(chunk)
            else:
                stats["articles_inserted"] += len(r.json())
        except Exception as e:
            stats["errors"].append({"stage": "insert", "norm_id": norm_id, "error": str(e)})
            stats["articles_insert_failed"] += len(chunk)


def update_norm_metadata(norm_id: str, pq: str, *, dry_run: bool, stats: dict):
    patch = {"parser_quality": pq, "parser_method": "regex",
             "issuing_body": "MINISTERIO DE AMBIENTE Y DESARROLLO SOSTENIBLE"}
    if dry_run:
        stats["would_patch_norms"] += 1
        return
    try:
        r = sb_patch("/normative_sources", params={"id": f"eq.{norm_id}"}, payload=patch)
        if r.status_code in (200, 204):
            stats["norms_patched"] += 1
        else:
            stats["errors"].append({"stage": "patch_norm", "norm_id": norm_id,
                                    "status": r.status_code, "error": r.text[:300]})
            stats["norms_patch_failed"] += 1
    except Exception as e:
        stats["errors"].append({"stage": "patch_norm", "norm_id": norm_id, "error": str(e)})
        stats["norms_patch_failed"] += 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingesta 5 PDFs MinAmbiente → normative_articles")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    if args.dry_run:
        print("=" * 78)
        print("  DRY RUN ON — NO Supabase, NO OpenAI")
        print("=" * 78)
    else:
        print("=" * 78)
        print("  DRY RUN OFF — modificación real en Supabase producción")
        print("  Proyecto:", SUPABASE_URL)
        print("=" * 78)

    data = json.loads(METADATA_JSON.read_text())
    candidates = [
        r for r in data["records"]
        if "minambiente.gov.co" in (r.get("primary_source_url") or "").lower()
        and (r["primary_source_url"].lower().endswith(".pdf")
             or "/wp-content/uploads/" in r["primary_source_url"].lower())
    ]
    print(f"[info] MinAmbiente PDFs directos identificados: {len(candidates)}")
    if args.limit:
        candidates = candidates[:args.limit]
    print(f"[info] {len(candidates)} docs a procesar")

    print("\n[pasada 0] Cargando {slug: norm_id}…")
    slug_to_nid = load_eureka_norm_dict()
    print(f"  {len(slug_to_nid)} normas EUREKA indexadas")

    resolved = []
    for r in candidates:
        nid = slug_to_nid.get(r["slug"])
        if not nid:
            continue
        if not args.dry_run and count_existing_articles(nid) > 0:
            print(f"  [skip] {r['slug'][:60]} — ya tiene artículos")
            continue
        resolved.append({**r, "norm_id": nid})
    print(f"  resueltos a procesar: {len(resolved)}")

    stats: dict[str, Any] = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "dry_run": args.dry_run,
        "total_candidates": len(candidates),
        "total_resolved": len(resolved),
        "articles_parsed_raw": 0,
        "articles_dedup": 0,
        "articles_inserted": 0,
        "articles_insert_failed": 0,
        "embeddings_generated": 0,
        "embeddings_failed": 0,
        "embedding_tokens_total": 0,
        "norms_patched": 0,
        "norms_patch_failed": 0,
        "download_failed": 0,
        "errors": [],
        "would_insert_articles": 0,
        "would_patch_norms": 0,
        "per_doc": [],
    }

    print(f"\n[pasada 1] Download + pypdf + regex + embed + INSERT (delay {DOWNLOAD_DELAY}s)…")
    t0 = time.time()
    for idx, r in enumerate(resolved, 1):
        slug = r["slug"]
        nid = r["norm_id"]
        url = r["primary_source_url"]
        pdf_name = url.rsplit("/", 1)[-1][:200]
        dest = PDF_CACHE_DIR / pdf_name
        if idx > 1:
            time.sleep(DOWNLOAD_DELAY)
        print(f"  [{idx}/{len(resolved)}] {slug[:60]}")
        print(f"         URL: {url}")
        try:
            data_bytes = download_pdf(url, dest)
            text, pages = extract_pdf_text(data_bytes)
        except Exception as e:
            stats["download_failed"] += 1
            stats["errors"].append({"stage": "download_or_pdf", "slug": slug, "error": str(e)})
            print(f"         ERROR: {e}")
            continue

        raw = parse_articles(text)
        arts = dedup_articles(raw)
        if not arts and len(text) >= 200:
            arts = [{
                "article_number": None, "article_label": "Documento completo",
                "title": None, "content": text, "chapter": None,
                "order_index": 1, "content_tokens": math.ceil(len(text) / 4),
            }]
        pq = evaluate_parser_quality(len(text), len(arts), arts) if arts else "manual_review_needed"
        stats["articles_parsed_raw"] += len(raw)
        stats["articles_dedup"] += len(arts)
        stats["per_doc"].append({"slug": slug, "pages": pages, "chars": len(text),
                                 "raw": len(raw), "final": len(arts), "quality": pq})
        print(f"         pages={pages} chars={len(text)} raw={len(raw)} final={len(arts)} q={pq}")

        embed_and_insert_articles(nid, arts, dry_run=args.dry_run, stats=stats)
        update_norm_metadata(nid, pq, dry_run=args.dry_run, stats=stats)

    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(
        stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6
    )
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "=" * 78)
    print("  RESUMEN FINAL")
    print("=" * 78)
    print(f"  candidates:              {stats['total_candidates']}")
    print(f"  resolved:                {stats['total_resolved']}")
    print(f"  download failed:         {stats['download_failed']}")
    print(f"  articles parsed (raw):   {stats['articles_parsed_raw']}")
    print(f"  articles dedup:          {stats['articles_dedup']}")
    if args.dry_run:
        print(f"  would insert articles:   {stats['would_insert_articles']}")
        print(f"  would patch norms:       {stats['would_patch_norms']}")
    else:
        print(f"  articles inserted:       {stats['articles_inserted']}")
        print(f"  embeddings generated:    {stats['embeddings_generated']}")
        print(f"  norms patched:           {stats['norms_patched']}")
    print(f"  embedding tokens:        {stats['embedding_tokens_total']:,}")
    print(f"  costo OpenAI estimado:   ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  errores:                 {len(stats['errors'])}")
    print(f"  elapsed:                 {stats['elapsed_seconds']}s")
    print(f"  reporte:                 {REPORT_JSON}")
    print("=" * 78)
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[INTERRUMPIDO]")
        sys.exit(130)
