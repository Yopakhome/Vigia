#!/usr/bin/env python3
"""MA-1 — Recon y procesamiento MinAmbiente Normativa (2024-2026 recentes).

Scrapea https://www.minambiente.gov.co/normativa/ con paginación
y procesa resoluciones/decretos post-EUREKA que no estén en corpus.
"""
from __future__ import annotations
import json, math, os, re, sys, time, zipfile
from io import BytesIO
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from pypdf import PdfReader

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

BASE = "https://www.minambiente.gov.co/normativa/"
AJAX_URL = "https://www.minambiente.gov.co/wp-admin/admin-ajax.php"
RECON_JSON = HERE / "minambiente_normativa_recon.json"
REPORT_JSON = HERE / "ingest_minambiente_recent_report.json"
UA = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
DELAY = 2.0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 10_000
ARTICLES_INSERT_BATCH = 20
MAX_PAGES = 40

REST_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json", "Prefer": "return=representation"}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?(\d{1,4}(?:\.\d+)*[A-Za-z]?)[°º\.\s]",
    re.IGNORECASE | re.MULTILINE)


def fetch_page(page_num):
    """AJAX endpoint discovered en recon_minambiente_ajax."""
    data = {"page": page_num, "areaActivador": 2, "action": "normativa_paginacion-load-posts"}
    r = SESSION.post(AJAX_URL, data=data,
                     headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    r.raise_for_status()
    return r.text


def parse_listing(html):
    """Retorna lista de {type, number, year, title, url, filename}"""
    items = []
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/wp-content/uploads/" not in href: continue
        if not re.search(r"\.(pdf|zip|7z)$", href, re.I): continue
        text = a.get_text(strip=True)[:300]
        # Parseo del nombre de archivo o título
        # Ejemplos: "Resolucion-0280-de-2026.zip", "Resolucion-No.-0280-de-2026.pdf"
        fn = href.rsplit("/", 1)[-1]
        m = re.search(r'(Resoluci[óo]n|Decreto|Ley|Circular|Auto|Acuerdo)[\s\-._]*(?:N[°º]?[\s\-._]*)?(\d{1,5})[\s\-._]*(?:de[\s\-._]*)?(\d{4})', fn, re.I)
        if not m:
            m = re.search(r'(Resoluci[óo]n|Decreto|Ley|Circular|Auto|Acuerdo)[\s\-._]*(?:N[°º]?[\s\-._]*)?(\d{1,5})[\s\-._]*(?:de[\s\-._]*)?(\d{4})', text, re.I)
        if not m: continue
        ntype = m.group(1).lower()
        if ntype.startswith("resolu"): ntype = "resolucion"
        number = m.group(2).lstrip("0") or m.group(2)
        year = int(m.group(3))
        items.append({"norm_type": ntype, "norm_number": number, "norm_year": year,
                      "title": text or fn, "url": href, "filename": fn})
    return items


def fetch_bytes(url):
    r = SESSION.get(url, timeout=60, allow_redirects=True)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "")


def extract_pdf_text(content):
    reader = PdfReader(BytesIO(content))
    return "\n".join((p.extract_text() or "") for p in reader.pages), len(reader.pages)


def extract_zip_pdf(content):
    with zipfile.ZipFile(BytesIO(content)) as z:
        for name in z.namelist():
            if name.lower().endswith(".pdf"):
                with z.open(name) as fp:
                    data = fp.read()
                    return extract_pdf_text(data)
    raise ValueError("no pdf in zip")


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
    params = {"select": "id", "norm_type": f"eq.{nt}",
              "norm_number": f"eq.{num}", "norm_year": f"eq.{year}"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                     headers=REST_HEADERS, params=params, timeout=30)
    return r.status_code == 200 and bool(r.json())


