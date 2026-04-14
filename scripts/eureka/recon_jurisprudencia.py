#!/usr/bin/env python3
"""Recon de la categoría Jurisprudencia de EUREKA (ANLA).

Adaptado de recon_normativa.py. Solo cambia la URL base y los prefijos
de listado. La estructura de paginación es la misma (?start=N step 10).
"""
from __future__ import annotations

import json
import random
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.anla.gov.co"
LISTING = f"{BASE}/eureka/jurisprudencia"
UA = "Mozilla/5.0 (compatible; VIGIAResearchBot/1.0; +https://vigia-five.vercel.app)"
DELAY = 3.0
OUT = Path(__file__).parent / "recon_jurisprudencia.json"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9,en;q=0.8"})


def fetch(url: str, label: str = "", retries: int = 2) -> requests.Response:
    print(f"[GET] {label or url}")
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


def parse_total_pages(soup: BeautifulSoup) -> int:
    txt = soup.get_text(" ", strip=True)
    m = re.search(r"P[aá]gina\s+\d+\s+de\s+(\d+)", txt, re.I)
    if m:
        return int(m.group(1))
    max_start = 0
    for a in soup.find_all("a", href=True):
        mm = re.search(r"start=(\d+)", a["href"])
        if mm:
            max_start = max(max_start, int(mm.group(1)))
    return (max_start // 10) + 1


def collect_items_from_listing(soup: BeautifulSoup) -> list[dict]:
    seen: dict[str, dict] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.startswith("/eureka/jurisprudencia/"):
            continue
        parts = [p for p in href.split("/") if p]
        if len(parts) < 4:
            continue
        title = a.get_text(strip=True)
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
    for it in seen.values():
        t = it["title"] or ""
        if t.lower().startswith("lee más:"):
            it["title"] = t.split(":", 1)[1].strip().rstrip(".")
    return list(seen.values())


def main() -> None:
    t0 = time.time()
    report: dict = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "base_url": BASE,
        "category_url": LISTING,
        "user_agent": UA,
        "request_delay_seconds": DELAY,
    }

    r = fetch(LISTING, label="listing page 1")
    time.sleep(DELAY)
    soup = BeautifulSoup(r.text, "html.parser")
    total_pages = parse_total_pages(soup)
    report["total_pages"] = total_pages
    report["pagination_pattern"] = f"{LISTING}?start=N (N=0,10,...,{(total_pages-1)*10})"

    # Subcategorías declaradas
    subcats: list[dict] = []
    seen_paths: set[str] = set()
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if h.startswith("/eureka/jurisprudencia/") and h.count("/") == 3:
            if h in seen_paths:
                continue
            seen_paths.add(h)
            subcats.append({"name": a.get_text(strip=True), "path": h, "url": BASE + h})
    report["declared_subcategories"] = subcats

    # Recolectar paginando
    all_items: dict[str, dict] = {}
    for it in collect_items_from_listing(soup):
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

    dist: dict[str, int] = {}
    for it in items_list:
        dist[it["subcategory_slug"]] = dist.get(it["subcategory_slug"], 0) + 1
    report["docs_by_subcategory"] = dict(sorted(dist.items(), key=lambda kv: -kv[1]))

    report["items"] = items_list
    report["elapsed_seconds"] = round(time.time() - t0, 1)
    report["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n[OK] Reporte escrito en {OUT}")
    print(f"     Total docs: {report['total_docs_found']}  "
          f"Páginas: {report['total_pages']}  "
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
