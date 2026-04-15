#!/usr/bin/env python3
"""Enriquece obligations sin norma_fundamento via búsqueda semántica.
Solo OpenAI embeddings + RPC match_normative_articles. Sin Anthropic.
"""
import os, time, requests
from pathlib import Path
from dotenv import load_dotenv
HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
from openai import OpenAI  # noqa: E402

SB_URL = os.environ["SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_CLIENT = OpenAI()
SRV = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}


def embed(text):
    return OPENAI_CLIENT.embeddings.create(model="text-embedding-3-small",
                                            input=text[:8000]).data[0].embedding


def match(embedding):
    r = requests.post(f"{SB_URL}/rest/v1/rpc/match_normative_articles",
                      headers=SRV,
                      json={"query_embedding": embedding, "match_count": 1,
                            "filter_scope": None, "filter_norm_type": None,
                            "filter_min_year": None, "filter_max_year": None,
                            "filter_sectors": None}, timeout=30)
    return r.json() if r.ok else []


def main():
    # Leer obligations sin norma_fundamento
    res = requests.get(f"{SB_URL}/rest/v1/obligations",
                       headers=SRV,
                       params={"norma_fundamento": "is.null",
                               "select": "id,obligation_num,description,name,org_id"},
                       timeout=30)
    obs = res.json() if res.ok else []
    print(f"[info] obligations sin fundamento: {len(obs)}")

    updated = skipped = errors = 0
    for i, ob in enumerate(obs, 1):
        desc = (ob.get("description") or "") + " " + (ob.get("name") or "")
        desc = desc.strip()
        if len(desc) < 20:
            skipped += 1
            continue
        print(f"[{i}/{len(obs)}] {ob.get('obligation_num')}: {desc[:70]}")
        try:
            matches = match(embed(desc))
            if not matches:
                print("  → no match"); skipped += 1; continue
            best = matches[0]
            dist = best.get("distance", 1.0)
            if dist > 0.5:
                print(f"  → similitud baja ({1-dist:.2f}), skip"); skipped += 1; continue
            norma = (f"{(best.get('norm_type') or '').capitalize()} "
                     f"{best.get('norm_number') or ''}/{best.get('norm_year') or ''}").strip()
            art = best.get("article_label") or f"Art. {best.get('article_number', '')}"
            print(f"  → {norma} {art} (sim {1-dist:.2f})")
            patch = requests.patch(f"{SB_URL}/rest/v1/obligations",
                                    headers={**SRV, "Prefer": "return=minimal"},
                                    params={"id": f"eq.{ob['id']}"},
                                    json={"norma_fundamento": norma,
                                          "articulo_fundamento": art,
                                          "vigencia_fundamento": "sin_informacion"},
                                    timeout=30)
            if patch.ok: updated += 1
            else: errors += 1; print(f"  ✗ UPDATE {patch.status_code}")
            time.sleep(0.25)
        except Exception as e:
            print(f"  ✗ {e}"); errors += 1

    print(f"\nActualizadas: {updated} · Saltadas: {skipped} · Errores: {errors}")


if __name__ == "__main__":
    main()
