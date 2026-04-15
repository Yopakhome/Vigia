#!/usr/bin/env python3
"""Sprint A2 Fase 2B — Ingesta de 120 sentencias de Jurisprudencia EUREKA
a Supabase + reparación del grafo Normativa→Jurisprudencia que quedó
unresolved después de Fase 2A.

Lee scripts/eureka/metadata_full_jurisprudencia.json (generado por
extract_metadata_jurisprudencia.py en Fase 1B, commit 247ed7c) y escribe:

  - jurisprudence_sources    (+120 filas)
  - eureka_sources_metadata  (+120 filas con source_type='sentencia')
  - concordances             (+N filas con from_type='sentencia')
  - concordances             (UPDATE de ~171 filas que en Fase 2A quedaron
                              unresolved porque apuntaban a sentencias que
                              no existían todavía en la DB)

Flujo en 3 pasadas:

  Pasada 0 (pre-carga) — Lee todas las normas ya ingestadas en Fase 2A
    desde eureka_sources_metadata.metadata->>'slug' construyendo un dict
    {slug_norma: uuid_norma} que se usará para resolver concordancias
    sentencia→norma en la Pasada 2.

  Pasada 1 — Inserta jurisprudence_sources + eureka_sources_metadata
    (source_type='sentencia') para cada sentencia. Mientras inserta,
    construye un dict {slug_sentencia: uuid_nuevo}.

  Pasada 2 — Construye e inserta concordances desde cada sentencia. Por
    cada link editorial:
      - category='jurisprudencia' y slug en dict_sentencias
        → resolved=true, to_type='sentencia'
      - category='normativa' y slug en dict_normas (pre-cargado en Pasada 0)
        → resolved=true, to_type='norma'
      - Cualquier otro caso → unresolved (to_id=NULL, to_slug=<slug>)

  Pasada 3 (REPARADOR) — UPDATE en concordances de Fase 2A que apuntaban a
    sentencias ahora existentes. Busca todos los rows con from_type='norma',
    resolved=false, to_slug NOT NULL, y para cada to_slug que ahora existe
    en jurisprudence_sources, hace PATCH con to_id + to_type='sentencia' +
    resolved=true. Reporta cuántos rows fueron promovidos. Esto cierra los
    171 links Normativa→Jurisprudencia que en Fase 2A quedaron en limbo.

Idempotencia: antes de insertar cada sentencia, se hace GET a Supabase
filtrando por slug (UNIQUE en jurisprudence_sources). Si existe, se
skipea y se usa el UUID existente. Permite reanudar corridas interrumpidas.

Embeddings: OpenAI text-embedding-3-small, truncado a 24k chars con
retry a 12k (patrón consistente con Fase 2A y norm-embed del Sprint A).

Flags:
  --dry-run   : NO toca Supabase ni OpenAI. El reparador en dry-run
                reporta cuántos rows WOULD promote sin ejecutar el UPDATE.
  --limit N   : procesa solo las primeras N sentencias (smoke test).
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
        f"Ver docs del script + instrucciones del briefing Fase 2B."
    )

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

from openai import OpenAI, BadRequestError, APIError  # noqa: E402

OPENAI_CLIENT = OpenAI()  # usa OPENAI_API_KEY del entorno

# ----------------------------------------------------------------------------
# Constantes
# ----------------------------------------------------------------------------
METADATA_JSON = HERE / "metadata_full_jurisprudencia.json"
REPORT_JSON = HERE / "ingest_report_phase2b.json"

BATCH_SIZE = 30
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
OPENAI_PRICE_PER_1M_TOKENS = 0.02

SOURCE_TYPE_SENTENCIA = "sentencia"
SOURCE_TYPE_NORMA = "norma"

REST_HEADERS_BASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ----------------------------------------------------------------------------
# Helpers de red
# ----------------------------------------------------------------------------
def sb_get(path: str, params: dict[str, str] | None = None) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.get(url, headers=REST_HEADERS_BASE, params=params, timeout=30)


def sb_post(path: str, payload: Any) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.post(url, headers=REST_HEADERS_BASE, json=payload, timeout=60)


def sb_patch(path: str, params: dict[str, str], payload: Any) -> requests.Response:
    """PATCH filtrado por query params. PostgREST aplica el body solo a las
    filas que matchean el filtro."""
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.patch(url, headers=REST_HEADERS_BASE, params=params,
                          json=payload, timeout=30)


def sb_delete(path: str, params: dict[str, str]) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.delete(url, headers=REST_HEADERS_BASE, params=params, timeout=30)


def find_existing_jurisprudence_source(slug: str) -> str | None:
    """Idempotencia: retorna UUID existente si hay una sentencia con este
    slug (UNIQUE en jurisprudence_sources), o None si no existe."""
    r = sb_get(
        "/jurisprudence_sources",
        params={"select": "id", "slug": f"eq.{slug}", "limit": "1"},
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0]["id"] if rows else None


def load_norma_slug_to_uuid_dict() -> dict[str, str]:
    """Pasada 0 — carga todas las normas EUREKA (Fase 2A) en un dict
    {slug: uuid_normative_source}. Lee de eureka_sources_metadata porque
    ahí vive metadata.slug para cada norma. Pagina para manejar >1k rows
    si alguna vez el corpus crece."""
    out: dict[str, str] = {}
    PAGE = 1000
    start = 0
    while True:
        headers = dict(REST_HEADERS_BASE)
        headers["Range"] = f"{start}-{start + PAGE - 1}"
        url = f"{SUPABASE_URL}/rest/v1/eureka_sources_metadata"
        r = requests.get(
            url, headers=headers,
            params={
                "select": "source_id,metadata",
                "source_type": f"eq.{SOURCE_TYPE_NORMA}",
            },
            timeout=30,
        )
        r.raise_for_status()
        rows = r.json()
        if not rows:
            break
        for row in rows:
            slug = (row.get("metadata") or {}).get("slug")
            if slug:
                out[slug] = row["source_id"]
        if len(rows) < PAGE:
            break
        start += PAGE
    return out


# ----------------------------------------------------------------------------
# Embeddings (reutilizado del script de Normativa)
# ----------------------------------------------------------------------------
def generate_embedding(text: str, *, dry_run: bool) -> tuple[list[float] | None, int, str | None]:
    """Genera embedding con OpenAI. Devuelve (embedding, tokens_used, error).
    En dry_run devuelve (None, ~tokens_estimated, None) sin llamar la API.
    """
    if not text:
        return None, 0, "empty_text"

    est_tokens = max(1, len(text) // 4)

    if dry_run:
        return None, min(est_tokens, EMBEDDING_MAX_CHARS_PRIMARY // 4), None

    truncated = text[:EMBEDDING_MAX_CHARS_PRIMARY]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        return r.data[0].embedding, r.usage.total_tokens, None
    except BadRequestError as e:
        if "maximum context length" not in str(e).lower() and "token" not in str(e).lower():
            return None, 0, f"openai_bad_request:{e}"
    except APIError as e:
        return None, 0, f"openai_api_error:{e}"
    except Exception as e:
        return None, 0, f"openai_unexpected:{type(e).__name__}:{e}"

    truncated2 = text[:EMBEDDING_MAX_CHARS_RETRY]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated2)
        return r.data[0].embedding, r.usage.total_tokens, None
    except Exception as e:
        return None, 0, f"openai_retry_failed:{type(e).__name__}:{e}"


def embedding_to_pgvector_literal(embedding: list[float] | None) -> str | None:
    if embedding is None:
        return None
    return "[" + ",".join(f"{f:.7f}" for f in embedding) + "]"


# ----------------------------------------------------------------------------
# Payloads de insert
# ----------------------------------------------------------------------------
def build_jurisprudence_source_row(rec: dict) -> dict:
    """Campos de jurisprudence_sources (14 columnas). id/created_at/updated_at
    los genera la DB. Todo lo demás viene del JSON de Fase 1B."""
    return {
        "slug": rec["slug"],
        "radicado": rec.get("radicado"),
        "tipo_providencia": rec.get("tipo_providencia"),
        "corte": rec.get("corte"),
        "fecha_emision_anio": rec.get("fecha_emision_anio"),
        "magistrado_ponente": rec.get("magistrado_ponente"),  # siempre null
        "fecha_emision_full": rec.get("fecha_emision_full"),  # siempre null
        "title": rec["title"],
        "primary_source_kind": rec.get("primary_source_kind"),
        "primary_source_url": rec.get("primary_source_url"),
        "primary_source_host": rec.get("primary_source_host"),
    }


def build_metadata_row(source_id: str, rec: dict, embedding_literal: str | None) -> dict:
    """Fila en eureka_sources_metadata con source_type='sentencia'. La
    metadata JSONB guarda los campos de EUREKA que no tienen columna propia
    en jurisprudence_sources (slug editorial, subcategory, url_eureka) +
    snapshot de los campos estructurados para facilitar consultas JSONB."""
    return {
        "source_id": source_id,
        "source_type": SOURCE_TYPE_SENTENCIA,
        "resumen": rec.get("resumen"),
        "resumen_embedding": embedding_literal,
        "palabras_clave": rec.get("palabras_clave"),
        "metadata": {
            "slug": rec["slug"],
            "subcategory": rec.get("subcategory"),
            "url_eureka": rec.get("url_eureka"),
            "radicado": rec.get("radicado"),
            "tipo_providencia": rec.get("tipo_providencia"),
            "corte": rec.get("corte"),
            "fecha_emision_anio": rec.get("fecha_emision_anio"),
        },
    }


def build_concordance_rows(from_uuid: str, concordancias: list[dict],
                           slug_to_uuid_sentencias: dict[str, str],
                           slug_to_uuid_normas: dict[str, str]) -> list[dict]:
    """Política de resolución para concordancias desde una sentencia:

      - concord.category='jurisprudencia' + slug en dict sentencias
        → resolved=True, to_type='sentencia'
      - concord.category='normativa' + slug en dict normas (pre-cargado)
        → resolved=True, to_type='norma'
      - Cualquier otro caso → unresolved (to_slug conservado para reparación
        manual o futura fase).
    """
    rows: list[dict] = []
    for c in concordancias:
        title_plain = c.get("title") or "(sin título)"
        target_category = c.get("category")
        target_slug = c.get("slug")
        is_resolved_in_input = bool(c.get("resolved"))

        resolved_row = None
        if is_resolved_in_input and target_slug:
            if target_category == "jurisprudencia" and target_slug in slug_to_uuid_sentencias:
                resolved_row = {
                    "from_id": from_uuid,
                    "from_type": SOURCE_TYPE_SENTENCIA,
                    "to_id": slug_to_uuid_sentencias[target_slug],
                    "to_type": SOURCE_TYPE_SENTENCIA,
                    "to_slug": target_slug,
                    "resolved": True,
                    "title_plain": title_plain,
                }
            elif target_category == "normativa" and target_slug in slug_to_uuid_normas:
                resolved_row = {
                    "from_id": from_uuid,
                    "from_type": SOURCE_TYPE_SENTENCIA,
                    "to_id": slug_to_uuid_normas[target_slug],
                    "to_type": SOURCE_TYPE_NORMA,
                    "to_slug": target_slug,
                    "resolved": True,
                    "title_plain": title_plain,
                }

        if resolved_row:
            rows.append(resolved_row)
        else:
            rows.append({
                "from_id": from_uuid,
                "from_type": SOURCE_TYPE_SENTENCIA,
                "to_id": None,
                "to_type": None,
                "to_slug": target_slug,
                "resolved": False,
                "title_plain": title_plain,
            })
    return rows


# ----------------------------------------------------------------------------
# Pasada 1: insertar sentencia + metadata
# ----------------------------------------------------------------------------
def pass1_insert_sentencia_and_metadata(rec: dict, *, dry_run: bool, stats: dict) -> str | None:
    """Retorna UUID (existente o nuevo) o None si hubo error."""
    slug = rec["slug"]

    # Idempotencia
    if not dry_run:
        try:
            existing_id = find_existing_jurisprudence_source(slug)
            if existing_id:
                stats["skipped_duplicates"] += 1
                stats["skipped_slugs"].append(slug)
                return existing_id
        except Exception as e:
            stats["errors"].append({
                "slug": slug, "stage": "idempotency_check", "error": str(e),
            })
            return None

    # Embedding del resumen
    embedding, tokens, emb_err = generate_embedding(rec.get("resumen") or "", dry_run=dry_run)
    stats["embedding_tokens_total"] += tokens
    if embedding is not None:
        stats["embeddings_generated"] += 1
    else:
        if emb_err:
            stats["embeddings_failed"] += 1
            stats["errors"].append({
                "slug": slug, "stage": "embedding", "error": emb_err,
            })
        elif dry_run:
            stats["embeddings_generated"] += 1

    emb_literal = embedding_to_pgvector_literal(embedding)

    # Insert jurisprudence_sources
    js_payload = build_jurisprudence_source_row(rec)
    if dry_run:
        fake_id = f"dry-run-{slug[:40]}"
        stats["would_insert_jurisprudence_sources"] += 1
        new_id = fake_id
    else:
        try:
            r = sb_post("/jurisprudence_sources", js_payload)
            if r.status_code not in (200, 201):
                stats["errors"].append({
                    "slug": slug, "stage": "insert_jurisprudence_sources",
                    "status": r.status_code, "error": r.text[:500],
                })
                return None
            new_id = r.json()[0]["id"]
        except Exception as e:
            stats["errors"].append({
                "slug": slug, "stage": "insert_jurisprudence_sources", "error": str(e),
            })
            return None

    # Insert eureka_sources_metadata (source_type='sentencia')
    md_payload = build_metadata_row(new_id, rec, emb_literal)
    if dry_run:
        stats["would_insert_eureka_metadata"] += 1
    else:
        try:
            r = sb_post("/eureka_sources_metadata", md_payload)
            if r.status_code not in (200, 201):
                # Rollback: eliminar la sentencia recién insertada para
                # mantener invariante "toda sentencia tiene su metadata".
                try:
                    sb_delete("/jurisprudence_sources", params={"id": f"eq.{new_id}"})
                except Exception:
                    pass
                stats["errors"].append({
                    "slug": slug, "stage": "insert_eureka_metadata",
                    "status": r.status_code, "error": r.text[:500],
                })
                return None
        except Exception as e:
            try:
                sb_delete("/jurisprudence_sources", params={"id": f"eq.{new_id}"})
            except Exception:
                pass
            stats["errors"].append({
                "slug": slug, "stage": "insert_eureka_metadata", "error": str(e),
            })
            return None

    stats["processed_ok"] += 1
    return new_id


# ----------------------------------------------------------------------------
# Pasada 2: insertar concordancias
# ----------------------------------------------------------------------------
def pass2_insert_concordances(all_rows: list[dict], *, dry_run: bool, stats: dict) -> None:
    if not all_rows:
        return

    if dry_run:
        stats["would_insert_concordances"] += len(all_rows)
        return

    CHUNK = 500
    for i in range(0, len(all_rows), CHUNK):
        chunk = all_rows[i:i + CHUNK]
        try:
            r = sb_post("/concordances", chunk)
            if r.status_code not in (200, 201):
                stats["errors"].append({
                    "stage": "insert_concordances_batch",
                    "chunk_start": i, "chunk_size": len(chunk),
                    "status": r.status_code, "error": r.text[:500],
                })
                stats["concordances_failed"] += len(chunk)
            else:
                stats["concordances_inserted"] += len(chunk)
        except Exception as e:
            stats["errors"].append({
                "stage": "insert_concordances_batch",
                "chunk_start": i, "chunk_size": len(chunk), "error": str(e),
            })
            stats["concordances_failed"] += len(chunk)


# ----------------------------------------------------------------------------
# Pasada 3: REPARADOR del grafo Fase 2A
# ----------------------------------------------------------------------------
def pass3_repair_norma_to_sentencia(slug_to_uuid_sentencias: dict[str, str],
                                    *, dry_run: bool, stats: dict) -> None:
    """Promueve concordancias de Fase 2A que quedaron unresolved apuntando
    a sentencias que ahora sí existen.

    Estrategia (sin JOIN-based UPDATE en PostgREST):
      1. GET todas las concordancias candidatas: from_type='norma',
         resolved=false, to_slug NOT NULL.
      2. Filtrar en memoria las que matchean un slug en slug_to_uuid_sentencias.
      3. Para cada match, PATCH individual con to_id + to_type='sentencia'
         + resolved=true.

    En dry_run solo reporta cuántos rows WOULD promote sin hacer los PATCH.
    """
    # 1. Fetch candidatos
    try:
        r = sb_get(
            "/concordances",
            params={
                "select": "id,to_slug",
                "from_type": f"eq.{SOURCE_TYPE_NORMA}",
                "resolved": "is.false",
                "to_slug": "not.is.null",
                "limit": "10000",
            },
        )
        r.raise_for_status()
        candidates = r.json()
    except Exception as e:
        stats["errors"].append({"stage": "pass3_fetch_candidates", "error": str(e)})
        stats["pass3_candidates_fetched"] = 0
        stats["pass3_matches_found"] = 0
        stats["pass3_promoted"] = 0
        return

    stats["pass3_candidates_fetched"] = len(candidates)

    # 2. Filtrar matches
    matches = [c for c in candidates if c.get("to_slug") in slug_to_uuid_sentencias]
    stats["pass3_matches_found"] = len(matches)

    if dry_run:
        stats["pass3_would_promote"] = len(matches)
        return

    # 3. PATCH individual por cada match
    promoted = 0
    failed = 0
    for m in matches:
        to_id = slug_to_uuid_sentencias[m["to_slug"]]
        try:
            r = sb_patch(
                "/concordances",
                params={"id": f"eq.{m['id']}"},
                payload={
                    "to_id": to_id,
                    "to_type": SOURCE_TYPE_SENTENCIA,
                    "resolved": True,
                },
            )
            if r.status_code in (200, 204):
                promoted += 1
            else:
                failed += 1
                stats["errors"].append({
                    "stage": "pass3_patch",
                    "concordance_id": m["id"],
                    "to_slug": m["to_slug"],
                    "status": r.status_code,
                    "error": r.text[:300],
                })
        except Exception as e:
            failed += 1
            stats["errors"].append({
                "stage": "pass3_patch",
                "concordance_id": m["id"],
                "to_slug": m["to_slug"],
                "error": str(e),
            })
    stats["pass3_promoted"] = promoted
    stats["pass3_failed"] = failed


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Ingesta Jurisprudencia EUREKA → Supabase (Fase 2B)")
    ap.add_argument("--dry-run", action="store_true",
                    help="No toca Supabase ni OpenAI; simula toda la ejecución (incluye Pasada 3).")
    ap.add_argument("--limit", type=int, default=None,
                    help="Procesar solo las primeras N sentencias (smoke test).")
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
        sys.exit(f"[FATAL] Falta {METADATA_JSON}. Fase 1B debería haberlo generado.")
    data = json.loads(METADATA_JSON.read_text())
    records = data["records"]
    if args.limit:
        records = records[:args.limit]
    print(f"[info] {len(records)} sentencias a procesar (total en JSON: {data['total_records']})")

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
        "would_insert_jurisprudence_sources": 0,
        "would_insert_eureka_metadata": 0,
        "would_insert_concordances": 0,
        # Pasada 0
        "normas_pre_loaded": 0,
        # Pasada 3
        "pass3_candidates_fetched": 0,
        "pass3_matches_found": 0,
        "pass3_promoted": 0,
        "pass3_failed": 0,
        "pass3_would_promote": 0,
    }

    t0 = time.time()

    # -------- PASADA 0 — pre-carga de slugs de Normativa --------
    print("\n[pasada 0] Cargando slugs de Normativa EUREKA (Fase 2A) desde Supabase…")
    if args.dry_run:
        # En dry-run igual hacemos el fetch: es read-only y nos da el dict
        # real para que Pasada 2 pueda reportar correctamente cuántas
        # concordancias a normas serían resolved vs unresolved.
        try:
            slug_to_uuid_normas = load_norma_slug_to_uuid_dict()
        except Exception as e:
            print(f"  [warn] fallo al precargar normas en dry-run: {e}")
            slug_to_uuid_normas = {}
    else:
        slug_to_uuid_normas = load_norma_slug_to_uuid_dict()
    stats["normas_pre_loaded"] = len(slug_to_uuid_normas)
    print(f"  {len(slug_to_uuid_normas)} normas EUREKA indexadas por slug")

    # -------- PASADA 1 — insertar sentencias + metadata --------
    print("\n[pasada 1] Insertando jurisprudence_sources + eureka_sources_metadata…")
    slug_to_uuid_sentencias: dict[str, str] = {}

    for batch_num, start in enumerate(range(0, len(records), BATCH_SIZE), 1):
        batch = records[start:start + BATCH_SIZE]
        batch_ok = 0
        for rec in batch:
            new_id = pass1_insert_sentencia_and_metadata(rec, dry_run=args.dry_run, stats=stats)
            if new_id:
                slug_to_uuid_sentencias[rec["slug"]] = new_id
                batch_ok += 1
        elapsed = int(time.time() - t0)
        print(f"  Batch {batch_num}: {batch_ok}/{len(batch)} done  "
              f"(cumulativo {start + batch_ok}/{len(records)}, elapsed {elapsed}s)")

    # -------- PASADA 2 — concordances desde sentencias --------
    print("\n[pasada 2] Construyendo filas de concordances desde sentencias…")
    all_concord_rows: list[dict] = []
    for rec in records:
        from_uuid = slug_to_uuid_sentencias.get(rec["slug"])
        if not from_uuid:
            continue
        all_concord_rows.extend(
            build_concordance_rows(
                from_uuid,
                rec.get("concordancias") or [],
                slug_to_uuid_sentencias,
                slug_to_uuid_normas,
            )
        )

    resolved_count = sum(1 for r in all_concord_rows if r["resolved"])
    unresolved_count = len(all_concord_rows) - resolved_count
    resolved_to_norma = sum(1 for r in all_concord_rows
                            if r["resolved"] and r["to_type"] == SOURCE_TYPE_NORMA)
    resolved_to_sentencia = sum(1 for r in all_concord_rows
                                if r["resolved"] and r["to_type"] == SOURCE_TYPE_SENTENCIA)
    print(f"  {len(all_concord_rows)} filas construidas "
          f"(resolved={resolved_count} [→norma={resolved_to_norma}, "
          f"→sentencia={resolved_to_sentencia}], unresolved={unresolved_count})")
    print(f"  Insertando en chunks de 500…")
    pass2_insert_concordances(all_concord_rows, dry_run=args.dry_run, stats=stats)

    # -------- PASADA 3 — REPARADOR del grafo Fase 2A --------
    print("\n[pasada 3] REPARADOR — promoviendo concordancias Normativa→Jurisprudencia de Fase 2A…")
    pass3_repair_norma_to_sentencia(slug_to_uuid_sentencias, dry_run=args.dry_run, stats=stats)
    if args.dry_run:
        print(f"  candidatos fetcheados: {stats['pass3_candidates_fetched']}")
        print(f"  matches encontrados:   {stats['pass3_matches_found']}")
        print(f"  WOULD promote:         {stats['pass3_would_promote']}")
    else:
        print(f"  candidatos fetcheados: {stats['pass3_candidates_fetched']}")
        print(f"  matches encontrados:   {stats['pass3_matches_found']}")
        print(f"  promovidos (ok):       {stats['pass3_promoted']}")
        print(f"  fallidos:              {stats['pass3_failed']}")

    # -------- REPORTE --------
    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["concordances_resolved_total"] = resolved_count
    stats["concordances_unresolved_total"] = unresolved_count
    stats["concordances_resolved_to_norma"] = resolved_to_norma
    stats["concordances_resolved_to_sentencia"] = resolved_to_sentencia
    stats["openai_cost_usd_estimated"] = round(
        stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6
    )
    stats["unique_slugs_inserted"] = len(slug_to_uuid_sentencias)

    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "=" * 72)
    print("  RESUMEN FINAL")
    print("=" * 72)
    print(f"  sentencias input:        {stats['total_input']}")
    print(f"  procesadas OK:           {stats['processed_ok']}")
    print(f"  skipped (duplicadas):    {stats['skipped_duplicates']}")
    print(f"  errores:                 {len(stats['errors'])}")
    print(f"  embeddings generados:    {stats['embeddings_generated']}")
    print(f"  embeddings fallidos:     {stats['embeddings_failed']}")
    print(f"  tokens OpenAI:           {stats['embedding_tokens_total']:,}")
    print(f"  costo OpenAI estimado:   ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  normas pre-cargadas:     {stats['normas_pre_loaded']}")
    if args.dry_run:
        print(f"  would insert sentencias: {stats['would_insert_jurisprudence_sources']}")
        print(f"  would insert metadata:   {stats['would_insert_eureka_metadata']}")
        print(f"  would insert concord:    {stats['would_insert_concordances']}")
        print(f"  pass3 would promote:     {stats['pass3_would_promote']}")
    else:
        print(f"  concordancias OK:        {stats['concordances_inserted']}")
        print(f"  concordancias fallidas:  {stats['concordances_failed']}")
        print(f"  pass3 promovidas:        {stats['pass3_promoted']}")
        print(f"  pass3 fallidas:          {stats['pass3_failed']}")
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
