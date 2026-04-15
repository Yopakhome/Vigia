#!/usr/bin/env python3
"""Sprint A2 Fase 2D-inline-anla — ingesta de los 11 PDFs inline de ANLA
(ya descargados y parseados en Fase 1A) a `normative_articles` con
embedding inline.

Lee `scripts/eureka/parsed_data.json` (generado por parse_anla_pdfs.py
en Fase 1A commit 47b63e6), re-aplica el regex de artículos con
`re.IGNORECASE` (fix SA-DEUDA-7 aplicado localmente) al texto extraído
por pypdf, y ingesta los chunks con embedding OpenAI.

Alcance: SOLO los 10 docs con `has_text_layer=True` (char_count > 0).
Res 631/2015 (scan, 62 páginas sin capa de texto) se EXCLUYE — queda
como deuda pendiente de OCR.

Flujo en 3 pasadas (equivalente al scraper SUIN Opción C, pero sin
Pasada 1 de scraping porque el texto ya existe local):

  Pasada 0 — Pre-carga {slug → normative_source.id} desde Supabase.
  Pasada 1 — Re-parse artículos + embedding inline + INSERT a
    normative_articles (1 chunk fallback "Documento completo" si 0
    artículos detectados, aplicable a circulares/directivas/decisiones).
  Pasada 2 — UPDATE normative_sources con parser_quality + parser_method.

Flags:
  --dry-run    : no toca Supabase ni OpenAI
  --limit N    : procesa solo los primeros N docs
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

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

PARSED_DATA_JSON = HERE / "parsed_data.json"
REPORT_JSON = HERE / "ingest_inline_anla_report.json"

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
EMBEDDING_BATCH_SIZE = 100
OPENAI_PRICE_PER_1M_TOKENS = 0.02
ARTICLES_INSERT_BATCH = 200

REST_HEADERS_BASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ----------------------------------------------------------------------------
# Helpers red
# ----------------------------------------------------------------------------
def sb_get(path: str, params: dict[str, str] | None = None) -> requests.Response:
    return requests.get(f"{SUPABASE_URL}/rest/v1{path}",
                        headers=REST_HEADERS_BASE, params=params, timeout=30)


def sb_post(path: str, payload: Any) -> requests.Response:
    return requests.post(f"{SUPABASE_URL}/rest/v1{path}",
                         headers=REST_HEADERS_BASE, json=payload, timeout=60)


def sb_patch(path: str, params: dict[str, str], payload: Any) -> requests.Response:
    return requests.patch(f"{SUPABASE_URL}/rest/v1{path}",
                          headers=REST_HEADERS_BASE, params=params,
                          json=payload, timeout=30)


def load_eureka_norm_dict() -> dict[str, str]:
    """Pre-carga {slug: normative_source.id} para los 270 docs EUREKA."""
    out: dict[str, str] = {}
    PAGE = 1000
    start = 0
    while True:
        headers = dict(REST_HEADERS_BASE)
        headers["Range"] = f"{start}-{start + PAGE - 1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/eureka_sources_metadata",
                         headers=headers,
                         params={"select": "source_id,metadata",
                                 "source_type": "eq.norma"}, timeout=30)
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
    headers = dict(REST_HEADERS_BASE)
    headers["Prefer"] = "count=exact"
    headers["Range"] = "0-0"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_articles",
                     headers=headers,
                     params={"select": "id", "norm_id": f"eq.{norm_id}"},
                     timeout=30)
    r.raise_for_status()
    return int(r.headers.get("content-range", "0-0/0").split("/")[-1])


# ----------------------------------------------------------------------------
# Parser de artículos (fix SA-DEUDA-7: IGNORECASE aplicado)
# ----------------------------------------------------------------------------
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
        num = m.group(3)
        matches.append((idx, label, num))

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


def evaluate_parser_quality(text_len: int, n_articles: int,
                            arts: list[dict]) -> str:
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


# ----------------------------------------------------------------------------
# Embeddings
# ----------------------------------------------------------------------------
def embed_texts_batch(texts: list[str], *, dry_run: bool) -> tuple[list[list[float] | None], int, str | None]:
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

    # Retry 1×1 a 12k
    embs: list[list[float] | None] = []
    total_tokens = 0
    for t in texts:
        try:
            rr = OPENAI_CLIENT.embeddings.create(
                model=EMBEDDING_MODEL, input=t[:EMBEDDING_MAX_CHARS_RETRY])
            embs.append(rr.data[0].embedding)
            total_tokens += rr.usage.total_tokens
        except Exception:
            embs.append(None)
    return embs, total_tokens, None


def embedding_to_pgvector(embedding: list[float] | None) -> str | None:
    if embedding is None:
        return None
    return "[" + ",".join(f"{f:.7f}" for f in embedding) + "]"


# ----------------------------------------------------------------------------
# Pipeline por doc
# ----------------------------------------------------------------------------
def embed_and_insert_articles(norm_id: str, articles: list[dict], *,
                              dry_run: bool, stats: dict) -> None:
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
            stats["errors"].append({"stage": "embed_batch",
                                    "norm_id": norm_id,
                                    "batch_start": i, "error": err})
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
                stats["errors"].append({"stage": "insert_articles",
                                        "norm_id": norm_id,
                                        "chunk_start": i,
                                        "status": r.status_code,
                                        "error": r.text[:400]})
                stats["articles_insert_failed"] += len(chunk)
            else:
                stats["articles_inserted"] += len(r.json())
        except Exception as e:
            stats["errors"].append({"stage": "insert_articles",
                                    "norm_id": norm_id, "chunk_start": i,
                                    "error": str(e)})
            stats["articles_insert_failed"] += len(chunk)


def update_norm_metadata(norm_id: str, parser_quality: str, *,
                         dry_run: bool, stats: dict) -> None:
    patch = {"parser_quality": parser_quality, "parser_method": "regex"}
    if dry_run:
        stats["would_patch_norms"] += 1
        return
    try:
        r = sb_patch("/normative_sources", params={"id": f"eq.{norm_id}"},
                     payload=patch)
        if r.status_code in (200, 204):
            stats["norms_patched"] += 1
        else:
            stats["errors"].append({"stage": "patch_norm",
                                    "norm_id": norm_id,
                                    "status": r.status_code,
                                    "error": r.text[:300]})
            stats["norms_patch_failed"] += 1
    except Exception as e:
        stats["errors"].append({"stage": "patch_norm",
                                "norm_id": norm_id, "error": str(e)})
        stats["norms_patch_failed"] += 1


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(
        description="Ingesta 11 PDFs inline ANLA → normative_articles (Fase 2D-inline-anla)"
    )
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

    if not PARSED_DATA_JSON.exists():
        sys.exit(f"[FATAL] Falta {PARSED_DATA_JSON}. Fase 1A debería haberlo generado.")

    parsed = json.loads(PARSED_DATA_JSON.read_text())
    # Filtrar: excluir scans (char_count=0) y docs sin full_text
    candidates = [r for r in parsed if r.get("char_count", 0) > 0 and r.get("full_text")]
    excluded = [r for r in parsed if r.get("char_count", 0) == 0]
    print(f"[info] parsed_data.json: {len(parsed)} docs totales, "
          f"{len(candidates)} procesables, {len(excluded)} excluidos (scans)")
    for r in excluded:
        print(f"        excluido: {r['slug'][:70]} (char_count=0)")

    if args.limit:
        candidates = candidates[:args.limit]
    print(f"[info] {len(candidates)} docs a procesar en esta corrida")

    # Pasada 0
    print("\n[pasada 0] Cargando {slug: norm_id} desde Supabase…")
    slug_to_norm_id = load_eureka_norm_dict()
    print(f"  {len(slug_to_norm_id)} normas EUREKA indexadas")

    # Resolver + verificar idempotencia
    resolved = []
    unresolved = 0
    already_has_articles = 0
    for r in candidates:
        nid = slug_to_norm_id.get(r["slug"])
        if not nid:
            unresolved += 1
            continue
        if not args.dry_run:
            cnt = count_existing_articles(nid)
            if cnt > 0:
                print(f"  [skip] {r['slug'][:60]} — ya tiene {cnt} artículos")
                already_has_articles += 1
                continue
        resolved.append({**r, "norm_id": nid})
    print(f"  resueltos: {len(resolved)}, sin match: {unresolved}, "
          f"ya tenían articles: {already_has_articles}")

    stats: dict[str, Any] = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "dry_run": args.dry_run,
        "limit": args.limit,
        "total_candidates": len(candidates),
        "total_resolved": len(resolved),
        "excluded_scans": [r["slug"] for r in excluded],
        "already_have_articles": already_has_articles,
        "articles_parsed_total": 0,
        "articles_dedup_total": 0,
        "articles_inserted": 0,
        "articles_insert_failed": 0,
        "embeddings_generated": 0,
        "embeddings_failed": 0,
        "embedding_tokens_total": 0,
        "norms_patched": 0,
        "norms_patch_failed": 0,
        "errors": [],
        "would_insert_articles": 0,
        "would_patch_norms": 0,
        "per_doc": [],
    }

    # Pasada 1 — parse + embed + insert
    print("\n[pasada 1] Re-parse + embed inline + INSERT normative_articles…")
    t0 = time.time()
    for idx, r in enumerate(resolved, 1):
        slug = r["slug"]
        nid = r["norm_id"]
        text = r["full_text"] or ""
        raw = parse_articles(text)
        arts = dedup_articles(raw)

        # Fallback 1-chunk si 0 artículos detectados
        if not arts and len(text) >= 200:
            arts = [{
                "article_number": None,
                "article_label": "Documento completo",
                "title": None,
                "content": text,
                "chapter": None,
                "order_index": 1,
                "content_tokens": math.ceil(len(text) / 4),
            }]

        pq = evaluate_parser_quality(len(text), len(arts), arts) if arts else "manual_review_needed"
        stats["articles_parsed_total"] += len(raw)
        stats["articles_dedup_total"] += len(arts)
        stats["per_doc"].append({
            "slug": slug, "parse_quality": pq,
            "articles_raw": len(raw),
            "articles_final": len(arts),
        })
        print(f"  [{idx}/{len(resolved)}] {slug[:60]}  "
              f"raw={len(raw)} final={len(arts)} q={pq}")
        embed_and_insert_articles(nid, arts, dry_run=args.dry_run, stats=stats)

        # Pasada 2 — UPDATE normative_sources (inline, una por doc)
        update_norm_metadata(nid, pq, dry_run=args.dry_run, stats=stats)

    elapsed = round(time.time() - t0, 1)
    stats["elapsed_seconds"] = elapsed
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(
        stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6
    )

    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "=" * 78)
    print("  RESUMEN FINAL")
    print("=" * 78)
    print(f"  candidates:              {stats['total_candidates']}")
    print(f"  excluded scans:          {len(stats['excluded_scans'])}")
    print(f"  already had articles:    {stats['already_have_articles']}")
    print(f"  resolved to process:     {stats['total_resolved']}")
    print(f"  articles parsed (raw):   {stats['articles_parsed_total']}")
    print(f"  articles dedup (final):  {stats['articles_dedup_total']}")
    if args.dry_run:
        print(f"  would insert articles:   {stats['would_insert_articles']}")
        print(f"  would patch norms:       {stats['would_patch_norms']}")
    else:
        print(f"  articles inserted:       {stats['articles_inserted']}")
        print(f"  articles failed:         {stats['articles_insert_failed']}")
        print(f"  embeddings generated:    {stats['embeddings_generated']}")
        print(f"  embeddings failed:       {stats['embeddings_failed']}")
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
