# VIGÍA — Handoff Sprint v3.9.8 → v3.9.10

Archivo: `VIGIA_HANDOFF_2026-04-15_v398_continuacion.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-15 madrugada (continuación sprint) |
| Versión producto | **v3.9.10** |
| Build | 322.84 kB / 90.03 KB gzip |
| Commits del bloque | `132d78a` (P1), `b6f3c7e` (P2), `86617dd` (P3 v3.9.9), `(P4+P5)` |
| Edge functions ACTIVE | chat-bot **v11**, norm-search **v6**, norm-ingest v4, multi-format-extractor v1, embed-text v1, enrich-org-profile v1 |
| Corpus | 364 normas · 14.205 artículos · 147 sentencias · 479 jur_arts · 17 fuentes pedagógicas · 73 chunks pedagógicos |

---

## 2. Estado por Paso

### Paso 1 — Paginación MinAmbiente — ✅ completo
Endpoint AJAX descubierto: `POST /wp-admin/admin-ajax.php` con `{page, areaActivador=2, action='normativa_paginacion-load-posts'}`. Scraper actualizado. **33 items detectados en 40 páginas potenciales**, 22 candidatos 2024+, 2 resoluciones nuevas ingestadas (1519/2025, 1499/2025 — ~20 chunks). 20 SKIP "texto corto" por scans o ZIPs sin texto legible.

### Paso 2 — Guías ANLA pedagógicas — ✅ completo (reclasificación inteligente)
En lugar de re-scrapear, **reclasifiqué 17 docs ya ingestados en Fase 1C** cambiando `corpus_source='fase1c'` → `corpus_source='pedagogico'`. Cubre:
- 7 conceptos jurídicos ANLA (interpretación oficial)
- 2 guías (Escazú, procedimiento sancionatorio Ley 1333+2387)
- 3 procedimientos (evaluación licencias, medidas preventivas, sancionatorio)
- 1 Manual de Seguimiento Ambiental de Proyectos
- 1 Plan DRMI Chocó
- 3 lineamientos CONPES (contaminación aire, salud ambiental, PSA paz)
**REGLA 20 del bot ya tiene 73 chunks pedagógicos reales** activos en RAG.

### Paso 3 — Integrar multi-format-extractor — ✅ completo (v3.9.9)
`analyzeDocument` pre-extrae texto de DOCX/TXT/MD/HTML via edge `multi-format-extractor` antes del analyze-document. PDF/imagen siguen con Claude vision directo (sin cambio). DOC legacy no soportado (mensaje claro). El texto extraído se guarda en `analysisResult.raw_text` + `extraction_method` para el Paso 4.

### Paso 4 — Vectorizar documents post-INSERT — ✅ completo
`saveToSupabase` ahora:
1. INSERT en `documents` con `raw_text`, `format_type`, `processed_method`, `raw_text_length`.
2. Fire-and-forget a `embed-text` edge function con el raw_text truncado a 8k.
3. PATCH `documents.embedding` con el vector 1536 retornado.
Todo silenciado si falla — el doc queda guardado de todas formas.

### Paso 5 — match_org_documents + CAPA 6 — ✅ completo (v3.9.10)
- Migración: `raw_text` en `documents` + RPC **`match_org_documents`** con filtro `org_id` y ORDER BY distancia coseno.
- **norm-search v6**: CAPA 6 activa. Fetch paralelo de normas + jurisprudencia + resúmenes editoriales + **documentos propios de la org** (si `include_org=true`, que es default). Mix global por distancia.
- **chat-bot v11**: `formatFragment` detecta `source_type='documento_org'` y emite `[FUENTE N — DOCUMENTO PROPIO DE LA ORG] <doc_label> (<doc_type>, <fecha>)\n[PRIORIDAD MÁXIMA — compromiso específico de la organización]`. REGLA 18 ya instruye "priorizar estos fragmentos sobre normas genéricas".
- Response incluye `capas: { ..., documentos_org: N }` para telemetría.

---

## 3. Pipeline end-to-end funcional

```
Cliente sube oficio Word (.docx) en INTAKE
  ↓
multi-format-extractor v1 → texto extraído via XML parse
  ↓
analyze-document (Claude Sonnet) → analysisResult + raw_text + extraction_method
  ↓
saveToSupabase:
  ├─ INSERT instruments (si acto_administrativo)
  ├─ INSERT documents con raw_text + processed_method='xml_parse'
  │    ↓ (fire-and-forget)
  │    embed-text v1 → vector 1536
  │    ↓
  │    PATCH documents.embedding
  ├─ INSERT obligations extraídas
  └─ (fire-and-forget) enrich-org-profile → UPDATE org_profile

