#!/usr/bin/env python3
"""Resuelve los 10 gaps de Fase 1C.

Dos modos:
  A) `external`: 8 docs sin inline PDF. Fetch detail ANLA → seguir
     primer link external_official (minambiente/dnp/ramajudicial).
     Si es PDF → pypdf → INSERT en normative_sources + normative_articles
     con corpus_source='fase1c'.
  B) `ocr`: 2 conceptos jurídicos scan. Fetch detail ANLA → inline PDF →
     llamar norm-extract-text (Claude OCR) → INSERT.
"""
from __future__ import annotations
import json, math, os, re, sys, time
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from pypdf import PdfReader

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
SB_PUB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV"
EMAIL = "admin@cerrejon-norte.vigia-test.co"
PWD = "Vigia2026!"

from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

BASE = "https://www.anla.gov.co"
RECON_JSON = HERE / "recon_fase1c.json"
REPORT_JSON = HERE / "resolve_fase1c_gaps_report.json"
CORPUS_GAPS_JSON = HERE / "corpus_gaps.json"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.5
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 24_000
OFFICIAL_HOSTS = ("minambiente.gov.co", "dnp.gov.co", "ramajudicial.gov.co",
                  "funcionpublica.gov.co", "presidencia.gov.co", "anla.gov.co")

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})

PDF_RE = re.compile(r"\.pdf(\?|$)", re.I)
ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?(\d{1,4}(?:\.\d+)*[A-Za-z]?)[°º\.\s]",
    re.IGNORECASE | re.MULTILINE)


def find_item_in_recon(slug):
    data = json.loads(RECON_JSON.read_text())
    for cat in data["categories"]:
        for it in cat.get("items", []):
            if it["slug"] == slug:
                return {**it, "_category_name": cat["category_name"],
                        "_category_path": cat["category_path"]}
    return None


def fetch_detail(url):
    r = SESSION.get(url, timeout=60); r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    main = (soup.find(attrs={"itemprop": "articleBody"})
            or soup.find("article") or soup.find("main") or soup)
    inline_pdf = None; external_official = None; external_any = None
    for a in main.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#"): continue
        if (href.startswith("/eureka/images/") or href.startswith("/images/")) and not inline_pdf:
            inline_pdf = BASE + href
        elif href.startswith("http"):
            host = urlparse(href).netloc
            if any(h in host for h in OFFICIAL_HOSTS) and not external_official:
                external_official = href
            elif not external_any:
                external_any = href
    doc_title = None
    for h in soup.find_all(["h1", "h2"]):
        t = h.get_text(strip=True)
        if t and "temas relacionados" not in t.lower() and "autoridad nacional" not in t.lower():
            doc_title = t; break
    return inline_pdf, external_official or external_any, doc_title


