#!/usr/bin/env python3
"""
seed_norm.py — Ingesta de normas al corpus universal de VIGÍA (Sprint A).

Uso:
  # Individual:
  python3 scripts/seed_norm.py \
      --url "https://..." \
      --meta '{"title":"...","norm_type":"resolucion","norm_number":"631","norm_year":2015,"scope":"agua"}' \
      --admin-email admin@enara.co

  # Clasificar sin ingestar (solo chequea si tiene text layer):
  python3 scripts/seed_norm.py --url "https://..." --classify-only

  # Batch desde JSON (lista de {url, meta}):
  python3 scripts/seed_norm.py --batch scripts/seed_list.json --admin-email admin@enara.co

El flujo:
  1. Descarga el PDF desde la URL oficial.
  2. Intenta extracción de texto con pypdf (gratis, rápido).
  3. Si <500 chars (scan sin text layer) y hay ANTHROPIC_API_KEY en env, hace OCR con Claude.
  4. Si tampoco hay OCR, falla con mensaje claro.
  5. Calcula SHA-256, prepara base64, llama a norm-ingest con raw_text + pdf_base64.
  6. norm-ingest: storage + enriquecer metadata + parser de artículos + INSERT.

Requisitos:
  - pypdf     (pip install pypdf)
  - requests  (pip install requests)
  - ANTHROPIC_API_KEY en env, solo si el PDF es escaneado.

Credenciales del admin:
  - email vía --admin-email (default: admin@enara.co)
  - password vía --admin-password o prompt interactivo o env VIGIA_ADMIN_PASSWORD

El usuario admin@enara.co es SuperAdmin → la norma entra como status='published' directo.
"""

from __future__ import annotations
import argparse, base64, getpass, hashlib, json, os, sys
from io import BytesIO
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("ERROR: pip install requests")

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("ERROR: pip install pypdf")

SB_URL = "https://itkbujkqjesuntgdkubt.supabase.co"
SB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV"
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")


def download_pdf(url: str) -> bytes:
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0 VIGIA/seed-norm"}, timeout=60)
    r.raise_for_status()
    ct = r.headers.get("content-type", "")
    if "pdf" not in ct.lower() and "octet" not in ct.lower():
        print(f"  ⚠ content-type inesperado: {ct}", file=sys.stderr)
    return r.content


def extract_pypdf(data: bytes) -> tuple[str, int]:
    # Busca la firma PDF dentro de los primeros 1024 bytes (algunos PDFs traen
    # prefijo de whitespace o BOM antes del %PDF-, pypdf los maneja OK).
    if b"%PDF-" not in data[:1024]:
        raise ValueError(f"El archivo no parece PDF (inicio: {data[:20]!r})")
    try:
        reader = PdfReader(BytesIO(data))
        pages = len(reader.pages)
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return text.strip(), pages
    except Exception as e:
        raise ValueError(f"pypdf no pudo procesar el PDF: {e}")


def extract_claude(data: bytes, api_key: str) -> str:
    b64 = base64.b64encode(data).decode()
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 32000,
        "system": (
            "Eres un extractor de texto de PDFs jurídicos colombianos. Devuelve EXCLUSIVAMENTE "
            "el texto íntegro del documento en texto plano, preservando el orden natural y los "
            'títulos de artículos/capítulos/secciones (con sus numeraciones y encabezados "Artículo N", '
            '"CAPÍTULO X", etc.). No resumas, no omitas, no agregues markdown ni metadata. '
            "Si hay tablas, transcribe su contenido como texto lineal fila por fila. "
            "Omite encabezados/pies de página repetidos. Comienza directamente con el contenido."
        ),
        "messages": [{
            "role": "user",
            "content": [
                {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
                {"type": "text", "text": "Extrae el texto íntegro de este PDF en texto plano."}
            ]
        }]
    }
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
        json=payload, timeout=600
    )
    if not r.ok:
        raise RuntimeError(f"Claude OCR falló ({r.status_code}): {r.text[:400]}")
    data_out = r.json()
    return "".join(c.get("text", "") for c in data_out.get("content", [])).strip()


def login(email: str, password: str) -> str:
    r = requests.post(
        f"{SB_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SB_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password}, timeout=30
    )
    r.raise_for_status()
    return r.json()["access_token"]


def call_ingest(token: str, pdf_url: str, pdf_bytes: bytes, raw_text: str, meta: dict,
                proposed_by_org_id: str | None = None) -> tuple[int, dict]:
    content_hash = hashlib.sha256(pdf_bytes).hexdigest()
    body = {
        "pdf_url": pdf_url,
        "raw_text": raw_text,
        "pdf_base64": base64.b64encode(pdf_bytes).decode(),
        "content_hash": content_hash,
        "proposed_metadata": meta or {},
    }
    if proposed_by_org_id:
        body["proposed_by_org_id"] = proposed_by_org_id
    r = requests.post(
        f"{SB_URL}/functions/v1/norm-ingest",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body, timeout=180
    )
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"raw": r.text[:500]}


