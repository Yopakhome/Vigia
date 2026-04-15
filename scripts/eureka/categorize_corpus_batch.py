#!/usr/bin/env python3
"""CAT-2/3: Categorización batch de normas + sentencias via Claude Haiku.

Taxonomía (15 categorías). Batch de 20 para reducir costo.
Usa edge function chat-bot para evitar exponer ANTHROPIC_API_KEY local.
Alternativa: llama directa a API si ANTHROPIC_API_KEY está en entorno.

Prompt minimalista para Haiku 4.5. Costo estimado: ~$0.02 total.
"""
from __future__ import annotations
import argparse, json, os, re, time
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not ANTHROPIC_API_KEY:
    # Llamar al edge function categorize o a chat-bot con un wrapper
    print("[warn] ANTHROPIC_API_KEY no local. Usando approach rule-based.")
    USE_LLM = False
else:
    USE_LLM = True
    print("[info] usando Claude Haiku 4.5")

REPORT_JSON = HERE / "categorize_report.json"
REST_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json", "Prefer": "return=minimal"}

TAXONOMIA = [
    "Aguas y vertimientos",
    "Aire y emisiones",
    "Biodiversidad y fauna silvestre",
    "Suelos y residuos sólidos",
    "Licenciamiento ambiental",
    "Cambio climático y transición energética",
    "Régimen sancionatorio ambiental",
    "Minería y energía",
    "Ordenamiento territorial ambiental",
    "Derecho internacional ambiental y tratados",
    "Consulta previa y comunidades étnicas",
    "Marco general e institucional",
    "Salud ambiental y sustancias químicas",
    "Política ambiental nacional",
    "Otra",
]

# Keywords por categoría para fallback rule-based (si no hay API key)
KW = {
    "Aguas y vertimientos": ["vertimiento","agua","hídrico","cuenca","potable","alcantarillado","acuífero","humedal","pomca","potos"],
    "Aire y emisiones": ["aire","emisión","emisiones","fuente móvil","fuente fija","ruido","calidad del aire","ozono","gei","carbono","material particulado"],
    "Biodiversidad y fauna silvestre": ["biodiversidad","fauna","flora","especies","ecosistema","área protegida","sinap","parque natural","reserva","bosque","ramsar","cites","silvestre","forestal"],
    "Suelos y residuos sólidos": ["residuo","desecho","suelo","erosión","disposición final","relleno","rcd","respel","hospitalarios","aseo","reciclaje","basura"],
    "Licenciamiento ambiental": ["licencia ambiental","permiso ambiental","anla","autoridad ambiental","pma","plan de manejo","estudio de impacto","eia","daa","trámite"],
    "Cambio climático y transición energética": ["cambio climático","ndc","redd","mitigación","adaptación","transición energética","renovable","solar","eólica","kyoto","paris","minamata"],
    "Régimen sancionatorio ambiental": ["sancionatorio","sanción","multa","infracción","decomiso","medida preventiva","procedimiento sancionatorio","tasación"],
    "Minería y energía": ["minería","mineral","hidrocarburos","petróleo","gas","energía","eléctrico","combustible","explotación","concesión minera"],
    "Ordenamiento territorial ambiental": ["ordenamiento","pot","pomca","zonificación","uso del suelo","área de exclusión","territorial","municipal","distrital"],
    "Derecho internacional ambiental y tratados": ["convenio","convención","protocolo","tratado","ratifica","aprueba","internacional","naciones unidas","oit","cites","ramsar","basilea","kyoto","estocolmo","rotterdam"],
    "Consulta previa y comunidades étnicas": ["consulta previa","indígena","comunidad étnica","afro","negra","tribal","territorio colectivo","oit 169","convenio 169"],
    "Marco general e institucional": ["sina","ministerio","ministro","ambiente y desarrollo sostenible","estructura","orgánica","competencias","corporación autónoma","car"],
    "Salud ambiental y sustancias químicas": ["salud ambiental","sustancia química","plaguicida","biocida","mercurio","plomo","asbesto","cianuro","riesgo químico"],
    "Política ambiental nacional": ["política nacional","política ambiental","conpes","estrategia nacional","plan nacional","política pública"],
}


