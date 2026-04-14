#!/usr/bin/env python3
"""Descarga los PDFs inline de Jurisprudencia identificados en
source_classification_jurisprudencia.json.

Guarda en scripts/eureka/samples_jurisprudencia/<subcat>__<slug>.pdf con
metadata al lado. Gemelo de download_anla_pdfs.py.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

UA = "Mozilla/5.0 (compatible; VIGIAResearchBot/1.0; +https://vigia-five.vercel.app)"
DELAY = 3.0
RETRY_DELAY = 10.0

HERE = Path(__file__).parent
SRC = HERE / "source_classification_jurisprudencia.json"
OUT_DIR = HERE / "samples_jurisprudencia"
REPORT = HERE / "download_report_jurisprudencia.json"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept": "application/pdf,*/*"})


def download_one(url: str, dest: Path) -> tuple[bool, str | None, int]:
    """Return (ok, error_msg, size_bytes)."""
    for attempt in range(2):
        try:
            r = SESSION.get(url, timeout=60, stream=True)
            if r.status_code in (429, 503):
                return False, f"rate_limit_{r.status_code}", 0
            if r.status_code != 200:
                if attempt == 0:
                    time.sleep(RETRY_DELAY)
                    continue
                return False, f"http_{r.status_code}", 0
            total = 0
            with dest.open("wb") as f:
                for chunk in r.iter_content(chunk_size=32768):
                    if chunk:
                        f.write(chunk)
                        total += len(chunk)
            if total < 500:
                return False, f"too_small_{total}b", total
            return True, None, total
        except (requests.ConnectionError, requests.Timeout) as e:
            if attempt == 0:
                time.sleep(RETRY_DELAY)
                continue
            return False, f"{type(e).__name__}: {e}", 0
    return False, "unknown", 0


def main():
    if not SRC.exists():
        sys.exit(f"Falta {SRC}. Correr primero classify_and_cache_details.py")

    data = json.loads(SRC.read_text())
    records = data["records"]
    inline = [r for r in records
              if r.get("primary_source", {}).get("kind") == "inline_pdf"
              and r["primary_source"].get("url")]
    print(f"Docs con PDF inline: {len(inline)} (de {len(records)} totales)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    t0 = time.time()
    total_bytes = 0
    ok_count = 0
    err_count = 0

    import hashlib
    for idx, rec in enumerate(inline, 1):
        url = rec["primary_source"]["url"]
        base = f"{rec['subcategory_slug']}__{rec['slug']}"
        if len(base) + len(".pdf") > 240:
            h = hashlib.sha1(rec['slug'].encode()).hexdigest()[:10]
            keep = 240 - len(rec['subcategory_slug']) - len("____") - len(h) - len(".pdf")
            base = f"{rec['subcategory_slug']}__{rec['slug'][:keep]}__{h}"
        name = f"{base}.pdf"
        dest = OUT_DIR / name
        meta_file = dest.with_suffix(".pdf.json")

        if dest.exists() and dest.stat().st_size > 500:
            size = dest.stat().st_size
            print(f"[{idx}/{len(inline)}] [cache] {name[:80]}  ({size} B)")
            results.append({**rec, "download_ok": True, "pdf_path": str(dest.relative_to(HERE)),
                            "size_bytes": size, "from_cache": True})
            total_bytes += size
            ok_count += 1
            continue

        time.sleep(DELAY)
        print(f"[{idx}/{len(inline)}] GET {url}")
        ok, err, size = download_one(url, dest)
        if ok:
            ok_count += 1
            total_bytes += size
            print(f"   OK  {size} B")
            results.append({**rec, "download_ok": True,
                            "pdf_path": str(dest.relative_to(HERE)),
                            "size_bytes": size, "from_cache": False})
            # Metadata sidecar
            meta = {
                "title": rec.get("doc_title") or rec.get("title"),
                "subcategory": rec["subcategory_slug"],
                "slug": rec["slug"],
                "source_url": rec["url"],
                "pdf_url": url,
                "size_bytes": size,
            }
            meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
        else:
            err_count += 1
            print(f"   ERR {err}")
            results.append({**rec, "download_ok": False, "error": err})
            if err.startswith("rate_limit_"):
                print("[ABORT] rate limit detectado — parando")
                break

    elapsed = round(time.time() - t0, 1)
    report = {
        "total_candidates": len(inline),
        "downloaded_ok": ok_count,
        "errors": err_count,
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / 1024 / 1024, 2),
        "elapsed_seconds": elapsed,
        "records": results,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n[OK] {ok_count}/{len(inline)} descargados — {report['total_mb']} MB — {elapsed}s")
    print(f"     Reporte: {REPORT}")


if __name__ == "__main__":
    main()
