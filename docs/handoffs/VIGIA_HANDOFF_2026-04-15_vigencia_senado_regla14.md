# VIGÍA — Handoff 2026-04-15 (madrugada): Scraper Senado vigencia + REGLA 14 chat-bot

Archivo: `VIGIA_HANDOFF_2026-04-15_vigencia_senado_regla14.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-15 madrugada tras sesión extendida |
| Commits del bloque | `d484c64` vigencia end-to-end, `19d1c64` recon, `68290ce` sentencias RedJust |
| Versión producto | **v3.9.4** |
| Edge functions deploy | chat-bot v8, norm-search v3, norm-ingest v4 (todos ACTIVE) |
| Build | 313.34 kB / 87.86 KB gzip |
| Último push origin/main | `d484c64` |

---

## 2. TAREA 1+2 — Scraper Senado basedoc (completado)

### Migración schema
```sql
ALTER TABLE normative_articles
  ADD vigencia_status text DEFAULT 'sin_informacion'
    CHECK (IN ('vigente','derogado','modificado','sin_informacion')),
  ADD derogado_por text, ADD modificado_por text,
  ADD vigencia_updated_at timestamptz;
ALTER TABLE normative_sources
  ADD vigencia_global text DEFAULT 'sin_informacion'
    CHECK (IN ('vigente','derogada_total','derogada_parcial','sin_informacion')),
  ADD vigencia_source text;
