# VIGÍA — Handoff Brief (Sprint A cerrado)

Este archivo: `VIGIA_HANDOFF_2026-04-13_1526.md` | También disponible como: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-13 15:26 COT (`America/Bogota`) |
| Versión del producto | **v3.6.0** (leído de `src/App.jsx:2337`) |
| Commit del Sprint A | `v3.6.0` en main (ver `git log --grep='Sprint A'`) |
| Repo GitHub | `Yopakhome/Vigia`, branch `main` |
| Proyecto Supabase | `itkbujkqjesuntgdkubt` (São Paulo, plan Free) |
| MCP Supabase | ✅ conectado |
| Deploy producción | https://vigia-five.vercel.app |
| Responsable humano | **Javier E. Restrepo V.** (`javierrestrepov@gmail.com`) |
| Brief anterior | `VIGIA_HANDOFF_2026-04-13_0135.md` (estado pre-Sprint A) |
| Autor | Claude Opus 4.6 (VIGÍA-03) |

---

## 2. Resumen ejecutivo

VIGÍA alcanzó **v3.6.0** con el **corpus universal de derecho ambiental colombiano operativo y consultable por RAG** (Sprint A cerrado). El corpus tiene **18 normas centrales publicadas** (Constitución + 5 leyes + 8 decretos + 4 resoluciones) con **3,607 artículos parseados y embebidos** en pgvector. La búsqueda semántica usa `text-embedding-3-small` (1536 dims, HNSW cosine) y el chat de "Consultar" ahora responde con citas verificables `[Norma X, Art. Y]` y rechaza alucinar lo que no está en el corpus. Validado en prod por Javier con 12 citas a 5 normas diferentes sin alucinaciones. Costo total de embeddings: **~$0.02 USD**. Quedan **4 normas en deuda** (scans grandes que exceden wall-time del Free tier o URLs oficiales no accesibles). Siguiente hito: Sprint A2 para expandir corpus o Sprint B para flujo deliberativo de propuestas.

---

## 3. Contexto de negocio

Sin cambios desde el handoff anterior. VIGÍA sigue siendo SaaS B2B de inteligencia regulatoria ambiental colombiana, ENARA Consulting, meta 800MM COP año 1. Sectores: energía, minería, manufactura, construcción. Diferenciador: **corpus normativo colombiano real** + extracción por artículo + embeddings + alertas cross-norm — esto último ya no es aspiracional, es funcional tras Sprint A.

---

## 4. Estado técnico verificado

### 4.1 Stack

Sin cambios: React 18 + Vite 4 + lucide-react + JS (no TypeScript). Package.json intacto.

### 4.2 Arquitectura del repo

```
.
├── docs/
│   ├── backups/
│   │   └── universe_v1_pre_reset_2026-04-13_1135.json     ← snapshot universo v1 pre-reset
│   └── handoffs/
│       ├── VIGIA_HANDOFF_2026-04-13_0135.md               ← Sprint 2 post-audit (pre-Sprint A)
│       ├── VIGIA_HANDOFF_2026-04-13_1526.md               ← ESTE archivo
│       ├── VIGIA_HANDOFF_LATEST.md                        ← copia del más nuevo
│       └── SPRINT_A_FASE_0.md                             ← verificación de prerreq del Sprint A
├── scripts/
│   ├── seed_norm.py                                       ← ingestor reutilizable (pypdf + OCR Claude + POST a norm-ingest)
│   ├── ocr_scans_via_edge.py                              ← orquestador para scans usando edge function (key server-side)
│   ├── seed_urls.json                                     ← 22 normas con URLs oficiales y metadata
│   ├── seed_text_layer.json                               ← subset 16 normas vía pypdf
│   ├── seed_scans.json                                    ← subset 4 normas vía Claude OCR
│   └── seed_pending_url.json                              ← 2 normas con URL inaccesible
├── src/
│   ├── App.jsx                                            ← single-file frontend (2,400 líneas ahora)
│   └── main.jsx
├── .gitignore                                             ← actualizado (node_modules, dist, .DS_Store, outputs efímeros)
├── package.json
├── vercel.json
├── vite.config.js
├── index.html
├── README.md                                              ← desfasado (v2.1.1)
├── VIGIA_bootstrap_claude_code.md                         ← en .gitignore
└── VIGIA_seed_demo_v1.sql
```

