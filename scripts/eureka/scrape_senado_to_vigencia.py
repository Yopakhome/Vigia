#!/usr/bin/env python3
"""T1 — Scraper Secretaría Senado basedoc para actualizar vigencia.

Por cada ley en normative_sources (norm_type='ley'):
  1. URL: http://www.secretariasenado.gov.co/senado/basedoc/ley_NNNN_YYYY.html
     (0-padded 4 dígitos)
  2. Fetch HTML (iso-8859-1), unescape entities.
  3. Split por "ARTÍCULO N" → chunks.
  4. Para cada chunk: detectar 'derogado'/'modificado' + extraer norma fuente.
  5. UPDATE normative_articles.vigencia_status + derogado_por/modificado_por.
  6. Calcular vigencia_global de la ley y UPDATE normative_sources.

Flags: --dry-run (no UPDATE), --limit N, --year YYYY (solo leyes de año).
"""
from __future__ import annotations
import argparse, html as htmlmod, json, os, re, sys, time
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

REPORT_JSON = HERE / "scrape_senado_vigencia_report.json"
UA = "Mozilla/5.0 (compatible; VIGIA-Vigencia/1.0)"
FETCH_DELAY = 1.2
TIMEOUT = 30

REST_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


# Patrón para extraer norma fuente de una derogatoria/modificación:
# "derogado por el artículo X de la Ley 1333 de 2009"
# "modificado por el artículo X del Decreto 2041 de 2014"
NORM_REF_RE = re.compile(
    r'(?:Ley|Decreto(?:\s+Ley)?|Decreto-Ley|Resoluci[óo]n|Acuerdo|C[óo]digo)\s*(?:N[°º]?\s*)?'
    r'(\d{1,5}(?:\s+de\s+\d{4}|\/\d{4}))',
    re.IGNORECASE
)
NORM_TYPE_RE = re.compile(
    r'(Ley|Decreto\s+Ley|Decreto-Ley|Decreto|Resoluci[óo]n|Acuerdo|C[óo]digo)\s*(?:N[°º]?\s*)?'
    r'(\d{1,5})\s+de\s+(\d{4})',
    re.IGNORECASE
)


def load_leyes():
    out = []; PAGE = 1000; start = 0
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+PAGE-1}"; h["Prefer"] = "count=exact"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources",
                         headers=h,
                         params={"select": "id,norm_number,norm_year,norm_title",
                                 "norm_type": "eq.ley"}, timeout=30)
        r.raise_for_status(); batch = r.json()
        if not batch: break
        out.extend(batch)
        if len(batch) < PAGE: break
        start += PAGE
    return out


def senado_url(norm_number, norm_year):
    try: n = int(str(norm_number).lstrip("0") or "0")
    except (ValueError, TypeError): return None
    if not norm_year: return None
    return f"http://www.secretariasenado.gov.co/senado/basedoc/ley_{n:04d}_{norm_year}.html"


def fetch_senado(url):
    r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
    r.raise_for_status()
    if len(r.content) < 2000:
        raise ValueError(f"html_too_small ({len(r.content)} bytes)")
    text = htmlmod.unescape(r.content.decode('iso-8859-1', errors='replace'))
    return text


def parse_articles_vigencia(html_text):
    """Retorna dict {art_num: {'status': ..., 'source_norm': ...}}."""
    # Split into article chunks using "ARTÍCULO N" as delimiter
    # (case insensitive, Í or I)
    matches = list(re.finditer(r'ART[ÍI]CULO\s+(\d+)(?:[°º]|\s+[º°])?\.?', html_text))
    if not matches:
        return {}

    results = {}
    for i, m in enumerate(matches):
        num = m.group(1)
        start = m.start()
        # First 1200 chars of the article (incluye cabecera, notas de vigencia, y texto inicial)
        end = matches[i+1].start() if i+1 < len(matches) else min(len(html_text), start + 1500)
        ctx = html_text[start:end]
        # Primera línea informativa (antes de salto o etiquetas)
        head = ctx[:1500]

        status = 'vigente'
        source_norm = None

        # Buscar "derogado" en las primeras líneas del artículo (cabecera editorial)
        if re.search(r'derogad[oa]', head, re.IGNORECASE):
            status = 'derogado'
            ref = NORM_TYPE_RE.search(head)
            if ref:
                ntype = re.sub(r'\s+', ' ', ref.group(1)).lower().replace('-', '_')
                nnum = ref.group(2); nyear = ref.group(3)
                source_norm = f"{ntype}:{nnum}/{nyear}"
        elif re.search(r'modificad[oa]', head, re.IGNORECASE):
            status = 'modificado'
            ref = NORM_TYPE_RE.search(head)
            if ref:
                ntype = re.sub(r'\s+', ' ', ref.group(1)).lower().replace('-', '_')
                nnum = ref.group(2); nyear = ref.group(3)
                source_norm = f"{ntype}:{nnum}/{nyear}"

        # Si ya hay info previa, priorizar estado "derogado" sobre "modificado" sobre "vigente"
        if num in results:
            prev = results[num]
            if prev['status'] == 'derogado': continue
            if prev['status'] == 'modificado' and status == 'vigente': continue
        results[num] = {'status': status, 'source_norm': source_norm}

    return results