```

RPC `match_normative_articles` re-creado (DROP + CREATE por signature change) para retornar los 4 campos nuevos de vigencia.

### Scraper scrape_senado_to_vigencia.py

**Flujo**:
1. Para cada ley en `normative_sources`: construye URL `ley_NNNN_YYYY.html` (zero-padded).
2. Fetch HTML iso-8859-1 + `html.unescape` entities.
3. Split por `ART[ÍI]CULO N` → chunks.
4. Primeras 1200 chars de cada artículo → regex `derogad`/`modificad` + extrae norma fuente.
5. UPDATE `normative_articles.vigencia_status` (y `derogado_por`/`modificado_por`).
6. Deriva `vigencia_global` para la norma entera (vigente / derogada_parcial / derogada_total).
7. UPDATE `normative_sources.vigencia_global`.

**Resultado real** (196 leyes procesadas):
- **181 fetched** (92%)
- **15 no encontradas** en basedoc (`404`) — leyes más antiguas (1989-era) o números discontinuados
- **3 parse_errors** (ningún artículo parseable)
- **2.802 artículos** con vigencia actualizada
- **178 sources** con vigencia_global

**Distribución vigencia_global**:
| Status | Conteo |
|---|---|
| vigente | 148 |
| derogada_parcial | 28 |
| derogada_total | 2 |
| sin_informacion | 18 (no encontradas + no leyes) |

**Distribución vigencia_status por artículo**:
| Status | Conteo |
|---|---|
| vigente | 2.564 |
| modificado | 177 |
| derogado | 61 |
| sin_informacion | 11.330 (decretos/resoluciones — fuera de scope del scraper Senado) |

**Limitación**: basedoc cubre SOLO leyes nacionales. Decretos y resoluciones quedan con `sin_informacion` (~11.300 artículos ~= 80% del corpus). Fuente complementaria para ellos: SISJUR (ver T3).

---

## 3. TAREA 3 — SISJUR mapeo (hallazgo negativo)

**Objetivo**: construir mapping `slug → sisjur_id` para consultas posteriores.

**Ejecución**: 80 normas prioritarias × `consulta_avanzada.jsp?tipodoc=X&nrodoc=N&ano1=Y&ano2=Y`.

**Hallazgo crítico**: el GET simple a `consulta_avanzada.jsp` **NO retorna resultados específicos**. Todos los 77 "matches" caen en `i=9035` que es el menú genérico "Códigos y Estatutos", no las normas.

**Causa**: la búsqueda avanzada de SISJUR requiere POST con `JSESSIONID` cookie, o scraping con navegador real (Selenium/Playwright) porque el frontend construye la query via JavaScript.

**Decisión**: documentar como bloqueado por limitación técnica. Intento futuro:
- Opción A: Playwright headless (overhead grande).
- Opción B: descubrir endpoint POST directo (inspección DevTools en browser real).
- Opción C: construir mapping slug→ID manualmente para las ~20 normas top (ley 99, decreto 1076, etc.) — aprox 1 hora de trabajo humano.

**Real matches en corpus actual**: los 4 IDs confirmados por inspección manual previa son `Ley 99/1993 i=297`, `Decreto 1076/2015 i=62510`, `Decreto-Ley 2811/1974 i=1551`, `Ley 1333/2009 i=38247`. Estos están hardcoded en `recon_sisjur_senado.py::SISJUR_KNOWN_IDS`.

---

## 4. TAREA 4 — REGLA 14 chat-bot (completado)

### Cambios

**norm-search v3**: expone en results los 4 campos de vigencia del RPC.

**chat-bot v8**: `buildContextFromResults` ahora inyecta marcador explícito antes del body de cada fragmento:
- `[VIGENCIA: DEROGADO por <ley 1333/2009>]`
- `[VIGENCIA: MODIFICADO por <decreto 1076/2015>]`
- `[VIGENCIA: NORMA GLOBALMENTE DEROGADA]`
- `[VIGENCIA: vigente (la norma padre tiene artículos derogados pero este no)]`

**REGLA 14 agregada** al system prompt:
- Si DEROGADO: no citar como vigente; si se pregunta específicamente por ese artículo, responder "El [cita] fue DEROGADO por <norma>. El texto que sigue es histórico, ya no aplica."
- Si MODIFICADO: advertir al usuario que el texto recuperado puede no ser la versión vigente.
- Si NORMA GLOBALMENTE DEROGADA: tratar como histórica.
- Regla marcada como **ABSOLUTA** porque citar derogada como vigente es error grave de compliance.

Deployed via MCP `claude-sonnet-4-5`. Chat-bot queda en **v8 ACTIVE**.

---

## 5. Corpus actualizado (cierre de madrugada)

| Métrica | Valor | Δ vs inicio de hoy |
|---|---|---|
| `normative_sources` | 352 | +0 |
| `normative_sources` con vigencia | **178** | **+178** (nueva columna) |
| `normative_articles` | 14.132 | +0 |
| `normative_articles` con vigencia | **2.802** | **+2.802** |
| `jurisprudence_sources` | 147 | +0 |
| `jurisprudence_articles` | 479 | +0 |
| Edge functions deployadas | chat-bot v8, norm-search v3, norm-ingest v4 | — |

---

## 6. Roadmap actualizado

### Completado en esta jornada nocturna
- ✅ Fase 1-5 resolución de 20 gaps (12 resueltos, 8 documentados)
- ✅ Red Justicia Ambiental: 32 leyes + 27 sentencias nuevas
- ✅ Recon SISJUR + Senado + comparativa vigencia
- ✅ **Scraper Senado + REGLA 14** (feature crítico de compliance desbloqueado)
- ✅ v3.9.4 bumpeada

### Pendiente corto plazo (próximas 1-3 sesiones)

1. **SISJUR scraper con Playwright** (para obtener vigencia de decretos/resoluciones). Podría usar Selenium remoto o Browserless.io (~$10-20/mes).
2. **OCR 4 resoluciones pendientes** (Res 631/2015, 2086/2010, 108/2015, 762/2022): requiere ANTHROPIC_API_KEY local para split páginas y evitar timeout edge.
3. **Directiva Pres 10/2013** SSL legacy: ejecutar en entorno Linux con OpenSSL 1.1.1+.
4. **STC-3872/2020 Corte Suprema**: búsqueda manual en `cortesuprema.gov.co/relatoria`.

### Pendiente mediano plazo

5. **Fase 2D-jur-htm** — 6 sentencias Red Justicia 2014 (HTML corteconstitucional). Ya procesadas en T bloque previo ✅.
6. **Monitoreo de cambios** con fingerprints SHA-256 SUIN — ya existen.
7. **Dashboard cobertura normativa** en SuperAdmin: % con vigencia conocida, % con embedding, % con concordancias.
8. **Demo real SuperAdmin** (reemplazo Setup Demo eliminado en v3.9.2).

### Pendiente largo plazo

9. **Alertas automáticas de derogatoria**: cron re-scrape Senado semanal → si detecta cambio de vigencia en una norma con obligaciones activas, generar `regulatory_alerts`.
10. **Visualización grafo de concordances** (2.928 links) en frontend.
11. **Exportación libro blanco por sector**.

---

## 7. Ideas y oportunidades identificadas (nuevas)

1. **REGLA 14 es el diferenciador competitivo clave**. Ningún chatbot legal colombiano que conozca esté haciendo esta distinción explícita por artículo. Es dinamita para la propuesta comercial.

2. **Scraper Senado es incremental**: re-ejecutarlo mensualmente actualiza la base de vigencia sin costo (fetch only). Cron semanal también viable.

3. **Cobertura de vigencia baja en decretos (sin_info 11.330 arts)**: el Decreto 1076/2015 **ya fue scrapeado por SISJUR previamente** con 9 derog + 86 modif. Si resolvemos el problema SISJUR Playwright, ganamos 80% del corpus de golpe.

4. **Campo vigencia_global en UI**: en el módulo Normativa mostrar badge rojo "Derogada total" / amarillo "Derogada parcial" / verde "Vigente" al lado de cada norma. Cambio de ~20 líneas en App.jsx.

5. **Filtro vigencia en búsqueda RAG**: agregar filter opcional `filter_vigencia = ['vigente']` al RPC para que el usuario pueda preguntar "solo normas vigentes". Útil para reports regulatorios.

6. **Eureka de concordances + vigencia**: los 2.928 concordances links tienen referencias a normas que ahora pueden tener `derogada_total`. Query útil: `SELECT concordances donde to_norm está derogada_total AND from_norm está vigente` → detecta referencias rotas en el grafo editorial.

7. **Product feature: "Audit de vigencia"** por cliente: analizar las obligaciones activas en `obligations` y señalar cuáles derivan de normas con artículos derogados. Valor directo para el cliente enterprise.

---

## 8. Próximos pasos recomendados (priorizados)

1. **[HIGH]** UI badge vigencia en módulo Normativa (1-2 horas, alto impacto visible).
2. **[HIGH]** Filtro `filter_vigencia` en RPC + norm-search + UI (chip "Solo vigentes" en Consultar).
3. **[MED]** Feature audit de vigencia para obligaciones (cruce con `obligations` por `norm_id`).
4. **[MED]** Playwright setup para SISJUR → cubrir vigencia de decretos.
5. **[LOW]** Cron semanal de re-scrape Senado para tracking de derogatorias.

---

## 9. Referencias

- Scripts nuevos: `scrape_senado_to_vigencia.py`, `build_sisjur_id_map.py`.
- Reports: `scrape_senado_vigencia_report.json`, `sisjur_id_map.json`.
- Edge functions modificadas: `chat-bot`, `norm-search`.
- Migración: `add_vigencia_columns`, `match_articles_with_vigencia_v2`.
- Handoff anterior: `VIGIA_HANDOFF_2026-04-14_sisjur_senado_red_justicia.md`.
