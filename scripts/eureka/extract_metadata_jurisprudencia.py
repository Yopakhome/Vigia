#!/usr/bin/env python3
"""Extrae metadata curada rica de los HTMLs de Jurisprudencia (EUREKA).

Gemelo de extract_metadata_full.py pero con modelo de datos de sentencias:
  - radicado (ej. "C-035/2016", "T-411/1992", "SU-121/2022", "CE-2019-00262")
  - tipo_providencia (Constitucionalidad / Tutela / Unificación / Auto / Sentencia)
  - corte (Corte Constitucional / Consejo de Estado / Corte Suprema)
  - fecha_emision_anio (año desde título; null si no se puede extraer confiable)
  - magistrado_ponente (null para casi todos — EUREKA NO expone este campo
    como dato estructurado en la página curada)
  - fecha_emision_full (null para casi todos — idem)

Campos comunes con Normativa: slug, subcategory, url_eureka, title,
primary_source_*, resumen, palabras_clave, concordancias.

Sin requests al servidor. Salida: metadata_full_jurisprudencia.json.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup

HERE = Path(__file__).parent
SRC = HERE / "source_classification_jurisprudencia.json"
OUT = HERE / "metadata_full_jurisprudencia.json"

BASE = "https://www.anla.gov.co"

# Radicado de la Corte Constitucional: "Sentencia C – 035 de 2016" o con SU, T, A.
# Ejemplo captura: ("C", "035", "2016")
RADICADO_CC_RE = re.compile(
    r"Sentencia\s+(C|T|SU|A)\s*[\-–—]\s*(\d+)\s+de\s+(\d{4})",
    re.IGNORECASE,
)
# Radicado del Consejo de Estado: "radicación 2019 – 00262"
# Ejemplo captura: ("2019", "00262")
RADICADO_CE_RE = re.compile(
    r"radicaci[oó]n\s+(\d{4})\s*[\-–—]\s*(\d+)",
    re.IGNORECASE,
)
# Radicado de Corte Suprema, Sala de Casación Civil (STC): "Sentencia STC3872-2020"
# Ejemplo captura: ("3872", "2020")
RADICADO_STC_RE = re.compile(
    r"Sentencia\s+STC\s*(\d+)\s*[\-–—]\s*(\d{4})",
    re.IGNORECASE,
)

TIPO_PROVIDENCIA_CC = {
    "C": "Sentencia de Constitucionalidad",
    "T": "Sentencia de Tutela",
    "SU": "Sentencia de Unificación",
    "A": "Auto",
}

YEAR_FALLBACK = re.compile(r"\b(19|20)\d{2}\b")


def detect_radicado_y_tipo(title: str) -> tuple[str | None, str | None, int | None]:
    """Devuelve (radicado, tipo_providencia, año) extraídos del título.

    Todos null si el título no encaja en los patrones conocidos. NO inventa."""
    if not title:
        return None, None, None
    # Caso 1: Corte Constitucional
    m = RADICADO_CC_RE.search(title)
    if m:
        prefix = m.group(1).upper()
        num = m.group(2)
        year = int(m.group(3))
        radicado = f"{prefix}-{num}/{year}"
        tipo = TIPO_PROVIDENCIA_CC.get(prefix)
        return radicado, tipo, year
    # Caso 2: Consejo de Estado con radicación
    m = RADICADO_CE_RE.search(title)
    if m:
        year = int(m.group(1))
        num = m.group(2)
        radicado = f"CE-{year}-{num}"
        return radicado, "Sentencia", year
    # Caso 3: Corte Suprema Sala de Casación Civil (STC)
    m = RADICADO_STC_RE.search(title)
    if m:
        num = m.group(1)
        year = int(m.group(2))
        radicado = f"STC-{num}/{year}"
        return radicado, "Sentencia", year
    # Fallback: solo año si aparece
    my = YEAR_FALLBACK.search(title)
    return None, "Sentencia" if title.lower().startswith("sentencia") else None, \
        int(my.group(0)) if my else None


def detect_corte(title: str) -> str | None:
    if not title:
        return None
    tl = title.lower()
    if "corte constitucional" in tl:
        return "Corte Constitucional"
    if "consejo de estado" in tl:
        return "Consejo de Estado"
    if "corte suprema" in tl:
        return "Corte Suprema de Justicia"
    if "tribunal" in tl:
        return "Tribunal"
    return None


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


def main():
    if not SRC.exists():
        sys.exit(f"Falta {SRC}. Correr primero classify_jurisprudencia.py")

    data = json.loads(SRC.read_text())
    records = data["records"]
    print(f"Procesando {len(records)} HTMLs cacheados (Jurisprudencia)")

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

        # Campos específicos de sentencias
        radicado, tipo_providencia, anio = detect_radicado_y_tipo(title or "")
        corte = detect_corte(title or "")
        # Fix taxonómico: "Sentencia de Constitucionalidad/Tutela/Unificación/Auto"
        # son tipologías exclusivas de la Corte Constitucional. Si la corte
        # emisora es otra (Tribunal, Consejo de Estado, Corte Suprema) pero
        # el radicado tenía prefijo C/T/SU/A, forzamos tipo genérico "Sentencia".
        if corte and corte != "Corte Constitucional":
            tipo_providencia = "Sentencia"

        primary = rec.get("primary_source", {})
        out_records.append({
            "slug": rec["slug"],
            "subcategory": rec["subcategory_slug"],
            "url_eureka": rec["url"],
            "title": title,
            "radicado": radicado,
            "tipo_providencia": tipo_providencia,
            "corte": corte,
            "fecha_emision_anio": anio,
            # EUREKA no expone estos campos como estructurados en la página
            # curada. Si alguna sentencia los tiene en el resumen, se pueden
            # post-procesar en Fase 2, pero no hacemos regex frágil aquí.
            "magistrado_ponente": None,
            "fecha_emision_full": None,
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
    with_title = sum(1 for r in out_records if r["title"])
    with_radicado = sum(1 for r in out_records if r["radicado"])
    with_tipo = sum(1 for r in out_records if r["tipo_providencia"])
    with_corte = sum(1 for r in out_records if r["corte"])
    with_anio = sum(1 for r in out_records if r["fecha_emision_anio"])
    with_resumen = sum(1 for r in out_records if r["resumen"])
    with_palabras = sum(1 for r in out_records if r["palabras_clave"])
    with_concord = sum(1 for r in out_records if r["concordancias"])
    source_kinds = Counter(r["primary_source_kind"] for r in out_records)
    tipos = Counter(r["tipo_providencia"] for r in out_records if r["tipo_providencia"])
    cortes = Counter(r["corte"] for r in out_records if r["corte"])
    total_cc_links = sum(len(r["concordancias"]) for r in out_records)
    cc_resolved = sum(sum(1 for c in r["concordancias"] if c.get("resolved")) for r in out_records)

    # Concordancias por categoría destino
    cat_counter: Counter = Counter()
    for r in out_records:
        for c in r["concordancias"]:
            if c.get("resolved"):
                cat_counter[c.get("category")] += 1

    stats = {
        "total_records": n,
        "cache_missing": len(errors),
        "coverage": {
            "with_title": with_title,
            "pct_title": pct(with_title, n),
            "with_radicado": with_radicado,
            "pct_radicado": pct(with_radicado, n),
            "with_tipo_providencia": with_tipo,
            "pct_tipo_providencia": pct(with_tipo, n),
            "with_corte": with_corte,
            "pct_corte": pct(with_corte, n),
            "with_fecha_emision_anio": with_anio,
            "pct_fecha_emision_anio": pct(with_anio, n),
            "with_resumen": with_resumen,
            "pct_resumen": pct(with_resumen, n),
            "with_palabras_clave": with_palabras,
            "pct_palabras_clave": pct(with_palabras, n),
            "with_concordancias": with_concord,
            "pct_concordancias": pct(with_concord, n),
            "total_concordancia_links": total_cc_links,
            "resolved_concordancia_links": cc_resolved,
            "unresolved_concordancia_links": total_cc_links - cc_resolved,
            "avg_concordancias_per_doc": round(total_cc_links / max(n, 1), 2),
            "concordancias_by_target_category": dict(cat_counter),
        },
        "source_kind_distribution": dict(source_kinds),
        "tipo_providencia_distribution": dict(tipos.most_common()),
        "corte_distribution": dict(cortes.most_common()),
        "errors": errors,
        "records": out_records,
    }
    OUT.write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"\n[OK] metadata de {n} sentencias → {OUT}")
    print(f"     título:         {with_title}/{n}  ({pct(with_title, n)}%)")
    print(f"     radicado:       {with_radicado}/{n}  ({pct(with_radicado, n)}%)")
    print(f"     tipo_providencia: {with_tipo}/{n}  ({pct(with_tipo, n)}%)")
    print(f"     corte:          {with_corte}/{n}  ({pct(with_corte, n)}%)")
    print(f"     año:            {with_anio}/{n}  ({pct(with_anio, n)}%)")
    print(f"     resumen:        {with_resumen}/{n}  ({pct(with_resumen, n)}%)")
    print(f"     palabras clave: {with_palabras}/{n}  ({pct(with_palabras, n)}%)")
    print(f"     concordancias:  {with_concord}/{n}  ({pct(with_concord, n)}%)  "
          f"total={total_cc_links}  resolved={cc_resolved}  "
          f"avg/doc={stats['coverage']['avg_concordancias_per_doc']}")
    print(f"     magistrado_ponente: null para todos (no expuesto por EUREKA)")


if __name__ == "__main__":
    main()