def determine_vigencia_global(vigencia_map):
    """Clasifica la norma global basado en vigencia por artículo."""
    if not vigencia_map:
        return 'sin_informacion'
    total = len(vigencia_map)
    derog = sum(1 for v in vigencia_map.values() if v['status'] == 'derogado')
    if derog == 0:
        return 'vigente'
    elif derog >= total * 0.9:  # 90%+ derogados = prácticamente derogada
        return 'derogada_total'
    else:
        return 'derogada_parcial'


def update_article(art_id, status, source_norm, field_name):
    """PATCH normative_article vigencia."""
    payload = {"vigencia_status": status, "vigencia_updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    if source_norm:
        payload[field_name] = source_norm
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/normative_articles",
                       headers=REST_HEADERS, params={"id": f"eq.{art_id}"},
                       json=payload, timeout=30)
    return r.status_code in (200, 204)


def update_source_vigencia(nid, vigencia_global):
    payload = {"vigencia_global": vigencia_global,
               "vigencia_source": "secretariasenado.gov.co/basedoc"}
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/normative_sources",
                       headers=REST_HEADERS, params={"id": f"eq.{nid}"},
                       json=payload, timeout=30)
    return r.status_code in (200, 204)


def load_articles_for_norm(nid):
    """Load all articles of a norm: {article_number: id}."""
    out = {}; start = 0
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+999}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_articles",
                         headers=h,
                         params={"select": "id,article_number",
                                 "norm_id": f"eq.{nid}"}, timeout=30)
        r.raise_for_status(); batch = r.json()
        if not batch: break
        for a in batch:
            if a.get("article_number"):
                out[str(a["article_number"]).lstrip("0") or "0"] = a["id"]
        if len(batch) < 1000: break
        start += 1000
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--year", type=int, default=None)
    args = ap.parse_args()

    leyes = load_leyes()
    print(f"[info] Leyes en DB: {len(leyes)}")
    if args.year:
        leyes = [l for l in leyes if l["norm_year"] == args.year]
    if args.limit:
        leyes = leyes[:args.limit]
    print(f"[info] Procesando: {len(leyes)}")

    stats = {"total": len(leyes), "fetched": 0, "not_found": 0, "parse_errors": 0,
             "articles_updated": 0, "sources_updated": 0,
             "by_vigencia_global": {}, "errors": [], "per_norm": []}

    for idx, ley in enumerate(leyes, 1):
        nid = ley["id"]; num = ley["norm_number"]; year = ley["norm_year"]
        if idx > 1: time.sleep(FETCH_DELAY)
        url = senado_url(num, year)
        if not url:
            print(f"[{idx}/{len(leyes)}] Ley {num}/{year} — SKIP (número inválido)")
            stats["errors"].append({"norm_id": nid, "stage": "build_url"})
            continue
        print(f"[{idx}/{len(leyes)}] Ley {num}/{year} — {url.split('/')[-1]}")

        try:
            html = fetch_senado(url)
            stats["fetched"] += 1
        except requests.HTTPError as e:
            if "404" in str(e):
                stats["not_found"] += 1
                print(f"  404 (ley no en basedoc)")
            else:
                stats["errors"].append({"norm_id": nid, "url": url, "error": str(e)[:150]})
                print(f"  ERROR: {e}")
            continue
        except Exception as e:
            stats["errors"].append({"norm_id": nid, "url": url, "error": str(e)[:150]})
            print(f"  ERROR: {e}")
            continue

        vmap = parse_articles_vigencia(html)
        if not vmap:
            stats["parse_errors"] += 1
            print(f"  WARN: 0 artículos parseados")
            continue

        global_status = determine_vigencia_global(vmap)
        stats["by_vigencia_global"][global_status] = stats["by_vigencia_global"].get(global_status, 0) + 1

        derog = sum(1 for v in vmap.values() if v['status'] == 'derogado')
        modif = sum(1 for v in vmap.values() if v['status'] == 'modificado')
        print(f"  arts parsed: {len(vmap)}  derog: {derog}  modif: {modif}  global: {global_status}")

        per_norm = {"norm_id": nid, "ley": f"{num}/{year}", "articulos_basedoc": len(vmap),
                    "derogados": derog, "modificados": modif, "vigencia_global": global_status}

        if not args.dry_run:
            # Cross-reference with DB articles
            db_arts = load_articles_for_norm(nid)
            matched = 0
            for art_num, v in vmap.items():
                key = str(art_num).lstrip("0") or "0"
                if key in db_arts:
                    field = "derogado_por" if v['status'] == 'derogado' else ("modificado_por" if v['status'] == 'modificado' else None)
                    if update_article(db_arts[key], v['status'], v.get('source_norm'), field or "derogado_por"):
                        matched += 1
                        stats["articles_updated"] += 1
            per_norm["db_arts_matched"] = matched
            per_norm["db_arts_total"] = len(db_arts)
            if update_source_vigencia(nid, global_status):
                stats["sources_updated"] += 1
            print(f"  UPDATE: {matched}/{len(db_arts)} arts DB matched")

        stats["per_norm"].append(per_norm)

    stats["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "="*78); print("  RESUMEN"); print("="*78)
    for k in ["total", "fetched", "not_found", "parse_errors", "articles_updated", "sources_updated"]:
        print(f"  {k}: {stats[k]}")
    print(f"  por vigencia_global: {stats['by_vigencia_global']}")
    print(f"  errores: {len(stats['errors'])}")


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: sys.exit(130)
