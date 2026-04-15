#!/usr/bin/env python3
"""PASO 3 — Re-procesar scans MinAmbiente con OCR via norm-extract-text."""
from __future__ import annotations
import argparse, json, math, os, re, sys, time
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
SB_PUB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV"
EMAIL = "admin@cerrejon-norte.vigia-test.co"
PWD = "Vigia2026!"
from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

RECON_JSON = HERE / "minambiente_normativa_recon.json"
REPORT_JSON = HERE / "ingest_minambiente_recent_report.json"
OUT_JSON = HERE / "retry_minambiente_ocr_report.json"
DELAY = 2.0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 10_000
ARTICLES_INSERT_BATCH = 20

REST_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json", "Prefer": "return=representation"}


def login():
    r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": SB_PUB_KEY, "Content-Type": "application/json"},
                      json={"email": EMAIL, "password": PWD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def ocr_via_edge(token, pdf_url):
    """norm-extract-text con force_ocr=true. Claude vision extrae texto."""
    r = requests.post(f"{SUPABASE_URL}/functions/v1/norm-extract-text",
                      headers={"apikey": SB_PUB_KEY, "Authorization": f"Bearer {token}",
                               "Content-Type": "application/json"},
                      json={"pdf_url": pdf_url, "force_ocr": True}, timeout=240)
    try: body = r.json()
    except Exception: body = {"error": r.text[:500]}
    return r.status_code, body


ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?(\d{1,4}(?:\.\d+)*[A-Za-z]?)[°º\.\s]",
    re.IGNORECASE | re.MULTILINE)


def parse_articles(text):
    norm = text.replace("\r", "").replace("\t", " ")
    matches = [(m.start()+len(m.group(1)), f"{m.group(2).strip()} {m.group(3)}".strip(), m.group(3))
               for m in ARTICLE_RE.finditer(norm)]
    if not matches: return []
    out = []
    for i, (s, label, num) in enumerate(matches):
        e = matches[i+1][0] if i+1 < len(matches) else len(norm)
        out.append({"article_number": num, "article_label": label,
                    "title": None, "content": norm[s:e].strip()})
    by = {}
    for a in out:
        k = a["article_number"]
        if k not in by or len(a["content"]) > len(by[k]["content"]):
            by[k] = a
    return list(by.values())


def embed_texts(texts):
    trunc = [t[:EMBEDDING_MAX_CHARS] for t in texts]
    r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=trunc)
    embs = [None]*len(texts)
    for d in r.data: embs[d.index] = d.embedding
    return embs, r.usage.total_tokens


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def check_existing(nt, num, year):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                     headers=REST_HEADERS,
                     params={"select": "id", "norm_type": f"eq.{nt}",
                             "norm_number": f"eq.{num}", "norm_year": f"eq.{year}"}, timeout=30)
    return r.status_code == 200 and bool(r.json())


def insert_source(it, pages, chars):
    nn = it["norm_number"]
    payload = {
        "norm_type": it["norm_type"], "norm_number": nn, "norm_year": it["norm_year"],
        "norm_title": f"{it['norm_type'].title()} {nn} de {it['norm_year']} — {it['title'][:300]}"[:500],
        "issuing_body": "MINISTERIO DE AMBIENTE Y DESARROLLO SOSTENIBLE",
        "source_url": it["url"],
        "publication_source": "MinAmbiente normativa (OCR Claude)",
        "summary": it["title"][:500],
        "status": "published", "corpus_source": "minambiente_normativa",
        "content_hash": f"minambiente-ocr:{it['norm_type']}-{nn}-{it['norm_year']}",
        "parser_method": "llm",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_sources",
                      headers=REST_HEADERS, json=[payload], timeout=60)
    if r.status_code in (200, 201): return r.json()[0]["id"]
    return None