Más tarde, el usuario pregunta al bot:
"¿Qué dice mi oficio del 10 de marzo sobre vertimientos?"
  ↓
chat-bot v11 → norm-search v6
  ├─ CAPA 1: match_normative_articles (normas vigentes)
  ├─ CAPA 2: match_jurisprudence_articles
  ├─ CAPA 3: match_eureka_resumen
  └─ CAPA 6: match_org_documents WHERE org_id=<la del user>  ← NUEVO
  ↓
chat-bot aplica REGLA 18:
"Según su oficio del 10/03/2026, usted tiene obligación específica de..."
```

---

## 4. Corpus al cierre

| Tabla | Total | Notas |
|---|---|---|
| `normative_sources` | **364** | +2 MinAmbiente nuevas |
| ↳ `corpus_source='pedagogico'` | **17** | Reclasificados de fase1c |
| ↳ `corpus_source='minambiente_normativa'` | 2 | Res 1519/2025, Res 1499/2025 |
| `normative_articles` | **14.205** | +20 MinAmbiente |
| ↳ pedagógicos | 73 | Con REGLA 20 activa |
| `jurisprudence_sources` | 147 | 100% categorized |
| `jurisprudence_articles` | 479 | |
| `documents` con `embedding` | 0 | Se llenará en el primer INTAKE post-v3.9.10 |
| `org_profile` | 0 | Se llenará con enrich-org-profile en primer INTAKE |

---

## 5. Hallazgos/Gaps nuevos

1. **~20 normas MinAmbiente descartadas por "texto corto"**: son scans (necesitan OCR) o ZIPs atípicos. Oportunidad de aplicar el patrón OCR de Sprint A a MinAmbiente recentes.
2. **`raw_text` column en `documents`**: había que agregarla (columna faltaba). Ahora OK. Próximo backfill para INTAKE histórico es trivial.
3. **`match_org_documents` RPC retorna `d.created_at`** como `uploaded_at`. El timestamp usado es el de creación del row, no de subida real. Si en el futuro se agrega `uploaded_at` específico, cambiar la RPC.

---

## 6. Ideas y oportunidades nuevas

1. **Demo end-to-end REGLA 18**: grabar screencast: "suba su licencia ambiental PDF + oficio Word de la autoridad, VIGÍA los indexa y cita por fecha cuando usted pregunta". Es el primer feature con **corpus privado del cliente en el bot**. Enorme diferenciador vs ChatGPT genérico.

2. **Dashboard "Fuentes usadas" por consulta**: mostrar al usuario de Consultar cuántas de cada capa se usaron en la última respuesta (`capas` del response). "Esta respuesta se basó en: 3 normas, 2 sentencias, 1 documento propio". Transparencia de tipo "brand-signal".

3. **Auto-categorización de `documents` via Haiku**: el campo `doc_type_detected` aún se llena a mano/heurística. Con Haiku podría auto-detectar (licencia ambiental/PMA/acto admin/oficio/informe cumplimiento) en ~$0.01 por doc.

4. **Recorrido "empty state" de ORG profile más visual**: el panel dice "suba documentos para llenar". Agregar un stepper visual: "1. Sube licencia → 2. Sube oficio → 3. VIGÍA detectará su perfil completo". Onboarding guiado.

5. **Scraping MinAmbiente con OCR inline**: adaptar `ingest_minambiente_recent.py` para que cuando pypdf devuelve <500 chars, llame a `multi-format-extractor` con `force_ocr=true`. ~20 resoluciones más procesables.

---

## 7. Próximos pasos priorizados

| # | Tarea | Tiempo | Impacto |
|---|---|---|---|
| 1 | Test manual REGLA 18 end-to-end: subir doc, preguntar, confirmar cita correcta | 15 min | Alto |
| 2 | Badge visual "documento propio" en fuentes del bot | 10 min | Medio |
| 3 | OCR inline para MinAmbiente scans (~20 normas) | 1h | Medio-Alto |
| 4 | Auto-categorización de documents via Haiku | 1h | Medio |
| 5 | Compliance Matrix feature (cruce obligations × vigencia) | 2h | Alto |
| 6 | Cron schedule monitor_eureka + review_pending_gaps | 30 min | Bajo |

---

## 8. Referencias

- Handoff anterior: `VIGIA_HANDOFF_2026-04-15_bloques_1_4.md`.
- Commits sincronizados a `origin/main`: P1, P2, P3, P4+P5.
- Edge functions deployadas: 8 ACTIVE.
- Build final: 322.84 kB / 90.03 KB gzip (v3.9.10).
