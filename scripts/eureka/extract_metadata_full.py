#!/usr/bin/env python3
"""Extrae metadata curada rica de los 270 HTMLs cacheados en html_cache/.

Sin requests al servidor — solo lee archivos locales. Por cada doc produce:
  - slug, subcategory_slug
  - title_clean (filtrado de 'Temas Relacionados' y footer ANLA)
  - primary_source (inline_pdf / external_official / external_other / none)
  - external_source_url (si aplica)
  - pdf_url (si aplica)
  - resumen (contenido bajo h2 'Resumen')
  - palabras_clave (lista, bajo h2 'Palabras Claves')
  - concordancias (lista de {slug, title, url} a otras normas EUREKA)
  - temas_relacionados (los chips/categorías tipo articulos-relacionados-*)
  - norm_type, norm_number, norm_year (inferidos del título)

Salida: metadata_full.json con los 270 records.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup

HERE = Path(__file__).parent
SRC = HERE / "source_classification.json"
OUT = HERE / "metadata_full.json"

BASE = "https://www.anla.gov.co"

NORM_TYPE_PATTERNS = [
    ("Constitución", r"\bConstituci[óo]n\b"),
    ("Decreto Ley", r"\bDecreto\s*-?\s*Ley\b"),
    ("Decreto Reglamentario", r"\bDecreto\s+Reglamentario\b"),
    ("Decreto", r"\bDecreto\b"),
    ("Ley", r"\bLey\b"),
    ("Resolución", r"\bResoluci[óo]n\b"),
    ("Circular Externa", r"\bCircular\s+Externa\b"),
    ("Circular", r"\bCircular\b"),
    ("Directiva Presidencial", r"\bDirectiva\s+Presidencial\b"),
    ("Directiva", r"\bDirectiva\b"),
    ("Decisión Andina", r"\bDecisi[óo]n\s+Andina\b"),
    ("Decisión", r"\bDecisi[óo]n\b"),
    ("Declaración", r"\bDeclaraci[óo]n\b"),
    ("Acuerdo", r"\bAcuerdo\b"),
]

NUM_YEAR_RE = re.compile(r"(\d{1,5})\s*de\s*(\d{4})", re.I)
YEAR_FALLBACK = re.compile(r"\b(19|20)\d{2}\b")


def clean_title(soup: BeautifulSoup) -> str | None:
    for h in soup.find_all(["h1", "h2", "h3"]):
        t = h.get_text(strip=True)
        if not t:
            continue
        low = t.lower()
        if ("temas relacionados" in low or
            "autoridad nacional de licencias" in low or
            "palabras claves" in low or
            low == "resumen" or
            low == "concordancias"):
            continue
        return t
    tt = soup.find("title")
    return tt.get_text(strip=True) if tt else None


def get_article_body(soup: BeautifulSoup):
    """El HTML de EUREKA mete toda la prosa del doc en el primer <div>
    descendiente de .article-details que no tiene class. Ahí viven Resumen,
    Palabras Claves y (duplicado) Concordancias."""
    ad = soup.find("div", class_="article-details")
    if not ad:
        return None
    for c in ad.find_all("div", recursive=False):
        if not c.get("class"):
            return c
    return None


def extract_section_by_marker(body_text: str, marker: str, next_markers: list[str]) -> str | None:
    """Extrae el texto entre `marker` y el siguiente de `next_markers`."""
    idx = body_text.find(marker)
    if idx < 0:
        return None
    start = idx + len(marker)
    end = len(body_text)
    for nm in next_markers:
        pos = body_text.find(nm, start)
        if pos >= 0 and pos < end:
            end = pos
    out = body_text[start:end].strip(" .:\n\t")
    return out or None


def extract_concordancias(soup: BeautifulSoup) -> list[dict]:
    """En EUREKA, las concordancias viven en un <section class="pb-4 px-2 ...">
    cuyo heading es 'Concordancias'. La mayoría están como <a href> apuntando
    a otras normas de EUREKA, pero algunos docs las listan como <li> de texto
    plano sin link (el editor no las hizo clickables). Capturamos ambos casos."""
    out: list[dict] = []
    for sec in soup.find_all("section", class_="pb-4"):
        txt = sec.get_text(" ", strip=True)
        if not txt.lower().startswith("concordancia"):
            continue
        # Primero: links a otras normas EUREKA
        linked_texts: set[str] = set()
        for a in sec.find_all("a", href=True):
            href = a["href"]
            if href.startswith("/eureka/normativa/") or href.startswith("/eureka/jurisprudencia/"):
                parts = [p for p in href.split("/") if p]
                title = a.get_text(strip=True)
                out.append({
                    "url": BASE + href,
                    "category": parts[1] if len(parts) >= 2 else None,
                    "subcategory": parts[2] if len(parts) >= 3 else None,
                    "slug": parts[-1] if len(parts) >= 4 else None,
                    "title": title,
                    "resolved": True,
                })
                linked_texts.add(title.lower())
        # Después: ítems de lista sin link (fallback)
        for li in sec.find_all("li"):
            t = li.get_text(" ", strip=True)
            if not t or len(t) < 4 or len(t) > 400:
                continue
            # Evitar duplicar entradas que ya están como links
            if t.lower() in linked_texts:
                continue
            out.append({
                "url": None,
                "category": None,
                "subcategory": None,
                "slug": None,
                "title": t,
                "resolved": False,
            })
        break
    # dedupe por (url, title)
    seen = set(); uniq = []
    for c in out:
        k = (c["url"] or "", c["title"].lower())
        if k in seen: continue
        seen.add(k); uniq.append(c)
    return uniq


def extract_palabras_clave(body_text: str) -> list[str]:
    """Palabras Claves en EUREKA es un bloque de texto dentro del body, entre
    los marcadores 'Palabras Claves' y 'Concordancias'. Suele ser una línea
    con frases separadas por '/' o por '–'."""
    raw = extract_section_by_marker(body_text, "Palabras Claves", ["Concordancias"])
    if not raw:
        return []
    # Separadores típicos: '/', '–', '|', ','. Punto ya fue stripeado.
    pieces = re.split(r"\s*[/|•·\u00B7]\s*|\s+–\s+|\s+-\s+|,\s+", raw)
    clean: list[str] = []
    seen: set[str] = set()
    for p in pieces:
        p = p.strip(" .:\n\t")
        if not p or len(p) < 2 or len(p) > 140:
            continue
        kl = p.lower()
        if kl in seen:
            continue
        seen.add(kl)
        clean.append(p)
    return clean


RESUMEN_HEADER_PREFIX = "Autoridad Nacional de Licencias Ambientales - ANLA"


def extract_resumen(body_text: str) -> str | None:
    """Resumen está entre 'Resumen' y 'Palabras Claves' en el body del artículo.
    El prefijo 'Autoridad Nacional de Licencias Ambientales - ANLA' es una
    cabecera editorial constante que aparece en los 270 docs — se stripea."""
    raw = extract_section_by_marker(body_text, "Resumen", ["Palabras Claves", "Concordancias"])
    if not raw:
        return None
    if raw.startswith(RESUMEN_HEADER_PREFIX):
        raw = raw[len(RESUMEN_HEADER_PREFIX):].strip()
    return raw or None


def extract_temas_relacionados(soup: BeautifulSoup) -> list[dict]:
    """Los chips 'articulos-relacionados-*' que aparecen en la página."""
    out: list[dict] = []
    seen = set()
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if h.startswith("/eureka/articulos-"):
            if h in seen: continue
            seen.add(h)
            out.append({
                "slug": h.replace("/eureka/articulos-relacionados-", "").replace("/eureka/articulos-", ""),
                "name": a.get_text(strip=True),
                "url": BASE + h,
            })
    return out


def detect_norm_type(title: str) -> str | None:
    if not title:
        return None
    for name, pat in NORM_TYPE_PATTERNS:
        if re.search(pat, title, re.I):
            return name
    return None


def detect_num_year(title: str) -> tuple[str | None, int | None]:
    if not title:
        return None, None
    m = NUM_YEAR_RE.search(title)
    if m:
        return m.group(1), int(m.group(2))
    my = YEAR_FALLBACK.search(title)
    return None, int(my.group(0)) if my else None


def main():
    if not SRC.exists():
        sys.exit(f"Falta {SRC}. Correr primero classify_and_cache_details.py")

    data = json.loads(SRC.read_text())
    records = data["records"]
    print(f"Procesando {len(records)} HTMLs cacheados")

    out_records: list[dict] = []
    errors: list[dict] = []

    for idx, rec in enumerate(records, 1):
        cache_rel = rec.get("cache_file")
        if not cache_rel:
            errors.append({"slug": rec.get("slug"), "reason": "no_cache_file"})
            continue
        cache_path = HERE / cache_rel
        if not cache_path.exists():
            errors.append({"slug": rec.get("slug"), "reason": "cache_missing", "path": str(cache_path)})
            continue
        html = cache_path.read_text(encoding="utf-8", errors="replace")
        soup = BeautifulSoup(html, "html.parser")

        # Título limpio viene del h1 dentro de article-header
        title = None
        header = soup.find("div", class_="article-header")
        if header:
            h1 = header.find(["h1", "h2"])
            if h1:
                title = h1.get_text(strip=True)
        if not title:
            title = rec.get("doc_title") or clean_title(soup)

        # Resumen / Palabras Claves viven dentro del body del artículo
        body = get_article_body(soup)
        body_text = body.get_text(" ", strip=True) if body else ""
        resumen = extract_resumen(body_text)
        palabras = extract_palabras_clave(body_text)
        concord = extract_concordancias(soup)
        # Nota: los chips sidebar de "Temas" (Biodiversidad, Cambio Climático,
        # Minería, etc.) son idénticos en los 270 docs — no son metadata del
        # doc sino el menú lateral del sitio. No los extraemos.
        norm_type = detect_norm_type(title or "")
        num, year = detect_num_year(title or "")

        primary = rec.get("primary_source", {})
        out_records.append({
            "slug": rec["slug"],
            "subcategory": rec["subcategory_slug"],
            "url_eureka": rec["url"],
            "title": title,
            "norm_type": norm_type,
            "norm_number": num,
            "norm_year": year,
            "primary_source_kind": primary.get("kind"),
            "primary_source_url": primary.get("url"),
            "primary_source_host": primary.get("host"),
            "resumen": resumen,
            "palabras_clave": palabras,
            "concordancias": concord,
        })
        if idx % 30 == 0:
            print(f"  {idx}/{len(records)}")

    # Estadísticas
    def pct(n, total): return round(100*n/max(total,1), 1)
    n = len(out_records)
    with_resumen = sum(1 for r in out_records if r["resumen"])
    with_palabras = sum(1 for r in out_records if r["palabras_clave"])
    with_concord = sum(1 for r in out_records if r["concordancias"])
    with_norm_type = sum(1 for r in out_records if r["norm_type"])
    with_num_year = sum(1 for r in out_records if r["norm_number"] and r["norm_year"])
    source_kinds = Counter(r["primary_source_kind"] for r in out_records)
    subcats = Counter(r["subcategory"] for r in out_records)
    types = Counter(r["norm_type"] for r in out_records if r["norm_type"])

    stats = {
        "total_records": n,
        "cache_missing": len(errors),
        "coverage": {
            "with_title": sum(1 for r in out_records if r["title"]),
            "with_resumen": with_resumen,
            "pct_resumen": pct(with_resumen, n),
            "with_palabras_clave": with_palabras,
            "pct_palabras_clave": pct(with_palabras, n),
            "with_concordancias": with_concord,
            "pct_concordancias": pct(with_concord, n),
            "total_concordancia_links": sum(len(r["concordancias"]) for r in out_records),
            "avg_concordancias_per_doc": round(
                sum(len(r["concordancias"]) for r in out_records) / max(n, 1), 2),
            "with_norm_type": with_norm_type,
            "pct_norm_type": pct(with_norm_type, n),
            "with_num_and_year": with_num_year,
            "pct_num_and_year": pct(with_num_year, n),
        },
        "source_kind_distribution": dict(source_kinds),
        "norm_type_distribution": dict(types.most_common()),
        "docs_by_subcategory": dict(subcats.most_common()),
        "errors": errors,
        "records": out_records,
    }
    OUT.write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"\n[OK] metadata de {n} docs → {OUT}")
    print(f"     resumen:        {with_resumen}/{n}  ({pct(with_resumen, n)}%)")
    print(f"     palabras clave: {with_palabras}/{n}  ({pct(with_palabras, n)}%)")
    print(f"     concordancias:  {with_concord}/{n}  ({pct(with_concord, n)}%)  "
          f"total_links={stats['coverage']['total_concordancia_links']}  "
          f"avg/doc={stats['coverage']['avg_concordancias_per_doc']}")
    print(f"     norm_type:      {with_norm_type}/{n}  ({pct(with_norm_type, n)}%)")
    print(f"     num+year:       {with_num_year}/{n}  ({pct(with_num_year, n)}%)")


if __name__ == "__main__":
    main()
