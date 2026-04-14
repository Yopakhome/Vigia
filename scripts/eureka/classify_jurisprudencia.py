#!/usr/bin/env python3
"""Recorre los 120 detalles de Jurisprudencia EUREKA una sola vez.

Gemelo de classify_and_cache_details.py pero con:
  - Lee recon_jurisprudencia.json (120 sentencias)
  - Guarda HTMLs en html_cache_jurisprudencia/ (separado del cache de Normativa)
  - Escribe source_classification_jurisprudencia.json
  - OFFICIAL_DOMAINS incluye subdominios de las cortes (relatoria.*, etc.)
    para que las sentencias linkeadas ahí caigan como external_official.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

BASE = "https://www.anla.gov.co"
UA = "Mozilla/5.0 (compatible; VIGIAResearchBot/1.0; +https://vigia-five.vercel.app)"
DELAY = 3.0

HERE = Path(__file__).parent
RECON = HERE / "recon_jurisprudencia.json"
CACHE_DIR = HERE / "html_cache_jurisprudencia"
OUT = HERE / "source_classification_jurisprudencia.json"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9,en;q=0.8"})

PDF_RE = re.compile(r"\.pdf(\?|$)", re.I)
DOC_RE = re.compile(r"\.docx?(\?|$)", re.I)

OFFICIAL_DOMAINS = {
    "suin-juriscol.gov.co", "www.suin-juriscol.gov.co",
    "funcionpublica.gov.co", "www.funcionpublica.gov.co",
    "secretariasenado.gov.co", "www.secretariasenado.gov.co",
    "alcaldiabogota.gov.co", "www.alcaldiabogota.gov.co",
    "minambiente.gov.co", "www.minambiente.gov.co",
    "anla.gov.co", "www.anla.gov.co",
    "corteconstitucional.gov.co", "www.corteconstitucional.gov.co",
    "relatoria.corteconstitucional.gov.co",
    "consejodeestado.gov.co", "www.consejodeestado.gov.co",
    "relatoria.consejodeestado.gov.co",
    "ramajudicial.gov.co", "www.ramajudicial.gov.co",
    "cortesuprema.gov.co", "www.cortesuprema.gov.co",
    "minsalud.gov.co", "www.minsalud.gov.co",
    "mininterior.gov.co", "www.mininterior.gov.co",
    "cancilleria.gov.co", "www.cancilleria.gov.co",
    "minenergia.gov.co", "www.minenergia.gov.co",
    "minagricultura.gov.co", "www.minagricultura.gov.co",
    "comunidadandina.org", "www.comunidadandina.org",
}


def fetch(url: str, retries: int = 2) -> requests.Response:
    for attempt in range(retries + 1):
        try:
            r = SESSION.get(url, timeout=30)
            if r.status_code in (429, 503):
                raise SystemExit(
                    f"[ABORT] {r.status_code} en {url} — Retry-After={r.headers.get('Retry-After')}"
                )
            r.raise_for_status()
            return r
        except (requests.ConnectionError, requests.Timeout) as e:
            if attempt < retries:
                backoff = 10 * (attempt + 1)
                print(f"   [retry {attempt+1}/{retries}] {type(e).__name__} — esperando {backoff}s")
                time.sleep(backoff)
            else:
                raise


def cache_filename(item: dict) -> Path:
    # macOS limita nombres a 255 bytes. Truncamos slug pero conservamos unicidad
    # con un hash corto del slug completo al final.
    import hashlib
    base = f"{item['subcategory_slug']}__{item['slug']}"
    if len(base) + len(".html") > 240:
        h = hashlib.sha1(item['slug'].encode()).hexdigest()[:10]
        keep = 240 - len(item['subcategory_slug']) - len("____") - len(h) - len(".html")
        base = f"{item['subcategory_slug']}__{item['slug'][:keep]}__{h}"
    return CACHE_DIR / f"{base}.html"


def classify(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    main = (soup.find(attrs={"itemprop": "articleBody"})
            or soup.find("article")
            or soup.find("main")
            or soup)

    inline_pdfs: list[str] = []
    external_links: list[dict] = []

    for a in main.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#") or href.startswith("javascript"):
            continue
        text = (a.get_text(strip=True) or "")[:160]
        # Inline PDF bajo ANLA
        if href.startswith("/eureka/images/") or href.startswith("/images/"):
            full = BASE + href
            if PDF_RE.search(href):
                inline_pdfs.append(full)
            continue
        if href.startswith("http"):
            host = urlparse(href).netloc
            if "anla.gov.co" in host and PDF_RE.search(href):
                inline_pdfs.append(href)
                continue
            if host:
                external_links.append({
                    "host": host, "href": href, "text": text,
                    "is_pdf": bool(PDF_RE.search(href)),
                    "is_doc": bool(DOC_RE.search(href)),
                    "is_official": host in OFFICIAL_DOMAINS,
                })

    # Título limpio
    doc_title = None
    for h in soup.find_all(["h1", "h2"]):
        t = h.get_text(strip=True)
        if not t:
            continue
        low = t.lower()
        if "temas relacionados" in low or "autoridad nacional de licencias" in low:
            continue
        doc_title = t
        break
    if not doc_title:
        tt = soup.find("title")
        if tt:
            doc_title = tt.get_text(strip=True)

    # Primary source
    if inline_pdfs:
        primary = {"kind": "inline_pdf", "url": inline_pdfs[0]}
    else:
        official = [e for e in external_links if e["is_official"]]
        if official:
            primary = {"kind": "external_official", "url": official[0]["href"],
                       "host": official[0]["host"], "text": official[0]["text"]}
        elif external_links:
            # Filtrar navegación interna del propio EUREKA
            non_eureka = [e for e in external_links if "anla.gov.co" not in e["host"]]
            if non_eureka:
                primary = {"kind": "external_other", "url": non_eureka[0]["href"],
                           "host": non_eureka[0]["host"], "text": non_eureka[0]["text"]}
            else:
                primary = {"kind": "none"}
        else:
            primary = {"kind": "none"}

    return {
        "doc_title": doc_title,
        "inline_pdf_count": len(inline_pdfs),
        "inline_pdfs": inline_pdfs,
        "external_link_count": len(external_links),
        "external_links": external_links[:15],
        "primary_source": primary,
    }


def main():
    if not RECON.exists():
        sys.exit(f"Falta {RECON}. Correr primero recon_normativa.py")

    recon = json.loads(RECON.read_text())
    items = recon["items"]
    print(f"Total items a procesar: {len(items)}")

    CACHE_DIR.mkdir(exist_ok=True)

    # Estado previo si existe
    results: list[dict] = []
    done_paths: set[str] = set()
    if OUT.exists():
        prev = json.loads(OUT.read_text())
        results = prev.get("records", [])
        done_paths = {r["path"] for r in results}
        print(f"Reanudando: {len(done_paths)} registros previos")

    t0 = time.time()
    n_total = len(items)
    n_cache_hits = 0

    for idx, it in enumerate(items, 1):
        if it["path"] in done_paths:
            continue

        cache_file = cache_filename(it)
        if cache_file.exists() and cache_file.stat().st_size > 1000:
            # HTML ya cacheado en una corrida previa
            html = cache_file.read_text(encoding="utf-8", errors="replace")
            n_cache_hits += 1
            from_cache = True
        else:
            time.sleep(DELAY)
            print(f"[{idx}/{n_total}] GET {it['slug'][:70]}")
            try:
                r = fetch(it["url"])
                html = r.text
                cache_file.write_text(html, encoding="utf-8")
                from_cache = False
            except Exception as e:
                print(f"   ERROR: {e}")
                record = {
                    **it, "cached": False, "error": str(e),
                    "primary_source": {"kind": "error"},
                }
                results.append(record)
                _write(results, n_total, t0)
                continue

        cls = classify(html)
        record = {
            **it,
            "cached": True,
            "cache_file": str(cache_file.relative_to(HERE)),
            "from_cache": from_cache,
            **cls,
        }
        results.append(record)

        if idx % 10 == 0 or idx == n_total:
            _write(results, n_total, t0)
            done = len(results)
            eta_s = (time.time() - t0) / max(done, 1) * (n_total - done)
            print(f"   progreso: {done}/{n_total}  "
                  f"cache_hits: {n_cache_hits}  "
                  f"eta: {int(eta_s)}s")

    _write(results, n_total, t0, final=True)
    _summary(results)


def _write(results, n_total, t0, final=False):
    payload = {
        "total_expected": n_total,
        "total_recorded": len(results),
        "elapsed_seconds": round(time.time() - t0, 1),
        "finalized": final,
        "records": results,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))


def _summary(results):
    from collections import Counter
    kinds = Counter(r.get("primary_source", {}).get("kind", "error") for r in results)
    print("\n=== RESUMEN ===")
    print(f"Total records: {len(results)}")
    for k, n in kinds.most_common():
        print(f"  {k}: {n}")
    inline_docs = [r for r in results if r.get("primary_source", {}).get("kind") == "inline_pdf"]
    print(f"\nDocs con PDF inline descargable: {len(inline_docs)}")
    by_sub = Counter(r["subcategory_slug"] for r in inline_docs)
    for sc, n in by_sub.most_common():
        print(f"  {sc}: {n}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[INTERRUMPIDO] estado guardado en source_classification.json")
        sys.exit(130)