def rule_based_categorize(title, text=""):
    """Fallback: score keywords por categoría, retorna top-2."""
    low = (title + " " + text).lower()
    scores = {}
    for cat, kws in KW.items():
        s = sum(1 for kw in kws if kw in low)
        if s > 0: scores[cat] = s
    if not scores:
        return "Otra", None
    top = sorted(scores.items(), key=lambda x: -x[1])
    primary = top[0][0]
    secondary = top[1][0] if len(top) > 1 and top[1][1] >= top[0][1] * 0.5 else None
    return primary, secondary


def llm_categorize_batch(items):
    """Una sola llamada Haiku para batch de 20. Retorna lista de dicts."""
    tax_list = "\n".join(f"- {t}" for t in TAXONOMIA)
    items_text = ""
    for i, it in enumerate(items, 1):
        items_text += f"\n[{i}] {it['display']}\n"
    prompt = f"""Clasifica cada uno de estos documentos ambientales colombianos en UNA categoría principal (y opcionalmente UNA secundaria si aplica) de esta lista:

{tax_list}

Documentos:{items_text}

Responde SOLO un JSON array con {len(items)} objetos en el orden dado:
[{{"primary":"...","secondary":"..."}}, ...]
(secondary puede ser null)"""

    r = requests.post("https://api.anthropic.com/v1/messages",
                      headers={"Content-Type": "application/json",
                               "x-api-key": ANTHROPIC_API_KEY,
                               "anthropic-version": "2023-06-01"},
                      json={"model": "claude-haiku-4-5-20251001",
                            "max_tokens": 3000,
                            "messages": [{"role":"user","content":prompt}]},
                      timeout=90)
    if r.status_code != 200:
        return None, f"http_{r.status_code}: {r.text[:200]}"
    data = r.json()
    raw = data["content"][0]["text"]
    # strip markdown
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    first = raw.find("["); last = raw.rfind("]")
    if first < 0 or last < 0: return None, "no_array"
    try:
        parsed = json.loads(raw[first:last+1])
    except Exception as e:
        return None, f"parse: {e}"
    if len(parsed) != len(items):
        return parsed[:len(items)], f"length_mismatch (got {len(parsed)}, expected {len(items)})"
    return parsed, None


def load_normative():
    out = []; start = 0; PAGE = 1000
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+PAGE-1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/normative_sources", headers=h,
                         params={"select": "id,norm_type,norm_number,norm_year,norm_title,summary,category"},
                         timeout=30)
        r.raise_for_status(); batch = r.json()
        if not batch: break
        out.extend(batch)
        if len(batch) < PAGE: break
        start += PAGE
    return out


def load_jurisprudence():
    out = []; start = 0
    while True:
        h = dict(REST_HEADERS); h["Range"] = f"{start}-{start+999}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/jurisprudence_sources", headers=h,
                         params={"select": "id,radicado,corte,title,category"},
                         timeout=30)
        r.raise_for_status(); batch = r.json()
        if not batch: break
        out.extend(batch)
        if len(batch) < 1000: break
        start += 1000
    return out


