#!/usr/bin/env python3
"""Sprint A2 Fase 2D-sisjur — ingesta de 3 docs con articulado HTML
embebido en backend "Norma1.jsp" (alcaldiabogota.gov.co + sisjur.bogotajuridica.gov.co).

Hosts cubiertos:
  - www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=X
  - sisjur.bogotajuridica.gov.co/sisjur/normas/Norma1.jsp?i=X

Ambos usan `<div class="container container-norma">` como wrapper del doc,
con articulado en texto plano + charset Windows-1252.

Flujo:
  Pasada 0 — {slug: norm_id}
  Pasada 1 — GET HTML → extract body → regex artículos IGNORECASE →
    dedup → embed inline → INSERT
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
from bs4 import BeautifulSoup
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")

REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
if any(not os.environ.get(k) for k in REQUIRED_ENV):
    sys.exit(f"[FATAL] Faltan env vars en {HERE / '.env.local'}")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

from openai import OpenAI, BadRequestError, APIError  # noqa: E402
OPENAI_CLIENT = OpenAI()

METADATA_JSON = HERE / "metadata_full.json"
REPORT_JSON = HERE / "ingest_sisjur_report.json"

USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.0
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


def sb_get(path, params=None):
    return requests.get(f"{SUPABASE_URL}/rest/v1{path}", headers=REST_HEADERS, params=params, timeout=30)

def sb_post(path, payload):
    return requests.post(f"{SUPABASE_URL}/rest/v1{path}", headers=REST_HEADERS, json=payload, timeout=60)

def sb_patch(path, params, payload):
    return requests.patch(f"{SUPABASE_URL}/rest/v1{path}", headers=REST_HEADERS, params=params, json=payload, timeout=30)


def load_eureka_norm_dict():
    out = {}; PAGE = 1000; start = 0
    while True:
        headers = dict(REST_HEADERS); headers["Range"] = f"{start}-{start + PAGE - 1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/eureka_sources_metadata", headers=headers,
                         params={"select": "source_id,metadata", "source_type": "eq.norma"}, timeout=30)
        r.raise_for_status(); rows = r.json()
        if not rows: break
        for row in rows:
            s = (row.get("metadata") or {}).get("slug")
            if s: out[s] = row["source_id"]
        if len(rows) < PAGE: break
        start += PAGE
    return out


def count_existing_articles(nid):
    headers = dict(REST_HEADERS); headers["Prefer"] = "count=exact"; headers["Range"] = "0-0"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_articles", headers=headers,
                     params={"select": "id", "norm_id": f"eq.{nid}"}, timeout=30)
    r.raise_for_status()
    return int(r.headers.get("content-range", "0-0/0").split("/")[-1])


ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?(\d{1,4}(?:\.\d+)*[A-Za-z]?)[°º\.\s]",
    re.IGNORECASE | re.MULTILINE,
)
CHAPTER_RE = re.compile(
    r"\n\s*(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N)\s+[A-Z0-9IVXLCDM][^\n]{0,120}",
    re.IGNORECASE,
)


def parse_articles(text):
    norm = text.replace("\r", "").replace("\t", " ")
    chapters = []
    for m in CHAPTER_RE.finditer("\n" + norm):
        chapters.append((m.start(), m.group(0).strip()))

    def chap_at(pos):
        last = None
        for idx, label in chapters:
            if idx < pos: last = label
            else: break
        return last

    matches = [(m.start() + len(m.group(1)), f"{m.group(2).strip()} {m.group(3)}".strip(), m.group(3))
               for m in ARTICLE_RE.finditer(norm)]
    if not matches: return []
    out = []
    for i, (s, label, num) in enumerate(matches):
        e = matches[i+1][0] if i+1 < len(matches) else len(norm)
        chunk = norm[s:e].strip()
        first_nl = chunk.find("\n")
        first_line = (chunk[:first_nl] if first_nl > 0 else chunk[:200]).strip()
        after = re.sub(r"^(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?\d{1,4}(?:\.\d+)*[A-Za-z]?[°º\.\s]*",
                       "", first_line, flags=re.IGNORECASE).strip()
        title = after if (0 < len(after) < 160 and re.search(r"[.:]$", after)) else None
        if title: title = title.rstrip(".:").strip()
        out.append({"article_number": num, "article_label": label, "title": title,
                    "content": chunk, "chapter": chap_at(s)})
    return out


def dedup(arts):
    by_key = {}
    for a in arts:
        k = (a["article_number"], a["chapter"])
        if k not in by_key or len(a["content"]) > len(by_key[k]["content"]):
            by_key[k] = a
    out = list(by_key.values())
    for i, a in enumerate(out, 1):
        a["order_index"] = i
        a["content_tokens"] = math.ceil(len(a["content"]) / 4)
    return out


def quality(tlen, n, arts):
    if n == 0: return "manual_review_needed"
    avg = sum(len(a["content"]) for a in arts) / max(n, 1)
    if n < 5 and tlen > 10_000: return "low"
    if avg > 5000: return "low"
    if 5 <= n <= 500 and 150 <= avg <= 4000: return "high"
    return "medium"


def fetch_body_text(url: str) -> str:
    r = SESSION.get(url, timeout=60)
    r.raise_for_status()
    # Sisjur usa Windows-1252, forzar
    r.encoding = "windows-1252"
    soup = BeautifulSoup(r.text, "html.parser")
    container = soup.select_one("div.container-norma") or soup.find("body") or soup
    return container.get_text(separator="\n", strip=True)


def embed_texts_batch(texts, *, dry_run):
    if dry_run:
        est = sum(max(1, min(len(t), EMBEDDING_MAX_CHARS_PRIMARY) // 4) for t in texts)
        return [None] * len(texts), est, None
    truncated = [t[:EMBEDDING_MAX_CHARS_PRIMARY] for t in texts]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        embs = [None] * len(texts)
        for d in r.data: embs[d.index] = d.embedding
        return embs, r.usage.total_tokens, None
    except BadRequestError as e:
        if "maximum context length" not in str(e).lower() and "token" not in str(e).lower():
            return [None] * len(texts), 0, f"bad_request:{e}"
    except APIError as e:
        return [None] * len(texts), 0, f"api:{e}"
    except Exception as e:
        return [None] * len(texts), 0, f"unexpected:{type(e).__name__}:{e}"
    embs = []; total = 0
    for t in texts:
        try:
            rr = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=t[:EMBEDDING_MAX_CHARS_RETRY])
            embs.append(rr.data[0].embedding); total += rr.usage.total_tokens
        except Exception:
            embs.append(None)
    return embs, total, None


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def embed_insert(nid, arts, *, dry_run, stats):
    if not arts: return
    emap = {}; now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    for i in range(0, len(arts), EMBEDDING_BATCH_SIZE):
        batch = arts[i:i+EMBEDDING_BATCH_SIZE]
        texts = [a["content"] or "" for a in batch]
        embs, tokens, err = embed_texts_batch(texts, dry_run=dry_run)
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
        rows.append({"norm_id": nid, "article_number": a.get("article_number"),
                     "article_label": a.get("article_label"), "title": a.get("title"),
                     "content": a["content"], "content_tokens": a.get("content_tokens"),
                     "order_index": a["order_index"], "chapter": a.get("chapter"),
                     "section": None, "embedding": emb_lit(e),
                     "embedding_model": EMBEDDING_MODEL if e is not None else None,
                     "embedding_generated_at": now if e is not None else None})
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i+ARTICLES_INSERT_BATCH]
        try:
            r = sb_post("/normative_articles", chunk)
            if r.status_code not in (200, 201):
                stats["errors"].append({"stage": "insert", "norm_id": nid,
                                        "status": r.status_code, "error": r.text[:400]})
                stats["articles_insert_failed"] += len(chunk)
            else:
                stats["articles_inserted"] += len(r.json())
        except Exception as e:
            stats["errors"].append({"stage": "insert", "norm_id": nid, "error": str(e)})
            stats["articles_insert_failed"] += len(chunk)


def patch_norm(nid, pq, *, dry_run, stats):
    patch = {"parser_quality": pq, "parser_method": "regex"}
    if dry_run:
        stats["would_patch_norms"] += 1; return
    try:
        r = sb_patch("/normative_sources", params={"id": f"eq.{nid}"}, payload=patch)
        if r.status_code in (200, 204): stats["norms_patched"] += 1
        else:
            stats["errors"].append({"stage": "patch", "norm_id": nid,
                                    "status": r.status_code, "error": r.text[:300]})
            stats["norms_patch_failed"] += 1
    except Exception as e:
        stats["errors"].append({"stage": "patch", "norm_id": nid, "error": str(e)})
        stats["norms_patch_failed"] += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    if args.dry_run:
        print("=" * 78); print("  DRY RUN ON"); print("=" * 78)
    else:
        print("=" * 78); print(f"  DRY RUN OFF — {SUPABASE_URL}"); print("=" * 78)

    data = json.loads(METADATA_JSON.read_text())
    candidates = [
        r for r in data["records"]
        if "sisjur" in (r.get("primary_source_url") or "").lower()
        and "Norma1.jsp" in (r.get("primary_source_url") or "")
    ]
    print(f"[info] Docs sisjur Norma1.jsp: {len(candidates)}")
    if args.limit: candidates = candidates[:args.limit]

    print("\n[pasada 0] Cargando {slug: norm_id}…")
    slug_map = load_eureka_norm_dict()
    print(f"  {len(slug_map)} normas EUREKA indexadas")

    resolved = []
    for r in candidates:
        nid = slug_map.get(r["slug"])
        if not nid: continue
        if not args.dry_run and count_existing_articles(nid) > 0:
            print(f"  [skip] {r['slug'][:60]} — ya tiene artículos"); continue
        resolved.append({**r, "norm_id": nid})
    print(f"  resueltos: {len(resolved)}")

    stats = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "dry_run": args.dry_run,
        "total_candidates": len(candidates),
        "total_resolved": len(resolved),
        "fetch_failed": 0,
        "articles_parsed_raw": 0,
        "articles_dedup": 0,
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

    print(f"\n[pasada 1] Fetch sisjur HTML + regex + embed + INSERT (delay {FETCH_DELAY}s)…")
    t0 = time.time()
    for idx, r in enumerate(resolved, 1):
        slug = r["slug"]; nid = r["norm_id"]; url = r["primary_source_url"]
        if idx > 1: time.sleep(FETCH_DELAY)
        print(f"  [{idx}/{len(resolved)}] {slug[:60]}")
        print(f"         URL: {url}")
        try:
            text = fetch_body_text(url)
        except Exception as e:
            stats["fetch_failed"] += 1
            stats["errors"].append({"stage": "fetch", "slug": slug, "error": str(e)})
            print(f"         ERROR fetch: {e}"); continue

        raw = parse_articles(text)
        arts = dedup(raw)
        if not arts and len(text) >= 200:
            arts = [{"article_number": None, "article_label": "Documento completo",
                     "title": None, "content": text, "chapter": None,
                     "order_index": 1, "content_tokens": math.ceil(len(text) / 4)}]
        pq = quality(len(text), len(arts), arts) if arts else "manual_review_needed"
        stats["articles_parsed_raw"] += len(raw); stats["articles_dedup"] += len(arts)
        stats["per_doc"].append({"slug": slug, "chars": len(text),
                                 "raw": len(raw), "final": len(arts), "quality": pq})
        print(f"         chars={len(text)} raw={len(raw)} final={len(arts)} q={pq}")
        embed_insert(nid, arts, dry_run=args.dry_run, stats=stats)
        patch_norm(nid, pq, dry_run=args.dry_run, stats=stats)

    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(
        stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "=" * 78); print("  RESUMEN FINAL"); print("=" * 78)
    for k in ["total_candidates","total_resolved","fetch_failed",
              "articles_parsed_raw","articles_dedup","articles_inserted","embeddings_generated",
              "norms_patched","embedding_tokens_total","elapsed_seconds"]:
        print(f"  {k}: {stats[k]}")
    print(f"  openai_cost_usd: ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  errores: {len(stats['errors'])}")
    print(f"  reporte: {REPORT_JSON}")
    print("=" * 78)
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try: sys.exit(main())
    except KeyboardInterrupt: print("\n[INTERRUMPIDO]"); sys.exit(130)
