#!/usr/bin/env python3
"""Parsea los PDFs de SENTENCIAS descargados. Adaptación del parser de
normas para jurisprudencia: las sentencias NO tienen 'ARTÍCULO N', tienen
secciones (ANTECEDENTES / CONSIDERACIONES / RESUELVE). No forzamos regex
de artículo — se acepta parse_quality='full_text' si tiene capa de texto,
'scan' si no.
"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

HERE = Path(__file__).parent
DL_REPORT = HERE / "download_report_jurisprudencia.json"
PDFS_DIR = HERE / "samples_jurisprudencia"
OUT_REPORT = HERE / "parse_report_jurisprudencia.json"
OUT_DATA = HERE / "parsed_data_jurisprudencia.json"

# Patrones de artículo — tolerantes a variaciones de formato.
# pypdf a veces extrae "ARTíCULO" (con í minúscula dentro de mayúsculas),
# por eso usamos IGNORECASE.
ART_PATTERNS = [
    re.compile(
        r"(?:^|\n)\s*(?:ART[IÍ]CULO|ARTICULO|Art\.)\s*(\d+(?:\.\d+)*)\s*[º°o\.\-–—]?\s*",
        re.MULTILINE | re.IGNORECASE,
    ),
]

# Orden importa: patrones específicos antes que genéricos.
NORM_TYPES = [
    ("Constitución", r"\bConstituci[óo]n\b"),
    ("Decreto Ley", r"\bDecreto\s*-?\s*Ley\b"),
    ("Decreto Reglamentario", r"\bDecreto\s+Reglamentario\b"),
    ("Decreto", r"\bDecreto\b"),
    ("Circular Externa", r"\bCircular\s+Externa\b"),
    ("Circular", r"\bCircular\b"),
    ("Directiva Presidencial", r"\bDirectiva\s+Presidencial\b"),
    ("Directiva", r"\bDirectiva\b"),
    ("Decisión Andina", r"\bDecisi[óo]n\s+Andina\b"),
    ("Decisión", r"\bDecisi[óo]n\b"),
    ("Resolución", r"\bResoluci[óo]n\b"),
    ("Declaración", r"\bDeclaraci[óo]n\b"),
    ("Acuerdo", r"\bAcuerdo\b"),
    ("Ley", r"\bLey\b"),
]

NUM_YEAR_RE = re.compile(r"(?:N[uú]mero|No\.?)?\s*(\d{1,5})\s*de\s*(\d{4})", re.I)
YEAR_ONLY_RE = re.compile(r"\b(19|20)\d{2}\b")


def extract_text(pdf_path: Path) -> tuple[str, int]:
    try:
        reader = PdfReader(str(pdf_path))
    except Exception as e:
        return f"__PDF_ERROR__: {e}", 0
    text_parts = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        text_parts.append(t)
    full = "\n".join(text_parts)
    return full, len(reader.pages)


def detect_articles(text: str) -> list[str]:
    seen: list[str] = []
    for pat in ART_PATTERNS:
        for m in pat.finditer(text):
            num = m.group(1)
            if num not in seen:
                seen.append(num)
    return seen


def detect_norm_type(text: str, title: str) -> str | None:
    # El título es la señal más confiable ("Ley 685 de 2001 – Código…").
    # Evitamos el cuerpo porque menciona otras normas y falsea el tipo.
    if title:
        for name, pat in NORM_TYPES:
            if re.search(pat, title, re.I):
                return name
    return None


def detect_num_year(title: str, text: str) -> tuple[str | None, int | None]:
    for source in (title, text[:4000]):
        if not source:
            continue
        m = NUM_YEAR_RE.search(source)
        if m:
            return m.group(1), int(m.group(2))
    # fallback: solo año
    m = YEAR_ONLY_RE.search(title or "")
    return None, int(m.group(0)) if m else None


def quality(articles_count: int, char_count: int, has_text: bool) -> str:
    """Para sentencias: 'full_text' si hay capa de texto extraíble
    (no esperamos artículos). 'scan' si no tiene capa de texto."""
    if not has_text:
        return "scan"
    return "full_text"


def main():
    if not DL_REPORT.exists():
        sys.exit(f"Falta {DL_REPORT}. Correr primero download_anla_pdfs.py")
    dl = json.loads(DL_REPORT.read_text())
    pdf_records = [r for r in dl["records"] if r.get("download_ok")]
    print(f"PDFs a parsear: {len(pdf_records)}")

    per_doc: list[dict] = []
    parsed_data: list[dict] = []
    t0 = time.time()

    for idx, rec in enumerate(pdf_records, 1):
        pdf_path = HERE / rec["pdf_path"]
        title = rec.get("doc_title") or rec.get("title") or ""
        text, n_pages = extract_text(pdf_path)
        if text.startswith("__PDF_ERROR__"):
            per_doc.append({
                "slug": rec["slug"], "subcat": rec["subcategory_slug"],
                "pdf": str(pdf_path.name), "error": text,
                "parse_quality": "error",
            })
            continue
        char_count = len(text.strip())
        has_text = char_count >= 500
        articles = detect_articles(text) if has_text else []
        # El tipo de norma viene del título — válido incluso si el PDF es scan.
        norm_type = detect_norm_type(text, title)
        num, year = detect_num_year(title, text)
        q = quality(len(articles), char_count, has_text)

        summary = {
            "slug": rec["slug"],
            "subcat": rec["subcategory_slug"],
            "pdf": pdf_path.name,
            "title": title,
            "pages": n_pages,
            "has_text_layer": has_text,
            "char_count": char_count,
            "articles_detected": len(articles),
            "article_numbers_sample": articles[:10],
            "norm_type_detected": norm_type,
            "norm_number_detected": num,
            "norm_year_detected": year,
            "parse_quality": q,
        }
        per_doc.append(summary)

        parsed_data.append({
            **summary,
            "source_url": rec["url"],
            "pdf_url": rec["primary_source"]["url"],
            "full_text": text,
        })
        print(f"[{idx}/{len(pdf_records)}] {pdf_path.name[:70]}  "
              f"pages={n_pages} chars={char_count} arts={len(articles)} q={q}")

    # Estadísticas agregadas
    qualities = Counter(d["parse_quality"] for d in per_doc)
    types = Counter(d.get("norm_type_detected") for d in per_doc if d.get("norm_type_detected"))
    subcats = Counter(d["subcat"] for d in per_doc)

    elapsed = round(time.time() - t0, 1)
    report = {
        "total_parsed": len(per_doc),
        "elapsed_seconds": elapsed,
        "parse_quality_distribution": dict(qualities),
        "norm_type_distribution": dict(types),
        "docs_by_subcategory": dict(subcats),
        "pct_scan": round(100 * qualities.get("scan", 0) / max(len(per_doc), 1), 1),
        "pct_excellent": round(100 * qualities.get("excellent", 0) / max(len(per_doc), 1), 1),
        "pct_good": round(100 * qualities.get("good", 0) / max(len(per_doc), 1), 1),
        "pct_manual_review": round(100 * qualities.get("manual_review", 0) / max(len(per_doc), 1), 1),
        "per_doc": per_doc,
    }
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    OUT_DATA.write_text(json.dumps(parsed_data, ensure_ascii=False, indent=2))

    print(f"\n[OK] {len(per_doc)} docs parseados en {elapsed}s")
    print(f"     Distribución: {dict(qualities)}")
    print(f"     Tipos: {dict(types)}")
    print(f"     Reporte: {OUT_REPORT}")
    print(f"     Data:    {OUT_DATA}")


if __name__ == "__main__":
    main()