def process_one(url: str, meta: dict, token: str | None, anthropic_key: str | None,
                classify_only: bool = False) -> dict:
    result = {"url": url, "meta": meta, "status": "unknown"}
    print(f"\n→ {meta.get('title','(sin título)')}  [{url}]")
    try:
        pdf = download_pdf(url)
    except Exception as e:
        result["status"] = "download_failed"
        result["error"] = str(e)
        print(f"  ✗ descarga falló: {e}")
        return result
    print(f"  • descarga OK ({len(pdf):,} bytes)")
    result["pdf_size"] = len(pdf)

    try:
        text, pages = extract_pypdf(pdf)
    except ValueError as e:
        result["status"] = "pdf_invalid"
        result["error"] = str(e)
        print(f"  ✗ {e}")
        return result
    result["pages"] = pages
    result["pypdf_chars"] = len(text)
    print(f"  • pypdf: {len(text):,} chars en {pages} páginas")

    if len(text) < 500:
        if not anthropic_key:
            print(f"  ⚠ scan sin text layer y no hay ANTHROPIC_API_KEY → marca 'needs_ocr'")
            result["status"] = "needs_ocr"
            result["text_method"] = "scan_detected"
            return result
        print(f"  • pypdf insuficiente, lanzando Claude OCR (puede tardar 30-120s)…")
        try:
            text = extract_claude(pdf, anthropic_key)
        except Exception as e:
            result["status"] = "ocr_failed"
            result["error"] = str(e)
            print(f"  ✗ OCR falló: {e}")
            return result
        print(f"  • Claude OCR: {len(text):,} chars extraídos")
        result["text_method"] = "claude_ocr"
    else:
        result["text_method"] = "pypdf"

    if len(text) < 500:
        result["status"] = "text_too_short"
        result["error"] = f"Texto final muy corto: {len(text)} chars"
        print(f"  ✗ texto final muy corto ({len(text)} chars)")
        return result

    if classify_only:
        result["status"] = "classified"
        print(f"  ✓ clasificada: text_method={result['text_method']}, {len(text):,} chars")
        return result

    if not token:
        result["status"] = "missing_token"
        result["error"] = "No se proveyó token de admin"
        return result

    print(f"  • invocando norm-ingest…")
    status, body = call_ingest(token, url, pdf, text, meta)
    result["ingest_status"] = status
    result["ingest_body"] = body
    if status == 200 and body.get("norm_id"):
        result["status"] = "ingested"
        result["norm_id"] = body["norm_id"]
        result["articles_extracted"] = body.get("articles_extracted")
        result["parser_quality"] = body.get("parser_quality")
        print(f"  ✓ ingested norm_id={body['norm_id'][:8]}… articles={body.get('articles_extracted')} quality={body.get('parser_quality')}")
    elif status == 409:
        result["status"] = "duplicate"
        print(f"  ⚠ duplicada: ya existe norma publicada con este contenido")
    else:
        result["status"] = "ingest_failed"
        result["error"] = body.get("error") or f"HTTP {status}"
        print(f"  ✗ ingest falló ({status}): {result['error']}")
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="URL oficial del PDF")
    ap.add_argument("--meta", help="JSON con metadata propuesta (title, norm_type, norm_number, norm_year, issuing_authority, scope, etc.)")
    ap.add_argument("--batch", help="Archivo JSON con lista de {url, meta} para procesar en batch")
    ap.add_argument("--classify-only", action="store_true", help="Solo clasifica (text-layer vs scan), no ingesta")
    ap.add_argument("--admin-email", default="admin@enara.co")
    ap.add_argument("--admin-password", default=None, help="Si no, usa env VIGIA_ADMIN_PASSWORD o prompt")
    ap.add_argument("--output", help="Archivo de salida JSON con resultados")
    args = ap.parse_args()

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if anthropic_key:
        print(f"• ANTHROPIC_API_KEY detectada en env (OCR disponible)")
    else:
        print(f"• ANTHROPIC_API_KEY NO en env — PDFs escaneados se marcarán 'needs_ocr'")

    token = None
    if not args.classify_only:
        pwd = args.admin_password or os.environ.get("VIGIA_ADMIN_PASSWORD")
        if not pwd:
            pwd = getpass.getpass(f"Password para {args.admin_email}: ")
        print(f"• Login como {args.admin_email}…")
        try:
            token = login(args.admin_email, pwd)
            print(f"  ✓ autenticado")
        except Exception as e:
            sys.exit(f"ERROR login: {e}")

    tasks: list[tuple[str, dict]] = []
    if args.batch:
        data = json.loads(Path(args.batch).read_text())
        if not isinstance(data, list):
            sys.exit("ERROR: --batch debe apuntar a un array JSON")
        for item in data:
            tasks.append((item["url"], item.get("meta", {})))
    elif args.url:
        meta = json.loads(args.meta) if args.meta else {}
        tasks.append((args.url, meta))
    else:
        sys.exit("ERROR: usar --url o --batch")

    results = []
    for url, meta in tasks:
        r = process_one(url, meta, token, anthropic_key, classify_only=args.classify_only)
        results.append(r)

    print("\n" + "=" * 60)
    print(f"RESUMEN: {len(results)} normas procesadas")
    by_status = {}
    for r in results:
        by_status.setdefault(r["status"], 0)
        by_status[r["status"]] += 1
    for k, v in sorted(by_status.items()):
        print(f"  {k}: {v}")

    if args.output:
        Path(args.output).write_text(json.dumps(results, indent=2, ensure_ascii=False))
        print(f"• Resultados guardados en {args.output}")

    # Exit code != 0 si hay normas needs_ocr y no hay key (sugiere al operador que re-corra con key)
    has_needs_ocr = any(r["status"] == "needs_ocr" for r in results)
    sys.exit(0 if not has_needs_ocr else 2)


if __name__ == "__main__":
    main()
