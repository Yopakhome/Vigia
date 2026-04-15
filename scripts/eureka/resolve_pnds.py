#!/usr/bin/env python3
"""Resuelve los 3 PNDs de pending_research aplicando filtro temático 8D.

PNDs y fuentes:
  - Ley 1955/2019 (PND 2018-2022) → SUIN viewDocument ruta=Leyes/30036488
  - Ley 2294/2023 (PND 2022-2026) → SUIN viewDocument id=30046580
  - Ley 1753/2015 (PND 2014-2018) → funcionpublica norma.php?i=61933

Proceso:
  1. Source existence: Ley 1955 y 2294 ya existen con corpus_source='eureka_metadata'
     (arts parciales) → borrar arts existentes antes de re-ingestar.
     Ley 1753 no existe → crear source.
  2. Fetch texto completo.
  3. Parse artículos con ARTICLE_RE (IGNORECASE MULTILINE).
  4. Filtrar por filtro_tematico_pnd.dimensiones (OR entre 8D).
  5. Embed + INSERT.
"""
from __future__ import annotations
import json, math, os, re, sys, time
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

REPORT_JSON = HERE / "resolve_pnds_report.json"
CORPUS_GAPS_JSON = HERE / "corpus_gaps.json"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 24_000
EMBEDDING_BATCH = 50
ARTICLES_INSERT_BATCH = 20

PNDS = [
    {
        "id": "pnd-2022-2026", "ley": "Ley 2294 de 2023",
        "norm_number": "2294", "norm_year": 2023, "norm_type": "ley",
        "url": "https://www.suin-juriscol.gov.co/viewDocument.asp?id=30046580",
        "fuente": "suin-juriscol",
    },
    {
        "id": "pnd-2018-2022", "ley": "Ley 1955 de 2019",
        "norm_number": "1955", "norm_year": 2019, "norm_type": "ley",
        "url": "https://www.suin-juriscol.gov.co/viewDocument.asp?ruta=Leyes/30036488",
        "fuente": "suin-juriscol",
    },
    {
        "id": "pnd-2014-2018", "ley": "Ley 1753 de 2015",
        "norm_number": "1753", "norm_year": 2015, "norm_type": "ley",
        "url": "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=61933",
        "fuente": "funcionpublica",
    },
]

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def find_source_id(nn, ny, nt):
    params = {"select": "id,norm_title", "norm_number": f"eq.{nn}",
              "norm_year": f"eq.{ny}", "norm_type": f"eq.{nt}"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                     headers=REST_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def create_source(pnd, title):
    payload = {
        "norm_type": pnd["norm_type"],
        "norm_number": pnd["norm_number"],
        "norm_year": pnd["norm_year"],
        "norm_title": title,
        "issuing_body": "CONGRESO DE LA REPÚBLICA",
        "source_url": pnd["url"],
        "publication_source": f"SUIN / funcionpublica — {pnd['fuente']}",
        "summary": f"{pnd['ley']} — Plan Nacional de Desarrollo. "
                   f"Filtro temático 8D aplicado (solo artículos con relevancia ambiental).",
        "status": "published", "corpus_source": "fase1c",
        "content_hash": f"pnd:{pnd['id']}",
        "parser_method": "regex",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_sources",
                      headers=REST_HEADERS, json=[payload], timeout=60)
    if r.status_code in (200, 201):
        return r.json()[0]["id"]
    print(f"[fail] create source: {r.status_code} {r.text[:200]}")
    return None


def delete_existing_articles(nid):
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/normative_articles",
                        headers=REST_HEADERS, params={"norm_id": f"eq.{nid}"}, timeout=30)
    return r.status_code in (200, 204)


def fetch_text_suin(url):
    r = SESSION.get(url, timeout=90); r.raise_for_status()
    text = r.content.decode(r.apparent_encoding or "utf-8", errors="replace")
    soup = BeautifulSoup(text, "html.parser")
    body = soup.find("body") or soup
    return body.get_text(separator="\n", strip=True)