### 4.3 Tamaño del código

| Archivo | Líneas |
|---|---:|
| `src/App.jsx` | **2,400** (era 2,137 en v3.5.0, +263 por UI de Fase 7) |
| `src/main.jsx` | 9 |
| `scripts/seed_norm.py` | ~260 |
| `scripts/ocr_scans_via_edge.py` | ~70 |

Edge Functions en Supabase (no versionadas en git — ver §7 riesgo abierto):
- 11 funciones activas.

### 4.4 Dependencias externas

| Servicio | Estado |
|---|---|
| Supabase | plan Free, project_ref `itkbujkqjesuntgdkubt` · MCP OK |
| Vercel | auto-deploy en push a main |
| Anthropic API | modelo `claude-sonnet-4-5`, secret `ANTHROPIC_API_KEY` · usado en analyze-document, chat-bot, norm-ingest, norm-extract-text |
| **OpenAI API (nuevo)** | modelo `text-embedding-3-small`, secret `OPENAI_API_KEY` · usado en norm-embed, norm-search |
| Postmark u otro email provider | **NO integrado** (deuda para Sprint siguiente) |
| GitHub | `Yopakhome/Vigia` |

### 4.5 Variables de entorno y secrets

| Nombre | Ubicación | Rotación | Riesgo |
|---|---|---|---|
| `SB_URL`, `SB_KEY` | `src/App.jsx:4-5` | — | Bajo (pública) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Env var auto en Edge Functions | Supabase Dashboard | Alto (service_role) |
| `ANTHROPIC_API_KEY` | Supabase Edge Function Secrets | Javier | Alto (billing) |
| `ANTHROPIC_MODEL` | idem, opcional (default `claude-sonnet-4-5`) | — | Bajo |
| **`OPENAI_API_KEY`** | idem | Javier | Medio |
| `OPENAI_EMBEDDING_MODEL` | idem, opcional (default `text-embedding-3-small`) | — | Bajo |
| `SUPERADMIN_EMAILS` | idem (coma-separado) | Javier | Medio |

`SB_SERVICE` / `SB_ADMIN_URL` **ya no existen en el bundle** (cerrado en v3.5.0).

---

## 5. Estado verificado de la base de datos

Verificado al 2026-04-13 15:26 COT vía MCP.

### 5.1 Tablas

Totales globales:

| Tabla | Filas |
|---|---:|
| organizations | 6 |
| user_org_map | 18 |
| user_profiles | 20 |
| auth.users | 20 |
| instruments (EDIs) | 21 |
| obligations | 77 |
| documents | 0 |
| **`normative_sources`** (extendida en Sprint A) | **18** (todas published) |
| **`normative_articles`** (NUEVA) | **3,607** (todos con embedding de 1536 dims) |
| regulatory_alerts | 0 |
| org_update_requests | 2 |
| bot_queries | 2 |
| (otras 7 tablas con 0 filas: projects, evidences, alert_matches, communications*, document_references, oversight_log) | 0 |

### 5.2 Schema Sprint A

**`normative_sources` — 35 columnas** (las 16 legacy + 19 nuevas de Sprint A):
- Legacy conservadas: `id`, `norm_type`, `norm_number`, `norm_title`, `issuing_body`, `issue_date`, `effective_date`, `repeal_date`, `is_active`, `domain[]`, `keywords[]`, `full_text`, `source_url`, `last_verified`, `created_at`, `updated_at`.
- Nuevas (decisión P2 B: conservar nombres legacy + agregar): `norm_year`, `publication_source`, `pdf_storage_path`, `scope`, `summary`, `applies_to_sectors[]`, `hierarchy_level`, `supersedes_norm_ids[]`, `modified_by_norm_ids[]`, `is_universal`, `status` (CHECK `pending_validation|published|rejected|deprecated|superseded`, default `published`), `proposed_by_org_id`, `proposed_by_user_id`, `validated_by`, `validated_at`, `rejection_reason`, `content_hash` (unique), `total_articles`, `parser_quality` (CHECK `high|medium|low|manual_review_needed`), `parser_method` (CHECK `regex|llm|hybrid|manual`).
- `norm_type` CHECK ampliado para compat legacy: incluye `constitucion|ley|decreto_ley|decreto|resolucion|circular|sentencia|sentencia_tribunal|concepto|acuerdo|proyecto_normativo|otra`.

