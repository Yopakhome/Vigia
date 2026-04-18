# VIGÍA — HANDOFF · 17 abril 2026 · v3.15.5 Cierre H0

## 0. Qué es este handoff

Cierre del Horizonte 0 del roadmap v3. v3.15.4 → v3.15.5 con fixes técnicos + manual usuario regenerado + script generador ReportLab en repo.

Sesión ejecutada por Claude Code + Javier en una jornada. 4 tareas principales: fix SA-DEUDA-7-REV (parser literal), diagnóstico + fix Capa 1 ANLA, manual v1.1, script generador PDF.

---

## 1. Estado producción

| Campo | Valor |
|---|---|
| Versión | **v3.15.5** |
| Commit | dd33018 |
| Build | index-418e8970.js · 496.90 KB · gzip 133.75 KB |
| URL prod | https://vigia-five.vercel.app |
| Repo | https://github.com/Yopakhome/Vigia (main, push directo) |
| Supabase | `itkbujkqjesuntgdkubt` (São Paulo) |
| JWTs en bundle | 0 verificados |
| Deploy | auto-deploy Vercel ~2 min post-push |

---

## 2. Cambios técnicos v3.15.4 → v3.15.5

### Edge functions

**`supabase/functions/norm-ingest/index.ts`** — v11 → **v12**

- **SA-DEUDA-7-REV**: parser captura `ARTÍCULO PRIMERO..DUODÉCIMO + ÚNICO`.
- Numeración literal convertida a `article_number` numérico (`"PRIMERO"` → `"1"`).
- `article_label` preserva forma original (`"ARTÍCULO PRIMERO"`).
- Nuevo helper `parseArticleNumber()` + tabla `LETRA_A_NUM`.
- Regex extendido con alternativa `NUM_LETRA` vs `\d{1,4}`.
- Limpieza cosmética: `ART[ÍÍII]CULO` → `ART[ÍI]CULO`.
- Skip + `console.warn` si parser no puede extraer número (no rompe índice).
- Validado: 7 positive tests + 3 negative tests (antes del deploy).

**`supabase/functions/resolve-norma-url/index.ts`** — v3 → **v5** (2 iteraciones)

- **SA-DEUDA-10**: refactor Capa 1 de HTML scraping a RSS feed. El HTML de `/eureka/normativa/{section}` es shell Joomla que hidrata client-side y no contiene items; el feed `?format=feed&type=rss` sí trae data.
- **SA-DEUDA-11**: `DECRETO_LEY` agregado a `tipoPlural` (ANLA los clasifica en `/leyes/`).
- Normalización tipo input: `.toUpperCase().trim().replace(/[\s-]+/g, "_")`.
- Regex permite zeros-leading en slug (`resolucion-0126-de-2024` matchea num=126).

### Corpus

**Res 610/2010** (`id=2394352c-0cb4-4761-8a90-33d11bbc55d3`):

- 0 → **7 artículos** high quality (promedio 3,084 chars)
- 7 embeddings generados: `text-embedding-3-small`, 5,683 tokens, **$0.000114**
- Método: parser local + INSERT+UPDATE directo vía `service_key` (edge `norm-ingest` dedup bloqueaba re-ingesta, ver DEUDA-TEC-1)

### Radar URL resolution — backfill Capa 1

Distribución actual (142 items `url_resolved_at IS NOT NULL`):

| Source | Antes H0 | Después H0 | Δ |
|---|---|---|---|
| `corpus_eureka_metadata` | 18 | 18 | 0 |
| `corpus_fase1c` | 4 | 4 | 0 |
| `corpus_sprint_a_corpus` | 1 | 1 | 0 |
| `secretariasenado` | 10 | 10 | 0 |
| `anla_eureka` | 0 | **1** | **+1** |
| `google_suin` | 109 | 108 | −1 |

Backfill bajo: el RSS de ANLA sirve **~60 items curados totales** (20 por sección), intersección mínima con el histórico del Radar (normas 1950s-2020s). El fix es importante para **normas futuras** detectadas por el Radar que coincidan con la selección curada de ANLA Eureka.

### Documentación

- `docs/VIGIA_Manual_Usuario_v1.1.pdf` — **19 páginas**, 52 KB
  - Secciones nuevas: **14 Radar Normativo**, **15 Onboarding**
  - Renumeración: secciones 14-19 del v1.0 → 16-21 en v1.1
  - Soporte (sección 13) ya estaba en v1.0 — no se duplicó
- `docs/VIGIA_Manual_Usuario_v1.1_source.md` — source markdown versionable
- `docs/archive/VIGIA_Manual_Usuario_v1.0.pdf` — versión previa archivada para referencia de estilo
- `scripts/generate_manual_pdf.py` — generador ReportLab reusable (~370 líneas)
  - Parser markdown minimal (headings, tablas, listas, callouts, bold)
  - Estilo coherente con v1.0: Helvetica, cajas header por sección (teal/navy/blue/purple/orange/darkslate), cover custom, header+footer con numeración

---

## 3. Deudas resueltas en H0

| # | Deuda | Resolución |
|---|---|---|
| **SA-DEUDA-7** *(original)* | CERRADA | Diagnosticada incorrectamente en brief histórico del 14 abril. El regex actual ya tenía flag `gi` y normalización NBSP. No-op. |
| **SA-DEUDA-7-REV** | CERRADA | Fix literal PRIMERO..DUODÉCIMO + ÚNICO. Res 610/2010 re-ingestada: 7 arts high quality + 7 embeddings. |
| **SA-DEUDA-10** | CERRADA | Capa 1 refactoreada de HTML scraping a RSS feed. Edge v3 → v5. |
| **SA-DEUDA-11** | CERRADA | DECRETO_LEY mapeado a `/leyes/` + normalización del input. |

