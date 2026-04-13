#!/usr/bin/env python3
"""
OCR y ingesta de scans usando SOLO edge functions (ANTHROPIC_API_KEY vive en Supabase secrets).
Pasos por norma:
  1. Login admin@cerrejon-norte (cliente, no SuperAdmin).
  2. POST norm-extract-text → Claude OCR server-side → texto + pdf_base64 + hash.
  3. POST norm-ingest con raw_text + pdf_base64 → norma entra pending_validation.
La promoción a published la hace Claude Code vía MCP execute_sql después.
"""
import json, sys, os, requests
from pathlib import Path

SB_URL = "https://itkbujkqjesuntgdkubt.supabase.co"
SB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV"
EMAIL  = "admin@cerrejon-norte.vigia-test.co"
PWD    = "Vigia2026!"

def login():
    r = requests.post(f"{SB_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SB_KEY, "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PWD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]

def extract_text(token, pdf_url):
    r = requests.post(f"{SB_URL}/functions/v1/norm-extract-text",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"pdf_url": pdf_url}, timeout=180)
    return r.status_code, r.json() if r.headers.get("content-type","").startswith("application/json") else {"raw": r.text[:300]}

def ingest(token, pdf_url, raw_text, pdf_base64, content_hash, meta, org_id="c1000000-0000-0000-0000-000000000001"):
    r = requests.post(f"{SB_URL}/functions/v1/norm-ingest",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "pdf_url": pdf_url,
            "raw_text": raw_text,
            "pdf_base64": pdf_base64,
            "content_hash": content_hash,
            "proposed_metadata": meta,
            "proposed_by_org_id": org_id
        }, timeout=180)
    return r.status_code, r.json() if r.headers.get("content-type","").startswith("application/json") else {"raw": r.text[:300]}

def main():
    scans = json.loads(Path("scripts/seed_scans.json").read_text())
    print(f"• Login como {EMAIL}…")
    token = login()
    print(f"  ✓ autenticado")
    results = []
    for i, item in enumerate(scans, 1):
        url = item["url"]; meta = {k:v for k,v in item["meta"].items() if not k.startswith("_")}
        print(f"\n[{i}/{len(scans)}] {meta.get('title','')[:80]}")
        print(f"  URL: {url}")
        r = {"url": url, "meta": meta}
        print(f"  • extract-text (OCR via Claude en edge)…")
        s, body = extract_text(token, url)
        if s != 200 or not body.get("ok"):
            print(f"  ✗ extract-text falló ({s}): {body.get('error') or body}")
            r["status"] = "extract_failed"
            r["error"] = body.get("error") or str(body)[:200]
            results.append(r); continue
        text = body["text"]; pdf_base64 = body["pdf_base64"]; chash = body["content_hash"]
        print(f"  ✓ texto: {len(text):,} chars | método: {body.get('text_method')} | OCR tokens: {body.get('ocr_usage',{}).get('tokens_in',0)}/{body.get('ocr_usage',{}).get('tokens_out',0)}")
        print(f"  • norm-ingest…")
        s2, body2 = ingest(token, url, text, pdf_base64, chash, meta)
        if s2 != 200 or not body2.get("norm_id"):
            print(f"  ✗ ingest falló ({s2}): {body2.get('error') or body2}")
            r["status"] = "ingest_failed"
            r["error"] = body2.get("error") or str(body2)[:200]
            r["ingest_status"] = s2
            results.append(r); continue
        print(f"  ✓ ingested norm_id={body2['norm_id'][:8]}… articles={body2.get('articles_extracted')} quality={body2.get('parser_quality')}")
        r["status"] = "ingested"
        r["norm_id"] = body2["norm_id"]
        r["articles"] = body2.get("articles_extracted")
        r["parser_quality"] = body2.get("parser_quality")
        results.append(r)
    Path("scripts/ocr_scans_result.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    ok = sum(1 for r in results if r["status"]=="ingested")
    print(f"\n{'='*60}\nResultado: {ok}/{len(scans)} ingestadas → scripts/ocr_scans_result.json")

if __name__ == "__main__":
    main()