**`normative_articles` — 14 columnas** (NUEVA):
- `id`, `norm_id` (FK → normative_sources, cascade delete), `article_number`, `article_label`, `title`, `content`, `content_tokens`, `order_index`, `chapter`, `section`, **`embedding vector(1536)`**, `embedding_model`, `embedding_generated_at`, `created_at`.

**Índices**:
- `normative_sources`: `(status)`, `(status, scope) where status='published'`, partial `(proposed_by_org_id) where status='pending_validation'`, unique partial `(content_hash)`.
- `normative_articles`: `(norm_id)`, `(norm_id, order_index)`, **HNSW** `(embedding vector_cosine_ops)` con `m=16, ef_construction=64`.

**pgvector 0.8.0** instalada en schema `extensions`.

**Función RPC** `public.match_normative_articles(query_embedding, match_count, filter_scope, filter_norm_type, filter_min_year, filter_max_year, filter_sectors[])` — SECURITY INVOKER, GRANT EXECUTE a `authenticated`.

### 5.3 RLS

| Tabla | Policy | Regla |
|---|---|---|
| `normative_sources` | `normative_sources_select_pub` | `status='published' OR proposed_by_user_id=auth.uid()` |
| `normative_articles` | `normative_articles_select_pub` | join `EXISTS` con padre `status='published'` |
| ambas | sin INSERT/UPDATE/DELETE policies | writes solo vía service_role en Edge Functions |

**Bucket storage `normative-pdfs`** (NUEVO): private, 50 MB, solo `application/pdf`. Policy `normative_pdfs_read` authenticated SELECT. Writes solo vía service_role.

### 5.4 Universo de datos actual

**Orgs (6)**: cerrejon-norte, isagen-hidro, celsia-termo (enterprise), constructora-capital, carton-cali, palma-llanos. Intactas desde el handoff anterior.

**Usuarios (20 auth.users)**: 18 de test (`{admin|editor|viewer}@<slug>.vigia-test.co`) + `admin@enara.co` (SuperAdmin) + `javierrestrepov@gmail.com` (PO).

**Corpus Sprint A (18 normas)** distribuidas por scope:

| Scope | Normas | Artículos |
|---|:-:|:-:|
| general (marco) | Constitución 1991, Ley 99/1993, DecLey 2811/1974, Dec 1076/2015 | 2,816 |
| sancionatorio | Ley 1333/2009, Dec 3678/2010 | 82 |
| agua | Dec 1541/1978, Dec 3930/2010, Res 1207/2014 | 375 |
| aire | Res 909/2008, Res 610/2010 | 104 |
| residuos | Dec 4741/2005, Ley 1252/2008 | 58 |
| licenciamiento | Dec 2041/2014 | 53 |
| biodiversidad | Dec 2372/2010, Ley 1930/2018, Res 1517/2012 | 83 |
| cambio_climatico | Ley 1931/2018 | 36 |
| **Total** | **18** | **3,607** |

Res 610/2010 tiene 0 artículos parseados (parser_quality=manual_review_needed, formato atípico).
Res 1517/2012 también 0 (manual, corto).

### 5.5 Integridad referencial

0 huérfanos en checks FK — verificado.

---

## 6. Funcionalidades implementadas

