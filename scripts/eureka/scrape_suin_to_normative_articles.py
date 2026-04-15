#!/usr/bin/env python3
"""Sprint A2 Fase 2D — Scraper de SUIN-Juriscol para extraer texto por
artículo de las 239 normas EUREKA externas que apuntan a ese sitio, e
insertarlos en `normative_articles` replicando el pipeline del Sprint A
(3.607 artículos del corpus original).

Alcance: SOLO los 239 docs con primary_source_host='www.suin-juriscol.gov.co'
de `metadata_full.json`. Los 30 docs no-SUIN (minambiente, un.org, etc.)
van en un script separado.

Pipeline en 4 pasadas (Opción C — embedding inline con INSERT):

  Pasada 0 — Pre-carga {slug → normative_source.id} desde Supabase
    (los 270 docs EUREKA Normativa ingestados en Fase 2A). Filtra los
    239 que tienen URL SUIN. Si --only-missing, descarta los que ya
    tienen ≥1 fila en normative_articles.

  Pasada 1 — Scraping SUIN doc-a-doc (delay 2s entre requests):
    a. GET viewDocument.asp?id=X (o ?ruta=…)
    b. soup.select_one('body.documento_cms').get_text('\\n', strip=True)
    c. Cortar prefijo UI (buscar marcador de inicio del doc real)
    d. Cortar sufijo JURISPRUDENCIA (sección editorial SUIN)
    e. Extraer metadata estructurada del prefijo (fecha, autoridad,
       diario oficial, vigencia, subtipo)
    f. Regex artículo con re.IGNORECASE (fix SA-DEUDA-7 aplicado)
    g. Deduplicar por (article_number, chapter) → conservar chunk más
       largo (modificaciones editoriales SUIN repiten artículos)
    h. Calcular fingerprint SHA-256(texto_limpio) + scraped_at
    i. Si 0 artículos (directivas/circulares sin articulado) →
       guardar 1 chunk 'Documento completo' (no descartar)

  Pasada 2 — Embedding INLINE + INSERT `normative_articles`:
    Por cada doc, agrupa sus artículos en batches de 100 para una
    sola llamada a OpenAI text-embedding-3-small (truncado 24k con
    retry 12k), y luego INSERT batch a `normative_articles` con el
    embedding ya incluido en el payload. Estado siempre consistente:
    si el script cae a mitad, cada fila en DB tiene su embedding.
    Si un embedding individual falla (después del retry), se inserta
    con embedding=NULL y se registra en errores.

  Pasada 3 — UPDATE `normative_sources` con metadata enriquecida
    de SUIN (issue_date, issuing_body, publication_source, is_active).

  Pasada 4 — Guardar fingerprints en
    `scripts/eureka/suin_scrape_fingerprints.json` para detectar
    cambios futuros en SUIN vía monitoreo periódico (Fase 3).

Flags:
  --dry-run        : no toca Supabase ni OpenAI; reporta qué haría.
  --limit N        : procesa solo los primeros N docs SUIN.
  --only-missing   : solo procesa docs que aún no tienen artículos
                     en normative_articles (útil para reanudar).

Idempotencia: el check --only-missing se basa en presencia de filas
en `normative_articles WHERE norm_id=X`. Si se re-ejecuta sin
--only-missing, DUPLICARÍA artículos. Usar con cuidado.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ----------------------------------------------------------------------------
# Env vars
# ----------------------------------------------------------------------------
HERE = Path(__file__).parent
ENV_PATH = HERE / ".env.local"
load_dotenv(ENV_PATH)

REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
_missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
if _missing:
    sys.exit(f"[FATAL] Faltan env vars en {ENV_PATH}: {', '.join(_missing)}")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

from openai import OpenAI, BadRequestError, APIError  # noqa: E402
OPENAI_CLIENT = OpenAI()

# ----------------------------------------------------------------------------
# Constantes
# ----------------------------------------------------------------------------
METADATA_JSON = HERE / "metadata_full.json"
REPORT_JSON = HERE / "scrape_report_suin.json"
FINGERPRINTS_JSON = HERE / "suin_scrape_fingerprints.json"

USER_AGENT = "Mozilla/5.0 (compatible; VIGIA-Ingest/1.0)"
SUIN_HOST = "www.suin-juriscol.gov.co"
SUIN_DELAY = 2.0
SUIN_RETRY_DELAY = 10.0

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS_PRIMARY = 24_000
EMBEDDING_MAX_CHARS_RETRY = 12_000
EMBEDDING_BATCH_SIZE = 100
OPENAI_PRICE_PER_1M_TOKENS = 0.02

ARTICLES_INSERT_BATCH = 200
EMBEDDINGS_UPSERT_BATCH = 100

REST_HEADERS_BASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "es-CO,es;q=0.9"})

# ----------------------------------------------------------------------------
# Helpers de red — Supabase REST
# ----------------------------------------------------------------------------
def sb_get(path: str, params: dict[str, str] | None = None) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.get(url, headers=REST_HEADERS_BASE, params=params, timeout=30)


def sb_post(path: str, payload: Any) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.post(url, headers=REST_HEADERS_BASE, json=payload, timeout=60)


def sb_upsert(path: str, payload: list[dict], on_conflict: str = "id") -> requests.Response:
    """PostgREST upsert con Prefer=resolution=merge-duplicates. Mucho más
    rápido que PATCH individual para UPDATE masivo en Pasada 3."""
    url = f"{SUPABASE_URL}/rest/v1{path}"
    headers = dict(REST_HEADERS_BASE)
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    return requests.post(url, headers=headers, params={"on_conflict": on_conflict},
                         json=payload, timeout=60)


def sb_patch(path: str, params: dict[str, str], payload: Any) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    return requests.patch(url, headers=REST_HEADERS_BASE, params=params,
                          json=payload, timeout=30)


# ----------------------------------------------------------------------------
# Pasada 0 — pre-carga de normas EUREKA desde Supabase
# ----------------------------------------------------------------------------
def load_eureka_norm_dict() -> dict[str, str]:
    """Carga {slug: normative_source.id} para los 270 docs EUREKA.
    Idéntica lógica a Fase 2B Pasada 0."""
    out: dict[str, str] = {}
    PAGE = 1000
    start = 0
    while True:
        headers = dict(REST_HEADERS_BASE)
        headers["Range"] = f"{start}-{start + PAGE - 1}"
        url = f"{SUPABASE_URL}/rest/v1/eureka_sources_metadata"
        r = requests.get(url, headers=headers,
                         params={"select": "source_id,metadata",
                                 "source_type": "eq.norma"}, timeout=30)
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


def count_existing_articles(norm_id: str) -> int:
    headers = dict(REST_HEADERS_BASE)
    headers["Prefer"] = "count=exact"
    headers["Range"] = "0-0"
    url = f"{SUPABASE_URL}/rest/v1/normative_articles"
    r = requests.get(url, headers=headers,
                     params={"select": "id", "norm_id": f"eq.{norm_id}"},
                     timeout=30)
    r.raise_for_status()
    cr = r.headers.get("content-range", "0-0/0")
    try:
        return int(cr.split("/")[-1])
    except Exception:
        return 0


# ----------------------------------------------------------------------------
# Pasada 1 — scraping SUIN
# ----------------------------------------------------------------------------
def fetch_suin(url: str) -> requests.Response:
    """GET con retry simple para transient errors. Aborta en rate limit."""
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            r = SESSION.get(url, timeout=30)
            if r.status_code in (429, 503):
                raise SystemExit(
                    f"[ABORT] SUIN respondió {r.status_code} en {url}. "
                    f"Retry-After={r.headers.get('Retry-After')}. "
                    f"Parar y reportar."
                )
            r.raise_for_status()
            r.encoding = "utf-8"  # forzar utf-8, el META dice utf-16 pero es falso
            return r
        except (requests.ConnectionError, requests.Timeout) as e:
            last_exc = e
            if attempt < 2:
                time.sleep(SUIN_RETRY_DELAY)
            else:
                raise
    raise last_exc  # pragma: no cover


def extract_body_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.select_one("body.documento_cms")
    if not body:
        # Fallback: el body completo sin class
        body = soup.find("body") or soup
    return body.get_text(separator="\n", strip=True)


# Marcador del inicio del documento real (después de la UI chrome).
# Estrategia cascada: intentamos patrones conocidos.
START_MARKERS = [
    # El disclaimer oficial de SUIN aparece justo antes del texto real
    re.compile(r"Los datos publicados en SUIN-?Juriscol son exclusivamente informativos[^\n]*\n",
               re.IGNORECASE),
    # "Subtipo:\n{VALOR}" también marca fin de la metadata
    re.compile(r"Subtipo:\s*\n[A-ZÁÉÍÓÚÑ ]+\n", re.IGNORECASE),
    # "ESTADO DE VIGENCIA:\n{X}" (sin disclaimer)
    re.compile(r"ESTADO DE VIGENCIA:\s*\n[^\n]+\n(?:\[\s*\nMostrar\s*\n\]\s*\n)?", re.IGNORECASE),
]

# Marcador del fin del documento (antes de secciones editoriales)
END_MARKERS = [
    re.compile(r"\nJURISPRUDENCIA\s*\n(?:\[\s*\nMostrar\s*\n\])?", re.IGNORECASE),
    re.compile(r"\nANEXO[S ]?\s*\n\[\s*\nMostrar", re.IGNORECASE),
]


def cut_prefix(text: str) -> tuple[str, str]:
    """Corta el prefijo UI. Devuelve (texto_cortado, prefijo_descartado).
    Estrategia cascada: intenta múltiples marcadores en orden."""
    for pat in START_MARKERS:
        m = pat.search(text)
        if m:
            return text[m.end():], text[:m.end()]
    # Ninguno matcheó — fallback: cortar después del primer título en mayúsculas
    # con patrón "TIPO NUM DE AÑO"
    m = re.search(r"\n([A-ZÁÉÍÓÚÑ]+(?:\s[A-ZÁÉÍÓÚÑ]+)?)\s+\d+\s+DE\s+\d{4}\s*\n", text)
    if m:
        return text[m.end():], text[:m.end()]
    return text, ""


def cut_suffix(text: str) -> tuple[str, str]:
    """Corta JURISPRUDENCIA/ANEXOS del final. Devuelve (texto_cortado, sufijo)."""
    earliest = len(text)
    earliest_match = None
    for pat in END_MARKERS:
        m = pat.search(text)
        if m and m.start() < earliest:
            earliest = m.start()
            earliest_match = m
    if earliest_match:
        return text[:earliest], text[earliest:]
    return text, ""


# Extracción de metadata del prefijo
DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")
DIARIO_OFICIAL_RE = re.compile(r"(DIARIO\s+OFICIAL[^\n]*|Gaceta[^\n]{3,200})", re.IGNORECASE)
VIGENCIA_RE = re.compile(r"\b(Vigente|Derogada|Declarada inhibida|Suspendida|Sin vigencia)\b",
                         re.IGNORECASE)
# Autoridad: líneas en mayúsculas que mencionan MINISTERIO/PRESIDENCIA/CONGRESO/etc.
AUTORIDAD_RE = re.compile(
    r"^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,\-\(\)]{10,200}?)\s*$", re.MULTILINE)
AUTORIDAD_KEYWORDS = re.compile(
    r"MINISTERIO|PRESIDENCIA|CONGRESO|ASAMBLEA|COMISI[ÓO]N|CORTE|"
    r"PROCURADUR[ÍI]A|CONTRALOR[ÍI]A|DEFENSOR[ÍI]A|"
    r"DEPARTAMENTO|INSTITUTO|CONSEJO|AUTORIDAD|AGENCIA|SUPERINTENDENCIA",
    re.IGNORECASE)
# Fecha expedición
FECHA_EXPEDICION_RE = re.compile(
    r"Fecha de expedici[óo]n de la norma\s*\n\s*(\d{1,2}/\d{1,2}/\d{4})",
    re.IGNORECASE)


def parse_date_ddmmyyyy(s: str) -> str | None:
    """'27/06/2013' → '2013-06-27' (ISO para Postgres date)."""
    m = DATE_RE.fullmatch(s.strip())
    if not m:
        return None
    d, mo, y = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}"


def extract_prefix_metadata(prefix: str) -> dict:
    """Extrae metadata estructurada del prefijo descartado + primeras líneas.
    Todo best-effort con null si no se puede."""
    out: dict[str, Any] = {
        "issue_date": None,
        "issuing_body": None,
        "publication_source": None,
        "vigencia": None,
        "subtipo": None,
    }

    # Fecha expedición
    m = FECHA_EXPEDICION_RE.search(prefix)
    if m:
        out["issue_date"] = parse_date_ddmmyyyy(m.group(1))

    # Diario oficial
    m = DIARIO_OFICIAL_RE.search(prefix)
    if m:
        out["publication_source"] = m.group(1).strip()

    # Vigencia
    m = VIGENCIA_RE.search(prefix)
    if m:
        out["vigencia"] = m.group(1).capitalize()

    # Subtipo
    m = re.search(r"Subtipo:\s*\n\s*([A-ZÁÉÍÓÚÑ\s]+)\s*\n", prefix, re.IGNORECASE)
    if m:
        out["subtipo"] = m.group(1).strip()

    # Autoridad — primera línea que matchea los keywords institucionales.
    for line in prefix.split("\n"):
        line = line.strip()
        if 15 < len(line) < 200 and AUTORIDAD_KEYWORDS.search(line) \
                and line.isupper():
            out["issuing_body"] = line
            break

    return out


# Parser de artículos (adaptado del Sprint A, con re.IGNORECASE — fix SA-DEUDA-7)
ARTICLE_RE = re.compile(
    r"(^|\n)\s*(Art[ií]culo|ARTICULO|ART\.)"
    r"[\s\u00A0]+(?:N[°º]?\s*)?"
    r"(\d{1,4}(?:\.\d+)*[A-Za-z]?)"
    r"[°º\.\s]",
    re.IGNORECASE | re.MULTILINE,
)
CHAPTER_RE = re.compile(
    r"\n\s*(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N)\s+[A-Z0-9IVXLCDM][^\n]{0,120}",
    re.IGNORECASE,
)


def parse_articles(text: str) -> list[dict]:
    # Normalizar: quitar \r y tabs, preservar \xa0 solo alrededor de "Artículo"
    norm = text.replace("\r", "").replace("\t", " ")

    # Capítulos (para asociar a cada artículo)
    chapters: list[tuple[int, str]] = []
    for m in CHAPTER_RE.finditer("\n" + norm):
        chapters.append((m.start(), m.group(0).strip()))

    def chapter_at(pos: int) -> str | None:
        last: str | None = None
        for idx, label in chapters:
            if idx < pos:
                last = label
            else:
                break
        return last

    # Artículos
    matches: list[tuple[int, str, str]] = []
    for m in ARTICLE_RE.finditer(norm):
        # idx es donde empieza la palabra "Artículo" (después del \n + \s*)
        idx = m.start() + len(m.group(1))
        label = f"{m.group(2).strip()} {m.group(3)}".strip()
        num = m.group(3)
        matches.append((idx, label, num))

    if not matches:
        return []

    articles: list[dict] = []
    for i, (start, label, num) in enumerate(matches):
        end = matches[i + 1][0] if i + 1 < len(matches) else len(norm)
        chunk = norm[start:end].strip()
        # Intentar extraer título inline del primer renglón
        first_nl = chunk.find("\n")
        first_line = (chunk[:first_nl] if first_nl > 0 else chunk[:200]).strip()
        # Eliminar "Artículo N°" del inicio de first_line para obtener solo el
        # título semántico (si existe)
        after_label = re.sub(
            r"^(Art[ií]culo|ARTICULO|ART\.)[\s\u00A0]+(?:N[°º]?\s*)?"
            r"\d{1,4}(?:\.\d+)*[A-Za-z]?[°º\.\s]*",
            "", first_line, flags=re.IGNORECASE,
        ).strip()
        title = after_label if (0 < len(after_label) < 160
                                and re.search(r"[.:]$", after_label)) else None
        if title:
            title = title.rstrip(".:").strip()
        articles.append({
            "article_number": num,
            "article_label": label,
            "title": title,
            "content": chunk,
            "chapter": chapter_at(start),
        })
    return articles


def dedup_articles(articles: list[dict]) -> list[dict]:
    """Deduplica por (article_number, chapter). Si hay colisión (modificaciones
    editoriales de SUIN que repiten el mismo artículo), conserva el chunk más
    largo — típicamente es la versión modificada/vigente."""
    by_key: dict[tuple[str, str | None], dict] = {}
    for a in articles:
        key = (a["article_number"], a["chapter"])
        existing = by_key.get(key)
        if existing is None or len(a["content"]) > len(existing["content"]):
            by_key[key] = a
    out = list(by_key.values())
    # Re-numerar order_index
    for i, a in enumerate(out, 1):
        a["order_index"] = i
        a["content_tokens"] = math.ceil(len(a["content"]) / 4)
    return out


def evaluate_parser_quality(text_len: int, n_articles: int,
                            arts: list[dict]) -> str:
    if n_articles == 0:
        return "manual_review_needed"
    avg = sum(len(a["content"]) for a in arts) / max(n_articles, 1)
    if n_articles < 5 and text_len > 10_000:
        return "low"
    if avg > 5000:
        return "low"
    if 5 <= n_articles <= 500 and 150 <= avg <= 4000:
        return "high"
    return "medium"


def scrape_one(url: str, *, dry_run: bool) -> dict:
    """Fetch + extract + parse una sola norma. Devuelve dict con:
      html_len, body_text_len, cleaned_text_len, prefix_metadata,
      articles: list[dict], parser_quality, text_hash, error (opcional).
    """
    out: dict[str, Any] = {"url": url, "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    try:
        r = fetch_suin(url)
    except Exception as e:
        out["error"] = f"fetch_failed: {e}"
        return out

    out["status_code"] = r.status_code
    out["html_len"] = len(r.text)

    body_text = extract_body_text(r.text)
    out["body_text_len"] = len(body_text)

    cleaned, prefix = cut_prefix(body_text)
    cleaned, _ = cut_suffix(cleaned)
    out["cleaned_text_len"] = len(cleaned)
    out["prefix_len"] = len(prefix)

    out["prefix_metadata"] = extract_prefix_metadata(prefix + cleaned[:2000])

    raw_articles = parse_articles(cleaned)
    articles = dedup_articles(raw_articles)
    out["articles_raw"] = len(raw_articles)
    out["articles_dedup"] = len(articles)
    out["parser_quality"] = evaluate_parser_quality(
        len(cleaned), len(articles), articles)

    # Fallback: 0 artículos → 1 chunk "Documento completo"
    if not articles and len(cleaned) >= 200:
        articles = [{
            "article_number": None,
            "article_label": "Documento completo",
            "title": None,
            "content": cleaned,
            "chapter": None,
            "order_index": 1,
            "content_tokens": math.ceil(len(cleaned) / 4),
        }]
        out["fallback_single_chunk"] = True

    out["articles_final"] = len(articles)
    out["articles"] = articles  # para Pasada 2
    out["text_hash"] = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
    return out


# ----------------------------------------------------------------------------
# Embeddings (helpers reutilizados en Pasada 2)
# ----------------------------------------------------------------------------
def embed_texts_batch(texts: list[str], *, dry_run: bool) -> tuple[list[list[float] | None], int, str | None]:
    """Embeds una batch de N textos (≤100). Trunca preemptivo a 24k.
    Si falla por tokens, reintenta 1×1 con 12k. Devuelve (embeddings_list,
    tokens, error). En dry-run devuelve [None]*N con tokens estimados."""
    if dry_run:
        est = sum(max(1, min(len(t), EMBEDDING_MAX_CHARS_PRIMARY) // 4) for t in texts)
        return [None] * len(texts), est, None

    truncated = [t[:EMBEDDING_MAX_CHARS_PRIMARY] for t in texts]
    try:
        r = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
        embs = [None] * len(texts)
        for d in r.data:
            embs[d.index] = d.embedding
        return embs, r.usage.total_tokens, None
    except BadRequestError as e:
        if "maximum context length" not in str(e).lower() and "token" not in str(e).lower():
            return [None] * len(texts), 0, f"openai_bad_request:{e}"
    except APIError as e:
        return [None] * len(texts), 0, f"openai_api_error:{e}"
    except Exception as e:
        return [None] * len(texts), 0, f"openai_unexpected:{type(e).__name__}:{e}"

    # Retry 1×1 a 12k (algún texto individual excedía el límite de tokens)
    embs: list[list[float] | None] = []
    total_tokens = 0
    for t in texts:
        t2 = t[:EMBEDDING_MAX_CHARS_RETRY]
        try:
            rr = OPENAI_CLIENT.embeddings.create(model=EMBEDDING_MODEL, input=t2)
            embs.append(rr.data[0].embedding)
            total_tokens += rr.usage.total_tokens
        except Exception:
            embs.append(None)
    return embs, total_tokens, None


def embedding_to_pgvector(embedding: list[float] | None) -> str | None:
    if embedding is None:
        return None
    return "[" + ",".join(f"{f:.7f}" for f in embedding) + "]"


# ----------------------------------------------------------------------------
# Pasada 2 — embedding INLINE + INSERT normative_articles
# ----------------------------------------------------------------------------
def embed_and_insert_articles(norm_id: str, articles: list[dict], *,
                              dry_run: bool, stats: dict) -> None:
    """Genera embeddings en batches de 100 (una llamada OpenAI por batch) e
    inserta en Supabase incluyendo el embedding en el payload. Si una fila
    no obtiene embedding (fallo individual después del retry 12k), se
    inserta con embedding=NULL y se registra en errores — pero la fila se
    persiste igual para que Pasada 3/4 puedan aplicarse a ella."""
    if not articles:
        return

    # 1) Generar embeddings en batches de 100 para minimizar llamadas a OpenAI
    embeddings_map: dict[int, list[float] | None] = {}
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    for i in range(0, len(articles), EMBEDDING_BATCH_SIZE):
        batch = articles[i:i + EMBEDDING_BATCH_SIZE]
        texts = [a["content"] or "" for a in batch]
        embs, tokens, err = embed_texts_batch(texts, dry_run=dry_run)
        stats["embedding_tokens_total"] += tokens
        if err:
            stats["errors"].append({
                "stage": "embed_batch",
                "norm_id": norm_id,
                "batch_start": i,
                "error": err,
            })
            # Todos los del batch → sin embedding
            for j in range(len(batch)):
                embeddings_map[i + j] = None
            stats["embeddings_failed"] += len(batch)
        else:
            for j, emb in enumerate(embs):
                embeddings_map[i + j] = emb
                if emb is None:
                    stats["embeddings_failed"] += 1
                else:
                    stats["embeddings_generated"] += 1

    # 2) Construir payload para INSERT
    if dry_run:
        stats["would_insert_articles"] += len(articles)
        return

    rows = []
    for idx, a in enumerate(articles):
        emb = embeddings_map.get(idx)
        rows.append({
            "norm_id": norm_id,
            "article_number": a.get("article_number"),
            "article_label": a.get("article_label"),
            "title": a.get("title"),
            "content": a["content"],
            "content_tokens": a.get("content_tokens"),
            "order_index": a["order_index"],
            "chapter": a.get("chapter"),
            "section": None,
            "embedding": embedding_to_pgvector(emb),
            "embedding_model": EMBEDDING_MODEL if emb is not None else None,
            "embedding_generated_at": now_iso if emb is not None else None,
        })

    # 3) INSERT en batches de 200
    for i in range(0, len(rows), ARTICLES_INSERT_BATCH):
        chunk = rows[i:i + ARTICLES_INSERT_BATCH]
        try:
            r = sb_post("/normative_articles", chunk)
            if r.status_code not in (200, 201):
                stats["errors"].append({
                    "stage": "insert_articles",
                    "norm_id": norm_id,
                    "chunk_start": i,
                    "status": r.status_code,
                    "error": r.text[:400],
                })
                stats["articles_insert_failed"] += len(chunk)
                continue
            resp = r.json()
            stats["articles_inserted"] += len(resp)
        except Exception as e:
            stats["errors"].append({
                "stage": "insert_articles",
                "norm_id": norm_id,
                "chunk_start": i,
                "error": str(e),
            })
            stats["articles_insert_failed"] += len(chunk)


# ----------------------------------------------------------------------------
# Pasada 3 — UPDATE normative_sources con metadata enriquecida de SUIN
# ----------------------------------------------------------------------------
def update_norm_metadata(norm_id: str, md: dict, parser_quality: str, *,
                         dry_run: bool, stats: dict) -> None:
    patch: dict[str, Any] = {}
    if md.get("issue_date"):
        patch["issue_date"] = md["issue_date"]
    if md.get("issuing_body"):
        patch["issuing_body"] = md["issuing_body"]
    if md.get("publication_source"):
        patch["publication_source"] = md["publication_source"]
    # Vigencia → is_active (sólo si detectamos explícitamente "no vigente")
    v = (md.get("vigencia") or "").lower()
    if v in ("derogada", "sin vigencia"):
        patch["is_active"] = False
    # parser_quality también actualizable
    if parser_quality:
        patch["parser_quality"] = parser_quality
        patch["parser_method"] = "regex"

    if not patch:
        stats["norms_patch_skipped"] += 1
        return

    if dry_run:
        stats["would_patch_norms"] += 1
        return

    try:
        r = sb_patch("/normative_sources", params={"id": f"eq.{norm_id}"},
                     payload=patch)
        if r.status_code in (200, 204):
            stats["norms_patched"] += 1
        else:
            stats["errors"].append({
                "stage": "patch_norm_metadata",
                "norm_id": norm_id,
                "status": r.status_code,
                "error": r.text[:300],
            })
            stats["norms_patch_failed"] += 1
    except Exception as e:
        stats["errors"].append({
            "stage": "patch_norm_metadata",
            "norm_id": norm_id,
            "error": str(e),
        })
        stats["norms_patch_failed"] += 1


# ----------------------------------------------------------------------------
# Pasada 4 — fingerprints
# ----------------------------------------------------------------------------
def save_fingerprints(fingerprints: dict[str, dict]) -> None:
    """Guarda/mergea fingerprints en JSON local. Si ya existe, conserva los
    registros previos no actualizados en esta corrida."""
    existing: dict[str, dict] = {}
    if FINGERPRINTS_JSON.exists():
        try:
            existing = json.loads(FINGERPRINTS_JSON.read_text())
        except Exception:
            existing = {}
    existing.update(fingerprints)
    FINGERPRINTS_JSON.write_text(json.dumps(existing, ensure_ascii=False, indent=2))


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(
        description="Scraper SUIN-Juriscol → normative_articles (replica Sprint A)"
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="No toca Supabase ni OpenAI; simula toda la ejecución.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Procesar solo los primeros N docs SUIN.")
    ap.add_argument("--only-missing", action="store_true",
                    help="Solo procesar docs que no tienen artículos en normative_articles.")
    args = ap.parse_args()

    if args.dry_run:
        print("=" * 78)
        print("  DRY RUN ON — NO se va a modificar Supabase. NO se va a llamar OpenAI.")
        print("=" * 78)
    else:
        print("=" * 78)
        print("  DRY RUN OFF — se van a modificar datos reales en Supabase producción")
        print("  Proyecto:", SUPABASE_URL)
        print("  Modelo embeddings:", EMBEDDING_MODEL)
        print("  Delay SUIN entre requests:", SUIN_DELAY, "s")
        print("=" * 78)

    if not METADATA_JSON.exists():
        sys.exit(f"[FATAL] Falta {METADATA_JSON}")

    data = json.loads(METADATA_JSON.read_text())
    all_records = data["records"]

    # Filtrar SUIN
    suin_records = [
        r for r in all_records
        if "suin" in (r.get("primary_source_url") or "").lower()
    ]
    print(f"[info] Total normas SUIN en metadata_full.json: {len(suin_records)}")

    # Pasada 0 — load norm dict
    print("\n[pasada 0] Cargando slugs de Normativa EUREKA desde Supabase…")
    slug_to_norm_id = load_eureka_norm_dict()
    print(f"  {len(slug_to_norm_id)} normas EUREKA indexadas por slug")

    # Resolve norm_id para cada record SUIN
    resolved: list[dict] = []
    unresolved = 0
    for r in suin_records:
        nid = slug_to_norm_id.get(r["slug"])
        if nid:
            resolved.append({**r, "norm_id": nid})
        else:
            unresolved += 1
    print(f"  {len(resolved)} docs con norm_id resuelto  ({unresolved} sin match)")

    # Filter --only-missing
    if args.only_missing and not args.dry_run:
        print("  --only-missing: filtrando docs que ya tienen artículos…")
        filtered = []
        for i, r in enumerate(resolved, 1):
            cnt = count_existing_articles(r["norm_id"])
            if cnt == 0:
                filtered.append(r)
            if i % 30 == 0:
                print(f"    checked {i}/{len(resolved)}…")
        print(f"  → {len(filtered)}/{len(resolved)} docs pendientes de artículos")
        resolved = filtered

    if args.limit:
        resolved = resolved[:args.limit]
    print(f"[info] {len(resolved)} docs a procesar en esta corrida")

    stats: dict[str, Any] = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "dry_run": args.dry_run,
        "limit": args.limit,
        "only_missing": args.only_missing,
        "total_input": len(resolved),
        "scraped_ok": 0,
        "scrape_failed": 0,
        "articles_raw_total": 0,
        "articles_dedup_total": 0,
        "articles_inserted": 0,
        "articles_insert_failed": 0,
        "embeddings_generated": 0,
        "embeddings_failed": 0,
        "embedding_tokens_total": 0,
        "norms_patched": 0,
        "norms_patch_skipped": 0,
        "norms_patch_failed": 0,
        "errors": [],
        "would_insert_articles": 0,
        "would_patch_norms": 0,
    }

    # Pasada 1 — scraping (todos primero, para tener fingerprints + articles)
    print(f"\n[pasada 1] Scraping SUIN (delay {SUIN_DELAY}s entre requests)…")
    scrape_results: list[dict] = []
    t0 = time.time()
    for idx, r in enumerate(resolved, 1):
        url = r["primary_source_url"]
        if idx > 1:
            time.sleep(SUIN_DELAY)
        print(f"  [{idx}/{len(resolved)}] GET {url[:80]}")
        result = scrape_one(url, dry_run=args.dry_run)
        result["slug"] = r["slug"]
        result["norm_id"] = r["norm_id"]
        result["title"] = r.get("title")
        if "error" in result:
            stats["scrape_failed"] += 1
            stats["errors"].append({
                "stage": "scrape",
                "slug": r["slug"],
                "url": url,
                "error": result["error"],
            })
        else:
            stats["scraped_ok"] += 1
            stats["articles_raw_total"] += result.get("articles_raw", 0)
            stats["articles_dedup_total"] += result.get("articles_dedup", 0)
        scrape_results.append(result)

    elapsed_p1 = int(time.time() - t0)
    print(f"  pasada 1 OK en {elapsed_p1}s — "
          f"scraped={stats['scraped_ok']}, failed={stats['scrape_failed']}, "
          f"articles_raw={stats['articles_raw_total']}, "
          f"articles_dedup={stats['articles_dedup_total']}")

    # Pasada 2 — embedding INLINE + INSERT normative_articles
    print("\n[pasada 2] Embedding OpenAI + INSERT normative_articles (inline)…")
    norm_ids_with_articles: list[str] = []
    for result in scrape_results:
        if "error" in result:
            continue
        arts = result.get("articles") or []
        if not arts:
            continue
        nid = result["norm_id"]
        embed_and_insert_articles(nid, arts, dry_run=args.dry_run, stats=stats)
        norm_ids_with_articles.append(nid)
    print(f"  insertados: {stats['articles_inserted']}  "
          f"failed insert: {stats['articles_insert_failed']}  "
          f"embeddings ok: {stats['embeddings_generated']}  "
          f"embeddings fail: {stats['embeddings_failed']}  "
          f"tokens: {stats['embedding_tokens_total']:,}  "
          f"normas con articles: {len(norm_ids_with_articles)}")

    # Pasada 3 — UPDATE normative_sources con metadata enriquecida
    print("\n[pasada 3] UPDATE normative_sources con metadata enriquecida…")
    for result in scrape_results:
        if "error" in result:
            continue
        md = result.get("prefix_metadata") or {}
        pq = result.get("parser_quality")
        update_norm_metadata(result["norm_id"], md, pq,
                             dry_run=args.dry_run, stats=stats)
    print(f"  patched: {stats['norms_patched']}  "
          f"skipped: {stats['norms_patch_skipped']}  "
          f"failed: {stats['norms_patch_failed']}")

    # Pasada 4 — fingerprints
    print("\n[pasada 4] Guardando fingerprints…")
    fps: dict[str, dict] = {}
    for result in scrape_results:
        if "error" in result:
            continue
        fps[result["slug"]] = {
            "slug": result["slug"],
            "url": result["url"],
            "text_hash": result.get("text_hash"),
            "scraped_at": result.get("scraped_at"),
            "articles_found": result.get("articles_final", 0),
            "parser_quality": result.get("parser_quality"),
            "body_text_len": result.get("body_text_len"),
            "cleaned_text_len": result.get("cleaned_text_len"),
        }
    if not args.dry_run:
        save_fingerprints(fps)
    stats["fingerprints_saved"] = len(fps)

    # -------- REPORTE --------
    stats["elapsed_seconds"] = round(time.time() - t0, 1)
    stats["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    stats["openai_cost_usd_estimated"] = round(
        stats["embedding_tokens_total"] * OPENAI_PRICE_PER_1M_TOKENS / 1_000_000, 6
    )
    REPORT_JSON.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

    print("\n" + "=" * 78)
    print("  RESUMEN FINAL")
    print("=" * 78)
    print(f"  input docs:              {stats['total_input']}")
    print(f"  scraped OK:              {stats['scraped_ok']}")
    print(f"  scrape failed:           {stats['scrape_failed']}")
    print(f"  articles raw:            {stats['articles_raw_total']}")
    print(f"  articles dedup:          {stats['articles_dedup_total']}")
    if args.dry_run:
        print(f"  would insert articles:   {stats['would_insert_articles']}")
        print(f"  would patch norms:       {stats['would_patch_norms']}")
    else:
        print(f"  articles inserted:       {stats['articles_inserted']}")
        print(f"  embeddings generated:    {stats['embeddings_generated']}")
        print(f"  embeddings failed:       {stats['embeddings_failed']}")
        print(f"  norms patched:           {stats['norms_patched']}")
    print(f"  embedding tokens:        {stats['embedding_tokens_total']:,}")
    print(f"  costo OpenAI estimado:   ${stats['openai_cost_usd_estimated']:.6f}")
    print(f"  fingerprints saved:      {stats['fingerprints_saved']}")
    print(f"  errores:                 {len(stats['errors'])}")
    print(f"  elapsed:                 {stats['elapsed_seconds']}s")
    print(f"  reporte:                 {REPORT_JSON}")
    print("=" * 78)

    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[INTERRUMPIDO] Usar --only-missing para reanudar si se alcanzó a insertar parcial.")
        sys.exit(130)