def insert_articles(nid, arts):
    if not arts: return 0, 0
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    embs, tokens = embed_texts([a["content"] for a in arts])
    rows = []
    for i, (a, e) in enumerate(zip(arts, embs), 1):
        rows.append({"norm_id": nid, "article_number": a.get("article_number"),
                     "article_label": a.get("article_label"), "title": None,
                     "content": a["content"], "content_tokens": math.ceil(len(a["content"])/4),
                     "order_index": i, "chapter": None, "section": None,
                     "embedding": emb_lit(e), "embedding_model": EMBEDDING_MODEL,
                     "embedding_generated_at": now})
    inserted = 0
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i+ARTICLES_INSERT_BATCH]
        r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_articles",
                          headers=REST_HEADERS, json=chunk, timeout=120)
        if r.status_code in (200, 201): inserted += len(r.json())
    return inserted, tokens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    recon = json.loads(RECON_JSON.read_text())
    report = json.loads(REPORT_JSON.read_text())
    failed_tags = {e["tag"] for e in report.get("errors", []) if e.get("stage") == "empty"}
    print(f"[info] tags con 'empty' previo: {len(failed_tags)}")

    candidates = []
    for it in recon.get("items", []):
        if it["norm_year"] < 2024: continue
        tag = f"{it['norm_type']} {it['norm_number']}/{it['norm_year']}"
        if tag in failed_tags:
            candidates.append(it)
    print(f"[info] candidatos a re-OCR: {len(candidates)}")
    if args.limit: candidates = candidates[:args.limit]

    if args.dry_run:
        for c in candidates: print(f"  {c['norm_type']} {c['norm_number']}/{c['norm_year']} → {c['url'][:80]}")
        return

    print("[info] login…")
    token = login()
    print("  ✓ authenticated")

    stats = {"total": len(candidates), "recovered": 0, "still_empty": 0,
             "chunks": 0, "tokens": 0, "ocr_tokens_in": 0, "ocr_tokens_out": 0,
             "errors": [], "per_doc": []}

    for idx, it in enumerate(candidates, 1):
        if idx > 1: time.sleep(DELAY)
        tag = f"{it['norm_type']} {it['norm_number']}/{it['norm_year']}"
        print(f"\n[{idx}/{len(candidates)}] {tag}")
        if check_existing(it["norm_type"], it["norm_number"], it["norm_year"]):
            print(f"  SKIP: ya existe en corpus")
            continue

        if it["url"].lower().endswith(".zip") or it["url"].lower().endswith(".7z"):
            print(f"  SKIP: archivo {it['url'][-3:]} no procesable por norm-extract-text")
            stats["errors"].append({"tag": tag, "stage": "zip_not_supported"})
            continue

        t0 = time.time()
        status, body = ocr_via_edge(token, it["url"])
        elapsed = round(time.time()-t0, 1)
        if status != 200 or not body.get("ok"):
            err = body.get("error") or str(body)[:150]
            print(f"  ✗ OCR failed ({status}, {elapsed}s): {err[:100]}")
            stats["errors"].append({"tag": tag, "stage": "ocr", "error": err[:150]})
            stats["still_empty"] += 1
            continue

        text = body.get("text", "")
        ocr_usage = body.get("ocr_usage") or {}
        print(f"  ✓ OCR ok ({elapsed}s): {len(text):,} chars, method={body.get('text_method')}")
        stats["ocr_tokens_in"] += ocr_usage.get("tokens_in") or 0
        stats["ocr_tokens_out"] += ocr_usage.get("tokens_out") or 0

        if len(text) < 300:
            print(f"  SKIP aún corto ({len(text)})")
            stats["errors"].append({"tag": tag, "stage": "still_short", "chars": len(text)})
            stats["still_empty"] += 1
            continue

        arts = parse_articles(text)
        if len(arts) < 2:
            arts = [{"article_number": None, "article_label": "Documento completo",
                     "title": None, "content": text}]

        nid = insert_source(it, body.get("pages", 0), len(text))
        if not nid:
            print(f"  ✗ insert_source fail")
            stats["errors"].append({"tag": tag, "stage": "insert_source"})
            continue
        ins, tok = insert_articles(nid, arts)
        stats["recovered"] += 1
        stats["chunks"] += ins; stats["tokens"] += tok
        stats["per_doc"].append({"tag": tag, "chars": len(text), "arts": ins, "tokens": tok})
        print(f"  ✓ INSERT {ins} arts, {tok} embedding tokens")

    stats["cost_usd_est"] = round(stats["tokens"]*0.02/1e6 + stats["ocr_tokens_in"]*3/1e6 + stats["ocr_tokens_out"]*15/1e6, 4)
    OUT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN"); print("="*78)
    for k in ["total", "recovered", "still_empty", "chunks", "tokens", "ocr_tokens_in", "ocr_tokens_out"]:
        print(f"  {k}: {stats[k]}")
    print(f"  cost estimado: ${stats['cost_usd_est']}")
    print(f"  errores: {len(stats['errors'])}")


if __name__ == "__main__":
    main()