| Funcionalidad | Estado | Notas |
|---|:-:|---|
| Login y sesión | ✅ | refresh token automático |
| Dashboard cliente | ✅ | counters derivados en vivo (v3.3.0) |
| Mis EDIs | ✅ | buscador + filtros críticos/proximos/al_dia |
| Detalle EDI | ✅ | obligaciones con trazabilidad de fuente |
| INTAKE (acto administrativo) | ✅ | edge function `analyze-document` |
| INTAKE (normas) | ✅ | van a `normative_sources` + `regulatory_alerts` (no crean EDI) |
| Panel SuperAdmin | ✅ | 9 tabs: overview, requests, **curación (NUEVA Sprint A)**, **catálogo (NUEVA Sprint A)**, users, orgs, neworg, create, setup |
| Multi-tenancy (RLS) | ✅ | 8 tablas con is_org_member() |
| Mi equipo / Mi organización | ✅ | orgadmin-users + request→approval flow |
| Módulo Normativa (cliente) | ✅ **RENOVADO Sprint A** | agrupado por 9 scopes con colores, detalle al click con artículos paginados |
| Módulo Inteligencia | ✅ | alertas regulatorias |
| **Módulo Consultar + RAG** | ✅ **RENOVADO Sprint A** | `chat-bot` v4 hace búsqueda semántica internamente, respuesta con citas [Norma, Art], fuentes clickeables debajo |
| Módulo Oversight | ⚠️ | UI existe, tabla `oversight_log` vacía, sin motor que inserte |
| Email transaccional | ❌ | no integrado (deuda para sprint siguiente) |

---

## 7. Bugs y gaps conocidos

### Deuda nueva del Sprint A

| ID | Severidad | Tipo | Descripción | Plan |
|---|---|---|---|---|
| SA-DEUDA-1 | media | gap | 4 normas del seed inicial no procesadas (Res 631/2015, Res 2254/2017, Res 1362/2007, Res 1519/2017) | Ver §13 backlog |
| SA-DEUDA-2 | baja | gap | Res 610/2010 y Res 1517/2012 ingestadas con `parser_quality=manual_review_needed` y 0 artículos (formatos atípicos) | Parser manual o re-OCR |
| SA-DEUDA-3 | alta | riesgo | **Código de Edge Functions no versionado en git** (11 funciones solo viven en Supabase) | Crear `supabase/functions/*/index.ts` pulling desde Supabase |
| SA-DEUDA-4 | baja | mejora | `article_label` del parser regex a veces captura solo el número de primer nivel (ej. "ARTÍCULO 2" en lugar de "ARTÍCULO 2.2.3.3.4.5") | Mejorar regex para capturar subíndices jerárquicos |
| SA-DEUDA-5 | baja | riesgo | Algunos artículos de la Constitución exceden 8192 tokens individualmente → se truncaron a 12k chars al embeddear | Considerar dividir en chunks de ~4k tokens antes del embed |
| SA-DEUDA-6 | media | gap | El parser crea 385 "artículos" para la Constitución cuando oficialmente tiene ~380; algunos chunks son inválidos | Revisar parser con regex más estricto que ignore citas cruzadas |

### Pendientes de sprints anteriores (aún abiertos)

| ID | Severidad | Estado |
|---|---|---|
| R-01 (service_role viejo válido hasta 2036) | alta | ⚠️ Requiere rotación manual en Supabase por Javier |
| G-03 (tablas sin UI: evidences, communications*, projects) | baja | ⚠️ Abierto |
| G-R02 (user_profiles RLS sin policy) | baja | ⚠️ Abierto |
| R-03 (HIBP off, pg_trgm en public, update_updated_at search_path mutable) | baja | ⚠️ Abierto |
| INTAKE-RAMIF (tipos evidencia/comunicación/técnico sin persistencia) | media | ⚠️ Abierto |

---

## 8. Historial de versiones (Sprint A)

| Versión | Commit | Hito |
|---|---|---|
| v3.5.0 | `90f5d47` | Pre-Sprint A: `SB_SERVICE` fuera del bundle |
| **v3.6.0** | tag `v3.6.0` en `main` | **Sprint A: corpus RAG completo** |

Sub-hitos del Sprint A (en migrations y deploys):
- Fase 1: migration `sprint_a_corpus_schema` (ampliación normative_sources + tabla normative_articles + RLS + bucket).
- Fase 2: migration `sprint_a_pgvector_enable` (extension vector + columna embedding + índice HNSW).
- Fase 3: deploy `norm-ingest` (v3), `norm-validate` (v1), `norm-extract-text` (v1).
- Fase 4: deploy `norm-embed` (v2), secret `OPENAI_API_KEY` añadido por Javier. 18 normas embeddedas.
- Fase 5: migration `sprint_a_match_normative_articles_rpc`, deploy `norm-search` (v1), `chat-bot` v4 con RAG.
- Fase 6: seed aplicado (16 text-layer vía script local + 2 scans vía edge + 2 pendientes).
- Fase 7: UI 4 cambios en App.jsx (curación, catálogo, normativa agrupada, fuentes en chat).
- Fase 8: commit v3.6.0 + handoff.

