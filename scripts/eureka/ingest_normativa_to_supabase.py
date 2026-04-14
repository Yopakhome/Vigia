#!/usr/bin/env python3
"""Sprint A2 Fase 2A — Ingesta de 270 docs de Normativa EUREKA a Supabase.

Lee scripts/eureka/metadata_full.json (generado por extract_metadata_full.py
en Fase 1A, commit 47b63e6) y escribe:

  - normative_sources       (+270 filas con corpus_source='eureka_metadata')
  - eureka_sources_metadata (+270 filas con source_type='norma')
  - concordances            (+1,769 filas: from_type='norma', polimórficas)

Flujo en 2 pasadas (decisión arquitectónica del briefing):

  Pasada 1 — Inserta normative_sources + eureka_sources_metadata para cada
             doc. Mientras inserta, construye un diccionario {slug: uuid_nuevo}
             que será necesario en la Pasada 2 para resolver concordancias
             apuntando a otros docs del mismo corpus.
  Pasada 2 — Inserta concordances. Por cada link editorial:
             - Si target.category='normativa' y target.slug está en el dict
               de Pasada 1 → resolved=true, to_id=<uuid>, to_type='norma'.
             - Si no (target=sentencia, o slug fuera del corpus) → downgrade
               a unresolved: to_id=NULL, to_type=NULL, to_slug=<slug>,
               title_plain=<título editorial>.

NOTA sobre los 171 links Normativa→Jurisprudencia del grafo: en Fase 2A
TODOS caen como unresolved porque jurisprudence_sources todavía está vacía.
Cuando ejecutemos Fase 2B, un script separado de "reparación del grafo" los
promoverá de unresolved→resolved. Esto es parte del diseño, no un bug.

Idempotencia: antes de insertar cada norma, se hace GET a Supabase filtrando
por (source_url, corpus_source='eureka_metadata'). Si existe, se skipea y se
usa el UUID existente para el dict de Pasada 2 (permite reanudar corridas
interrumpidas).

Embeddings: OpenAI text-embedding-3-small. Truncado del resumen a 24k chars
(consistente con norm-embed edge function del Sprint A). Si falla por límite
de tokens, reintenta con truncado a 12k. Si falla la 2ª vez, se inserta la
fila de metadata con resumen_embedding=NULL y se registra en errores.

Flags:
  --dry-run   : ejecuta toda la lógica EXCEPTO los inserts a Supabase y
                EXCEPTO las llamadas a OpenAI (cero costo, cero escritura).
  --limit N   : procesa solo los primeros N docs (útil para smoke tests).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

# ----------------------------------------------------------------------------
# Carga y validación de env vars (fail fast)
# ----------------------------------------------------------------------------
HERE = Path(__file__).parent
ENV_PATH = HERE / ".env.local"
load_dotenv(ENV_PATH)

REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
_missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
if _missing:
    sys.exit(
        f"[FATAL] Faltan env vars en {ENV_PATH}: {', '.join(_missing)}. "
        f"Ver docs del script + instrucciones del briefing Fase 2A."
    )

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# Import OpenAI solo después de validar la key (si falta, error claro arriba)
from openai import OpenAI, BadRequestError, APIError  # noqa: E402

OPENAI_CLIENT = OpenAI()  # usa OPENAI_API_KEY del entorno

# ----------------------------------------------------------------------------
# Constantes
# ----------------------------------------------------------------------------
METADATA_JSON = HERE / "metadata_full.json"
REPORT_JSON = HERE / "ingest_report_phase2a.json"

BATCH_SIZE = 30
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
# Consistente con norm-embed edge function (Sprint A, SA-DEUDA-5):
# preemptivo 24k chars, reintento 1×1 con 12k si falla por tokens.
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
# Precio OpenAI text-embedding-3-small: $0.02 por 1M tokens input.
OPENAI_PRICE_PER_1M_TOKENS = 0.02

CORPUS_SOURCE_VALUE = "eureka_metadata"

REST_HEADERS_BASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ----------------------------------------------------------------------------
# Normalización de norm_type (EUREKA labels → CHECK constraint values)
# ----------------------------------------------------------------------------
# CHECK actual: ('constitucion','ley','decreto_ley','decreto','resolucion',
#                'circular','sentencia','sentencia_tribunal','concepto',
#                'acuerdo','proyecto_normativo','otra')
NORM_TYPE_MAP = {
    "Constitución": "constitucion",
    "Ley": "ley",
    "Decreto Ley": "decreto_ley",
    "Decreto": "decreto",
    "Decreto Reglamentario": "decreto",
    "Resolución": "resolucion",
    "Circular": "circular",
    "Circular Externa": "circular",
    "Directiva Presidencial": "otra",
    "Directiva": "otra",
    "Decisión Andina": "otra",
    "Decisión": "otra",
    "Declaración": "otra",
    "Acuerdo": "acuerdo",
}


def normalize_norm_type(raw: str | None) -> str:
    if not raw:
        return "otra"
    return NORM_TYPE_MAP.get(raw, "otra")


# ----------------------------------------------------------------------------
# Helpers de red
# ----------------------------------------------------------------------------
def sb_get(path: str, params: dict[str, str] | None = None) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.get(url, headers=REST_HEADERS_BASE, params=params, timeout=30)


def sb_post(path: str, payload: Any) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.post(url, headers=REST_HEADERS_BASE, json=payload, timeout=60)


def sb_delete(path: str, params: dict[str, str]) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.delete(url, headers=REST_HEADERS_BASE, params=params, timeout=30)


def find_existing_normative_source(source_url: str) -> str | None:
    """Idempotencia: retorna UUID existente si hay una norma con este
    source_url + corpus_source='eureka_metadata', o None si no existe."""
    r = sb_get(
        "/normative_sources",
        params={
            "select": "id",
            "source_url": f"eq.{source_url}",
            "corpus_source": f"eq.{CORPUS_SOURCE_VALUE}",
            "limit": "1",
        },
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0]["id"] if rows else None


# ----------------------------------------------------------------------------
# Embeddings
# ----------------------------------------------------------------------------
def generate_embedding(text: str, *, dry_run: bool) -> tuple[list[float] | None, int, str | None]:
    """Genera embedding con OpenAI. Devuelve (embedding, tokens_used, error).
    En dry_run devuelve (None, ~tokens_estimated, None) sin llamar la API.
    Estrategia: truncar a 24k chars preemptivamente. Si OpenAI rechaza por
    tokens, reintentar con 12k. Si también falla, retornar (None, 0, <error>).
    """
    if not text:
        return None, 0, "empty_text"

    # Estimar tokens (aprox chars/4 para conteo)
    est_tokens = max(1, len(text) // 4)

    if dry_run:
        # No llama a la API. Simulamos que el embedding sería generado OK
        # y reportamos estimación de tokens para costo.
        return None, min(est_tokens, EMBEDDING_MAX_CHARS_PRIMARY // 4), None

    truncated = text[:EMBEDDING_MAX_CHARS_PRIMARY]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        return r.data[0].embedding, r.usage.total_tokens, None
    except BadRequestError as e:
        # Típicamente "maximum context length" → reintentar con 12k
        if "maximum context length" not in str(e).lower() and "token" not in str(e).lower():
            return None, 0, f"openai_bad_request:{e}"
    except APIError as e:
        return None, 0, f"openai_api_error:{e}"
    except Exception as e:
        return None, 0, f"openai_unexpected:{type(e).__name__}:{e}"

    # Segundo intento con truncado más agresivo
    truncated2 = text[:EMBEDDING_MAX_CHARS_RETRY]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated2)
        return r.data[0].embedding, r.usage.total_tokens, None
    except Exception as e:
        return None, 0, f"openai_retry_failed:{type(e).__name__}:{e}"


def embedding_to_pgvector_literal(embedding: list[float] | None) -> str | None:
    """pgvector acepta string literal tipo '[0.1,0.2,...]' vía PostgREST."""
    if embedding is None:
        return None
    return "[" + ",".join(f"{f:.7f}" for f in embedding) + "]"


# ----------------------------------------------------------------------------
# Payloads de insert
# ----------------------------------------------------------------------------
def build_normative_source_row(rec: dict) -> dict:
    return {
        "norm_type": normalize_norm_type(rec.get("norm_type")),
        "norm_title": rec["title"],
        "norm_number": rec.get("norm_number"),
        "norm_year": rec.get("norm_year"),
        "source_url": rec["url_eureka"],
        "status": "published",
        "is_active": True,
        "is_universal": True,
        "scope": None,  # EUREKA no expone clasificación temática
        "corpus_source": CORPUS_SOURCE_VALUE,
    }


def build_metadata_row(source_id: str, rec: dict, embedding_literal: str | None) -> dict:
    return {
        "source_id": source_id,
        "source_type": "norma",
        "resumen": rec.get("resumen"),
        "resumen_embedding": embedding_literal,
        "palabras_clave": rec.get("palabras_clave"),  # lista de strings → JSONB
        "metadata": {
            "slug": rec["slug"],
            "subcategory": rec["subcategory"],
            "url_eureka": rec["url_eureka"],
            "primary_source_kind": rec.get("primary_source_kind"),
            "primary_source_url": rec.get("primary_source_url"),
            "primary_source_host": rec.get("primary_source_host"),
            "original_norm_type_label": rec.get("norm_type"),
        },
    }


def build_concordance_rows(from_uuid: str, concordancias: list[dict],
                           slug_to_uuid: dict[str, str]) -> list[dict]:
    """Construye las filas de concordances para una norma origen.

    Política de resolución (decisiones 4 y 5 del briefing):
      - concord.resolved=True AND concord.category='normativa' AND
        concord.slug está en slug_to_uuid  → resolved=True, to_type='norma'
      - En cualquier otro caso (category=jurisprudencia, slug desconocido,
        resolved=False desde el input) → unresolved.

    Los 171 links hacia jurisprudencia caen aquí como unresolved en Fase 2A.
    Se repararán en Fase 2B cuando jurisprudence_sources esté poblada.
    """
    rows: list[dict] = []
    for c in concordancias:
        title_plain = c.get("title") or "(sin título)"
        target_category = c.get("category")
        target_slug = c.get("slug")
        is_resolved_in_input = bool(c.get("resolved"))

        if (is_resolved_in_input
                and target_category == "normativa"
                and target_slug
                and target_slug in slug_to_uuid):
            rows.append({
                "from_id": from_uuid,
                "from_type": "norma",
                "to_id": slug_to_uuid[target_slug],
                "to_type": "norma",
                "to_slug": target_slug,
                "resolved": True,
                "title_plain": title_plain,
            })
        else:
            rows.append({
                "from_id": from_uuid,
                "from_type": "norma",
                "to_id": None,
                "to_type": None,
                "to_slug": target_slug,
                "resolved": False,
                "title_plain": title_plain,
            })
    return rows


# ----------------------------------------------------------------------------
# Pasada 1: insertar normas + metadata
# ----------------------------------------------------------------------------
def pass1_insert_norma_and_metadata(rec: dict, *, dry_run: bool, stats: dict) -> str | None:
    """Retorna el UUID de la norma insertada (o existente por idempotencia),
    o None si hubo error y no se pudo insertar.
    """
    source_url = rec["url_eureka"]

    # Check idempotencia
    if not dry_run:
        try:
            existing_id = find_existing_normative_source(source_url)
            if existing_id:
                stats["skipped_duplicates"] += 1
                stats["skipped_slugs"].append(rec["slug"])
                return existing_id
        except Exception as e:
            stats["errors"].append({
                "slug": rec["slug"],
                "stage": "idempotency_check",
                "error": str(e),
            })
            return None

    # Generar embedding del resumen
    embedding, tokens, emb_err = generate_embedding(rec.get("resumen") or "", dry_run=dry_run)
    stats["embedding_tokens_total"] += tokens
    if embedding is not None:
        stats["embeddings_generated"] += 1
    else:
        if emb_err:
            stats["embeddings_failed"] += 1
            stats["errors"].append({
                "slug": rec["slug"],
                "stage": "embedding",
                "error": emb_err,
            })
        elif dry_run:
            # En dry_run no pasa por la API; contamos como "generado"
            # para el reporte (no es un fallo).
            stats["embeddings_generated"] += 1

    emb_literal = embedding_to_pgvector_literal(embedding)

    # Insert normative_sources
    ns_payload = build_normative_source_row(rec)
    if dry_run:
        # En dry_run simulamos UUID determinístico para que Pasada 2 pueda
        # construir el grafo sin tocar la DB.
        fake_id = f"dry-run-{rec['slug'][:40]}"
        stats["would_insert_normative_sources"] += 1
        new_id = fake_id
    else:
        try:
            r = sb_post("/normative_sources", ns_payload)
            if r.status_code not in (200, 201):
                stats["errors"].append({
                    "slug": rec["slug"],
                    "stage": "insert_normative_sources",
                    "status": r.status_code,
                    "error": r.text[:500],
                })
                return None
            new_id = r.json()[0]["id"]
        except Exception as e:
            stats["errors"].append({
                "slug": rec["slug"],
                "stage": "insert_normative_sources",
                "error": str(e),
            })
            return None

    # Insert eureka_sources_metadata
    md_payload = build_metadata_row(new_id, rec, emb_literal)
    if dry_run:
        stats["would_insert_eureka_metadata"] += 1
    else:
        try:
            r = sb_post("/eureka_sources_metadata", md_payload)
            if r.status_code not in (200, 201):
                # Rollback de la norma insertada para mantener invariante
                # "cada norma eureka tiene su metadata".
                try:
                    sb_delete("/normative_sources", params={"id": f"eq.{new_id}"})
                except Exception:
                    pass
                stats["errors"].append({
                    "slug": rec["slug"],
                    "stage": "insert_eureka_metadata",
                    "status": r.status_code,
                    "error": r.text[:500],
                })
                return None
        except Exception as e:
            try:
                sb_delete("/normative_sources", params={"id": f"eq.{new_id}"})
            except Exception:
                pass
            stats["errors"].append({
                "slug": rec["slug"],
                "stage": "insert_eureka_metadata",
                "error": str(e),
            })
            return None

    stats["processed_ok"] += 1
    return new_id


# ----------------------------------------------------------------------------
# Pasada 2: insertar concordancias
# ----------------------------------------------------------------------------
def pass2_insert_concordances(all_rows: list[dict], *, dry_run: bool, stats: dict) -> None:
    """Inserta concordancias en batches. Un solo POST batch puede manejar
    varias docenas de rows de manera atómica server-side."""
    if not all_rows:
        return

    if dry_run:
        stats["would_insert_concordances"] += len(all_rows)
        return

    # Chunkear para evitar payloads enormes (500 rows por POST es conservador)
    CHUNK = 500
    for i in range(0, len(all_rows), CHUNK):
        chunk = all_rows[i:i + CHUNK]
        try:
            r = sb_post("/concordances", chunk)
            if r.status_code not in (200, 201):
                stats["errors"].append({
                    "stage": "insert_concordances_batch",
                    "chunk_start": i,
                    "chunk_size": len(chunk),
                    "status": r.status_code,
                    "error": r.text[:500],
                })
                stats["concordances_failed"] += len(chunk)
            else:
                stats["concordances_inserted"] += len(chunk)
        except Exception as e:
            stats["errors"].append({
                "stage": "insert_concordances_batch",
                "chunk_start": i,
                "chunk_size": len(chunk),
                "error": str(e),
            })
            stats["concordances_failed"] += len(chunk)


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Ingesta Normativa EUREKA → Supabase (Fase 2A)")
    ap.add_argument("--dry-run", action="store_true",
                    help="No toca Supabase ni OpenAI; simula toda la ejecución.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Procesar solo los primeros N docs (smoke test).")
    args = ap.parse_args()

    if args.dry_run:
        print("=" * 72)
        print("  DRY RUN ON — NO se va a modificar Supabase. NO se va a llamar OpenAI.")
        print("=" * 72)
    else:
        print("=" * 72)
        print("  DRY RUN OFF — se van a modificar datos reales en Supabase producción")
        print("  Proyecto:", SUPABASE_URL)
        print("  Modelo embeddings:", EMBEDDING_MODEL)
        print("=" * 72)

    # Leer metadata local
    if not METADATA_JSON.exists():
        sys.exit(f"[FATAL] Falta {METADATA_JSON}. Fase 1A debería haberlo generado.")
    data = json.loads(METADATA_JSON.read_text())
    records = data["records"]
    if args.limit:
        records = records[:args.limit]
    print(f"[info] {len(records)} docs a procesar (total en JSON: {data['total_records']})")

    stats: dict[str, Any] = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "dry_run": args.dry_run,
        "limit": args.limit,
        "total_input": len(records),
        "processed_ok": 0,
        "skipped_duplicates": 0,
        "skipped_slugs": [],
        "embeddings_generated": 0,
        "embeddings_failed": 0,
        "embedding_tokens_total": 0,
        "concordances_inserted": 0,
        "concordances_failed": 0,
        "errors": [],
        "would_insert_normative_sources": 0,
        "would_insert_eureka_metadata": 0,
        "would_insert_concordances": 0,
    }

    # -------- PASADA 1 --------
    print("\n[pasada 1] Insertando normative_sources + eureka_sources_metadata…")
    slug_to_uuid: dict[str, str] = {}
    t0 = time.time()

    for batch_num, start in enumerate(range(0, len(records), BATCH_SIZE), 1):
        batch = records[start:start + BATCH_SIZE]
        batch_ok = 0
        for rec in batch:
            new_id = pass1_insert_norma_and_metadata(rec, dry_run=args.dry_run, stats=stats)
            if new_id:
                slug_to_uuid[rec["slug"]] = new_id
                batch_ok += 1
        elapsed = int(time.time() - t0)
        print(f"  Batch {batch_num}: {batch_ok}/{len(batch)} done  "
              f"(cumulativo {start + batch_ok}/{len(records)}, elapsed {elapsed}s)")

    # -------- PASADA 2 --------
    print("\n[pasada 2] Construyendo filas de concordances…")
    all_concord_rows: list[dict] = []
    for rec in records:
        from_uuid = slug_to_uuid.get(rec["slug"])
        if not from_uuid:
            # La norma no se pudo insertar (error en pasada 1). Sin from_id
            # no podemos crear concordancias desde ese doc.
            continue
        all_concord_rows.extend(
            build_concordance_rows(from_uuid, rec.get("concordancias") or [], slug_to_uuid)
        )

    resolved_count = sum(1 for r in all_concord_rows if r["resolved"])
    unresolved_count = len(all_concord_rows) - resolved_count
    print(f"  {len(all_concord_rows)} filas construidas "
          f"(resolved={resolved_count}, unresolved={unresolved_count})")
    print(f"  Insertando en chunks de 500…")
    pass2_insert_concordances(all_concord_rows, dry_run=args.dry_run, stats=stats)

    # -------- REPORTE --------
    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["concordances_resolved_total"] = resolved_count
    stats["concordances_unresolved_total"] = unresolved_count
    stats["openai_cost_usd_estimated"] = round(
        stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6
    )
    stats["unique_slugs_inserted"] = len(slug_to_uuid)

    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "=" * 72)
    print("  RESUMEN FINAL")
    print("=" * 72)
    print(f"  docs input:              {stats['total_input']}")
    print(f"  procesados OK:           {stats['processed_ok']}")
    print(f"  skipped (duplicados):    {stats['skipped_duplicates']}")
    print(f"  errores:                 {len(stats['errors'])}")
    print(f"  embeddings generados:    {stats['embeddings_generated']}")
    print(f"  embeddings fallidos:     {stats['embeddings_failed']}")
    print(f"  tokens OpenAI:           {stats['embedding_tokens_total']:,}")
    print(f"  costo OpenAI estimado:   ${stats['openai_cost_usd_estimated']:.6f}")
    if args.dry_run:
        print(f"  would insert normas:     {stats['would_insert_normative_sources']}")
        print(f"  would insert metadata:   {stats['would_insert_eureka_metadata']}")
        print(f"  would insert concord:    {stats['would_insert_concordances']}")
    else:
        print(f"  concordancias OK:        {stats['concordances_inserted']}")
        print(f"  concordancias fallidas:  {stats['concordances_failed']}")
    print(f"  elapsed:                 {stats['elapsed_seconds']}s")
    print(f"  reporte:                 {REPORT_JSON}")
    print("=" * 72)

    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[INTERRUMPIDO] estado parcial puede estar en Supabase. Correr otra vez para reanudar (idempotente).")
        sys.exit(130)
