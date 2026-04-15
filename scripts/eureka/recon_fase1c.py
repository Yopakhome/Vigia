#!/usr/bin/env python3
"""Sprint A2 Fase 1C — recon de 4 categorías EUREKA pendientes.

Categorías objetivo:
  - /eureka/procedimientos-y-procesos
  - /eureka/manuales-guias-y-programas
  - /eureka/conceptos-y-problemas-juridicos
  - /eureka/documentos-estrategicos

Excluidas: especies-en-riesgo, gestion-del-conocimiento, normativa, jurisprudencia.

Proceso (SOLO recon, NO ingesta):
  1. Por cada categoría: listar items paginando ?start=N (step 10).
  2. Extraer slug, subcategoría, title, URL detalle.
  3. Sample de 2 items por subcategoría: fetch detail + clasificar fuente
     primaria (inline PDF / external official / HTML / ninguno).
  4. Escribir recon_fase1c.json con metadata agregada.
"""
from __future__ import annotations
import json, re, time
from pathlib import Path
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

BASE = "https://www.anla.gov.co"
UA = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
DELAY = 3.0
OUT = Path(__file__).parent / "recon_fase1c.json"

CATEGORIES = [
    ("/eureka/procedimientos-y-procesos", "Procedimientos y Procesos"),
    ("/eureka/manuales-guias-y-programas", "Manuales, Guías y Programas"),
    ("/eureka/conceptos-y-problemas-juridicos", "Conceptos y Problemas Jurídicos"),
    ("/eureka/documentos-estrategicos", "Documentos Estratégicos"),
]

OFFICIAL_DOMAINS = {
    "www.anla.gov.co", "anla.gov.co",
    "www.minambiente.gov.co", "minambiente.gov.co",
    "www.corteconstitucional.gov.co", "corteconstitucional.gov.co",
    "www.funcionpublica.gov.co", "funcionpublica.gov.co",
    "www.suin-juriscol.gov.co", "suin-juriscol.gov.co",
    "www.secretariasenado.gov.co", "secretariasenado.gov.co",
    "www.minsalud.gov.co", "minsalud.gov.co",
    "www.mininterior.gov.co", "mininterior.gov.co",
    "www.dnp.gov.co", "dnp.gov.co",
    "www.ideam.gov.co", "ideam.gov.co",
}

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9"})


def fetch(url, retries=2):
    for attempt in range(retries + 1):
        try:
            r = SESSION.get(url, timeout=30)
            if r.status_code in (429, 503):
                raise SystemExit(f"[ABORT] {r.status_code} en {url}")
            r.raise_for_status(); return r
        except (requests.ConnectionError, requests.Timeout) as e:
            if attempt < retries: time.sleep(8 * (attempt + 1))
            else: raise


