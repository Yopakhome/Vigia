#!/usr/bin/env python3
"""Resuelve el gap SSL de Directiva Presidencial 10/2013.

Estrategia:
  1. Fetch via HTTPAdapter con SSLContext relajado (TLS 1.0 legacy).
     Es el workaround documentado en el propio gap.
  2. Parse HTML body → texto.
  3. Chunk único 'Documento completo' (es guía administrativa, no articulado).
  4. Embed + INSERT en normative_articles con norm_id existente.
  5. Actualizar corpus_gaps.json con status.
"""
from __future__ import annotations
import json, math, os, ssl, sys, time
from pathlib import Path
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from bs4 import BeautifulSoup
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
from openai import OpenAI  # noqa: E402
OPENAI_CLIENT = OpenAI()

REPORT_JSON = HERE / "resolve_ssl_gap_report.json"
CORPUS_GAPS_JSON = HERE / "corpus_gaps.json"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 24_000
USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=representation",
}


class LegacyTLSAdapter(HTTPAdapter):
    """Adapter que acepta TLS 1.0+ y seclevel bajo. SOLO para uso aislado."""
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context(
            ssl_version=ssl.PROTOCOL_TLS_CLIENT,
            ciphers="DEFAULT@SECLEVEL=0")
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


def fetch_with_legacy_ssl(url):
    s = requests.Session()
    s.mount("https://", LegacyTLSAdapter())
    s.headers.update({"User-Agent": USER_AGENT})
    r = s.get(url, timeout=60, verify=False)
    r.raise_for_status()
    return r


def find_source_id(norm_number, norm_year, norm_type):
    params = {"select": "id", "norm_number": f"eq.{norm_number}",
              "norm_year": f"eq.{norm_year}", "norm_type": f"eq.{norm_type}"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                     headers=REST_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    rows = r.json()
    return rows[0]["id"] if rows else None


def embed_one(text):
    r = OPENAI_CLIENT.embeddings.create(
        model=EMBEDDING_MODEL, input=text[:EMBEDDING_MAX_CHARS])
    return r.data[0].embedding, r.usage.total_tokens


def emb_lit(e):
    return "[" + ",".join(f"{f:.7f}" for f in e) + "]"


def main():
    gaps = json.loads(CORPUS_GAPS_JSON.read_text())
    gap = next((g for g in gaps["gaps"] if g.get("reason") == "ssl_obsoleto_servidor"), None)
    if not gap:
        print("[info] no SSL gap encontrado"); return

    slug = gap["slug"]
    nn = gap["norm_number"]; ny = gap["norm_year"]; nt = gap["norm_type"]
    url = gap["urls_intentadas"][0]
    today = time.strftime("%Y-%m-%d")

    print(f"[info] Directiva Pres {nn}/{ny}")
    print(f"[info] URL: {url}")

    nid = find_source_id(nn, ny, nt)
    if not nid:
        print("[warn] source not in DB — skipping")
        gap["status"] = "pendiente"
        gap["ultimo_intento"] = today
        gap.setdefault("fuentes_intentadas", []).append({
            "url": url, "via": "db_lookup", "error": "source not in DB"})
        CORPUS_GAPS_JSON.write_text(json.dumps(gaps, ensure_ascii=False, indent=2))
        return
    print(f"[info] source_id={nid}")

    report = {"url": url, "source_id": nid}
    attempted = []

    # Tentativa 1: SSL legacy adapter
    try:
        print("[try] SSL legacy adapter…")
        import urllib3; urllib3.disable_warnings()
        r = fetch_with_legacy_ssl(url)
        text_raw = r.content.decode(r.apparent_encoding or "utf-8", errors="replace")
        print(f"[ok] fetched {len(text_raw):,} chars (raw)")
        attempted.append({"url": url, "via": "ssl_legacy_adapter", "status": "ok",
                          "chars": len(text_raw)})
        soup = BeautifulSoup(text_raw, "html.parser")
        body = soup.find("body") or soup
        text = body.get_text(separator="\n", strip=True)
        print(f"[parse] body text: {len(text):,} chars")
        if len(text) < 300:
            raise ValueError("body text too short")

        # Chunk único
        emb, tokens = embed_one(text)
        now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        payload = [{
            "norm_id": nid, "article_number": None,
            "article_label": "Documento completo",
            "title": None, "content": text,
            "content_tokens": math.ceil(len(text)/4),
            "order_index": 1, "chapter": None, "section": None,
            "embedding": emb_lit(emb),
            "embedding_model": EMBEDDING_MODEL,
            "embedding_generated_at": now,
        }]
        # Borrar previos (no debería haber)
        requests.delete(f"{SUPABASE_URL}/rest/v1/normative_articles",
                        headers=REST_HEADERS, params={"norm_id": f"eq.{nid}"}, timeout=30)
        ir = requests.post(f"{SUPABASE_URL}/rest/v1/normative_articles",
                           headers=REST_HEADERS, json=payload, timeout=60)
        if ir.status_code not in (200, 201):
            raise RuntimeError(f"insert_fail_{ir.status_code}: {ir.text[:200]}")

        # Patch parser
        requests.patch(f"{SUPABASE_URL}/rest/v1/normative_sources",
                       headers=REST_HEADERS, params={"id": f"eq.{nid}"},
                       json={"parser_method": "manual",
                             "parser_quality": "medium"}, timeout=30)

        gap["status"] = "resuelto"
        gap["resuelto_en"] = today
        gap["resultado"] = {
            "via": "ssl_legacy_adapter",
            "chars": len(text), "articles": 1, "chunking": "documento_completo",
            "embedding_tokens": tokens,
        }
        report["result"] = "resuelto"
        report["chars"] = len(text)
        print(f"[ok] RESUELTO: 1 chunk insertado, {tokens} tokens")
    except Exception as e:
        err = str(e)[:200]
        print(f"[fail] SSL legacy: {err}")
        attempted.append({"url": url, "via": "ssl_legacy_adapter",
                          "status": "fail", "error": err})
        gap["status"] = "pendiente"
        gap["ultimo_intento"] = today
        gap.setdefault("fuentes_intentadas", []).extend(attempted)
        report["result"] = "pendiente"
        report["error"] = err

    gaps["last_updated"] = f"{today} (Fase 2 — SSL gap)"
    CORPUS_GAPS_JSON.write_text(json.dumps(gaps, ensure_ascii=False, indent=2))
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print("\n" + "="*60)
    print(f"  resultado: {report['result']}")
    print("="*60)


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: sys.exit(130)