def fetch_text_funcionpublica(url):
    r = SESSION.get(url, timeout=90); r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    main = soup.select_one("main.main") or soup.find("main") or soup.find("body") or soup
    return main.get_text(separator="\n", strip=True)


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
    # Dedup
    by = {}
    for a in out:
        k = a["article_number"]
        if k not in by or len(a["content"]) > len(by[k]["content"]):
            by[k] = a
    return list(by.values())


def load_filter_keywords(gaps_data):
    ft = gaps_data["filtro_tematico_pnd"]["dimensiones"]
    all_kw = []
    for dim, kws in ft.items():
        for kw in kws: all_kw.append((dim, kw.lower()))
    return all_kw


def matches_filter(content, keywords):
    """Devuelve lista de dimensiones matched."""
    low = content.lower()
    hits = set()
    for dim, kw in keywords:
        if kw in low:
            hits.add(dim)
    return sorted(hits)


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def embed_insert(nid, arts, stats):
    """Embedding batch + INSERT batch."""
    if not arts: return
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    all_embs = []
    for i in range(0, len(arts), EMBEDDING_BATCH):
        batch = arts[i:i+EMBEDDING_BATCH]
        texts = [a["content"][:EMBEDDING_MAX_CHARS] for a in batch]
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=texts)
        embs = [None]*len(batch)
        for d in r.data: embs[d.index] = d.embedding
        all_embs.extend(embs)
        stats["embedding_tokens"] += r.usage.total_tokens

    rows = []
    for a, e in zip(arts, all_embs):
        rows.append({
            "norm_id": nid,
            "article_number": a["article_number"],
            "article_label": a["article_label"],
            "title": None, "content": a["content"],
            "content_tokens": math.ceil(len(a["content"])/4),
            "order_index": a["order_index"],
            "chapter": None, "section": None,
            "embedding": emb_lit(e),
            "embedding_model": EMBEDDING_MODEL,
            "embedding_generated_at": now,
        })
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i+ARTICLES_INSERT_BATCH]
        r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_articles",
                          headers=REST_HEADERS, json=chunk, timeout=120)
        if r.status_code not in (200, 201):
            stats["errors"].append(f"insert_{r.status_code}: {r.text[:200]}")
        else:
            stats["inserted"] += len(r.json())