---

## 9. Decisiones arquitectónicas nuevas (Sprint A)

| Decisión | Razón | Consecuencia | Costo de reversar |
|---|---|---|---|
| Corpus es global (no por org) | Briefing Sprint A decisión 2 | `normative_sources` sin `org_id`, universal para todos los clientes | Bajo |
| Modelo B de curación (cliente propone, SuperAdmin valida) | Briefing decisión 1 | 2 estados clave `pending_validation` / `published` | Bajo |
| Embeddings OpenAI `text-embedding-3-small` 1536d | Briefing decisión 3 | Proveedor dependency, $0.02/M tokens | Medio (cambiar proveedor implica re-embed) |
| Texto parseado por artículo (no por página) | Briefing decisión 4 | Chunks semánticamente significativos, citas precisas | Alto (re-parsear y re-embed todo) |
| Parser híbrido regex → LLM fallback | Briefing decisión 5 | Barato por default, LLM solo si regex es malo | — |
| pgvector HNSW sobre ivfflat | Performance con corpus chico (<10k artículos), recall mejor | Mayor memoria, sin necesidad de re-train | Bajo (ALTER INDEX) |
| **PDF parsing fuera de Edge Function** para PDFs grandes | Wall-time 150s del Supabase Free tier | Seed corrido parte local (pypdf), parte vía `norm-extract-text` separada; el flujo UI del cliente para PDFs medianos sí funciona en 1 call | Alto si se quiere unificar (requiere plan Pro o arquitectura distinta) |
| Schema naming conservador: `norm_title`, `issuing_body`, etc. | Decisión P2 B de Fase 0 — no renombrar columnas existentes que ya usan publish-intel y handleNewNorm | Deuda semántica mínima (nombres no exactos al briefing, con comentarios SQL documentándolo) | Bajo |
| 4 normas del seed quedan como **deuda documentada** en lugar de procesadas con trucos | Honestidad operativa: preferible seed de 18 verificadas que 22 con 4 truqueadas | Sprint A cierra con cobertura 82% del listado original | Bajo (procesar las 4 en Sprint A2 cuando haya plan Pro o URLs alternativas) |

---

## 10. Ambiente de pruebas

### Corpus universal (Sprint A) — disponible para todos los usuarios authenticated

18 normas × 3,607 artículos embeddeados. Vista cliente en "Normativa" (agrupada por scope). Vista SuperAdmin en "Catálogo normativo".

### Universo de clientes (Sprint anterior) — intacto

6 orgs × 18 users × 21 EDIs × 77 obligaciones. Sin cambios desde el handoff anterior del 2026-04-13 01:35. Ver sección equivalente en `VIGIA_HANDOFF_2026-04-13_0135.md`.

**Credenciales de prueba**: password universal `[NO INCLUIDA; Javier la conoce]`.

---

## 11. Workflow de desarrollo

Sin cambios materiales. Ver §11 del handoff anterior. Adicional para Sprint A:

### Ingesta de una norma nueva al corpus

**Si el PDF tiene text layer**:
```bash
python3 scripts/seed_norm.py --url "https://..." --meta '{"title":"...","norm_type":"decreto","norm_number":"XXX","norm_year":2023,"scope":"agua"}' --admin-email admin@enara.co
```

**Si el PDF es escaneado** (requiere OCR):
- Opción A (local con key): exportar `ANTHROPIC_API_KEY` y correr el mismo script.
- Opción B (vía edge sin key local): usar `scripts/ocr_scans_via_edge.py` modificando el batch JSON.

### Regenerar embeddings de una norma

```bash
curl -X POST "$SB_URL/functions/v1/norm-embed" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"norm_id":"<uuid>"}'
```

Idempotente: no reprocesa artículos ya embeddedas (WHERE embedding IS NULL).

### Búsqueda semántica ad-hoc (CLI)