def insert_source(it, pages, chars):
    nn = it["norm_number"]
    payload = {
        "norm_type": it["norm_type"], "norm_number": nn,
        "norm_year": it["norm_year"],
        "norm_title": f"{it['norm_type'].title()} {nn} de {it['norm_year']} — {it['title'][:300]}"[:500],
        "issuing_body": "MINISTERIO DE AMBIENTE Y DESARROLLO SOSTENIBLE",
        "source_url": it["url"],
        "publication_source": "MinAmbiente normativa",
        "summary": it["title"][:500],
        "status": "published", "corpus_source": "minambiente_normativa",
        "content_hash": f"minambiente:{it['norm_type']}-{nn}-{it['norm_year']}",
        "parser_method": "regex",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_sources",
                      headers=REST_HEADERS, json=[payload], timeout=60)
    if r.status_code in (200, 201): return r.json()[0]["id"]
    if r.status_code == 409 or "duplicate" in r.text.lower():
        lk = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                          headers=REST_HEADERS,
                          params={"select":"id","content_hash": f"eq.minambiente:{it['norm_type']}-{nn}-{it['norm_year']}"}, timeout=30)
        if lk.status_code == 200 and lk.json(): return lk.json()[0]["id"]
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
    all_items = []; seen = set()
    print(f"[info] scraping {MAX_PAGES} páginas de MinAmbiente...")
    for p in range(1, MAX_PAGES + 1):
        if p > 1: time.sleep(DELAY)
        try:
            html = fetch_page(p)
        except Exception as e:
            print(f"  p{p} ERROR: {e}"); break
        items = parse_listing(html)
        new = 0
        for it in items:
            key = (it["norm_type"], it["norm_number"], it["norm_year"])
            if key not in seen:
                seen.add(key); all_items.append(it); new += 1
        print(f"  p{p}: +{new} (total {len(all_items)})")
        if not items: break

    print(f"\n[info] total items recon: {len(all_items)}")
    RECON_JSON.write_text(json.dumps({"generated": time.strftime("%Y-%m-%d"),
                                      "total": len(all_items), "items": all_items},
                                     ensure_ascii=False, indent=2))

    # Filtrar solo 2024+ para foco reciente
    candidates = [it for it in all_items if it["norm_year"] >= 2024]
    print(f"[info] candidates 2024+: {len(candidates)}")

    # Cruzar con corpus
    news = []
    for it in candidates:
        if not check_existing(it["norm_type"], it["norm_number"], it["norm_year"]):
            news.append(it)
    print(f"[info] nuevos (no en corpus): {len(news)}")

    stats = {"scraped": len(all_items), "candidates_2024": len(candidates),
             "new": len(news), "inserted": 0, "chunks": 0, "tokens": 0,
             "errors": [], "per_doc": []}

    for idx, it in enumerate(news, 1):
        if idx > 1: time.sleep(DELAY)
        tag = f"{it['norm_type']} {it['norm_number']}/{it['norm_year']}"
        print(f"\n[{idx}/{len(news)}] {tag}")
        try:
            content, ct = fetch_bytes(it["url"])
        except Exception as e:
            print(f"  ERROR fetch: {e}")
            stats["errors"].append({"tag": tag, "stage": "fetch", "error": str(e)[:150]})
            continue

        try:
            if it["url"].lower().endswith(".zip"):
                text, pages = extract_zip_pdf(content)
            elif it["url"].lower().endswith(".pdf") or "pdf" in ct.lower():
                text, pages = extract_pdf_text(content)
            else:
                stats["errors"].append({"tag": tag, "stage": "unsupported_format"})
                continue
        except Exception as e:
            print(f"  ERROR extract: {e}")
            stats["errors"].append({"tag": tag, "stage": "extract", "error": str(e)[:150]})
            continue

        if len(text) < 300:
            print(f"  SKIP texto corto ({len(text)})")
            stats["errors"].append({"tag": tag, "stage": "empty", "chars": len(text)})
            continue

        arts = parse_articles(text)
        if len(arts) < 2:
            arts = [{"article_number": None, "article_label": "Documento completo",
                     "title": None, "content": text}]
        print(f"  pages={pages} chars={len(text):,} arts={len(arts)}")

        nid = insert_source(it, pages, len(text))
        if not nid:
            stats["errors"].append({"tag": tag, "stage": "insert_source"})
            continue
        ins, tok = insert_articles(nid, arts)
        stats["inserted"] += 1; stats["chunks"] += ins; stats["tokens"] += tok
        stats["per_doc"].append({"tag": tag, "arts": ins, "tokens": tok, "pages": pages})
        print(f"  ✓ INSERT {ins} arts, {tok} tokens")

    stats["cost_usd"] = round(stats["tokens"] * 0.02 / 1e6, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN MA-1"); print("="*78)
    for k in ["scraped", "candidates_2024", "new", "inserted", "chunks", "tokens"]:
        print(f"  {k}: {stats[k]}")
    print(f"  cost: ${stats['cost_usd']:.4f}")
    print(f"  errores: {len(stats['errors'])}")


if __name__ == "__main__":
    main()
