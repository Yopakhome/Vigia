#!/usr/bin/env python3
"""T3 — Construir mapeo slug→SISJUR_ID para normas del corpus.

SISJUR `consulta_avanzada.jsp?tipodoc=X&nrodoc=N&ano1=Y&ano2=Y` retorna
HTML con lista de resultados. Cada result es un link a `Norma1.jsp?i=ID`.
Extraemos el primer ID cuya URL matchea exactamente (tipo, número, año).
"""
from __future__ import annotations
import json, os, re, time, urllib3
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
urllib3.disable_warnings()

OUT = HERE / "sisjur_id_map.json"
FETCH_DELAY = 1.5
REST_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

TYPE_MAP = {"ley": "LEY", "decreto": "DECRETO", "decreto_ley": "DECRETO",
            "resolucion": "RESOLUCION", "acuerdo": "ACUERDO",
            "circular": "CIRCULAR", "constitucion": "CONSTITUCION"}


def load_norms_priority():
    """Top normas ambientales del corpus — las que más vale tener mapping."""
    # Leyes marco + decretos clave
    r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                     headers=REST_HEADERS,
                     params={"select": "id,norm_type,norm_number,norm_year,norm_title",
                             "norm_type": "in.(ley,decreto,decreto_ley,resolucion)",
                             "norm_year": "gte.1970",
                             "order": "norm_year.desc",
                             "limit": "80"}, timeout=30)
    r.raise_for_status()
    return r.json()


def search_sisjur(tipo, num, ano):
    tipodoc = TYPE_MAP.get(tipo.lower())
    if not tipodoc: return None, "unknown_type"
    try: n = int(str(num).lstrip("0") or "0")
    except (TypeError, ValueError): return None, "invalid_number"
    url = f"https://www.alcaldiabogota.gov.co/sisjur/consulta_avanzada.jsp?tipodoc={tipodoc}&nrodoc={n}&ano1={ano}&ano2={ano}"
    try:
        r = requests.get(url, timeout=30, verify=False,
                         headers={"User-Agent": "Mozilla/5.0 VIGIA-IDMap"})
        r.raise_for_status()
    except Exception as e:
        return None, f"fetch_error:{str(e)[:60]}"

    # Resultados son links Norma1.jsp?i=ID dentro de la tabla de resultados
    # El título cerca del link usualmente contiene "LEY N DE YYYY" o similar
    html = r.text
    # Buscar todos los Norma1.jsp?i=XXX
    ids = re.findall(r'Norma1\.jsp\?i=(\d+)', html)
    if not ids:
        return None, "no_results"

    # Match más estricto: buscar contexto con "LEY N DE YYYY"
    pattern = f"{tipodoc}\\s+{n}\\s+DE\\s+{ano}"
    best = None
    for m in re.finditer(r'Norma1\.jsp\?i=(\d+)([^<]*)', html):
        candidate_id = m.group(1)
        ctx_start = max(0, m.start() - 200)
        ctx_end = min(len(html), m.end() + 300)
        ctx = html[ctx_start:ctx_end].upper()
        if re.search(pattern, ctx):
            best = candidate_id; break

    if best: return best, "matched_strict"
    # Fallback: primero con tipo correcto en contexto
    for m in re.finditer(r'Norma1\.jsp\?i=(\d+)([^<]*)', html):
        ctx_start = max(0, m.start() - 200)
        ctx_end = min(len(html), m.end() + 300)
        if tipodoc in html[ctx_start:ctx_end].upper():
            return m.group(1), "matched_loose"

    return ids[0] if ids else None, "first_result_fallback"


def main():
    norms = load_norms_priority()
    print(f"[info] Normas prioridad: {len(norms)}")

    results = []; found = 0
    for i, n in enumerate(norms, 1):
        if i > 1: time.sleep(FETCH_DELAY)
        rid, status = search_sisjur(n["norm_type"], n["norm_number"], n["norm_year"])
        entry = {
            "norm_id": n["id"],
            "norm_type": n["norm_type"],
            "norm_number": n["norm_number"],
            "norm_year": n["norm_year"],
            "norm_title": n["norm_title"][:100],
            "sisjur_id": rid,
            "match_status": status,
            "sisjur_url": f"https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i={rid}" if rid else None,
        }
        results.append(entry)
        if rid: found += 1
        label = f"{n['norm_type']} {n['norm_number']}/{n['norm_year']}"
        print(f"[{i}/{len(norms)}] {label}: {status} id={rid}")

    OUT.write_text(json.dumps({
        "generated": time.strftime("%Y-%m-%d"),
        "total": len(norms), "found": found,
        "hit_rate": f"{100*found/max(len(norms),1):.1f}%",
        "map": results,
    }, ensure_ascii=False, indent=2))
    print(f"\n{'='*60}\nRESULT: {found}/{len(norms)} mapped ({100*found/max(len(norms),1):.1f}%)")
    print(f"Output: {OUT}")


if __name__ == "__main__":
    main()