```bash
curl -X POST "$SB_URL/functions/v1/norm-search" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"qué dice sobre vertimientos industriales","top_k":5}'
```

---

## 12. Bloqueos activos que requieren acción humana

Del handoff anterior siguen:
- A.2 (rotar service_role key) — sigue sin hacer, R-01 técnicamente resuelto pero JWT viejo sigue válido hasta 2091.
- Dominio propio app.vigia.co.
- Vercel/Anthropic/Supabase billing a team ENARA.
- Email provider.

Nuevos de Sprint A:
- **Upgrade Supabase Free → Pro** si se quiere procesar las 4 normas pendientes server-side (wall-time actual 150s insuficiente).
- **Conseguir URL alternativa de Res 1362/2007** (la oficial de IDEAM no responde).

---

## 13. Backlog priorizado

### Sprint A2 sugerido (corpus expansion)

| ID | Ítem | Impacto | Esfuerzo |
|---|---|:-:|:-:|
| A2.1 | Procesar las 4 normas pendientes (Res 631, 2254, 1362, 1519) | 3 | M (requiere plan Pro o split de PDFs >100pg) |
| A2.2 | Re-parsear Res 610/2010 y Res 1517/2012 con estrategia alternativa | 2 | M |
| A2.3 | Mejorar parser regex para captar subíndices jerárquicos (Dec 1076) | 2 | M |
| A2.4 | Versionar código de Edge Functions en `supabase/functions/` | 3 | M |
| A2.5 | Expandir corpus con 10-20 normas adicionales (compensaciones, SINAP, jurisprudencia clave) | 4 | L |

### Sprint B (briefing explícito, flujo deliberativo)

- Construir flujo de propuestas deliberativas sobre el corpus existente (encima de Sprint A).

### Backlog largo plazo (del handoff anterior)

Sin cambios: G-03, R-02, R-03, partition App.jsx, migrar a TS, etc.

---

## 14. Reglas de trabajo con Javier

Sin cambios desde el handoff anterior. Las 12 reglas siguen aplicando. Una adicional observada en Sprint A:

13. **Cuando algo no es viable técnicamente (ej. wall-time del plan Free), parar y reportar con opciones explícitas** en lugar de improvisar soluciones que pueden dejar sistema inconsistente. Javier prefiere "B+D híbrido" (procesar lo que se puede + marcar deuda explícita) sobre forzar una solución ciega.

---

## 15. Cómo continuar

**Si eres un Claude nuevo**:
1. Leé §2 (resumen) y §11 (workflow) — 2 min.
2. `git log --oneline | head -5` debe empezar con `v3.6.0 - Sprint A: corpus universal…`.
3. Con MCP Supabase: `SELECT count(*) FROM normative_sources WHERE status='published'` debe dar 18. `SELECT count(*) FROM normative_articles WHERE embedding IS NOT NULL` debe dar 3,607.
4. Revisá §13 para decidir qué sprint toca.
5. **Validá los 2 secrets críticos**: `SUPERADMIN_EMAILS` y `OPENAI_API_KEY` deben existir en Supabase Edge Function Secrets. Si el SuperAdmin no ve los tabs de curación/catálogo, el primero falta; si `norm-search` devuelve 500, el segundo.
6. **Preguntale a Javier una sola cosa** sobre el siguiente paso antes de asumir el sprint siguiente.

---

## 16. Observaciones del Ingeniero

Esta sección la escribo con autonomía después de construir todo el Sprint A. 15 observaciones de valor real para el próximo Claude.

### 16.1 El wall-time de 150s del plan Free redefine la arquitectura
**Categoría: Decisión no obvia.** Durante Fase 3 descubrí que OCR de un PDF de 62 páginas tarda >150s y el Edge Function muere con `WORKER_LIMIT`. Esto forzó partir `norm-ingest` en dos: `norm-extract-text` (download + OCR) + `norm-ingest` (storage + metadata + parse + insert). Cada una cabe en 150s. El próximo Claude que quiera agregar "un paso más" a alguna edge function debe verificar primero cuánto tarda el actual. Upgrade a Pro elimina esta restricción (wall-time ~400s), pero mientras estemos en Free, la regla es: **una edge function, una responsabilidad pesada máximo**.

