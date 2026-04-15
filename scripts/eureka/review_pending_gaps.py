#!/usr/bin/env python3
"""MON-2 — Revisión periódica de gaps pendientes.

Uso (cron quincenal):
  0 4 1,15 * * cd /path/to/vigia/scripts/eureka && python3 review_pending_gaps.py

Lógica:
  1. Lee corpus_gaps.json
  2. Para cada gap con status=='pendiente' y ultimo_intento > 14 días:
     - Re-intenta fetch de URLs guardadas en fuentes_intentadas
     - Si alguna retorna contenido válido (>500 chars) → procesa
     - Si todas fallan → actualiza ultimo_intento, mantiene pendiente
  3. Genera reporte de cambios
"""
from __future__ import annotations
import json, os, re, time
from datetime import datetime, timedelta
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
CORPUS_GAPS = HERE / "corpus_gaps.json"
REVIEW_LOG = HERE / "review_gaps_log.json"
UA = "Mozilla/5.0 (compatible; VIGIA-Review/1.0)"


def days_since(date_str):
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
        return (datetime.now() - d).days
    except Exception:
        return 999


def main():
    gaps = json.loads(CORPUS_GAPS.read_text())
    today = time.strftime("%Y-%m-%d")
    report = {"started_at": today, "reviewed": 0, "newly_resolvable": [], "unchanged": 0}

    all_gaps = []
    for g in gaps.get("gaps", []):
        all_gaps.append(("main", g))

    # Iterar gaps pendientes con ultimo_intento > 14 días
    for section, g in all_gaps:
        if g.get("status") != "pendiente": continue
        lu = g.get("ultimo_intento") or g.get("discovered_in", "")
        if days_since(lu) < 14:
            continue
        report["reviewed"] += 1
        slug = g.get("slug", "(sin slug)")
        print(f"[review] {slug[:60]}")
        # Intentar URLs guardadas
        urls = []
        for it in g.get("fuentes_intentadas", []):
            if isinstance(it, dict) and it.get("url"):
                urls.append(it["url"])
            elif isinstance(it, str):
                urls.append(it)
        for u in g.get("urls_intentadas", []):
            if isinstance(u, str) and u.startswith("http"):
                urls.append(u.split(" ")[0])

        found = None
        for url in urls[:3]:
            try:
                r = requests.get(url, timeout=30, headers={"User-Agent": UA}, verify=False)
                if r.status_code == 200 and len(r.content) > 2000:
                    found = url
                    break
            except Exception:
                pass

        if found:
            print(f"  ✓ ahora accesible: {found[:80]}")
            report["newly_resolvable"].append({"slug": slug, "url": found})
        else:
            g["ultimo_intento"] = today
            report["unchanged"] += 1

    CORPUS_GAPS.write_text(json.dumps(gaps, ensure_ascii=False, indent=2))
    REVIEW_LOG.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nReview: {report['reviewed']} revisados, {len(report['newly_resolvable'])} ahora accesibles, {report['unchanged']} sin cambio")


if __name__ == "__main__":
    main()
