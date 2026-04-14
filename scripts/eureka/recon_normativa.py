#!/usr/bin/env python3
"""Recon de la categoría Normativa de EUREKA (ANLA).

Paginación: ?start=N (step 10). Cada item de listado apunta a un detalle
tipo /eureka/normativa/<subcategoria>/<slug>, y dentro del detalle hay un
link a un PDF (normalmente bajo /eureka/images/<archivo>.pdf).

Este script:
  1. Fetchea /eureka/normativa (página 1) para confirmar URL y paginación.
  2. Itera todas las páginas de listado recolectando (titulo, url_detalle,
     subcategoria inferida de la URL).
  3. Toma una muestra de 5 detalles y confirma presencia/patrón del PDF.
  4. Deduplica por URL de detalle (el HTML repite cada enlace en título + "Lee más").
  5. Genera scripts/eureka/recon_normativa.json con todo.

Respeto al servidor: delay 3s entre requests, UA identificable, abort si 429/503.
"""
from __future__ import annotations

import json
import random
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.anla.gov.co"
LISTING = f"{BASE}/eureka/normativa"
UA = "Mozilla/5.0 (compatible; VIGIAResearchBot/1.0; +https://vigia-five.vercel.app)"
DELAY = 3.0
OUT = Path(__file__).parent / "recon_normativa.json"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9,en;q=0.8"})


def fetch(url: str, label: str = "", retries: int = 2) -> requests.Response:
    """GET con retry simple para caídas transitorias (keep-alive drops).
    Aborta inmediatamente en 429/503 (rate limit real)."""
    print(f"[GET] {label or url}")
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = SESSION.get(url, timeout=30)
            if r.status_code in (429, 503):
                raise SystemExit(
                    f"[ABORT] Servidor respondió {r.status_code} en {url}. "
                    f"Retry-After={r.headers.get('Retry-After')}. Parar y reportar."
                )
            r.raise_for_status()
            return r
        except (requests.ConnectionError, requests.Timeout) as e:
            last_exc = e
            if attempt < retries:
                backoff = 10 * (attempt + 1)
                print(f"       [retry {attempt+1}/{retries}] {type(e).__name__} — esperando {backoff}s")
                time.sleep(backoff)
            else:
                raise
    raise last_exc  # pragma: no cover


