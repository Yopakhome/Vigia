"""
audit_corpus_estado.py
Clasifica las 364 normas en 4 grupos según su estado de ingesta.
Output: imprime tabla + guarda audit_corpus_report.json
"""
import os, json, requests
from pathlib import Path
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")

SB_URL = os.environ["SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

def sb_get(path):
    r = requests.get(f"{SB_URL}/rest/v1/{path}", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def sb_get_all(base_path, page=1000):
    out, offset = [], 0
    while True:
        h = dict(HEADERS, **{"Range-Unit": "items", "Range": f"{offset}-{offset+page-1}"})
        r = requests.get(f"{SB_URL}/rest/v1/{base_path}", headers=h)
        r.raise_for_status()
        chunk = r.json()
        out.extend(chunk)
        if len(chunk) < page:
            break
        offset += page
    return out

# Traer todas las normas con conteo de artículos
normas = sb_get_all("normative_sources?select=id,norm_type,norm_number,norm_year,norm_title,category,corpus_source,source_url,full_text")
articulos = sb_get_all("normative_articles?select=norm_id")

# Contar artículos por norma
art_count = {}
for a in articulos:
    sid = a["norm_id"]
    art_count[sid] = art_count.get(sid, 0) + 1

groups = {"A_completa": [], "B_texto_sin_articulos": [], "C_sin_texto_con_url": [], "D_pendiente_ocr": []}

for n in normas:
    nid = n["id"]
    tiene_texto = n.get("full_text") and len(n["full_text"]) > 300
    tiene_url = bool(n.get("source_url"))
    count = art_count.get(nid, 0)
    n["article_count"] = count

    if tiene_texto and count > 0:
        groups["A_completa"].append(n)
    elif tiene_texto and count == 0:
        groups["B_texto_sin_articulos"].append(n)
    elif not tiene_texto and tiene_url:
        groups["C_sin_texto_con_url"].append(n)
    else:
        groups["D_pendiente_ocr"].append(n)

print("\n=== AUDITORÍA CORPUS VIGÍA ===")
for g, items in groups.items():
    print(f"\n{g}: {len(items)} normas")
    for n in items[:5]:
        label = f"{n.get('norm_type','?')} {n.get('norm_number','?')}/{n.get('norm_year','?')}"
        print(f"  - {label} | arts: {n['article_count']} | texto: {len(n.get('full_text') or '')}")
    if len(items) > 5:
        print(f"  ... y {len(items)-5} más")

report = {g: [{"id": n["id"], "label": f"{n.get('norm_type','')} {n.get('norm_number','')}/{n.get('norm_year','')}", "article_count": n["article_count"], "text_len": len(n.get("full_text") or ""), "source_url": n.get("source_url")} for n in items] for g, items in groups.items()}
out = HERE / "audit_corpus_report.json"
out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(f"\nReporte guardado en: {out}")
print(f"\nRESUMEN: A={len(groups['A_completa'])} B={len(groups['B_texto_sin_articulos'])} C={len(groups['C_sin_texto_con_url'])} D={len(groups['D_pendiente_ocr'])}")
