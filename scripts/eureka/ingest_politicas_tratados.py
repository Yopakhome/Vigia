#!/usr/bin/env python3
"""PRE-3 + PRE-5: Políticas ambientales Red Justicia + tratados internacionales.

PRE-3: 11 políticas nacionales de Red Justicia (PDFs directos).
PRE-5: verificar/complementar tratados internacionales:
  Basilea/Ley 253/1996, Estocolmo/Ley 994/2005, Rotterdam/Ley 1159/2007,
  Kyoto/Ley 629/2000, París/Ley 1844/2017, Minamata/Ley 1892/2018,
  Biodiversidad/Ley 165/1994, OIT 169/Ley 21/1991, CITES/Ley 17/1981
"""
from __future__ import annotations
import json, math, os, re, sys, time
from io import BytesIO
from pathlib import Path
import requests
from dotenv import load_dotenv
from pypdf import PdfReader

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

REPORT_JSON = HERE / "ingest_politicas_tratados_report.json"
RECON_JSON = HERE / "red_justicia_recon_pendientes.json"
CORPUS_GAPS = HERE / "corpus_gaps.json"
UA = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
DELAY = 2.0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 10_000
ARTICLES_INSERT_BATCH = 20

REST_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json", "Prefer": "return=representation"}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})

POLITICAS = [
    {"title": "Política Nacional de Biodiversidad", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/polc3adtica-nacional-de-biodiversidad.pdf"},
    {"title": "Política de Bosques", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/polc3adtica-de-bosques.pdf"},
    {"title": "Política Nacional de Humedales Interiores", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/polc3adtica-nacional-de-humedales-interiores-de-colombia.pdf"},
    {"title": "Política Ambiental Gestión Integral Residuos Peligrosos", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/polc3adtica-ambiental-para-la-gestic3b3n-integral-de-residuos-o-desechos-tc3b3xicos.pdf"},
    {"title": "Política Nacional Producción Más Limpia", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/polc3adtica-nacional-de-produccic3b3n-mc3a1s-limpia2.pdf"},
    {"title": "Política Nacional Prevención Contaminación Aire", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/polc3adtica-de-prevencic3b3n-y-control-de-la-contaminacic3b3n-del-aire2.pdf"},
    {"title": "Política Nacional Investigación Ambiental", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/politica-nacional-de-investigacic3b3n-ambiental2.pdf"},
    {"title": "Política Nacional Educación Ambiental", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/politica-nacional-de-investigacic3b3n-ambiental3.pdf"},
    {"title": "Política Participación Social Conservación", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/polc3adtica-de-participacic3b3n-social-en-la-conservacic3b3n2.pdf"},
    {"title": "Política Desarrollo Ecoturismo", "url": "https://redjusticiaambientalcolombia.wordpress.com/wp-content/uploads/2012/09/politica-desarrollo-del-ecoturismo2.pdf"},
]

# Leyes ratificatorias de tratados a verificar en corpus
TRATADOS_VERIFICAR = [
    ("Basilea", "253", 1996), ("Estocolmo POPs", "994", 2005),
    ("Rotterdam", "1159", 2007), ("Kyoto", "629", 2000),
    ("París", "1844", 2017), ("Minamata", "1892", 2018),
    ("Biodiversidad", "165", 1994), ("OIT 169", "21", 1991),
    ("CITES", "17", 1981),
]

ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?(\d{1,4}(?:\.\d+)*[A-Za-z]?)[°º\.\s]",
    re.IGNORECASE | re.MULTILINE)


def fetch_pdf_text(url):
    r = SESSION.get(url, timeout=90, allow_redirects=True)
    r.raise_for_status()
    ct = (r.headers.get("Content-Type") or "").lower()
    if "pdf" in ct or r.content[:5] == b"%PDF-":
        reader = PdfReader(BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return text, len(reader.pages)
    raise ValueError(f"not_pdf (ct={ct})")


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


def slugify(t):
    s = t.lower()
    s = re.sub(r"[áàä]", "a", s); s = re.sub(r"[éèë]", "e", s)
    s = re.sub(r"[íìï]", "i", s); s = re.sub(r"[óòö]", "o", s)
    s = re.sub(r"[úùü]", "u", s); s = re.sub(r"ñ", "n", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:100]


def insert_policy_source(p, pages, chars):
    slug = slugify(p["title"])
    payload = {
        "norm_type": "otra",
        "norm_title": p["title"][:500],
        "norm_number": None, "norm_year": None,
        "issuing_body": "MINISTERIO DE AMBIENTE Y DESARROLLO SOSTENIBLE",
        "source_url": p["url"],
        "publication_source": "Red Justicia Ambiental Colombia / política nacional",
        "summary": f"{p['title']}. Política pública ambiental nacional. PDF {pages}pp, {chars} chars.",
        "status": "published",
        "corpus_source": "red_justicia_intl",
        "content_hash": f"redjust-politica:{slug}",
        "parser_method": "regex",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_sources",
                      headers=REST_HEADERS, json=[payload], timeout=60)
    if r.status_code in (200, 201): return r.json()[0]["id"], "created"
    if r.status_code == 409 or "duplicate" in r.text.lower():
        lk = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                          headers=REST_HEADERS,
                          params={"select":"id","content_hash": f"eq.redjust-politica:{slug}"}, timeout=30)
        if lk.status_code == 200 and lk.json(): return lk.json()[0]["id"], "existing"
    return None, f"fail_{r.status_code}"


def insert_articles_with_embedding(nid, arts):
    if not arts: return 0, 0
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    all_embs = []; total_tokens = 0
    BATCH = 50
    for i in range(0, len(arts), BATCH):
        batch = arts[i:i+BATCH]
        texts = [a["content"] for a in batch]
        embs, tok = embed_texts(texts)
        all_embs.extend(embs); total_tokens += tok
    rows = []
    for i, (a, e) in enumerate(zip(arts, all_embs), 1):
        rows.append({
            "norm_id": nid, "article_number": a.get("article_number"),
            "article_label": a.get("article_label"), "title": None,
            "content": a["content"],
            "content_tokens": math.ceil(len(a["content"])/4),
            "order_index": i, "chapter": None, "section": None,
            "embedding": emb_lit(e), "embedding_model": EMBEDDING_MODEL,
            "embedding_generated_at": now,
        })
    inserted = 0
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i+ARTICLES_INSERT_BATCH]
        r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_articles",
                          headers=REST_HEADERS, json=chunk, timeout=120)
        if r.status_code in (200, 201): inserted += len(r.json())
    return inserted, total_tokens


def main():
    stats = {"politicas_procesadas": 0, "politicas_fallidas": 0,
             "chunks_inserted": 0, "tokens": 0, "errors": [],
             "tratados_en_corpus": [], "tratados_faltantes": [], "per_doc": []}

    # PRE-5 verificar tratados
    print("=== PRE-5: Verificar tratados en corpus ===")
    for name, num, year in TRATADOS_VERIFICAR:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                         headers=REST_HEADERS,
                         params={"select": "id,norm_title",
                                 "norm_number": f"eq.{num}",
                                 "norm_year": f"eq.{year}",
                                 "norm_type": "eq.ley"}, timeout=30)
        if r.status_code == 200 and r.json():
            stats["tratados_en_corpus"].append(f"{name} (Ley {num}/{year})")
            print(f"  ✓ {name} — Ley {num}/{year} EN CORPUS")
        else:
            stats["tratados_faltantes"].append(f"{name} (Ley {num}/{year})")
            print(f"  ✗ {name} — Ley {num}/{year} FALTANTE")

    # PRE-3: procesar políticas Red Justicia
    print("\n=== PRE-3: 10 políticas Red Justicia ===")
    for idx, p in enumerate(POLITICAS, 1):
        if idx > 1: time.sleep(DELAY)
        print(f"\n[{idx}/{len(POLITICAS)}] {p['title'][:70]}")
        try:
            text, pages = fetch_pdf_text(p["url"])
        except Exception as e:
            print(f"  ERROR fetch: {str(e)[:100]}")
            stats["errors"].append({"doc": p["title"], "stage": "fetch", "error": str(e)[:150]})
            stats["politicas_fallidas"] += 1
            continue
        if len(text) < 300:
            print(f"  SKIP texto corto ({len(text)})")
            stats["errors"].append({"doc": p["title"], "stage": "empty", "chars": len(text)})
            continue
        arts = parse_articles(text)
        if len(arts) < 2:
            arts = [{"article_number": None, "article_label": "Documento completo",
                     "title": None, "content": text}]
        print(f"  pages={pages} chars={len(text):,} arts={len(arts)}")

        nid, status = insert_policy_source(p, pages, len(text))
        if not nid:
            print(f"  ERROR source: {status}")
            stats["errors"].append({"doc": p["title"], "stage": "source", "status": status})
            stats["politicas_fallidas"] += 1
            continue
        if status == "existing":
            print(f"  [skip] ya existe source_id={nid[:8]}")
            continue
        ins, tok = insert_articles_with_embedding(nid, arts)
        stats["chunks_inserted"] += ins; stats["tokens"] += tok
        stats["politicas_procesadas"] += 1
        stats["per_doc"].append({"title": p["title"], "arts": ins, "tokens": tok})
        print(f"  ✓ INSERT {ins} arts, {tok} tokens")

    stats["cost_usd"] = round(stats["tokens"] * 0.02 / 1e6, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN PRE-3 + PRE-5"); print("="*78)
    print(f"  políticas procesadas: {stats['politicas_procesadas']}")
    print(f"  políticas fallidas: {stats['politicas_fallidas']}")
    print(f"  chunks: {stats['chunks_inserted']}, tokens: {stats['tokens']:,}")
    print(f"  tratados en corpus: {len(stats['tratados_en_corpus'])}/9")
    print(f"  tratados faltantes: {stats['tratados_faltantes']}")
    print(f"  cost: ${stats['cost_usd']:.4f}")


if __name__ == "__main__":
    main()