def parse_total_pages(soup: BeautifulSoup) -> int:
    """Busca 'Página X de N' o el último link de paginación."""
    txt = soup.get_text(" ", strip=True)
    m = re.search(r"P[aá]gina\s+\d+\s+de\s+(\d+)", txt, re.I)
    if m:
        return int(m.group(1))
    # Fallback: max start= en links
    max_start = 0
    for a in soup.find_all("a", href=True):
        mm = re.search(r"start=(\d+)", a["href"])
        if mm:
            max_start = max(max_start, int(mm.group(1)))
    return (max_start // 10) + 1


def collect_items_from_listing(soup: BeautifulSoup) -> list[dict]:
    """Extrae items únicos por URL de detalle. Cada doc aparece en dos enlaces
    (título + 'Lee más'); dedupe por href."""
    seen: dict[str, dict] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.startswith("/eureka/normativa/"):
            continue
        # Debe tener al menos /eureka/normativa/<subcat>/<slug>
        parts = [p for p in href.split("/") if p]
        # ['eureka','normativa','<subcat>','<slug>', ...]
        if len(parts) < 4:
            continue
        title = a.get_text(strip=True)
        # Saltar "Lee más:" si ya tenemos el título principal
        if href in seen:
            if title and not title.lower().startswith("lee más"):
                seen[href]["title"] = title
            continue
        seen[href] = {
            "url": BASE + href,
            "path": href,
            "subcategory_slug": parts[2],
            "slug": parts[3],
            "title": title,
        }
    # Limpiar títulos "Lee más: ..." si quedaron
    for it in seen.values():
        t = it["title"] or ""
        if t.lower().startswith("lee más:"):
            it["title"] = t.split(":", 1)[1].strip().rstrip(".")
    return list(seen.values())


PDF_HREF_RE = re.compile(r"\.pdf(\?|$)", re.I)


def inspect_detail(url: str) -> dict:
    r = fetch(url, label=f"detail {url.rsplit('/',1)[-1][:60]}")
    soup = BeautifulSoup(r.text, "html.parser")
    pdfs: list[str] = []
    for a in soup.find_all("a", href=True):
        if PDF_HREF_RE.search(a["href"]):
            full = a["href"] if a["href"].startswith("http") else BASE + a["href"]
            pdfs.append(full)
    # Título del detalle
    h1 = soup.find(["h1", "h2"])
    title = h1.get_text(strip=True) if h1 else None
    return {
        "url": url,
        "title_detail": title,
        "pdf_links": pdfs,
        "pdf_count": len(pdfs),
        "content_length": len(r.text),
    }


def main() -> None:
    t0 = time.time()
    report: dict = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "base_url": BASE,
        "category_url": LISTING,
        "user_agent": UA,
        "request_delay_seconds": DELAY,
    }

    # 1) Página 1 del listado
    r = fetch(LISTING, label="listing page 1")
    time.sleep(DELAY)
    soup = BeautifulSoup(r.text, "html.parser")
    total_pages = parse_total_pages(soup)
    report["total_pages"] = total_pages
    report["pagination_pattern"] = f"{LISTING}?start=N (N=0,10,...,{(total_pages-1)*10})"

    # Subcategorías declaradas en el menú lateral
    subcats: list[dict] = []
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if h.startswith("/eureka/normativa/") and h.count("/") == 3:
            subcats.append({
                "name": a.get_text(strip=True),
                "path": h,
                "url": BASE + h,
            })
    # dedupe preservando orden
    seen_paths: set[str] = set()
    uniq_subcats = []
    for s in subcats:
        if s["path"] not in seen_paths:
            seen_paths.add(s["path"])
            uniq_subcats.append(s)
    report["declared_subcategories"] = uniq_subcats

    # Filtros laterales (temas)
    themes: list[dict] = []
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if h.startswith("/eureka/articulos-"):
            themes.append({"name": a.get_text(strip=True), "path": h})
    report["themes_filters"] = themes[:50]

    # 2) Recolectar todos los items paginando
    all_items: dict[str, dict] = {}
    first_page_items = collect_items_from_listing(soup)
    for it in first_page_items:
        all_items[it["path"]] = it

    for page_idx in range(1, total_pages):
        start = page_idx * 10
        url = f"{LISTING}?start={start}"
        time.sleep(DELAY)
        rp = fetch(url, label=f"listing page {page_idx+1}/{total_pages} (start={start})")
        soup_p = BeautifulSoup(rp.text, "html.parser")
        items = collect_items_from_listing(soup_p)
        new = 0
        for it in items:
            if it["path"] not in all_items:
                all_items[it["path"]] = it
                new += 1
        print(f"       → {len(items)} items (new: {new}) — cumulativo: {len(all_items)}")

    items_list = list(all_items.values())
    report["total_docs_found"] = len(items_list)

    # Distribución por subcategoría inferida
    dist: dict[str, int] = {}
    for it in items_list:
        dist[it["subcategory_slug"]] = dist.get(it["subcategory_slug"], 0) + 1
    report["docs_by_subcategory"] = dict(sorted(dist.items(), key=lambda kv: -kv[1]))

    # Checkpoint: persistimos el listado antes de hacer samples de detalle,
    # para no perder 90s de listing si un detalle falla.
    report["items"] = items_list
    report["detail_samples"] = []
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"[checkpoint] listado guardado ({len(items_list)} items)")

    # 3) Sample de 5 detalles para confirmar patrón PDF
    rnd = random.Random(42)
    sample = rnd.sample(items_list, k=min(5, len(items_list)))
    details: list[dict] = []
    for it in sample:
        time.sleep(DELAY)
        try:
            d = inspect_detail(it["url"])
        except requests.ConnectionError as e:
            print(f"       [warn] conexión falló definitivamente en {it['slug']}: {e}")
            d = {"url": it["url"], "error": str(e), "pdf_count": 0, "pdf_links": []}
        d["source_item"] = it
        details.append(d)
        # checkpoint después de cada detalle
        report["detail_samples"] = details
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    pdf_ok = sum(1 for d in details if d.get("pdf_count", 0) >= 1)
    report["detail_pdf_coverage"] = f"{pdf_ok}/{len(details)}"

    report["elapsed_seconds"] = round(time.time() - t0, 1)
    report["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n[OK] Reporte escrito en {OUT}")
    print(f"     Total docs: {report['total_docs_found']}  "
          f"Páginas: {report['total_pages']}  "
          f"PDF coverage: {report['detail_pdf_coverage']}  "
          f"Elapsed: {report['elapsed_seconds']}s")


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as e:
        print(f"[HTTP-ERROR] {e}", file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        print("\n[INTERRUMPIDO]", file=sys.stderr)
        sys.exit(130)
