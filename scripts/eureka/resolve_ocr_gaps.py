#!/usr/bin/env python3
"""Resuelve gaps OCR llamando a la edge function norm-extract-text
(que corre Claude vision server-side) y reutilizando el norm_id
existente en normative_sources para insertar chunks en normative_articles.

No crea nuevas normative_sources (ya existen con corpus_source='eureka_metadata').

Flow por gap:
  1. POST /functions/v1/norm-extract-text con pdf_url.
  2. Si devuelve texto limpio (>500 chars, text_method != "empty"):
     - Parsear con regex tolerante (fix SA-DEUDA-7 aplicado local).
     - Embed + INSERT en normative_articles con norm_id del source.
  3. Si falla → registrar ultimo_intento + fuentes_intentadas.
"""
from __future__ import annotations
import json, math, os, re, sys, time
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
if any(not os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY")):
    sys.exit("[FATAL] env vars missing")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
# Anon key (publishable) del ocr_scans_via_edge.py existente
SB_PUB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV"
EMAIL = "admin@cerrejon-norte.vigia-test.co"
PWD = "Vigia2026!"

from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
REPORT_JSON = HERE / "resolve_ocr_gaps_report.json"
CORPUS_GAPS_JSON = HERE / "corpus_gaps.json"

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}


def login():
    r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": SB_PUB_KEY, "Content-Type": "application/json"},
                      json={"email": EMAIL, "password": PWD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def extract_text_via_edge(token, pdf_url):
    r = requests.post(f"{SUPABASE_URL}/functions/v1/norm-extract-text",
                      headers={"apikey": SB_PUB_KEY, "Authorization": f"Bearer {token}",
                               "Content-Type": "application/json"},
                      json={"pdf_url": pdf_url, "force_ocr": True}, timeout=240)
    try:
        body = r.json()
    except Exception:
        body = {"error": r.text[:500]}
    return r.status_code, body


def find_source_id(norm_number, norm_year, norm_type):
    params = {"select": "id",
              "norm_number": f"eq.{norm_number}",
              "norm_year": f"eq.{norm_year}",
              "norm_type": f"eq.{norm_type}"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                     headers=REST_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    rows = r.json()
    if len(rows) == 1: return rows[0]["id"]
    # Probar variante con ceros a la izquierda (0108, 0827, 0762)
    padded = str(int(norm_number)).zfill(4)
    if padded != norm_number:
        params["norm_number"] = f"eq.{padded}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                         headers=REST_HEADERS, params=params, timeout=30)
        r.raise_for_status()
        rows = r.json()
        if len(rows) == 1: return rows[0]["id"]
    return None


ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?(\d{1,4}(?:\.\d+)*[A-Za-z]?)[°º\.\s]",
    re.IGNORECASE | re.MULTILINE)


def parse_articles(text):
    norm = text.replace("\r", "").replace("\t", " ")
    matches = [(m.start() + len(m.group(1)), f"{m.group(2).strip()} {m.group(3)}".strip(), m.group(3))
               for m in ARTICLE_RE.finditer(norm)]
    if not matches: return []
    out = []
    for i, (s, label, num) in enumerate(matches):
        e = matches[i+1][0] if i+1 < len(matches) else len(norm)
        chunk = norm[s:e].strip()
        out.append({"article_number": num, "article_label": label,
                    "title": None, "content": chunk})
    # Dedup
    by = {}
    for a in out:
        k = a["article_number"]
        if k not in by or len(a["content"]) > len(by[k]["content"]):
            by[k] = a
    out = list(by.values())
    for i, a in enumerate(out, 1):
        a["order_index"] = i
        a["content_tokens"] = math.ceil(len(a["content"]) / 4)
    return out


def embed_texts(texts):
    truncated = [t[:EMBEDDING_MAX_CHARS_PRIMARY] for t in texts]
    r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
    embs = [None] * len(texts)
    for d in r.data: embs[d.index] = d.embedding
    return embs, r.usage.total_tokens


def emb_lit(e):
    return None if e is None else "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def delete_existing_articles(nid):
    """Borra chunks previos (p.ej. el fallback basura de Res 762/2022)."""
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/normative_articles",
                        headers=REST_HEADERS, params={"norm_id": f"eq.{nid}"}, timeout=30)
    return r.status_code in (200, 204)


def insert_chunks(nid, arts):
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    embs, tokens = embed_texts([a["content"] for a in arts])
    rows = []
    for a, e in zip(arts, embs):
        rows.append({
            "norm_id": nid,
            "article_number": a.get("article_number"),
            "article_label": a.get("article_label"),
            "title": a.get("title"),
            "content": a["content"],
            "content_tokens": a.get("content_tokens"),
            "order_index": a["order_index"],
            "chapter": None, "section": None,
            "embedding": emb_lit(e),
            "embedding_model": EMBEDDING_MODEL,
            "embedding_generated_at": now,
        })
    r = requests.post(f"{SUPABASE_URL}/rest/v1/normative_articles",
                      headers=REST_HEADERS, json=rows, timeout=120)
    return r.status_code, r.text[:300], tokens


def patch_source_parser(nid, method, quality):
    payload = {"parser_method": method, "parser_quality": quality}
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/normative_sources",
                       headers=REST_HEADERS, params={"id": f"eq.{nid}"},
                       json=payload, timeout=30)
    return r.status_code


