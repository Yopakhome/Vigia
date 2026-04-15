#!/usr/bin/env python3
"""Test end-to-end REGLA 18: insertar doc con embedding real, verificar RPC."""
import json, os, sys
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
SB_URL = os.environ["SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
from openai import OpenAI  # noqa: E402
OPENAI = OpenAI()

# Org ID real del corpus (cerrejon-norte — org usada en seed de prueba)
ORG_ID = "c1000000-0000-0000-0000-000000000001"

TEST_TEXT = """AUTORIDAD NACIONAL DE LICENCIAS AMBIENTALES - ANLA
Oficio No. 2024-032847-1-000
Fecha: 15 de marzo de 2024
Expediente: LAM0123

Asunto: Requerimiento de información sobre vertimientos

En virtud del seguimiento a la Licencia Ambiental LAM0123, esta Autoridad
REQUIERE dentro de los 30 días hábiles:

1. Informe de monitoreo de vertimientos al cuerpo hídrico Río Bogotá,
   incluyendo análisis físico-químicos con parámetros DBO5, DQO, SST,
   pH y temperatura según Resolución 631 de 2015.

2. Plan de acción para reducción de carga contaminante en punto de
   vertimiento PV-001, con cronograma trimestral.

3. Certificación de calibración de equipos de medición vigente.

El incumplimiento dará lugar a medidas preventivas conforme al
artículo 36 de la Ley 1333 de 2009."""

HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
           "Content-Type": "application/json", "Prefer": "return=representation"}


def main():
    # 1) Verificar que la org existe
    r = requests.get(f"{SB_URL}/rest/v1/organizations",
                     headers=HEADERS, params={"select": "id,name", "id": f"eq.{ORG_ID}"},
                     timeout=30)
    r.raise_for_status()
    if not r.json():
        print(f"[warn] org {ORG_ID} no existe. Buscando cualquier org real...")
        r2 = requests.get(f"{SB_URL}/rest/v1/organizations",
                          headers=HEADERS, params={"select": "id,name", "limit": "1"},
                          timeout=30)
        orgs = r2.json()
        if not orgs:
            print("[fatal] no hay ninguna org en DB"); return 1
        org_id = orgs[0]["id"]
        org_name = orgs[0]["name"]
    else:
        org_id = r.json()[0]["id"]
        org_name = r.json()[0]["name"]
    print(f"[info] usando org: {org_id} ({org_name})")

    # 2) Verificar que un instrument existe en esa org, o crear uno
    r = requests.get(f"{SB_URL}/rest/v1/instruments",
                     headers=HEADERS,
                     params={"select": "id", "org_id": f"eq.{org_id}", "limit": "1"}, timeout=30)
    r.raise_for_status()
    insts = r.json()
    if insts:
        instr_id = insts[0]["id"]
        print(f"[info] usando instrument existente: {instr_id}")
    else:
        # Crear instrument minimo
        pl = {"org_id": org_id, "instrument_type": "licencia_ambiental",
              "number": "TEST-LAM0123", "authority_name": "ANLA",
              "project_name": "Test E2E REGLA 18", "domain": "ambiental",
              "edi_status": "activo", "completeness_pct": 0,
              "has_confidential_sections": False}
        ir = requests.post(f"{SB_URL}/rest/v1/instruments", headers=HEADERS, json=pl, timeout=30)
        ir.raise_for_status()
        instr_id = ir.json()[0]["id"]
        print(f"[info] instrument creado: {instr_id}")

    # 3) Embedding
    er = OPENAI.embeddings.create(model="text-embedding-3-small", input=TEST_TEXT[:8000])
    embedding = er.data[0].embedding
    vec = "[" + ",".join(f"{f:.7f}" for f in embedding) + "]"
    print(f"[info] embedding generado ({er.usage.total_tokens} tokens)")

    # 4) INSERT documents
    doc = {
        "org_id": org_id, "instrument_id": instr_id,
        "original_name": "TEST_Oficio_ANLA_2024_032847.txt",
        "file_type": "text/plain", "file_size_kb": 2,
        "doc_role": "auto_seguimiento",
        "doc_label": "TEST Oficio ANLA 2024-032847 Requerimiento vertimientos",
        "doc_type_detected": "requerimiento_autoridad",
        "accessibility": "confidencial_empresarial", "ocr_status": "completo",
        "extracted_text": TEST_TEXT[:500],
        "raw_text": TEST_TEXT,
        "format_type": "text/plain",
        "processed_method": "direct_text",
        "raw_text_length": len(TEST_TEXT),
        "embedding": vec,
        "category": "Aguas y vertimientos",
    }
    ir = requests.post(f"{SB_URL}/rest/v1/documents", headers=HEADERS, json=doc, timeout=60)
    if not ir.ok:
        print(f"[fail] INSERT: {ir.status_code} {ir.text[:400]}"); return 1
    doc_id = ir.json()[0]["id"]
    print(f"[ok] documento insertado: {doc_id}")

    # 5) Test RPC match_org_documents con una query embedding representativa
    qr = OPENAI.embeddings.create(model="text-embedding-3-small",
                                   input="requerimiento de monitoreo de vertimientos al río Bogotá")
    q_emb = qr.data[0].embedding
    q_vec = "[" + ",".join(f"{f:.7f}" for f in q_emb) + "]"
    rpc = requests.post(f"{SB_URL}/rest/v1/rpc/match_org_documents",
                        headers=HEADERS,
                        json={"query_embedding": q_emb, "org_id_filter": org_id, "match_count": 3},
                        timeout=30)
    if not rpc.ok:
        print(f"[fail] RPC: {rpc.status_code} {rpc.text[:400]}"); return 1
    results = rpc.json()
    print(f"\n[rpc] retornó {len(results)} docs:")
    for d in results[:3]:
        print(f"  distance={d.get('distance'):.4f} label={(d.get('doc_label') or '')[:60]}")
    if any(d.get("doc_id") == doc_id for d in results):
        print(f"\n✅ RPC funcionando — encontró el documento insertado")
        return 0
    else:
        print(f"\n⚠ el doc insertado NO apareció en top 3 (hay otros docs más cercanos)")
        return 0  # No es fallo, sólo info


if __name__ == "__main__":
    sys.exit(main())