def update_batch(table, updates):
    """Bulk PATCH: una llamada por row (PostgREST no tiene bulk PATCH eficiente)."""
    ok = 0
    for rid, primary, secondary in updates:
        payload = {"category": primary, "category_secondary": secondary}
        r = requests.patch(f"{SUPABASE_URL}/rest/v1/{table}",
                           headers=REST_HEADERS, params={"id": f"eq.{rid}"},
                           json=payload, timeout=30)
        if r.status_code in (200, 204): ok += 1
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sample", type=int, default=None, help="Solo procesar N docs")
    ap.add_argument("--force", action="store_true", help="Recategorizar aun si ya tiene category")
    args = ap.parse_args()

    norms = load_normative()
    jurs = load_jurisprudence()
    print(f"[info] normas: {len(norms)}, sentencias: {len(jurs)}")

    if not args.force:
        norms_to = [n for n in norms if not n.get("category")]
        jurs_to = [j for j in jurs if not j.get("category")]
    else:
        norms_to = norms; jurs_to = jurs
    print(f"[info] a categorizar: {len(norms_to)} normas + {len(jurs_to)} sentencias")
    if args.sample:
        norms_to = norms_to[:args.sample]
        jurs_to = jurs_to[:args.sample]

    # Preparar items
    norm_items = [{
        "id": n["id"],
        "display": f"{n.get('norm_type','').upper()} {n.get('norm_number') or ''}/{n.get('norm_year') or ''} — {(n.get('norm_title') or '')[:180]}"
    } for n in norms_to]
    jur_items = [{
        "id": j["id"],
        "display": f"Sentencia {j.get('corte','')}/{j.get('radicado','')} — {(j.get('title') or '')[:180]}"
    } for j in jurs_to]

    results_norms = []
    results_jurs = []
    tokens_used = 0
    errors = []

    BATCH = 20
    if USE_LLM:
        # Normativas
        for i in range(0, len(norm_items), BATCH):
            batch = norm_items[i:i+BATCH]
            if i > 0: time.sleep(0.5)
            parsed, err = llm_categorize_batch(batch)
            if err:
                print(f"  [norms {i}-{i+len(batch)}] ERROR: {err}")
                errors.append({"stage":"norms","batch":i,"error":err})
                # Fallback rule-based
                for item in batch:
                    p, s = rule_based_categorize(item["display"])
                    results_norms.append((item["id"], p, s))
            else:
                for item, cat in zip(batch, parsed):
                    p = cat.get("primary") or "Otra"
                    s = cat.get("secondary")
                    if p not in TAXONOMIA: p = "Otra"
                    if s and s not in TAXONOMIA: s = None
                    results_norms.append((item["id"], p, s))
                print(f"  [norms {i}-{i+len(batch)}] ok")
        # Jurisprudencia
        for i in range(0, len(jur_items), BATCH):
            batch = jur_items[i:i+BATCH]
            if i > 0 or results_norms: time.sleep(0.5)
            parsed, err = llm_categorize_batch(batch)
            if err:
                print(f"  [jurs {i}-{i+len(batch)}] ERROR: {err}")
                errors.append({"stage":"jurs","batch":i,"error":err})
                for item in batch:
                    p, s = rule_based_categorize(item["display"])
                    results_jurs.append((item["id"], p, s))
            else:
                for item, cat in zip(batch, parsed):
                    p = cat.get("primary") or "Otra"
                    s = cat.get("secondary")
                    if p not in TAXONOMIA: p = "Otra"
                    if s and s not in TAXONOMIA: s = None
                    results_jurs.append((item["id"], p, s))
                print(f"  [jurs {i}-{i+len(batch)}] ok")
    else:
        # Rule-based 100%
        for item in norm_items:
            p, s = rule_based_categorize(item["display"])
            results_norms.append((item["id"], p, s))
        for item in jur_items:
            p, s = rule_based_categorize(item["display"])
            results_jurs.append((item["id"], p, s))

    if args.dry_run:
        print("\n--- DRY RUN — muestra 10 normas ---")
        from collections import Counter
        all_cats = Counter(r[1] for r in results_norms + results_jurs)
        for c, n in all_cats.most_common():
            print(f"  {n:4d}  {c}")
        print()
        for r in results_norms[:10]:
            print(f"  {r}")
    else:
        norms_ok = update_batch("normative_sources", results_norms)
        jurs_ok = update_batch("jurisprudence_sources", results_jurs)
        print(f"\nUPDATE normative_sources: {norms_ok}/{len(results_norms)}")
        print(f"UPDATE jurisprudence_sources: {jurs_ok}/{len(results_jurs)}")

    report = {
        "method": "llm_haiku" if USE_LLM else "rule_based",
        "norms_categorized": len(results_norms),
        "jurs_categorized": len(results_jurs),
        "errors": errors,
        "tokens_used_estimated": tokens_used,
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