def parse_total_pages(soup):
    txt = soup.get_text(" ", strip=True)
    m = re.search(r"P[aá]gina\s+\d+\s+de\s+(\d+)", txt, re.I)
    if m: return int(m.group(1))
    max_start = 0
    for a in soup.find_all("a", href=True):
        mm = re.search(r"start=(\d+)", a["href"])
        if mm: max_start = max(max_start, int(mm.group(1)))
    return (max_start // 10) + 1


def collect_items(soup, cat_path):
    seen = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.startswith(cat_path + "/"): continue
        parts = [p for p in href.split("/") if p]
        if len(parts) < 4: continue
        title = a.get_text(strip=True)
        if href in seen:
            if title and not title.lower().startswith("lee más"):
                seen[href]["title"] = title
            continue
        seen[href] = {
            "url": BASE + href, "path": href,
            "subcategory_slug": parts[2],
            "slug": parts[3], "title": title,
        }
    for it in seen.values():
        t = it["title"] or ""
        if t.lower().startswith("lee más:"):
            it["title"] = t.split(":", 1)[1].strip().rstrip(".")
    return list(seen.values())


PDF_RE = re.compile(r"\.pdf(\?|$)", re.I)
DOC_RE = re.compile(r"\.docx?(\?|$)", re.I)


def classify_detail(url):
    r = fetch(url)
    soup = BeautifulSoup(r.text, "html.parser")
    main = (soup.find(attrs={"itemprop": "articleBody"})
            or soup.find("article") or soup.find("main") or soup)
    inline_pdfs = []; external_links = []
    for a in main.find_all("a", href=True):
        href = a["href"].strip()
        text = (a.get_text(strip=True) or "")[:120]
        if not href or href.startswith("#") or href.startswith("javascript"): continue
        if href.startswith("/eureka/images/") or href.startswith("/images/"):
            inline_pdfs.append(BASE + href); continue
        if href.startswith("http"):
            host = urlparse(href).netloc
            if "anla.gov.co" in host and PDF_RE.search(href):
                inline_pdfs.append(href); continue
            external_links.append({
                "host": host, "href": href, "text": text,
                "is_pdf": bool(PDF_RE.search(href)),
                "is_doc": bool(DOC_RE.search(href)),
                "is_official": host in OFFICIAL_DOMAINS,
            })
    doc_title = None
    for h in soup.find_all(["h1", "h2"]):
        t = h.get_text(strip=True)
        if t and "temas relacionados" not in t.lower() and "autoridad nacional" not in t.lower():
            doc_title = t; break
    primary = None
    if inline_pdfs:
        primary = {"kind": "inline_pdf", "url": inline_pdfs[0]}
    else:
        off = [e for e in external_links if e["is_official"]]
        if off:
            primary = {"kind": "external_official", "url": off[0]["href"],
                       "host": off[0]["host"]}
        elif external_links:
            primary = {"kind": "external_other", "url": external_links[0]["href"],
                       "host": external_links[0]["host"]}
    return {
        "doc_title": doc_title,
        "inline_pdf_count": len(inline_pdfs), "inline_pdfs": inline_pdfs[:3],
        "external_link_count": len(external_links),
        "external_sample": external_links[:5],
        "primary_source": primary,
    }


def recon_category(path, name):
    print(f"\n==== {name} ({path}) ====")
    url = BASE + path
    r = fetch(url); time.sleep(DELAY)
    soup = BeautifulSoup(r.text, "html.parser")
    total_pages = parse_total_pages(soup)
    print(f"  total_pages: {total_pages}")

    subcats = []
    seen_paths = set()
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if h.startswith(path + "/") and h.count("/") == 3:
            if h not in seen_paths:
                seen_paths.add(h)
                subcats.append({"name": a.get_text(strip=True)[:80], "path": h})
    print(f"  declared subcategories: {len(subcats)}")

    all_items = {}
    first = collect_items(soup, path)
    for it in first: all_items[it["path"]] = it

    for page_idx in range(1, total_pages):
        time.sleep(DELAY)
        start = page_idx * 10
        rp = fetch(f"{url}?start={start}")
        soup_p = BeautifulSoup(rp.text, "html.parser")
        new = 0
        for it in collect_items(soup_p, path):
            if it["path"] not in all_items:
                all_items[it["path"]] = it; new += 1
        print(f"  [page {page_idx+1}/{total_pages}] +{new} items (total={len(all_items)})")

    # agrupa por subcategoría
    by_sc = {}
    for it in all_items.values():
        by_sc.setdefault(it["subcategory_slug"], []).append(it)
    print(f"  subcategories with items: {sorted(by_sc.keys())}")

    # sample 2 por subcategoría (primer + último)
    samples = []
    for sc, lst in by_sc.items():
        probes = [lst[0]] + ([lst[-1]] if len(lst) > 1 else [])
        for p in probes:
            time.sleep(DELAY)
            print(f"    probe [{sc}] {p['slug'][:50]}")
            try:
                c = classify_detail(p["url"])
                c["source_item"] = p
                samples.append(c)
                prim = c.get("primary_source") or {}
                print(f"      → kind={prim.get('kind')} host={prim.get('host')}")
            except Exception as e:
                print(f"      ERROR: {e}")
                samples.append({"source_item": p, "error": str(e)})

    return {
        "category_path": path, "category_name": name,
        "total_pages": total_pages,
        "declared_subcategories": subcats,
        "items_count": len(all_items),
        "items": list(all_items.values()),
        "subcategory_counts": {k: len(v) for k, v in by_sc.items()},
        "sample_probes": samples,
    }


def main():
    t0 = time.time()
    report = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "base_url": BASE, "user_agent": UA, "delay_s": DELAY,
        "categories": [],
    }
    for path, name in CATEGORIES:
        try:
            rec = recon_category(path, name)
            report["categories"].append(rec)
        except Exception as e:
            print(f"  ERROR categoría {path}: {e}")
            report["categories"].append({"category_path": path, "error": str(e)})

    report["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    report["elapsed_s"] = round(time.time() - t0, 1)
    report["total_items"] = sum(c.get("items_count", 0) for c in report["categories"])

    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print("\n" + "="*78); print("  RESUMEN FASE 1C"); print("="*78)
    for c in report["categories"]:
        print(f"  {c.get('category_name', c['category_path'])}: "
              f"items={c.get('items_count','?')} "
              f"subcats={len(c.get('declared_subcategories', []))}")
    print(f"  TOTAL items: {report['total_items']}")
    print(f"  elapsed: {report['elapsed_s']}s")
    print(f"  output: {OUT}")


if __name__ == "__main__":
    main()