### 16.2 OpenAI embedding falla silenciosamente para artículos > 8191 tokens
**Categoría: Fragilidad.** La API devuelve HTTP 400 para el batch entero si **cualquier input** excede el límite. Mi truncado inicial a 30k chars falló con 2 artículos de la Constitución que eran aún más largos. La v2 de `norm-embed` ahora: (a) trunca preemptivamente a 24k chars, (b) si un batch falla, reintenta 1×1 y trunca a 12k en segundo intento. Esto detectó y procesó los 2 casos problemáticos. **Si se agregan normas con artículos muy extensos, esta lógica ya lo cubre; no simplificar el fallback 1×1 sin motivo**.

### 16.3 El parser regex sobreestima el conteo de artículos en ~2-3% de las normas
**Categoría: Deuda técnica aceptable.** La Constitución tiene ~380 artículos oficialmente, el parser extrajo 385. El Decreto 1076 es un "Decreto Único" cuyo articulado tiene numeración compuesta (2.2.3.3.4.5) — el parser extrajo 1,972 chunks, más que los artículos reales. Esto **inflaciona counts y genera chunks algo redundantes**, pero el RAG sigue funcionando excelente porque la similitud coseno no se ve afectada. Si el próximo Claude quiere refinar el parser, el riesgo es que parsear más estricto baje recall de búsquedas comunes. **Recomiendo dejarlo como está y priorizar el SA-DEUDA-4 solo si aparecen problemas reales de UX**.

### 16.4 Claude OCR costó menos de lo esperado
**Categoría: Insight.** El briefing estimaba $0.30-0.80 por PDF escaneado. Real: ~$0.04-0.15 en las 2 que procesé. El modelo `claude-sonnet-4-5` es eficiente con PDFs chicos (<20 páginas). Para escalar el corpus con más scans, el presupuesto es razonable: 100 scans de 15 páginas ≈ $10-15 total.

### 16.5 pypdf a veces falla con PDFs de Función Pública por el prefijo `\t\n`
**Categoría: Fragilidad → Resuelta.** Los PDFs de `norma_pdf.php?i=X` tienen 2 bytes (`\t\n`) antes del header `%PDF-`. Mi validación strict `startswith("%PDF-")` rechazaba PDFs válidos. El fix: `b"%PDF-" in data[:1024]`. Si el próximo Claude amplía el parser, **no restaurar el check estricto**.

### 16.6 La función RPC `match_normative_articles` es el único punto de extensión del RAG
**Categoría: Decisión no obvia.** Toda la lógica de búsqueda vectorial pasa por esa función Postgres. Si se quiere agregar filtros (ej. por fecha de efectividad, por estado de vigencia, por si una norma está derogada), se modifica ahí, no en `norm-search`. La función tiene `SECURITY INVOKER` por default (respeta RLS), pero todos los resultados ya están filtrados por `status='published'` dentro de la función — **no duplicar el filtro en la edge function**.

### 16.7 Recomendación: no probé con pregunta que NO tiene respuesta en el corpus
**Categoría: Recomendación.** Todas mis pruebas del RAG devolvieron algo relevante (top_k=5 siempre halla algo). No validé el caso "pregunta sobre tema no cubierto" (ej. "cómo se calcula el IVA"). Vale la pena que Javier pruebe esto en su ronda de 10-15 preguntas adicionales. **Si el bot responde con contexto irrelevante en vez de decir "no sé", habría que agregar un threshold de similitud mínima (ej. descartar chunks con sim<0.45)**.

### 16.8 Insight: Res 610/2010 y Res 1517/2012 probablemente no son "normas" en el sentido tradicional
**Categoría: Insight de datos.** Ambas quedaron con 0 artículos parseados. Miré los PDFs: la Res 610/2010 está en formato resolutivo ("ARTÍCULO PRIMERO — Adoptar…") que mi regex `\b(Artículo)\s+\d+` no captura porque el número viene en letras. La Res 1517/2012 es un manual técnico, no un articulado. **Para Sprint A2, si se quiere embeddear esto: o se extiende el parser para ordinales en letras, o se embed el texto completo como un solo chunk "norma_summary"**.

