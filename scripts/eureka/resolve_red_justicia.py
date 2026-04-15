#!/usr/bin/env python3
"""T1 — Red Justicia Ambiental Colombia: cruza recon con DB y procesa nuevos.

Proceso:
  1. Carga red_justicia_recon.json (jurisprudencia + legislacion).
  2. Cruza vs DB: normas por (norm_number, norm_year); sentencias por
     radicado normalizado.
  3. Clasifica en_corpus / candidato_nuevo.
  4. Para candidatos nuevos: fetch PDF desde URL → pypdf → parse artículos
     (o chunk único fallback) → embed → INSERT en normative_sources/
     normative_articles o jurisprudence_sources/jurisprudence_articles.
  5. Actualiza corpus_gaps.json si algún doc falla.
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

RECON_JSON = HERE / "red_justicia_recon.json"
REPORT_JSON = HERE / "resolve_red_justicia_report.json"
CORPUS_GAPS_JSON = HERE / "corpus_gaps.json"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 10_000
EMBEDDING_BATCH = 50
ARTICLES_INSERT_BATCH = 20

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def load_db_norms():
    rows = []; PAGE = 1000; start = 0
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+PAGE-1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources", headers=h,
                         params={"select": "id,norm_type,norm_number,norm_year"}, timeout=30)
        r.raise_for_status(); batch = r.json()
        if not batch: break
        rows.extend(batch)
        if len(batch) < PAGE: break
        start += PAGE
    return rows


def load_db_jur():
    rows = []; PAGE = 1000; start = 0
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+PAGE-1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_sources", headers=h,
                         params={"select": "id,radicado"}, timeout=30)
        r.raise_for_status(); batch = r.json()
        if not batch: break
        rows.extend(batch)
        if len(batch) < PAGE: break
        start += PAGE
    return rows


def norm_key(num, year):
    if num is None or year is None: return None
    # Padded variants
    try:
        n = str(int(str(num).lstrip("0") or "0"))
    except ValueError:
        n = str(num)
    return (n, int(year))


def parse_radicado(rad):
    """'C-035/2016' → ('C-035', 2016); 'T-462A/2014' → ('T-462A', 2014)"""
    m = re.match(r"^([A-Z]+-\d+[A-Z]?)/(\d{4})$", rad.strip())
    if m: return m.group(1), int(m.group(2))
    return None


def classify(recon, db_norms, db_jur):
    norm_set = {norm_key(r["norm_number"], r["norm_year"])
                for r in db_norms if r.get("norm_number") and r.get("norm_year")}
    norm_set.discard(None)
    jur_radicados = {}
    for j in db_jur:
        parsed = parse_radicado(j["radicado"]) if j.get("radicado") else None
        if parsed: jur_radicados[parsed] = j["id"]

    legis_result = []
    for d in recon["legislacion"]:
        key = norm_key(d["norm_number"], d["norm_year"])
        d["in_corpus"] = key in norm_set if key else False
        d["_key"] = key
        legis_result.append(d)

    jur_result = []
    for d in recon["jurisprudencia"]:
        parsed = parse_radicado(d["radicado"])
        d["in_corpus"] = parsed in jur_radicados if parsed else False
        d["_parsed_rad"] = parsed
        jur_result.append(d)

    return legis_result, jur_result


def fetch_pdf_text(url):
    r = SESSION.get(url, timeout=90, allow_redirects=True)
    r.raise_for_status()
    ct = (r.headers.get("Content-Type") or "").lower()
    if "pdf" in ct or r.content[:5] == b"%PDF-":
        reader = PdfReader(BytesIO(r.content))
        return "\n".join((p.extract_text() or "") for p in reader.pages), len(reader.pages)
    # HTML — no se procesa aquí
    raise ValueError(f"not_pdf ct={ct[:50]}")


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
    all_embs = []; tokens = 0
    for i in range(0, len(texts), EMBEDDING_BATCH):
        batch = texts[i:i+EMBEDDING_BATCH]
        truncated = [t[:EMBEDDING_MAX_CHARS] for t in batch]
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        embs = [None]*len(batch)
        for d in r.data: embs[d.index] = d.embedding
        all_embs.extend(embs); tokens += r.usage.total_tokens
    return all_embs, tokens


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


NORM_TYPES = {"ley","decreto","resolucion","circular","constitucion","decreto_ley","otra","concepto","acuerdo","proyecto_normativo"}


def insert_norm_source(doc):
    nt = doc["norm_type"].lower().strip()
    if nt not in NORM_TYPES: nt = "otra"
    nn = str(doc["norm_number"]).lstrip("0") or doc["norm_number"]
    payload = {
        "norm_type": nt, "norm_number": nn,
        "norm_year": int(doc["norm_year"]),
        "norm_title": f"{nt.title()} {doc['norm_number']} de {doc['norm_year']} — {doc['titulo'][:200]}"[:500],
        "issuing_body": doc.get("issuer", "")[:200] or None,
        "source_url": doc["url"],
        "publication_source": "Red Justicia Ambiental Colombia",
        "summary": f"Doc importado desde Red Justicia Ambiental Colombia. {doc['titulo'][:300]}",
        "status": "published", "corpus_source": "fase1c",
        "content_hash": f"redjust:{nt}-{nn}-{doc['norm_year']}",
        "parser_method": "regex",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_sources",
                      headers=REST_HEADERS, json=[payload], timeout=60)
    if r.status_code in (200, 201): return r.json()[0]["id"]
    # Idempotencia: si el content_hash ya existe, buscar id
    if r.status_code == 409 or "duplicate" in r.text.lower():
        look = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                            headers=REST_HEADERS,
                            params={"select": "id", "content_hash": f"eq.{payload['content_hash']}"},
                            timeout=30)
        if look.status_code == 200 and look.json():
            return look.json()[0]["id"]
    return None


def insert_articles(nid, arts):
    if not arts: return 0, 0
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    embs, tokens = embed_texts([a["content"] for a in arts])
    rows = []
    for idx, (a, e) in enumerate(zip(arts, embs)):
        rows.append({
            "norm_id": nid, "article_number": a["article_number"],
            "article_label": a["article_label"], "title": None,
            "content": a["content"],
            "content_tokens": math.ceil(len(a["content"])/4),
            "order_index": idx+1, "chapter": None, "section": None,
            "embedding": emb_lit(e), "embedding_model": EMBEDDING_MODEL,
            "embedding_generated_at": now,
        })
    inserted = 0
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i+ARTICLES_INSERT_BATCH]
        r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_articles",
                          headers=REST_HEADERS, json=chunk, timeout=120)
        if r.status_code in (200, 201): inserted += len(r.json())
    return inserted, tokens


def main():
    recon = json.loads(RECON_JSON.read_text())
    print(f"[info] jurisprudencia: {len(recon['jurisprudencia'])}, legislacion: {len(recon['legislacion'])}")

    print("[info] cargando DB…")
    db_norms = load_db_norms()
    db_jur = load_db_jur()
    print(f"  DB: {len(db_norms)} normas, {len(db_jur)} sentencias")

    legis, jurs = classify(recon, db_norms, db_jur)

    legis_en_corpus = [d for d in legis if d["in_corpus"]]
    legis_nuevos = [d for d in legis if not d["in_corpus"]]
    jur_en_corpus = [d for d in jurs if d["in_corpus"]]
    jur_nuevos = [d for d in jurs if not d["in_corpus"]]

    print(f"\n=== CLASIFICACIÓN ===")
    print(f"  Legislación — en_corpus: {len(legis_en_corpus)}, nuevos: {len(legis_nuevos)}")
    print(f"  Jurisprudencia — en_corpus: {len(jur_en_corpus)}, nuevos: {len(jur_nuevos)}")

    recon["legislacion"] = legis
    recon["jurisprudencia"] = jurs
    recon["clasificacion"] = {
        "legislacion_en_corpus": len(legis_en_corpus),
        "legislacion_nuevos": len(legis_nuevos),
        "jurisprudencia_en_corpus": len(jur_en_corpus),
        "jurisprudencia_nuevos": len(jur_nuevos),
    }

    today = time.strftime("%Y-%m-%d")
    report = {"started_at": today, "processed": [], "errors": [], "no_pdf_url": []}

    # PROCESAR LEGISLACIÓN NUEVA (jurisprudencia nueva la dejamos para otro momento
    # porque muchas son URLs .htm de corteconstitucional que necesitan su scraper)
    print(f"\n[processing] {len(legis_nuevos)} leyes/decretos nuevos…")
    total_tokens = 0
    for idx, doc in enumerate(legis_nuevos, 1):
        if idx > 1: time.sleep(FETCH_DELAY)
        print(f"  [{idx}/{len(legis_nuevos)}] {doc['norm_type']} {doc['norm_number']}/{doc['norm_year']}")
        if not doc["url"] or not doc["url"].lower().endswith(".pdf"):
            print(f"    SKIP: no PDF url ({doc.get('url','')[:60]})")
            report["no_pdf_url"].append(doc)
            continue
        try:
            text, pages = fetch_pdf_text(doc["url"])
        except Exception as e:
            print(f"    ERROR fetch: {str(e)[:100]}")
            report["errors"].append({"doc": f"{doc['norm_type']} {doc['norm_number']}/{doc['norm_year']}",
                                     "stage": "fetch", "error": str(e)[:150]})
            continue
        if len(text) < 200:
            print(f"    SKIP: texto corto ({len(text)} chars)")
            report["errors"].append({"doc": f"{doc['norm_type']} {doc['norm_number']}/{doc['norm_year']}",
                                     "stage": "empty", "chars": len(text)})
            continue
        arts = parse_articles(text)
        if len(arts) < 2:
            arts = [{"article_number": None, "article_label": "Documento completo",
                     "title": None, "content": text}]
        print(f"    pages={pages} chars={len(text):,} arts={len(arts)}")
        nid = insert_norm_source(doc)
        if not nid:
            print(f"    ERROR insert_source")
            report["errors"].append({"doc": f"{doc['norm_type']} {doc['norm_number']}/{doc['norm_year']}",
                                     "stage": "insert_source"})
            continue
        inserted, tokens = insert_articles(nid, arts)
        total_tokens += tokens
        print(f"    ✓ INSERT {inserted} articulos, {tokens} tokens")
        report["processed"].append({
            "doc": f"{doc['norm_type']} {doc['norm_number']}/{doc['norm_year']}",
            "nid": nid, "arts": inserted, "tokens": tokens, "chars": len(text),
        })

    recon["processed_at"] = today
    recon["processing_report"] = {
        "legis_procesados": len(report["processed"]),
        "legis_errors": len(report["errors"]),
        "legis_skipped_no_pdf": len(report["no_pdf_url"]),
        "jurisprudencia_nuevos_no_procesados": len(jur_nuevos),
        "embedding_tokens_total": total_tokens,
        "costo_usd_estimado": round(total_tokens * 0.02 / 1e6, 6),
    }
    RECON_JSON.write_text(json.dumps(recon, ensure_ascii=False, indent=2))
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN T1 Red Justicia"); print("="*78)
    print(f"  en_corpus: legis={len(legis_en_corpus)}, jur={len(jur_en_corpus)}")
    print(f"  nuevos: legis={len(legis_nuevos)}, jur={len(jur_nuevos)}")
    print(f"  procesados: {len(report['processed'])} / {len(legis_nuevos)} legis nuevos")
    print(f"  errores: {len(report['errors'])}")
    print(f"  sin_pdf_url: {len(report['no_pdf_url'])}")
    print(f"  jurisprudencia_nuevos_sin_procesar: {len(jur_nuevos)}")
    print(f"  tokens: {total_tokens:,}  (~${total_tokens*0.02/1e6:.4f})")


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: sys.exit(130)