def follow_to_pdf(url, depth=0):
    """Sigue URL hasta obtener PDF. Redirige HTML que contiene un PDF link dominante."""
    if depth > 2: return None, None, 0
    r = SESSION.get(url, timeout=60, allow_redirects=True)
    r.raise_for_status()
    ct = (r.headers.get("Content-Type") or "").lower()
    if "pdf" in ct or r.content[:5] == b"%PDF-":
        reader = PdfReader(BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return text, "pdf_direct", len(reader.pages)
    # HTML — buscar primer link a PDF
    soup = BeautifulSoup(r.text, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if PDF_RE.search(href):
            if href.startswith("/"):
                from urllib.parse import urljoin
                href = urljoin(url, href)
            if href.startswith("http"):
                return follow_to_pdf(href, depth + 1)
    return None, "no_pdf_found", 0


def login():
    r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": SB_PUB_KEY, "Content-Type": "application/json"},
                      json={"email": EMAIL, "password": PWD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def extract_via_edge(token, pdf_url):
    r = requests.post(f"{SUPABASE_URL}/functions/v1/norm-extract-text",
                      headers={"apikey": SB_PUB_KEY, "Authorization": f"Bearer {token}",
                               "Content-Type": "application/json"},
                      json={"pdf_url": pdf_url, "force_ocr": True}, timeout=240)
    try: body = r.json()
    except: body = {"error": r.text[:500]}
    return r.status_code, body


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
    out = list(by.values())
    for i, a in enumerate(out, 1):
        a["order_index"] = i; a["content_tokens"] = math.ceil(len(a["content"])/4)
    return out


def embed_texts(texts):
    truncated = [t[:EMBEDDING_MAX_CHARS] for t in texts]
    r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
    embs = [None]*len(texts)
    for d in r.data: embs[d.index] = d.embedding
    return embs, r.usage.total_tokens


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def insert_source(item, pdf_url, doc_title, pages, chars):
    title = (doc_title or item.get("title") or item["slug"]).strip()[:500]
    cat = item["_category_name"]; subcat = item["subcategory_slug"]
    payload = {
        "norm_type": "otra", "norm_title": title,
        "norm_year": None, "issuing_body": "AUTORIDAD NACIONAL DE LICENCIAS AMBIENTALES (ANLA)",
        "source_url": pdf_url,
        "publication_source": f"EUREKA / {cat} / {subcat}",
        "summary": f"Documento EUREKA '{cat}' subcat '{subcat}'. "
                   f"PDF {pages}pp, {chars} chars.",
        "status": "published", "corpus_source": "fase1c",
        "content_hash": f"fase1c:{item['slug']}",
        "parser_method": "regex",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_sources",
                      headers=REST_HEADERS, json=[payload], timeout=60)
    if r.status_code in (200, 201): return r.json()[0]["id"]
    return None


def insert_articles(nid, arts):
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    embs, tokens = embed_texts([a["content"] for a in arts])
    rows = [{
        "norm_id": nid, "article_number": a.get("article_number"),
        "article_label": a.get("article_label"), "title": a.get("title"),
        "content": a["content"], "content_tokens": a.get("content_tokens"),
        "order_index": a["order_index"], "chapter": None, "section": None,
        "embedding": emb_lit(e), "embedding_model": EMBEDDING_MODEL,
        "embedding_generated_at": now,
    } for a, e in zip(arts, embs)]
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_articles",
                      headers=REST_HEADERS, json=rows, timeout=120)
    return r.status_code, tokens


def main():
    gaps_data = json.loads(CORPUS_GAPS_JSON.read_text())
    f1c = gaps_data["fase1c_ingesta_gaps"]
    all_gaps = [("external", d) for d in f1c["sin_inline_pdf"]] + \
               [("ocr", d) for d in f1c["scan_no_ocr"]]
    print(f"[info] gaps a procesar: {len(all_gaps)} "
          f"({len(f1c['sin_inline_pdf'])} external + {len(f1c['scan_no_ocr'])} ocr)")

    # Login solo si necesitamos OCR
    ocr_needed = any(mode == "ocr" for mode, _ in all_gaps)
    token = login() if ocr_needed else None
    if token: print("[info] login ok para OCR")

    today = time.strftime("%Y-%m-%d")
    resultados = []; per_gap = {}

    for idx, (mode, gap_item) in enumerate(all_gaps, 1):
        slug = gap_item["slug"]
        if idx > 1: time.sleep(FETCH_DELAY)
        print(f"\n[{idx}/{len(all_gaps)}] [{mode}] {slug[:60]}")

        item = find_item_in_recon(slug)
        if not item:
            print(f"  WARN: slug no encontrado en recon_fase1c.json")
            per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                             "error": "slug not in recon"}
            continue

        try:
            inline, external, doc_title = fetch_detail(item["url"])
        except Exception as e:
            print(f"  ERROR fetch detail: {e}")
            per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                             "error": f"fetch_detail: {str(e)[:150]}"}
            continue

        # MODE OCR
        if mode == "ocr":
            if not inline:
                print(f"  ERROR: OCR mode pero no hay inline PDF")
                per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                                 "error": "no inline PDF para OCR"}
                continue
            print(f"  inline PDF: {inline}")
            print(f"  → norm-extract-text (force_ocr)…")
            t0 = time.time()
            status, body = extract_via_edge(token, inline)
            elapsed = round(time.time()-t0, 1)
            if status != 200 or not body.get("ok"):
                err = body.get("error") or str(body)[:150]
                print(f"  ✗ extract falló ({status}, {elapsed}s): {err}")
                per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                                 "fuentes_intentadas": [{"url": inline,
                                    "via": "norm-extract-text", "error": err[:150]}]}
                continue
            text = body.get("text", "")
            print(f"  ✓ extract OK ({elapsed}s): {len(text):,} chars")
            pages = None; chars = len(text)
            src_url = inline
        # MODE EXTERNAL
        else:
            if not external:
                print(f"  ERROR: sin external_official link")
                per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                                 "error": "no external_official link in detail page"}
                continue
            print(f"  external: {external}")
            try:
                text, method, pages = follow_to_pdf(external)
            except Exception as e:
                print(f"  ERROR follow_to_pdf: {e}")
                per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                                 "fuentes_intentadas": [{"url": external,
                                    "via": "follow_to_pdf", "error": str(e)[:150]}]}
                continue
            if not text or len(text) < 200:
                print(f"  WARN: texto insuficiente ({len(text) if text else 0} chars), method={method}")
                per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                                 "fuentes_intentadas": [{"url": external,
                                    "via": "follow_to_pdf", "result": method,
                                    "chars": len(text) if text else 0}]}
                continue
            chars = len(text); src_url = external
            print(f"  ✓ PDF {pages}pp, {chars:,} chars")

        arts = parse_articles(text)
        if len(arts) < 2:
            arts = [{"article_number": None, "article_label": "Documento completo",
                     "title": None, "content": text, "order_index": 1,
                     "content_tokens": math.ceil(len(text)/4)}]
            chunking = "fallback_doc_completo"
        else:
            chunking = f"{len(arts)}_articulos"
        print(f"  parsed: {chunking}")

        nid = insert_source(item, src_url, doc_title, pages or 0, chars)
        if not nid:
            print(f"  ✗ insert_source falló (quizás duplicate content_hash)")
            per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                             "error": "insert_source failed"}
            continue

        ins_status, tokens = insert_articles(nid, arts)
        if ins_status not in (200, 201):
            print(f"  ✗ insert_articles falló ({ins_status})")
            per_gap[slug] = {"status": "pendiente", "ultimo_intento": today,
                             "error": f"insert_articles_{ins_status}"}
            continue
        print(f"  ✓ RESUELTO: {len(arts)} chunks insertados")
        per_gap[slug] = {"status": "resuelto", "resuelto_en": today,
                         "via": mode, "source_url": src_url,
                         "articles": len(arts), "chars": chars}
        resultados.append(slug)

    # Update corpus_gaps
    f1c["per_doc_status"] = per_gap
    resueltos_count = sum(1 for v in per_gap.values() if v.get("status") == "resuelto")
    f1c["resueltos_en_fase3"] = resueltos_count
    f1c["pendientes_post_fase3"] = len(all_gaps) - resueltos_count
    gaps_data["last_updated"] = f"{today} (Fase 3 — Fase 1C gaps)"
    CORPUS_GAPS_JSON.write_text(json.dumps(gaps_data, ensure_ascii=False, indent=2))

    report = {"processed": len(all_gaps), "resueltos": resueltos_count,
              "pendientes": len(all_gaps) - resueltos_count, "per_gap": per_gap}
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN FASE 3"); print("="*78)
    print(f"  total: {len(all_gaps)}")
    print(f"  resueltos: {resueltos_count}")
    print(f"  pendientes: {len(all_gaps) - resueltos_count}")


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: sys.exit(130)