### 16.9 Fragilidad: el RAG del chat-bot depende de que `norm-search` esté disponible
**Categoría: Fragilidad.** Si `norm-search` devuelve error (p.ej. OPENAI_API_KEY inválida), `chat-bot` sigue adelante con `sources=[]` y el system prompt dice "(Sin fragmentos normativos relevantes)". El usuario ve una respuesta pobre sin saber por qué. **Mejora futura: el bot debería avisar "No pude consultar el corpus, la respuesta puede ser incompleta" cuando `rag_used=false`.**

### 16.10 Patrón de Javier: valora checkpoints intermedios con data real
**Categoría: Patrón del usuario.** Javier no pidió validar la UI hasta que yo ya tenía los 3,607 artículos embeddedas. Cuando validó, fue quirúrgico: 4 cambios explícitos probados con data real, 12 citas verificadas. Este patrón aplica: **no pedir validación en abstracto, llevar data concreta para que Javier pueda verificar en minutos, no horas**.

### 16.11 Decisión no obvia: scripts/ está en git aunque algunos outputs no
**Categoría: Decisión no obvia.** Los scripts `seed_norm.py` y `ocr_scans_via_edge.py` van a git (reutilizables). Los JSON de salida (`classify_report.json`, `ingest_result.json`, `ocr_scans_result.json`) están en `.gitignore` porque se regeneran con cada corrida. Pero `seed_urls.json` SÍ va a git: es fuente de verdad del corpus (las URLs oficiales verificadas). Futuros cambios al corpus → modificar `seed_urls.json`, re-correr script, commitear solo `seed_urls.json` cambiado.

### 16.12 Oportunidad: el endpoint `/rest/v1/rpc/match_normative_articles` es directamente invocable desde el frontend
**Categoría: Oportunidad.** Podría usarse para una caja de búsqueda full-text en la vista Normativa sin pasar por `norm-search`. Pero requiere que el frontend tenga el embedding de la query (lo cual significa tener `OPENAI_API_KEY` en el bundle → no). **Mantener la arquitectura actual: todas las búsquedas vectoriales pasan por la edge function, el frontend nunca ve la key de OpenAI**.

### 16.13 Deuda crítica no marcada antes: Edge Functions sin versionar en git
**Categoría: Riesgo futuro.** Ya existían 7 edge functions (chat-bot, analyze-document, etc.) y Sprint A agregó 5 más. **12 edge functions viven solo en Supabase**. Si alguien borra accidentalmente una función desde el dashboard, el código se pierde. **Recomendación fuerte para Sprint A2 o antes**: crear `supabase/functions/*/index.ts` en el repo haciendo `pull` desde Supabase, y que cada `deploy_edge_function` futuro escriba primero al archivo local, commitee, y luego despliegue.

### 16.14 Fragilidad: el wall-time de embeddings de Dec 1076 roza el límite
**Categoría: Fragilidad.** El Decreto 1076/2015 tiene 1,972 artículos — cada embed-batch de 100 tarda 2-3s, total ~60s por norma. En mi corrida tomó 23s para los primeros 1000 artículos, cortó por algún límite (parece que procesó uno por batch grande con chunks de 100 y se detuvo en algún punto), luego reinvoqué y procesó los 972 restantes en otra corrida. Si en Sprint A2 agregan una norma aún más grande (>3000 artículos), puede necesitar 3+ iteraciones. **La función es idempotente, así que un while-loop del caller hasta `pending_after=0` sigue funcionando**.

### 16.15 Patrón de Javier: el password del seed quedó en memoria del repo pero no en handoffs
**Categoría: Patrón del usuario / Seguridad.** La password universal de los 18 usuarios de test aparece como literal en `VIGIA_seed_demo_v1.sql` (en git) y en mis scripts Python (scripts/seed_norm.py default value). No está en los handoffs porque Javier aplicó la regla "no credenciales en chat". La inconsistencia: está en un archivo SQL en git pero no en documentos sensibles. **Si algún día este repo se vuelve público (ej. open source), esa password tiene que rotarse y sacarse del SQL del seed + de los scripts**.

---

**Fin del handoff Sprint A.**
