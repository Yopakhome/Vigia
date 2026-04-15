# VIGÍA — Handoff Sprint v3.9.10 → v3.9.12

Archivo: `VIGIA_HANDOFF_2026-04-15_v3910_continuacion.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-15 madrugada (continuación sprint) |
| Versión producto | **v3.9.12** |
| Build | 326.59 kB / 90.82 KB gzip |
| Commits | `2734515` (P1), `71f1e77` (P2 v3.9.11), `849dbb7` (P5 v3.9.12) |
| Edge functions ACTIVE | 8 (chat-bot v11, norm-search v6, norm-ingest v4, multi-format-extractor v1, embed-text v1, enrich-org-profile v1, norm-extract-text v1, analyze-document v6) |

---

## 2. Estado por Paso

### Paso 1 — Test REGLA 18 e2e — ✅ PASADO
Script `test_regla18_e2e.py` insertó oficio ANLA de prueba en Cerrejón Norte con embedding real. RPC `match_org_documents` respondió con `distance=0.2984` sobre query "requerimiento de monitoreo de vertimientos al río Bogotá" — **encontró el documento correcto**. Pipeline CAPA 6 funcionando. Bug menor corregido: `accessibility` check requiere `confidencial_empresarial` (no `confidencial`).

### Paso 2 — UI badge + capas — ✅ completo (v3.9.11)
- Badge `📄 PROPIO` (verde) en sources para `source_type='documento_org'`
- Badge `📖 GUÍA TÉCNICA` (amarillo) para `corpus_source='pedagogico'`
- Contador de capas consultadas debajo del panel de fuentes:
  `📋 normas · ⚖️ sentencias · 📰 editoriales · 📄 propios`
- `msg.capas` ahora persiste en el estado del bot

### Paso 3 — OCR MinAmbiente — ⚠️ BLOQUEADO (API sin créditos)
Script `retry_minambiente_ocr.py` completo y dry-run validado:
- 19 candidatos "empty" del run anterior identificados
- 17 PDFs + 2 ZIPs (ZIPs skippean — fuera de scope de `norm-extract-text`)

Ejecución real FALLÓ 19/19 con error:
```
Claude OCR falló: Your credit balance is too low to access the Anthropic API.
```

**Acción pendiente**: recargar créditos Anthropic en Supabase y re-ejecutar.
Costo estimado: ~$0.10 para los 17 PDFs. Script listo para re-run inmediato.

### Paso 4 — Auto-categorización LLM — ⏭️ skipeado
Sin `ANTHROPIC_API_KEY` local (y con cuenta Supabase sin créditos). Rule-based del sprint anterior ya cubrió 100% normas + sentencias. 137 `category='Otra'` siguen como tal. Script `categorize_corpus_batch.py` ya tiene modo LLM fallback listo para cuando haya créditos.

### Paso 5 — Compliance Matrix — ✅ completo (v3.9.12)
- Migración: `obligations` + 3 columnas de fundamento (`norma_fundamento`, `articulo_fundamento`, `vigencia_fundamento` con CHECK)
- **VIEW `compliance_matrix`**: LEFT JOIN `obligations` × `normative_sources` × `normative_articles` por número + artículo. Calcula `alert_level` (FUNDAMENTO_DEROGADO, FUNDAMENTO_MODIFICADO, VENCIDA, PROXIMA_30D, OK)
- **Panel Dashboard "Alertas de Cumplimiento"**: muestra top 10 alertas con badges de color + mensaje descriptivo (incluye la norma que derogó/modificó si aplica)
- Fetch automático en `tryConnect` con `alert_level != 'OK'`
- Estado actual: **50 alertas activas** en DB (mayormente VENCIDA/PROXIMA_30D; ninguna FUNDAMENTO_DEROGADO aún porque `obligations.norma_fundamento` está vacío — se llenará cuando el INTAKE extraiga la fuente normativa)

---

## 3. Métricas finales del corpus

```sql
SELECT
  (SELECT COUNT(*) FROM normative_sources) AS ns,                    -- 364
  (SELECT COUNT(*) FROM normative_sources
     WHERE corpus_source='pedagogico') AS ns_ped,                    -- 17
  (SELECT COUNT(*) FROM normative_sources
     WHERE corpus_source='minambiente_normativa') AS ns_ma,          -- 2
  (SELECT COUNT(*) FROM normative_articles) AS na,                   -- 14.205
  (SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL) AS docs_vec,   -- 1 (test e2e)
  (SELECT COUNT(*) FROM documents) AS docs_total,                    -- 1
  (SELECT COUNT(*) FROM obligations
     WHERE norma_fundamento IS NOT NULL) AS obs_con_fundamento,      -- 0
  (SELECT COUNT(*) FROM obligations) AS obs_total,                   -- 77
  (SELECT COUNT(*) FROM compliance_matrix
     WHERE alert_level != 'OK') AS alertas_activas;                  -- 50
