#!/usr/bin/env python3
"""B2: re-categorizar normas con category='Otra' via edge classify-item (Haiku).
Usa la edge function porque ANTHROPIC_API_KEY no está local.
"""
import os, time, requests
from pathlib import Path
from dotenv import load_dotenv
HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")

SB_URL = os.environ["SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
SB_PUB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV"
EMAIL = "admin@cerrejon-norte.vigia-test.co"
PWD = "Vigia2026!"

TAXONOMIA = [
    "Aguas y vertimientos", "Aire y emisiones", "Biodiversidad y fauna silvestre",
    "Suelos y residuos sólidos", "Licenciamiento ambiental",
    "Cambio climático y transición energética", "Régimen sancionatorio ambiental",
    "Minería y energía", "Ordenamiento territorial ambiental",
    "Derecho internacional ambiental y tratados", "Consulta previa y comunidades étnicas",
    "Marco general e institucional", "Salud ambiental y sustancias químicas",
    "Política ambiental nacional", "Otra"
]

REST = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}


def login():
    r = requests.post(f"{SB_URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": SB_PUB_KEY, "Content-Type": "application/json"},
                      json={"email": EMAIL, "password": PWD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def classify(token, title, summary):
    prompt = f"""Clasifica este documento ambiental colombiano en UNA categoría de esta lista exacta:
{chr(10).join(f'- {t}' for t in TAXONOMIA)}

Título: {title}
Resumen: {(summary or '')[:400]}

Responde SOLO con el nombre exacto de la categoría, sin explicación, sin guiones, sin prefijos."""
    r = requests.post(f"{SB_URL}/functions/v1/classify-item",
                      headers={"apikey": SB_PUB_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                      json={"prompt": prompt, "max_tokens": 40, "model": "claude-haiku-4-5-20251001"},
                      timeout=60)
    try: body = r.json()
    except: body = {"error": r.text[:200]}
    if r.status_code != 200 or "text" not in body:
        return None, body.get("error", "unknown"), 0, 0
    cat = body["text"].strip()
    # Match contra taxonomía (tolerante a case)
    for t in TAXONOMIA:
        if t.lower() == cat.lower() or cat.lower() in t.lower():
            return t, None, body.get("tokens_in", 0), body.get("tokens_out", 0)
    return "Otra", f"no_match: {cat[:80]}", body.get("tokens_in", 0), body.get("tokens_out", 0)


def main():
    # Leer normas con category='Otra'
    rows = []; start = 0
    while True:
        h = dict(REST); h["Range"] = f"{start}-{start+999}"
        r = requests.get(f"{SB_URL}/rest/v1/normative_sources",
                         headers=h,
                         params={"select": "id,norm_type,norm_number,norm_year,norm_title,summary",
                                 "category": "eq.Otra"}, timeout=30)
        r.raise_for_status(); batch = r.json()
        if not batch: break
        rows.extend(batch)
        if len(batch) < 1000: break
        start += 1000
    print(f"[info] normas con category='Otra': {len(rows)}")

    token = login()
    print("[info] auth OK")

    updated = skipped = errors = 0
    tokens_in_total = tokens_out_total = 0

    for i, n in enumerate(rows, 1):
        title = f"{(n.get('norm_type') or '').title()} {n.get('norm_number') or ''}/{n.get('norm_year') or ''} — {n.get('norm_title') or ''}"
        summary = n.get("summary") or ""
        if i > 1 and i % 10 == 1: time.sleep(0.3)  # pequeño throttle
        cat, err, tin, tout = classify(token, title, summary)
        tokens_in_total += tin; tokens_out_total += tout
        if err and cat == "Otra":
            print(f"[{i}/{len(rows)}] {title[:60]} → SKIP ({err[:50]})")
            skipped += 1
            continue
        if cat == "Otra":
            skipped += 1
            continue
        # UPDATE
        patch = requests.patch(f"{SB_URL}/rest/v1/normative_sources",
                               headers={**REST, "Prefer": "return=minimal"},
                               params={"id": f"eq.{n['id']}"},
                               json={"category": cat}, timeout=30)
        if patch.ok:
            updated += 1
            print(f"[{i}/{len(rows)}] {title[:55]} → {cat}")
        else:
            errors += 1
            print(f"[{i}/{len(rows)}] UPDATE fail {patch.status_code}")

    cost = tokens_in_total * 1.0 / 1_000_000 + tokens_out_total * 5.0 / 1_000_000
    print(f"\nActualizadas: {updated} · Saltadas: {skipped} · Errores: {errors}")
    print(f"Tokens: in={tokens_in_total}, out={tokens_out_total}, cost≈${cost:.4f}")


if __name__ == "__main__":
    main()
