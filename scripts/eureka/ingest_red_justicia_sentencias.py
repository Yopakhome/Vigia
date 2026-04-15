#!/usr/bin/env python3
"""TAREA B — ingesta 27 sentencias nuevas de Red Justicia.

Proceso por cada sentencia:
  1. Crear row en jurisprudence_sources (no existen en DB).
  2. Fetch texto:
     - Si URL es corteconstitucional.gov.co/.htm → scraper CC (HTML).
     - Si URL es redjusticia wordpress PDF → pypdf.
     - Si URL es 190.24.134.67 (Consejo de Estado boletín) → PDF.
  3. Split semántico (preambulo/antecedentes/considerandos/decision).
  4. Embed + INSERT en jurisprudence_articles.
  5. Actualizar corpus_gaps si falla.
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
from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

RECON_JSON = HERE / "red_justicia_recon.json"
REPORT_JSON = HERE / "ingest_red_justicia_sentencias_report.json"
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
FETCH_DELAY = 2.5
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 10_000

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def radicado_to_slug(rad):
    return f"sentencia-{rad.lower().replace('/','-de-').replace(' ','-')}-red-justicia"


def parse_radicado(rad):
    m = re.match(r"^([A-Z]+)-(\d+[A-Z]?)/(\d{4})$", rad.strip())
    if m: return m.group(1), m.group(2), int(m.group(3))
    return None, None, None


def get_or_create_jur_source(s):
    """Find existing or create new jurisprudence_sources row."""
    rad = s["radicado"]
    # Check by exact radicado
    r = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_sources",
                     headers=REST_HEADERS, params={"select": "id", "radicado": f"eq.{rad}"},
                     timeout=30)
    if r.status_code == 200 and r.json():
        return r.json()[0]["id"], False
    # Create
    prefix, num, year = parse_radicado(rad)
    tipo = "Constitucionalidad" if prefix == "C" else "Tutela" if prefix == "T" else "Unificacion" if prefix == "SU" else prefix or "Otro"
    host = urlparse(s["url"]).netloc if s.get("url") else None
    payload = {
        "slug": radicado_to_slug(rad),
        "radicado": rad,
        "tipo_providencia": tipo,
        "corte": s.get("corte", "Corte Constitucional"),
        "fecha_emision_anio": year,
        "title": f"Sentencia {rad} — {s.get('titulo','')[:200]}",
        "primary_source_kind": "external",
        "primary_source_url": s.get("url"),
        "primary_source_host": host,
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/jurisprudence_sources",
                      headers=REST_HEADERS, json=[payload], timeout=60)
    if r.status_code in (200, 201):
        return r.json()[0]["id"], True
    return None, False


def fetch_text(url):
    """Multi-format: PDF or HTML (CC relatoria)."""
    r = SESSION.get(url, timeout=90, allow_redirects=True)
    r.raise_for_status()
    ct = (r.headers.get("Content-Type") or "").lower()
    if "pdf" in ct or r.content[:5] == b"%PDF-":
        reader = PdfReader(BytesIO(r.content))
        return "\n".join((p.extract_text() or "") for p in reader.pages), "pdf"
    # HTML (CC uses windows-1252)
    raw = r.content
    m = re.search(rb'charset=[\"\']?([a-zA-Z0-9-]+)', raw[:3000])
    enc = m.group(1).decode("ascii", "ignore").lower() if m else "utf-8"
    for try_enc in (enc, "windows-1252", "utf-8", "latin-1"):
        try:
            text = raw.decode(try_enc); break
        except Exception: continue
    else:
        text = raw.decode("latin-1", errors="replace")
    soup = BeautifulSoup(text, "html.parser")
    body = soup.find("body") or soup
    return body.get_text(separator="\n", strip=True), "html"


SECTION_RE = re.compile(
    r'\n\s*(?:(?:I{1,3}V?|IV|V|VI{1,3})\.?\s+)?'
    r'(ANTECEDENTES|CONSIDERACIONES(?:\s+DE\s+LA\s+CORTE|\s+Y\s+FUNDAMENTOS)?|'
    r'FUNDAMENTOS(?:\s+DE\s+LA\s+DECISI[ÓO]N)?|DECISI[ÓO]N|RESUELVE|HECHOS)\s*\n',
    re.IGNORECASE)


def classify_key(h):
    u = h.upper()
    if "HECHO" in u or "ANTECEDENTE" in u: return "antecedentes", "Antecedentes / Hechos"
    if "FUNDAMENTO" in u or "CONSIDERA" in u: return "considerandos", "Considerandos / Fundamentos"
    if "DECISI" in u or "RESUELVE" in u: return "decision", "Decisión / Resuelve"
    return "otros", h.strip().title()


def split_sections(text):
    matches = list(SECTION_RE.finditer(text))
    if not matches:
        return [{"section_key": "documento_completo", "section_label": "Documento completo",
                 "content": text, "order_index": 1}]
    chunks = []
    pre = text[:matches[0].start()].strip()
    if len(pre) >= 200:
        chunks.append({"section_key": "preambulo", "section_label": "Preámbulo / Encabezado",
                       "content": pre, "order_index": 1})
    groups = {}
    for i, m in enumerate(matches):
        k, _ = classify_key(m.group(1))
        s = m.start(); e = matches[i+1].start() if i+1 < len(matches) else len(text)
        groups.setdefault(k, []).append(text[s:e].strip())
    order = ["preambulo", "antecedentes", "considerandos", "decision", "otros"]
    idx = len(chunks) + 1
    labels = {"antecedentes": "Antecedentes / Hechos", "considerandos": "Considerandos / Fundamentos",
              "decision": "Decisión / Resuelve", "otros": "Otros"}
    for k in order:
        if k == "preambulo" or k not in groups: continue
        merged = "\n\n".join(groups[k]).strip()
        if len(merged) < 100: continue
        chunks.append({"section_key": k, "section_label": labels[k],
                       "content": merged, "order_index": idx})
        idx += 1
    return chunks


def embed_texts(texts):
    truncated = [t[:EMBEDDING_MAX_CHARS] for t in texts]
    r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
    embs = [None]*len(texts)
    for d in r.data: embs[d.index] = d.embedding
    return embs, r.usage.total_tokens


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def insert_chunks(jid, chunks):
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    embs, tokens = embed_texts([c["content"] for c in chunks])
    rows = [{"jur_id": jid, "section_key": c["section_key"], "section_label": c["section_label"],
             "title": None, "content": c["content"],
             "content_tokens": math.ceil(len(c["content"])/4),
             "order_index": c["order_index"], "embedding": emb_lit(e),
             "embedding_model": EMBEDDING_MODEL, "embedding_generated_at": now}
            for c, e in zip(chunks, embs)]
    r = requests.post(f"{SUPABASE_URL}/rest/v1/jurisprudence_articles",
                      headers=REST_HEADERS, json=rows, timeout=120)
    return r.status_code, tokens


def main():
    recon = json.loads(RECON_JSON.read_text())
    nuevos = [s for s in recon["jurisprudencia"] if not s.get("in_corpus")]
    print(f"[info] sentencias nuevas: {len(nuevos)}")

    today = time.strftime("%Y-%m-%d")
    stats = {"total": len(nuevos), "created_sources": 0, "skipped_existing": 0,
             "chunks_inserted": 0, "errors": [], "tokens": 0, "per_doc": []}

    for idx, s in enumerate(nuevos, 1):
        if idx > 1: time.sleep(FETCH_DELAY)
        rad = s["radicado"]; url = s.get("url", "")
        print(f"\n[{idx}/{len(nuevos)}] {rad}")
        if not url:
            print(f"  SKIP: no URL")
            stats["errors"].append({"rad": rad, "stage": "no_url"}); continue

        jid, created = get_or_create_jur_source(s)
        if not jid:
            print(f"  ERROR create jur_source")
            stats["errors"].append({"rad": rad, "stage": "create_source"}); continue
        if created: stats["created_sources"] += 1
        print(f"  jur_id={jid[:8]} {'(nueva)' if created else '(existente)'}")

        # Check if already has articles
        h = dict(REST_HEADERS); h["Prefer"] = "count=exact"; h["Range"] = "0-0"
        cr = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_articles", headers=h,
                          params={"select": "id", "jur_id": f"eq.{jid}"}, timeout=30)
        count = int(cr.headers.get("content-range", "0-0/0").split("/")[-1])
        if count > 0:
            print(f"  SKIP: ya tiene {count} artículos")
            stats["skipped_existing"] += 1; continue

        try:
            text, kind = fetch_text(url)
        except Exception as e:
            print(f"  ERROR fetch: {str(e)[:100]}")
            stats["errors"].append({"rad": rad, "stage": "fetch", "error": str(e)[:200]})
            continue
        if len(text) < 200:
            print(f"  WARN texto corto ({len(text)})")
            stats["errors"].append({"rad": rad, "stage": "empty", "chars": len(text)})
            continue

        chunks = split_sections(text)
        print(f"  kind={kind} chars={len(text):,} chunks={len(chunks)}")

        ins_status, tokens = insert_chunks(jid, chunks)
        stats["tokens"] += tokens
        if ins_status not in (200, 201):
            stats["errors"].append({"rad": rad, "stage": "insert", "status": ins_status})
            continue
        stats["chunks_inserted"] += len(chunks)
        stats["per_doc"].append({"rad": rad, "chunks": len(chunks), "tokens": tokens, "kind": kind})
        print(f"  ✓ INSERT {len(chunks)} chunks, {tokens} tokens")

    stats["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["cost_usd"] = round(stats["tokens"] * 0.02 / 1e6, 6)
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN TAREA B"); print("="*78)
    for k in ["total", "created_sources", "skipped_existing", "chunks_inserted", "tokens"]:
        print(f"  {k}: {stats[k]}")
    print(f"  errores: {len(stats['errors'])}")
    print(f"  cost: ${stats['cost_usd']:.4f}")


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: sys.exit(130)