def process_pnd(pnd, keywords, stats_all):
    print(f"\n==== {pnd['ley']} ({pnd['id']}) ====")
    print(f"  URL: {pnd['url']}")

    stats = {"ley": pnd["ley"], "fetched_chars": 0, "articles_parsed": 0,
             "articles_after_filter": 0, "inserted": 0,
             "embedding_tokens": 0, "errors": [], "dimension_hits": {}}

    # Fetch
    try:
        if pnd["fuente"] == "suin-juriscol":
            text = fetch_text_suin(pnd["url"])
        else:
            text = fetch_text_funcionpublica(pnd["url"])
    except Exception as e:
        stats["errors"].append(f"fetch: {str(e)[:200]}")
        print(f"  ERROR fetch: {e}")
        stats_all.append(stats); return False
    stats["fetched_chars"] = len(text)
    print(f"  fetched: {len(text):,} chars")

    # Parse
    arts = parse_articles(text)
    stats["articles_parsed"] = len(arts)
    if not arts:
        stats["errors"].append("no articles parsed")
        print(f"  ERROR: 0 articles")
        stats_all.append(stats); return False
    print(f"  parsed: {len(arts)} articles")

    # Filter 8D
    filtered = []
    for a in arts:
        dims = matches_filter(a["content"], keywords)
        if dims:
            a["_dimensions"] = dims
            for d in dims: stats["dimension_hits"][d] = stats["dimension_hits"].get(d, 0) + 1
            filtered.append(a)
    stats["articles_after_filter"] = len(filtered)
    print(f"  after 8D filter: {len(filtered)}/{len(arts)} ({100*len(filtered)//max(len(arts),1)}%)")
    print(f"  dimensions: {dict(sorted(stats['dimension_hits'].items(), key=lambda x:-x[1]))}")
    if not filtered:
        stats["errors"].append("no article passed filter")
        print(f"  WARN: ningún artículo pasó el filtro")
        stats_all.append(stats); return False

    # Re-order and compute order_index
    for i, a in enumerate(filtered, 1):
        a["order_index"] = i

    # Source id
    existing = find_source_id(pnd["norm_number"], pnd["norm_year"], pnd["norm_type"])
    if existing:
        nid = existing["id"]
        title = existing["norm_title"]
        print(f"  source existente id={nid[:8]} (borrando arts previos)")
        delete_existing_articles(nid)
    else:
        title = pnd["ley"] + " — " + ("PND " + pnd["id"].replace("pnd-",""))
        nid = create_source(pnd, title)
        if not nid:
            stats["errors"].append("create source failed")
            stats_all.append(stats); return False
        print(f"  source CREADO id={nid[:8]}")

    # Embed + INSERT
    embed_insert(nid, filtered, stats)
    print(f"  inserted: {stats['inserted']}, embedding tokens: {stats['embedding_tokens']}")
    stats_all.append(stats)
    return True


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="norm_number to process only", default=None)
    args = ap.parse_args()

    gaps = json.loads(CORPUS_GAPS_JSON.read_text())
    keywords = load_filter_keywords(gaps)
    print(f"[info] filtro 8D cargado: {len(keywords)} keywords")

    today = time.strftime("%Y-%m-%d")
    stats_all = []
    pnds = [p for p in PNDS if not args.only or p["norm_number"] == args.only]
    for pnd in pnds:
        try: process_pnd(pnd, keywords, stats_all)
        except Exception as e:
            print(f"  ERROR pnd {pnd['id']}: {e}")
            stats_all.append({"ley": pnd["ley"], "errors": [str(e)]})

    # Update corpus_gaps
    pr = gaps["pending_research"]
    for entry in pr:
        pid = entry["id"]
        stat = next((s for s in stats_all if s.get("ley") == entry["ley"]), None)
        if stat:
            if stat.get("inserted", 0) > 0:
                entry["status"] = "resuelto"
                entry["resuelto_en"] = today
                entry["resultado"] = {
                    "articulos_total": stat.get("articles_parsed"),
                    "articulos_tras_filtro_8d": stat.get("articles_after_filter"),
                    "articulos_insertados": stat.get("inserted"),
                    "dimension_hits": stat.get("dimension_hits"),
                    "embedding_tokens": stat.get("embedding_tokens"),
                }
            else:
                entry["status"] = "pendiente"
                entry["ultimo_intento"] = today
                entry.setdefault("fuentes_intentadas", []).append({
                    "url": next((p["url"] for p in PNDS if p["id"] == pid), ""),
                    "errors": stat.get("errors", ["no inserts"]),
                })
    gaps["last_updated"] = f"{today} (Fase 5 — PNDs con filtro 8D)"
    CORPUS_GAPS_JSON.write_text(json.dumps(gaps, ensure_ascii=False, indent=2))

    REPORT_JSON.write_text(json.dumps({
        "started": today, "stats": stats_all,
        "total_inserted": sum(s.get("inserted", 0) for s in stats_all),
        "total_tokens": sum(s.get("embedding_tokens", 0) for s in stats_all),
    }, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN FASE 5"); print("="*78)
    for s in stats_all:
        ins = s.get("inserted", 0); tot = s.get("articles_parsed", 0)
        filt = s.get("articles_after_filter", 0)
        print(f"  {s.get('ley')}: parsed={tot} filtered={filt} inserted={ins}")
    tot = sum(s.get("inserted", 0) for s in stats_all)
    toks = sum(s.get("embedding_tokens", 0) for s in stats_all)
    print(f"  TOTAL inserted: {tot}, tokens: {toks:,} (~${toks*0.02/1e6:.4f})")


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: sys.exit(130)
