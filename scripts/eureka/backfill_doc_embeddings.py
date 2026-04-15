"""
backfill_doc_embeddings.py
Genera embeddings para documentos existentes que no los tienen.
"""
import os, requests
from pathlib import Path
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")

SB = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_KEY"]
OAI = os.environ["OPENAI_API_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

docs = requests.get(
    f"{SB}/rest/v1/documents?select=id,raw_text,extracted_text&embedding=is.null",
    headers=H).json()
print(f"Documentos sin embedding: {len(docs)}")

for d in docs:
    texto = d.get("raw_text") or d.get("extracted_text") or ""
    if len(texto) < 100:
        print(f"  id:{d['id'][:8]} — sin texto suficiente, skip")
        continue

    r = requests.post("https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {OAI}", "Content-Type": "application/json"},
        json={"model": "text-embedding-3-small", "input": texto[:24000]})

    if r.status_code == 200:
        emb = r.json()["data"][0]["embedding"]
        patch = requests.patch(
            f"{SB}/rest/v1/documents?id=eq.{d['id']}",
            headers={**H, "Content-Type": "application/json"},
            json={"embedding": emb})
        print(f"  id:{d['id'][:8]} — OK ({patch.status_code})")
    else:
        print(f"  id:{d['id'][:8]} — error OpenAI: {r.status_code} {r.text[:100]}")