def main():
    gaps_data = json.loads(CORPUS_GAPS_JSON.read_text())
    ocr_gaps = [g for g in gaps_data["gaps"] if g.get("reason") == "scan_no_ocr"]
    print(f"[info] OCR gaps: {len(ocr_gaps)}")

    print("[info] Login admin@cerrejon-norte…")
    token = login()
    print("  ✓ authenticated")

    report = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
              "results": [], "errors": []}
    today = time.strftime("%Y-%m-%d")

    for idx, gap in enumerate(ocr_gaps, 1):
        slug = gap["slug"]
        nn = gap["norm_number"]; ny = gap["norm_year"]; nt = gap["norm_type"]
        print(f"\n[{idx}/{len(ocr_gaps)}] {nt} {nn}/{ny} — {slug[:55]}")

        nid = find_source_id(nn, ny, nt)
        if not nid:
            gap["status"] = "pendiente"
            gap["ultimo_intento"] = today
            gap.setdefault("fuentes_intentadas", []).append("source_row_not_found_in_db")
            report["errors"].append({"slug": slug, "error": "source not in DB"})
            print(f"  WARN: source not in DB")
            continue
        print(f"  source_id={nid[:8]}…")

        pdf_url = gap["urls_intentadas"][0]
        # Extraer URL sin comentarios tipo " (carátula HTML)"
        pdf_url = pdf_url.split(" (")[0].strip()
        if not pdf_url.lower().endswith(".pdf"):
            # Res 827/2018 y Res 762/2022 tienen 2 URLs, tomar la .pdf (índice 1)
            for u in gap["urls_intentadas"]:
                u_clean = u.split(" (")[0].strip()
                if u_clean.lower().endswith(".pdf"):
                    pdf_url = u_clean; break
        print(f"  PDF: {pdf_url}")

        print(f"  → norm-extract-text (force_ocr=true)…")
        t0 = time.time()
        status, body = extract_text_via_edge(token, pdf_url)
        elapsed = round(time.time() - t0, 1)
        if status != 200 or not body.get("ok"):
            err = body.get("error") or str(body)[:200]
            print(f"  ✗ extract falló ({status}, {elapsed}s): {err}")
            gap["status"] = "pendiente"
            gap["ultimo_intento"] = today
            gap.setdefault("fuentes_intentadas", []).append({
                "url": pdf_url, "via": "norm-extract-text", "error": err[:200]
            })
            report["errors"].append({"slug": slug, "stage": "extract",
                                     "status": status, "error": err[:400]})
            continue

        text = body.get("text", "")
        method = body.get("text_method", "?")
        ocr_usage = body.get("ocr_usage") or {}
        print(f"  ✓ extract OK ({elapsed}s): chars={len(text):,} method={method} "
              f"tokens_in={ocr_usage.get('tokens_in',0)} tokens_out={ocr_usage.get('tokens_out',0)}")

        if len(text) < 500:
            print(f"  WARN: texto corto, fallback chunk único")

        arts = parse_articles(text)
        if len(arts) < 2:
            arts = [{
                "article_number": None, "article_label": "Documento completo",
                "title": None, "content": text, "order_index": 1,
                "content_tokens": math.ceil(len(text)/4),
            }]
            chunking = "fallback_doc_completo"
        else:
            chunking = f"{len(arts)}_articulos"
        print(f"  parsed: {chunking}")

        # Borrar chunks existentes basura (Res 762/2022 tiene 1)
        if delete_existing_articles(nid):
            print(f"  cleaned existing articles")

        ins_status, ins_err, emb_tokens = insert_chunks(nid, arts)
        if ins_status not in (200, 201):
            print(f"  ✗ insert falló ({ins_status}): {ins_err}")
            gap["status"] = "pendiente"
            gap["ultimo_intento"] = today
            gap.setdefault("fuentes_intentadas", []).append({
                "url": pdf_url, "via": "norm-extract-text+insert",
                "error": f"insert_{ins_status}: {ins_err}"
            })
            report["errors"].append({"slug": slug, "stage": "insert",
                                     "status": ins_status, "error": ins_err})
            continue

        quality = "high" if len(arts) >= 5 else "medium" if len(arts) >= 2 else "low"
        patch_source_parser(nid, "llm", quality)

        gap["status"] = "resuelto"
        gap["resuelto_en"] = today
        gap["resultado"] = {
            "via": "norm-extract-text (Claude OCR)",
            "text_method": method,
            "chars": len(text),
            "articles": len(arts),
            "chunking": chunking,
            "ocr_tokens_in": ocr_usage.get("tokens_in"),
            "ocr_tokens_out": ocr_usage.get("tokens_out"),
        }
        report["results"].append({"slug": slug, "status": "resuelto",
                                  "chars": len(text), "arts": len(arts),
                                  "ocr_tokens_in": ocr_usage.get("tokens_in", 0),
                                  "ocr_tokens_out": ocr_usage.get("tokens_out", 0)})
        print(f"  ✓ RESUELTO: {len(arts)} chunks insertados")

    # Actualizar corpus_gaps.json
    gaps_data["last_updated"] = f"{today} (Fase 1 — OCR gaps resolución)"
    gaps_data["stats"]["by_status"] = {}
    for g in gaps_data["gaps"]:
        s = g.get("status", "pendiente")
        gaps_data["stats"]["by_status"][s] = gaps_data["stats"]["by_status"].get(s, 0) + 1

    CORPUS_GAPS_JSON.write_text(json.dumps(gaps_data, ensure_ascii=False, indent=2))
    report["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN"); print("="*78)
    print(f"  gaps procesados: {len(ocr_gaps)}")
    print(f"  resueltos: {sum(1 for r in report['results'] if r['status']=='resuelto')}")
    print(f"  pendientes: {len(report['errors'])}")
    print(f"  output: {REPORT_JSON}")


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: print("\n[INTERRUMPIDO]"); sys.exit(130)