---

## 4. Deudas nuevas identificadas (no cierran en H0)

| # | Deuda | Scope | Notas |
|---|---|---|---|
| **SA-DEUDA-8** | OCR fallback en `norm-extract-text` | Post-M1 | Caso detectado: Res 1517/2012 (PDF scan, `pdftotext` extrae 4 bytes). Plan: detectar `raw_text < 500 chars` y derivar a Claude Vision Sonnet (~$0.05/PDF). Postergada por decisión estratégica. |
| **SA-DEUDA-9** | Regex `[°º\.\s]` no matchea `:` tras número | Baja prioridad | Footprint desconocido. Observado teóricamente en test mental, no en casos reales. |
| **SA-DEUDA-12** | RSS ANLA cobertura curada | M2+ | RSS sirve solo ~60 items curados (20 por sección). Evaluar APIs ANLA alternativas o scraping de HTML hidratado con headless browser si el gap sigue problemático. |
| **DEUDA-TEC-1** | `norm-ingest` dedup + INSERT bloquea re-ingesta | M2 si aplica | Patrón usado para Res 610/2010: parser local + INSERT+UPDATE directo vía `service_key`. Evaluar flag `force_reparse` en edge si >10 re-ingestas necesarias. |

---

## 5. Aprendizajes metodológicos del día

**Principio N°30 (Hipótesis ≠ hecho)** se aplicó DOS veces hoy:

**(a)** En la consolidación de la mañana escribí *"Capa 1 no es bug, es diseño correcto — Capa 0 captura todos los items ANLA"*. Claude Code lo refutó empíricamente con 3 fetchs directos al endpoint ANLA: el HTML devuelto es shell Joomla estático sin items hidratados, el regex nunca podía matchear. Capa 1 **sí tenía bug real**.

**(b)** Estimé el impacto del fix Capa 1 en **15-25%** del universo google_suin. Tras el bulk lookup local contra el RSS real: impacto real **0.9%** (1 de 109). Error: **~20×** por no validar con muestra antes de comprometer números. El RSS sirve ~60 items curados, la intersección con el histórico del Radar es minúscula.

**Propuesta de extensión del Principio N°30 para roadmap v3.1**:

> *"Hipótesis ≠ hecho — aplica tanto a diagnósticos causales como a estimaciones numéricas. Siempre validar con muestra empírica (aunque sea N=5) antes de comprometer números a roadmap o de inferir causa desde un commit message o handoff histórico."*

---

## 6. Lo que queda pendiente de H0 (acción manual de Javier)

- [ ] Rotar `SUPABASE_SERVICE_ROLE_KEY` — Dashboard → Settings → API → Reset
- [ ] Rotar `CRON_SECRET` + actualizar header del cron job (`task-runner-every-5min`)
- [ ] Activar HIBP password protection — Authentication → Password Protection
- [ ] Validar Radar manualmente con cuenta `jrestrepo@enaraconsulting.com.co` (12 puntos del plan de aceptación)
- [ ] Verificar PDF v1.1 en Preview y dar luz verde al reemplazo del v1.0 en cadena de distribución externa

---

## 7. Próxima sesión

**H1 — Milestone 1: Fundación del Cerebro Vivo**

Primer sprint: **M1.3 = Sprint 5c (ingesta automática encadenada)**.

Flujo objetivo: norma nueva detectada por Radar + no presente en corpus →
`norm-download` → `norm-extract-text` (con OCR fallback cuando `SA-DEUDA-8` se cierre) →
`norm-embed` → `UPDATE detected_items.promoted_to_source_id`.

No empezar sin brief dedicado de Javier.

---

## 8. Métricas SQL (17 abril 2026, 12:45 UTC)

### Corpus

| Tabla | Filas | Notas |
|---|---|---|
| `normative_sources` | 365 | — |
| `normative_articles` | **14,213** (+7 vs v3.15.4) | 100% embedded |
| `jurisprudence_sources` | 147 | — |
| `jurisprudence_articles` | 479 | 100% embedded |

### Operativo

| Tabla | Filas |
|---|---|
| `organizations` | 8 |
| `user_org_map` | 26 |
| `instruments` (EDIs) | 27 |
| `obligations` | 88 |

### Radar

| Tabla | Filas |
|---|---|
| `detected_items` | 500 |
| `detected_items` classified | 160 |
| `detected_items` promoted_to_source | 23 |
| `task_queue` completed | 1,796 |

### Embeddings

| Métrica | Valor |
|---|---|
| `normative_articles` embedded | 14,213 / 14,213 (100%) |
| `jurisprudence_articles` embedded | 479 / 479 (100%) |

---

## 9. Edge functions activas (24, todas `verify_jwt: false`)

Cambios en esta sesión:
- `norm-ingest` v11 → **v12**
- `resolve-norma-url` v3 → **v5**

Resto sin cambios. Regla permanente: todas las edges deploy con `verify_jwt: false` por migración ES256 de Supabase; validación JWT manual interna via `auth/v1/user` con anon key.

---

*Generado por Claude Opus 4.7 (1M context) en colaboración con Javier · 17 abril 2026*
