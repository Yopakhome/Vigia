# VIGÍA — Handoff Bloques 1-4 (v3.9.6 → v3.9.8)

Archivo: `VIGIA_HANDOFF_2026-04-15_bloques_1_4.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-15 madrugada (sprint continuación) |
| Versión producto | **v3.9.8** |
| Commits | `a14c06d` (v3.9.6 Bl1+2), `b1942c9` (v3.9.7 Bl3), `2cc735f` (v3.9.8 Bl4) |
| Edge functions ACTIVE | chat-bot **v10**, norm-search **v5**, multi-format-extractor **v1**, embed-text **v1**, enrich-org-profile **v1**, norm-ingest v4 |
| Build | 321.13 kB / 89.47 KB gzip |

---

## 2. Estado por Bloque

### BLOQUE 1 — ORG-3 + ORG-5 — ✅ completo (v3.9.6)
- **ORG-3**: `saveToSupabase` en IntakeModule ahora llama fire-and-forget a `enrich-org-profile` con text + metadata del análisis. Silenciado si falla.
- **ORG-5**: Panel "Perfil Regulatorio de su Organización" en Dashboard, visible para roles no-superadmin/no-viewer. Cards dinámicas: Sectores (badges verdes), Nivel de riesgo (semáforo), Autoridades competentes, Temas regulatorios (top 5 bullets), Normas aplicables (top 5 con link), Departamentos. Estado vacío motivacional con botón a INTAKE.

### BLOQUE 2 — UI-2 + UI-4 — ✅ completo (v3.9.6)
- **UI-2**: Badges de vigencia + tipo en cada source citada por el bot. 🔴 DEROGADO, 🟡 MODIFICADO, 🔵 JURISPRUDENCIA, ⬜ EDITORIAL, 🔴 NORMA DEROGADA. Optional chaining para compat retro.
- **UI-4**: Tabs dinámicos por `category` en renderNormativa. Fallback al `scope` si no hay categories. Counts reales por categoría. 14 categorías activas + "Otra".

### BLOQUE 3 — INTAKE multi-formato — ⚠️ parcial (v3.9.7)
- ✅ Edge function **`multi-format-extractor`** v1 deployed. Soporta: PDF (unpdf+vision fallback), DOCX (fflate+XML), TXT/MD/HTML (decode+strip), imágenes (Claude vision). Límite 50MB, truncado 50k chars. DOC legacy no soportado (mensaje claro).
- ✅ Edge function **`embed-text`** v1 deployed (OpenAI text-embedding-3-small wrapper).
- ✅ IntakeModule input `accept` extendido a todos los formatos soportados.
- ❌ **Pendiente**: integrar multi-format-extractor en el flujo `analyzeDocument`. Actualmente el flujo envía PDF/imagen directo a Claude. Refactor requiere: (a) pre-extract → texto, (b) enviar texto a `analyze-document` como `raw_text`, (c) vectorización post-INSERT con `embed-text`, (d) mime labels visibles en UI.

### BLOQUE 4 — MinAmbiente + Pedagógico + REGLA 20 — ⚠️ parcial (v3.9.8)
- ✅ **REGLA 20** en chat-bot v10 ACTIVE. `formatFragment` detecta `corpus_source='pedagogico'` y emite `[FUENTE N — GUÍA TÉCNICA OFICIAL]` + `[NOTA: Fuente de orientación técnica, no norma vinculante]`. Regla instruye al LLM: aclarar no-vinculante, recordar normativa vigente, nunca equiparar con ley/decreto, remitir a ENARA si hay necesidad de certeza.
- ✅ Migración: `corpus_source` CHECK extendido a `minambiente_normativa` + `pedagogico`.
- ✅ RPC `match_normative_articles` retorna ahora `corpus_source` + `category`.
- ✅ `norm-search` v5 pasa ambos campos al chat-bot.
- ⚠️ **MA-1 parcial**: scraper `ingest_minambiente_recent.py` detectó 1 norma de p1 (Res 0017/2026). Paginación `/page/N/` falla con 404 — MinAmbiente usa AJAX/JSON endpoint. Requiere próxima iteración: inspeccionar Network tab en browser real o usar Playwright.
- ❌ **PED-1/2 pendiente**: scraper de guías sectoriales ANLA (minería, energía, infraestructura, PMA, monitoreo). Edge function + REGLA 20 listas; solo falta ingestar el contenido.

---

## 3. Corpus al cierre del sprint

| Tabla | Total | Observación |
|---|---|---|
| `normative_sources` | **362** | 4 corpus_source distintos |
| `normative_articles` | **14.185** | 100% con embedding |
| `jurisprudence_sources` | 147 | 100% con category |
| `jurisprudence_articles` | 479 | 100% con embedding |
| `eureka_sources_metadata` | 390 | con resumen_embedding |
| `concordances` | 2.928 | 2.366 resolved |
| `org_profile` | 0 | Tabla lista; se llenará con primer INTAKE |

**Edge functions ACTIVE (6)**: chat-bot v10, norm-search v5, norm-ingest v4, multi-format-extractor v1, embed-text v1, enrich-org-profile v1 + otras legacy.

---

## 4. Gaps nuevos encontrados

1. **MinAmbiente paginación**: `/page/N/` devuelve 404. El sitio usa WordPress pero con paginación AJAX/JSON o URL distinta. Inspección manual en browser pendiente.
2. **Corpus MinAmbiente 2024-2026 no cubierto**: al menos 6 páginas × ~5 docs = ~30 resoluciones/decretos recientes faltantes.
3. **Guías sectoriales ANLA no ingestadas**: PED-1/2 skipeadas — ~6 guías técnicas (minería, energía, infraestructura, PMA, monitoreo). Valor alto para REGLA 20 del bot.
4. **Flujo analyzeDocument no usa multi-format-extractor aún**: edge function lista pero la integración al INTAKE requiere refactor del pipeline.
5. **Vectorización de documents post-INSERT pendiente**: edge `embed-text` lista, sólo falta llamarla desde `saveToSupabase` después de guardar el `extracted_text`.

---

## 5. Ideas y oportunidades nuevas

1. **Demo comercial del Dashboard ORG**: el panel de perfil regulatorio es muy visible. Grabar un screencast de 2 min: "suba 3 documentos y vea su perfil regulatorio cargarse automáticamente". Material de ventas sólido.

2. **REGLA 20 + REGLA 17 combinadas**: diferencian bot comercial. Ningún chatbot legal colombiano distingue ley vinculante vs guía ANLA vs concepto jurídico vs política nacional. Cuatro niveles de peso jurídico explícitos.

3. **`multi-format-extractor` como servicio independiente**: la edge function puede usarse más allá de INTAKE. Ejemplo: clientes envían docs por email → webhook → extractor → clasifica → ingesta a su org. Feature enterprise.

4. **Cron automático de MinAmbiente**: una vez resuelta paginación, agendar semanal. Captura de resoluciones post-EUREKA de forma continua. Value prop: "el corpus nunca se queda atrás".

5. **ORG profile como health score**: `confianza_perfil` podría visualizarse como "Completitud de tu perfil: 45%" con un anillo de progreso. Incentiva al usuario a subir más documentos.

6. **`embed-text` para búsqueda full-text en documents**: una vez vectorizados los docs de la org, el cliente puede preguntar "¿qué dice mi licencia 1234 sobre vertimientos?" y el bot responde con sus propios documentos como fuente primaria (REGLA 18).

---

## 6. Próximos pasos priorizados

| # | Tarea | Tiempo | Impacto |
|---|---|---|---|
| 1 | Resolver paginación MinAmbiente (inspección devtools + refactor parser) | 30 min | Alto (desbloquea ~30 normas) |
| 2 | PED-1/2 guías sectoriales ANLA (6 guías, INSERT con corpus_source='pedagogico') | 1-2h | Alto (activa REGLA 20 en campo) |
| 3 | Integrar multi-format-extractor en analyzeDocument (refactor pipeline) | 1h | Alto (adopción de clientes no-técnicos) |
| 4 | Vectorizar documents post-INSERT con embed-text (activar REGLA 18) | 45 min | Medio-Alto |
| 5 | UI del método de extracción en INTAKE (ver mime label + preview imagen) | 30 min | Medio |
| 6 | Match RPC para documents vectorizados (`match_org_documents`) | 45 min | Medio |
| 7 | Scraper vigencia decretos/resoluciones SUIN (cobertura 80% restante) | 2-3h | Medio |
| 8 | Cron schedule MinAmbiente + Senado | 30 min | Bajo-Medio |

---

## 7. Archivos del sprint

**Nuevos**:
- `supabase/functions/multi-format-extractor/index.ts` (deployed v1)
- `supabase/functions/embed-text/index.ts` (deployed v1)
- `scripts/eureka/ingest_minambiente_recent.py` + report + recon JSON

**Modificados**:
- `supabase/functions/chat-bot/index.ts` (v10 — REGLA 20)
- `supabase/functions/norm-search/index.ts` (v5 — pasa corpus_source + category)
- `src/App.jsx` (v3.9.6→v3.9.8 — ORG-3/5 + UI-2/4 + intake accept multi-formato)

**DB migrations aplicadas**:
- `add_category_columns`, `create_org_profile`, `extend_corpus_source_red_justicia`, `extend_corpus_source_minambiente_pedagogico`, `match_articles_with_corpus_source`

---

## 8. Referencias

- Handoff anterior: `VIGIA_HANDOFF_2026-04-15_sprint_autonomo.md`.
- Total sprint: 4 commits sincronizados a `origin/main`.
- Último commit: `2cc735f` v3.9.8.
