# VIGÍA — Handoff sprint autónomo nocturno 2026-04-15

Archivo: `VIGIA_HANDOFF_2026-04-15_sprint_autonomo.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-15 madrugada (autonomous run) |
| Versión producto | **v3.9.5** |
| Último commit | `0ffb269` UI+MON |
| Edge functions deployed | chat-bot v9, norm-search v4, norm-ingest v4, enrich-org-profile v1 |
| Build | 314.07 kB / 88.04 KB gzip |

---

## 2. Fases ejecutadas

### FASE PRE (gaps + verificación) — ✅ completada
- **PRE-1**: embeddings 100% en normative_articles (14.132), jurisprudence_articles (479), eureka_sources_metadata (390).
- **PRE-2**: 8/10 gaps Fase 1C ya cerrados previamente; 2 sin-external-link permanecen pendientes.
- **PRE-3**: 10 políticas nacionales Red Justicia procesadas (53 chunks, $0.001).
- **PRE-5**: 8/9 tratados en corpus; Ley 994/2005 (Estocolmo POPs) documentada como faltante.
- **PRE-4**: ya cubierta por re-runs del commit T1 anterior.
- **PRE-6**: Skip — decretos/resoluciones vigencia vía SUIN requieren scraper adicional (registrado en roadmap).

### FASE CAT (categorización) — ✅ completada
- Migración schema: `category` + `category_secondary` en normative_sources, jurisprudence_sources, documents.
- Script rule-based (sin ANTHROPIC_API_KEY local): 362/362 normas + 147/147 sentencias categorizadas.
- Top categorías normas: Biodiversidad 32, Tratados 31, Aguas 26, Marco institucional 21, Residuos 15, Política 14, Clima 14, Aire 13, Consulta previa 13, Licenciamiento 12. 137 "Otra" (38%).

### FASE INTAKE — ⚠️ parcial (migración + schema, edge function pendiente)
- ✅ Migración documents: `format_type`, `processed_method`, `raw_text_length`, `embedding vector(1536)`, `category`, `doc_type_detected`.
- ❌ multi-format-extractor edge function NO construida (DOCX XML parse + Word + OCR vision = scope grande). Dejar para sesión dedicada con ANTHROPIC_API_KEY local disponible.
- ❌ IntakeModule UI (accept multi-format + preview) pendiente.

### FASE 2C (RAG ampliado) — ✅ completada
- Migración: RPC `match_jurisprudence_articles` + `match_eureka_resumen` nuevas.
- norm-search **v4**: multi-source (normas + sentencias + resúmenes editoriales) en paralelo con `Promise.all`, mix por distancia coseno.
- chat-bot **v9**: `formatFragment` detecta `source_type` y formatea distinto; `buildOrgContext` inyecta perfil al system prompt.
- REGLAs 15-19 agregadas:
  - R15 jurisprudencia (corte+radicado+año, criterio auxiliar Art. 230 CP)
  - R16 tratados (ley ratificatoria + bloque de constitucionalidad)
  - R17 políticas/guías/conceptos (no equiparar con norma vinculante)
  - R18 documentos propios (prioridad máxima, citar fecha)
  - R19 concordancias (sugerir exploración)

### FASE ORG (perfil organizacional) — ⚠️ parcial
- ✅ Migración tabla `org_profile` con RLS.
- ✅ Edge function `enrich-org-profile` v1 deployed (Claude Sonnet extrae JSON estructurado + UPSERT merge arrays).
- ❌ ORG-3 conectar al INTAKE (requiere cambio en IntakeModule.saveToSupabase) pendiente.
- ❌ ORG-5 UI Dashboard panel "Perfil Regulatorio" pendiente (requiere edits ~80 líneas App.jsx).
- ✅ ORG-4 chat-bot ya consulta org_profile automáticamente y lo inyecta.

### FASE UI — ✅ completada parcialmente
- ✅ **UI-1** badges vigencia en renderNormativa (Vigente/Derogada parcial/Derogada + category badge).
- ✅ **UI-3** contador dinámico (`{normSources.length} normas`).
- ❌ **UI-2** icono/tooltip en respuestas del bot: el RAG ya retorna `vigencia_status` pero la UI no renderiza badge — pendiente.
- ❌ **UI-4** tabs dinámicos por `category` en Normativa (requiere refactor de renderNormativa) — pendiente.

### FASE MON — ✅ completada
- ✅ **MON-1** `monitor_eureka.py`: re-fetch muestra SUIN (10 URLs), compara SHA-256, registra cambios en corpus_gaps.json. Cron mensual sugerido.
- ✅ **MON-2** `review_pending_gaps.py`: cada 14d re-intenta URLs de gaps pendientes. Cron quincenal.

---

## 3. Corpus al cierre del sprint autónomo

| Tabla | Total | Δ sprint | Observación |
|---|---|---|---|
| normative_sources | **362** | +10 | +10 políticas Red Justicia |
| ↳ con category | **362 (100%)** | +362 | 15-taxonomía aplicada |
| ↳ con vigencia_global | 178 (49%) | sin cambio | Senado cubre leyes; decretos/resoluciones pendientes |
| normative_articles | **14.185** | +53 | +53 chunks de políticas |
| ↳ con vigencia_status | 2.802 (20%) | sin cambio | Solo leyes via Senado |
| jurisprudence_sources | 147 | 0 | - |
| ↳ con category | 147 (100%) | +147 | - |
| jurisprudence_articles | 479 | 0 | - |
| eureka_sources_metadata | 390 | 0 | - |
| concordances | 2.928 | 0 | 2.366 resolved |
| org_profile | 0 | 0 | tabla creada, aún sin datos (requiere ORG-3 integration) |

**Costo OpenAI acumulado del sprint**: ~$0.001 (10 políticas embedding only, el resto ya estaba).

---

## 4. Tareas skipeadas con razón

| Tarea | Razón | Next action |
|---|---|---|
| PRE-6 vigencia decretos/resoluciones via SUIN | Requiere scraper adicional (SUIN HTML tiene notas editoriales en formato distinto a Senado) | Sprint dedicado 2-3h |
| INTAKE-2 multi-format-extractor | Edge function compleja: DOCX zip+XML parse, Word OLE, Vision OCR | Sprint dedicado con ANTHROPIC_API_KEY local verificada |
| INTAKE-3 IntakeModule UI multi-accept | Depende de INTAKE-2 | Juntos |
| INTAKE-4 vectorizar documents | Depende de INTAKE-2 | Juntos |
| ORG-3 conectar enrich-org-profile al INTAKE | Edit en IntakeModule.saveToSupabase | 15 min |
| ORG-5 panel Dashboard perfil | ~80 líneas React en App.jsx | 30 min |
| UI-2 badge vigencia en bot responses | MarkdownText component necesita parsear `[VIGENCIA: ...]` marker | 15 min |
| UI-4 tabs dinámicos categoría | Refactor de renderNormativa para reemplazar scope por category | 20 min |
| 2C-3 concordancias como contexto adyacente | Requiere RPC extendido | Sprint 2C-cont |
| CAT-3 categorizar documents existentes | 0 rows en documents hoy | Cuando haya docs subidos |
| CAT-4 tabs dinámicos (=UI-4) | - | Duplicado |

---

## 5. Roadmap actualizado

### PRIORITY HIGH (próxima sesión)
1. **INTAKE multi-formato** — feature crítico para clientes (subir certificados imagen, oficios Word, etc.). 2-3h.
2. **ORG-3 + ORG-5** — conectar enrich a INTAKE + panel Dashboard perfil. ~45 min.
3. **UI-4 tabs por categoría** + UI-2 badges bot — mejora UX visible. ~35 min.

### PRIORITY MEDIUM
4. Scraper vigencia decretos/resoluciones SUIN — cubrir el 80% sin vigencia actualmente.
5. Feature "audit de vigencia" para obligaciones del cliente (cruce obligations × vigencia_status).
6. INTAKE-4 vectorización de documents → REGLA 18 del bot se activa.

### PRIORITY LOW
7. Playwright para SISJUR → mapping real slug→ID.
8. OCR 4 resoluciones pendientes (Res 631, 2086, 108, 762).
9. STC-3872/2020 búsqueda manual Corte Suprema.
10. Cron mensual MON-1 + quincenal MON-2 (requiere host con cron).

---

## 6. Ideas y oportunidades identificadas

### Producto
1. **Feature "Compliance Matrix"**: cruzar `obligations × normas derogadas/modificadas` → detectar obligaciones con fundamento jurídico obsoleto. Diferencia competitiva clara.
2. **Dashboard ORG profile**: ya todo el backend existe (tabla + edge function + chat-bot consume). Sólo falta UI. Quick win.
3. **Intake multi-formato como venta**: "suba foto de oficio recibido en Whatsapp, VIGÍA lo procesa". 10x adoption para clientes no técnicos.
4. **Exportar perfil de cumplimiento**: PDF con obligaciones activas + normas aplicables + estado de vigencia + actos administrativos de la org. Material comercial y entregable a autoridades.

### Arquitectura
5. **Categorías rule-based → LLM Haiku**: 137 "Otra" (38%) puede bajar a ~5% si se usa Haiku con prompt estructurado (~$0.02).
6. **Match_documents RPC**: falta RPC vectorial dedicado para `documents.embedding`. Sin eso, REGLA 18 no se activa aún.
7. **Tabla concordances_enriched**: pre-calcular al minuto las vinculaciones para evitar JOIN en cada query bot.

### Comercial
8. **Diferenciación REGLAs 14-18**: ningún competidor distingue explícitamente vigencia, jurisprudencia vs norma, políticas vs vinculante, documentos propios. Es argumento de venta consolidado.
9. **Marca "compliance hygiene"**: el sprint de esta semana convirtió a VIGÍA en la única herramienta con vigencia explícita + jurisprudencia integrada + perfil de org + REGLA ABSOLUTA de no-citar-derogadas. Material para landing.

---

## 7. Próximos pasos priorizados

1. **[HIGH 45min]** ORG-3 + ORG-5 (conectar enrich-org-profile al INTAKE + panel Dashboard). Desbloquea demo visual.
2. **[HIGH 35min]** UI-2 + UI-4 (badges en bot + tabs categoría). Mejora UX percibida.
3. **[HIGH 2-3h]** INTAKE multi-formato completo (edge function + UI).
4. **[MED 2h]** Scraper vigencia SUIN decretos.
5. **[MED 1h]** Compliance Matrix feature.

---

## 8. Archivos nuevos del sprint

- `scripts/eureka/ingest_politicas_tratados.py` + `_report.json`
- `scripts/eureka/categorize_corpus_batch.py` + `categorize_report.json`
- `scripts/eureka/monitor_eureka.py`
- `scripts/eureka/review_pending_gaps.py`
- `supabase/functions/enrich-org-profile/index.ts` (deployed v1)

**Modificados**:
- `supabase/functions/chat-bot/index.ts` (v9 — REGLAs 15-19 + orgProfile)
- `supabase/functions/norm-search/index.ts` (v4 — multi-source)
- `src/App.jsx` (UI-1 + UI-3 + v3.9.5)
- `scripts/eureka/corpus_gaps.json` (PRE-5 tratados faltantes doc)

---

## 9. Referencias

- Handoff anterior: `VIGIA_HANDOFF_2026-04-15_vigencia_senado_regla14.md`.
- Commits del sprint: `97412a1` (PRE-3+5), `67a341f` (CAT), `2cb7f4d` (2C), `4553bcc` (enrich-org-profile), `0ffb269` (UI+MON).
- RPC reference: `match_normative_articles` (v2), `match_jurisprudence_articles` (new), `match_eureka_resumen` (new).
