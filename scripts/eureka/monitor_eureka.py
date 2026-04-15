#!/usr/bin/env python3
"""MON-1 — Monitor automático EUREKA.

Re-fetcha muestra de URLs SUIN y compara SHA-256 contra fingerprints.
Si hay cambio → agrega a corpus_gaps.json con status='cambio_detectado'.

Uso (cron mensual):
  0 3 1 * * cd /path/to/vigia/scripts/eureka && python3 monitor_eureka.py
"""
from __future__ import annotations
import hashlib, json, os, random, sys, time
from pathlib import Path
import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env.local")
FINGERPRINTS = HERE / "suin_scrape_fingerprints.json"
CORPUS_GAPS = HERE / "corpus_gaps.json"
MONITOR_LOG = HERE / "monitor_eureka.log"

UA = "Mozilla/5.0 (compatible; VIGIA-Monitor/1.0)"
SAMPLE_SIZE = 10
TIMEOUT = 30


def fetch_hash(url):
    r = requests.get(url, timeout=TIMEOUT,
                     headers={"User-Agent": UA}, verify=False)
    if r.status_code != 200: return None
    return hashlib.sha256(r.content).hexdigest()


def main():
    if not FINGERPRINTS.exists():
        print(f"[fatal] {FINGERPRINTS} no existe. Correr scrape_suin_to_normative_articles.py primero.")
        return 1
    fps = json.loads(FINGERPRINTS.read_text())
    if isinstance(fps, dict): fps = list(fps.items())
    else: fps = [(k, v) for k, v in fps.items()] if hasattr(fps, "items") else fps

    # Normalizar: lista de (slug, {url, sha256}) o similar
    entries = []
    raw = json.loads(FINGERPRINTS.read_text())
    if isinstance(raw, dict):
        for slug, data in raw.items():
            if isinstance(data, dict) and "sha256" in data:
                entries.append({"slug": slug, "url": data.get("url"), "sha256": data["sha256"]})
    elif isinstance(raw, list):
        entries = [e for e in raw if "sha256" in e]
    print(f"[info] {len(entries)} fingerprints cargados")

    sample = random.sample(entries, min(SAMPLE_SIZE, len(entries)))
    cambios = []
    import urllib3; urllib3.disable_warnings()
    for i, e in enumerate(sample, 1):
        url = e.get("url")
        if not url: continue
        print(f"[{i}/{len(sample)}] {e['slug'][:60]}")
        try:
            new_hash = fetch_hash(url)
        except Exception as ex:
            print(f"  ERROR: {ex}"); continue
        if not new_hash: continue
        if new_hash != e["sha256"]:
            print(f"  ⚠ CAMBIO DETECTADO")
            cambios.append({"slug": e["slug"], "url": url,
                            "sha256_viejo": e["sha256"], "sha256_nuevo": new_hash,
                            "detected_at": time.strftime("%Y-%m-%d")})
        else:
            print(f"  ✓ sin cambios")

    if cambios:
        gaps = json.loads(CORPUS_GAPS.read_text())
        gaps.setdefault("suin_changes_detected", []).extend(cambios)
        gaps["last_monitor_run"] = time.strftime("%Y-%m-%d")
        CORPUS_GAPS.write_text(json.dumps(gaps, ensure_ascii=False, indent=2))
        print(f"\n{len(cambios)} cambios registrados en corpus_gaps.json")
    else:
        print(f"\nSin cambios detectados en la muestra de {len(sample)}")

    MONITOR_LOG.write_text(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - sample={len(sample)} cambios={len(cambios)}\n", )


if __name__ == "__main__":
    sys.exit(main() or 0)