```

| Métrica | Valor | Observación |
|---|---|---|
| normative_sources | 364 | +0 vs sprint anterior |
| ↳ pedagógicos | 17 | Reclasificados en Paso 2 previo |
| ↳ MinAmbiente | 2 | Bloqueadas las otras 17 por OCR sin crédito |
| normative_articles | 14.205 | |
| documents vectorizados | 1 | El insertado por test e2e |
| obligations total | 77 | 0 con `norma_fundamento` aún |
| alertas compliance | 50 | Todas tipo VENCIDA/PROXIMA_30D |

---

## 4. Hallazgos / Gaps

1. **ANTHROPIC balance agotado** — bloqueador principal. Impacta Paso 3 (OCR MinAmbiente) y cualquier flujo que use `norm-extract-text`, `enrich-org-profile`, `analyze-document` en Supabase. Recarga necesaria.

2. **`obligations.norma_fundamento` vacío** — la vista `compliance_matrix` está lista pero los 77 obligations actuales no tienen fundamento normativo extraído. El INTAKE actual (`analyze-document`) **sí extrae** `fuente.numero/articulo` pero el código de `saveToSupabase` no lo mapea a estos campos. **Quick fix 15 min**: mapear `analysisResult.fuente.numero/articulo` al `obligations.norma_fundamento/articulo_fundamento`.

3. **`accessibility` check restrictivo** — el valor `confidencial` (usado en muchos scripts viejos) NO pasa. Requiere `confidencial_empresarial`. Revisar todo el codebase por consistencia.

4. **ZIPs de MinAmbiente** — 2 resoluciones vienen en `.zip` o `.7z`. `norm-extract-text` solo procesa PDFs directos. Tratamiento alternativo: descargar localmente, unzip, re-upload PDF → OCR. Script separado.

---

## 5. Ideas / oportunidades nuevas

1. **Auto-relleno de `norma_fundamento` retroactivo**: un script que tome cada obligation sin fundamento + semantic search contra `normative_articles` → sugiere fundamento con `confidence`. UI con chip "sugerido — confirmar".

2. **Compliance Matrix como widget exportable**: PDF con las 50 alertas de la org, agrupadas por EDI, para compartir con autoridades o gerencia. Usa la vista directamente.

3. **Badge de fuente en la respuesta textual del bot**: el bot ya sabe si citó un documento propio (REGLA 18) pero la UI solo lo marca en las sources. Resaltar los markers `[cita a documento propio]` en el texto también.

4. **INTAKE "modo rápido"**: para docs cortos (oficio 1-2 páginas), skipear `analyze-document` (Claude Sonnet) y solo usar `multi-format-extractor` + `embed-text`. Menos costoso, resultado funcional en segundos.

---

## 6. Próximos pasos priorizados

| # | Tarea | Tiempo | Impacto |
|---|---|---|---|
| 1 | Recargar créditos Anthropic → ejecutar `retry_minambiente_ocr.py` | 15 min | Medio (17 normas MinAmbiente) |
| 2 | Mapear `fuente.numero/articulo` a `norma_fundamento` en saveToSupabase | 20 min | **Alto** — activa FUNDAMENTO_DEROGADO real |
| 3 | Script auto-llenar `norma_fundamento` retroactivo (77 obligations) | 1h | Alto |
| 4 | Export PDF del Compliance Matrix | 2h | Alto comercial |
| 5 | Fix `confidencial` → `confidencial_empresarial` en scripts | 10 min | Bajo |
| 6 | INTAKE "modo rápido" para oficios cortos | 1h | Medio-Alto |

---

## 7. Referencias

- Handoff anterior: `VIGIA_HANDOFF_2026-04-15_v398_continuacion.md`.
- Commits del sprint: `2734515` (test e2e), `71f1e77` (v3.9.11 UI), `849dbb7` (v3.9.12 compliance matrix).
- Último push: `849dbb7` v3.9.12 ACTIVE en origin/main.
- Edge functions deployadas: 8 ACTIVE (sin cambios de deploy en este sprint).
