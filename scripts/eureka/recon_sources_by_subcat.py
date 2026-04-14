#!/usr/bin/env python3
"""Explora 1 doc por subcategoría para clasificar el patrón de fuente.

Motivación: el primer recon encontró que leyes/decretos linkean a sitios
externos (SUIN-Juriscol etc.), no a PDFs internos. Las circulares sí tienen
PDF inline en /eureka/images/. Necesitamos confirmar el patrón por cada
subcategoría antes de seguir.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

BASE = "https://www.anla.gov.co"
UA = "Mozilla/5.0 (compatible; VIGIAResearchBot/1.0; +https://vigia-five.vercel.app)"
DELAY = 3.0
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})

RECON = Path(__file__).parent / "recon_normativa.json"
OUT = Path(__file__).parent / "recon_sources_by_subcat.json"


def fetch(url: str, retries: int = 2):
    for attempt in range(retries + 1):
        try:
            r = SESSION.get(url, timeout=30)
            r.raise_for_status()
            return r
        except (requests.ConnectionError, requests.Timeout) as e:
            if attempt < retries:
                time.sleep(10 * (attempt + 1))
            else:
                raise


PDF_RE = re.compile(r"\.pdf(\?|$)", re.I)
DOC_RE = re.compile(r"\.docx?(\?|$)", re.I)

# Dominios oficiales conocidos donde ANLA/MinJusticia publican textos
OFFICIAL_DOMAINS = {
    "suin-juriscol.gov.co",
    "www.suin-juriscol.gov.co",
    "funcionpublica.gov.co",
    "www.funcionpublica.gov.co",
    "secretariasenado.gov.co",
    "www.secretariasenado.gov.co",
    "alcaldiabogota.gov.co",
    "www.alcaldiabogota.gov.co",
    "minambiente.gov.co",
    "www.minambiente.gov.co",
    "anla.gov.co",
    "www.anla.gov.co",
    "corteconstitucional.gov.co",
    "www.corteconstitucional.gov.co",
    "consejodeestado.gov.co",
    "www.consejodeestado.gov.co",
    "ramajudicial.gov.co",
    "www.ramajudicial.gov.co",
    "minsalud.gov.co",
    "www.minsalud.gov.co",
    "mininterior.gov.co",
    "www.mininterior.gov.co",
    "comunidadandina.org",
    "www.comunidadandina.org",
    "oas.org",
    "www.oas.org",
}


def classify_detail(url: str) -> dict:
    r = fetch(url)
    soup = BeautifulSoup(r.text, "html.parser")

    # Intenta aislar el artículo principal (Joomla normalmente usa <main>
    # o una div con itemprop="articleBody"; si no lo encontramos, usamos todo)
    main = (soup.find(attrs={"itemprop": "articleBody"})
            or soup.find("article")
            or soup.find("main")
            or soup)

    inline_pdfs: list[str] = []
    external_links: list[dict] = []

    for a in main.find_all("a", href=True):
        href = a["href"].strip()
        text = (a.get_text(strip=True) or "")[:120]
        if not href or href.startswith("#") or href.startswith("javascript"):
            continue
        # PDF inline en ANLA
        if href.startswith("/eureka/images/") or href.startswith("/images/"):
            inline_pdfs.append(BASE + href)
            continue
        if href.startswith("http"):
            host = urlparse(href).netloc
            if "anla.gov.co" in host and PDF_RE.search(href):
                inline_pdfs.append(href)
                continue
            # Externo
            external_links.append({
                "host": host,
                "href": href,
                "text": text,
                "is_pdf": bool(PDF_RE.search(href)),
                "is_doc": bool(DOC_RE.search(href)),
                "is_official": host in OFFICIAL_DOMAINS,
            })

    # Extrae título "real" del doc: buscar h1 que NO sea "Temas Relacionados"
    doc_title = None
    for h1 in soup.find_all(["h1", "h2"]):
        t = h1.get_text(strip=True)
        if t and "temas relacionados" not in t.lower() and "autoridad nacional" not in t.lower():
            doc_title = t
            break
    if not doc_title:
        tt = soup.find("title")
        if tt:
            doc_title = tt.get_text(strip=True)

    # Primary source: el primer PDF inline, o el primer link externo oficial
    primary = None
    if inline_pdfs:
        primary = {"kind": "inline_pdf", "url": inline_pdfs[0]}
    else:
        official = [e for e in external_links if e["is_official"]]
        if official:
            primary = {"kind": "external_official", "url": official[0]["href"],
                       "host": official[0]["host"], "text": official[0]["text"]}
        elif external_links:
            primary = {"kind": "external_other", "url": external_links[0]["href"],
                       "host": external_links[0]["host"], "text": external_links[0]["text"]}

    return {
        "url": url,
        "doc_title": doc_title,
        "inline_pdf_count": len(inline_pdfs),
        "inline_pdfs": inline_pdfs[:5],
        "external_link_count": len(external_links),
        "external_sample": external_links[:10],
        "primary_source": primary,
    }


def main():
    recon = json.loads(RECON.read_text())
    items = recon["items"]
    # Agrupa por subcategoría
    by_subcat: dict[str, list] = {}
    for it in items:
        by_subcat.setdefault(it["subcategory_slug"], []).append(it)

    print(f"Subcategorías: {len(by_subcat)}")
    for sc, lst in by_subcat.items():
        print(f"  {sc}: {len(lst)}")

    # Tomar 2 por subcategoría (el primero y el último) para más cobertura
    results: dict = {"probes": {}}
    for sc, lst in by_subcat.items():
        probes = [lst[0]]
        if len(lst) > 1:
            probes.append(lst[-1])
        classified = []
        for p in probes:
            time.sleep(DELAY)
            print(f"\n[{sc}] Probing: {p['slug'][:60]}")
            try:
                c = classify_detail(p["url"])
                c["source_item"] = p
                classified.append(c)
                primary = c.get("primary_source") or {}
                print(f"   → inline_pdfs={c['inline_pdf_count']}  "
                      f"externals={c['external_link_count']}  "
                      f"primary_kind={primary.get('kind')}  "
                      f"primary_host={primary.get('host')}")
            except Exception as e:
                print(f"   ERROR: {e}")
                classified.append({"url": p["url"], "error": str(e), "source_item": p})
        results["probes"][sc] = classified

    # Resumen agregado
    summary: dict[str, dict] = {}
    for sc, probes in results["probes"].items():
        kinds = [p.get("primary_source", {}).get("kind") for p in probes if "primary_source" in p]
        hosts = [p.get("primary_source", {}).get("host") for p in probes
                 if p.get("primary_source", {}).get("host")]
        summary[sc] = {
            "sample_size": len(probes),
            "primary_kinds": kinds,
            "hosts": hosts,
        }
    results["summary"] = summary

    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\n[OK] Escrito {OUT}")
    print("\n=== RESUMEN POR SUBCATEGORÍA ===")
    for sc, info in summary.items():
        print(f"  {sc}: kinds={info['primary_kinds']} hosts={info['hosts']}")


if __name__ == "__main__":
    main()
