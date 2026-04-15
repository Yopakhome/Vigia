# VIGÍA — Handoff cierre día 2026-04-14 (completo)

Archivo: `VIGIA_HANDOFF_2026-04-14_cierre_dia_completo.md` | También disponible como: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-14 cierre nocturno (`America/Bogota`) |
| Fase actual | **Sprint A2 Fases 1A, 1B, 2A, 2B, 2D-* (todas), 2D-jur, 2D-jur-pdfs, 1C ingesta — CERRADAS**. Corpus ampliado con 115 sentencias Corte Constitucional + 4 sentencias no-CC con PDF + 23 docs Fase 1C. |
| Versión del producto | **v3.9.2** (eliminación de Setup Demo de SuperAdminModule, rediseñar como demo real en sprint futuro) |
| Último commit pusheado a origin/main | `a274809` feat(eureka): Fase 1C ingesta 23/33 docs + 4/5 sentencias non-CC |
| Commits del día 2026-04-14 (sesión continuada) | `247ed7c` Fase 1B → `2cd085d` v3.8.0 seed → `476310c` Fase 2A → `e06985d` Fase 2B → `e5aca67` v3.9.0 SUIN → `60de4c8` bump → `50d6d43` inline-anla → `03b3e0a` v3.9.1 REGLA 13 → `9f6f674` minambiente-pdf → `8650ba4` minambiente-html+sisjur → `abaf2a2` corpus_gaps → `c96da35` 2D-other → **`4f44619` v3.9.2 Setup Demo OFF → `d48ff0e` pending_research → `3fc60a0` 2D-jur + 1C recon → `a274809` Fase 1C ingesta + jur no-CC** |
| Edge function deploy | chat-bot v7 ACTIVE (REGLA 13 ENARA Consulting LIVE) |
| Repo GitHub | `Yopakhome/Vigia`, branch `main` |
| Proyecto Supabase | `itkbujkqjesuntgdkubt` (São Paulo, plan Free) |
| MCP Supabase | ✅ conectado |
| Deploy producción | https://vigia-five.vercel.app |
| Responsable humano | Javier E. Restrepo V. |
| Brief anterior | `VIGIA_HANDOFF_2026-04-14_sprint_a2_fase_2d_completo_cierre.md` |
| Autor | Claude Opus 4.6 (VIGÍA-03) |

---

## 2. Resumen ejecutivo del día

Sesión de cierre mayor para corpus EUREKA. El día comenzó en **cierre Fase 2D-completo** (outliers + funcionpublica + corpus_gaps.json) y escaló a **5 cierres adicionales** sin pausa:

1. **v3.9.2** — Setup Demo eliminado de SuperAdminModule. El botón no reflejaba la lógica real del producto y confundía a clientes demo. Se reservará para un rediseño futuro con datos coherentes con la universe_v2.
2. **`pending_research` en corpus_gaps.json** — registrados 3 PNDs (2014-2018, 2018-2022, 2022-2026) + filtro temático de 8 dimensiones (recursos naturales, contaminación, licenciamiento, sectores, cambio climático, ordenamiento, institucional, salud-ambiente). Sirve como roadmap explícito para próximos sprints de cobertura normativa.
3. **Fase 2D-jur** — nueva tabla `jurisprudence_articles` (FK `jur_id → jurisprudence_sources`, vector 1536, ivfflat, RLS `authenticated=true`). Scraper de Corte Constitucional procesó **115/115 sentencias** de `www.corteconstitucional.gov.co` + SUIN con split semántico (preámbulo + antecedentes + considerandos + decisión). **392 chunks con embedding**. Un subset de 40 docs falló por timeout la primera pasada; retry con timeout 180s y 2 reintentos recuperó el 100%.
4. **Fase 1C recon** — catálogo de 4 categorías EUREKA adicionales (Procedimientos=3, Manuales=5, Conceptos Jurídicos=7, Documentos Estratégicos=18, total 33 docs). Excluidas `especies-en-riesgo` y `gestion-del-conocimiento` por decisión del PO.
5. **Fase 1C ingesta** — script `ingest_fase1c_to_articles.py` procesa los 33 docs con patrón fetch-detail → inline PDF → pypdf → regex artículos | fallback → embed + INSERT. **23/33 ingestados** (8 gaps por ausencia de inline PDF que requieren link a minambiente/DNP, 2 gaps por PDF scan sin OCR). 77 chunks con embedding, costo $0.0052.
6. **Fase 2D-jur-pdfs** — script `ingest_jurisprudence_pdfs_to_articles.py` para las 4 sentencias no-CC viables: 2 Consejo de Estado con PDF inline ANLA, 1 Tribunal Superior Medellín (Río Cauca/Hidroituango), 1 Corte Suprema (Amazonía sujeto de derechos) con PDF en sinchi.org.co. **10 chunks**, 0 errores. STC-3872/2020 queda pendiente (URL es nota de prensa, no la sentencia).

**Migración de schema aplicada hoy**: (a) tabla `jurisprudence_articles` nueva, (b) extensión del `CHECK` en `normative_sources.corpus_source` para aceptar `'fase1c'`.

**Corpus en Supabase al cierre del día**:
| Tabla | Conteo | Notas |
|---|---|---|
| `normative_sources` | **311** | 18 Sprint A + 270 EUREKA + 23 Fase 1C |
| `normative_articles` (con embedding) | **11.742** | +377 vs ayer (23 fase1c + outliers/funcionpublica) |
| `jurisprudence_sources` | 120 | sin cambios en conteo |
| `jurisprudence_articles` (nueva tabla) | **402** | 392 Corte Constitucional + 10 no-CC |
| `eureka_sources_metadata` | 390 | sin cambios |
| `concordances` | 2.928 | 2.366 resolved (80.8%) |
| Cobertura jurisprudencia con artículos | **119/120 (99%)** | solo falta STC-3872/2020 (nota de prensa) |

**Costo OpenAI acumulado del día**: ~$0.046 (Fase 2D-jur $0.0375 + retry $0.0129 + 1C ingesta $0.0052 + jur-pdfs $0.0010). Total día < 5 centavos.

**Tiempo total del día**: ~30 min de ejecución efectiva (scripts), múltiples horas de diseño/recon/fix.

---

## 3. Cambios aplicados a la DB hoy

### Migración: `jurisprudence_articles`
```sql
CREATE TABLE jurisprudence_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jur_id uuid NOT NULL REFERENCES jurisprudence_sources(id) ON DELETE CASCADE,
  section_key text,          -- 'preambulo' | 'antecedentes' | 'considerandos' | 'decision' | 'otros' | 'documento_completo'
  section_label text,        -- etiqueta legible
  title text,
  content text NOT NULL,
  content_tokens integer,
  order_index integer NOT NULL,
  embedding_model text,
  embedding_generated_at timestamptz,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON jurisprudence_articles(jur_id);
CREATE INDEX ON jurisprudence_articles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
ALTER TABLE jurisprudence_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY jurisprudence_articles_select_auth
  ON jurisprudence_articles FOR SELECT TO authenticated USING (true);
```

**Decisión de diseño**: se creó tabla hermana en vez de adaptar `normative_articles` porque el FK `norm_id → normative_sources` no acepta jurisprudence_sources.id. Mantener dos tablas hermanas es más limpio que flexibilizar la FK.

### Migración: extensión `corpus_source` check
```sql
ALTER TABLE normative_sources DROP CONSTRAINT normative_sources_corpus_source_check;
ALTER TABLE normative_sources ADD CONSTRAINT normative_sources_corpus_source_check
  CHECK (corpus_source = ANY (ARRAY['sprint_a_corpus','eureka_metadata','fase1c']));
```

---

## 4. Scripts nuevos creados hoy

| Archivo | Propósito | LOC |
|---|---|---|
| `scripts/eureka/ingest_jurisprudence_to_articles.py` | Scraper Corte Constitucional/SUIN + split semántico + embed + INSERT `jurisprudence_articles` | ~270 |
| `scripts/eureka/recon_fase1c.py` | Recon de 4 categorías EUREKA pendientes (NO ingesta, solo catálogo) | ~180 |
| `scripts/eureka/ingest_fase1c_to_articles.py` | Fetch detail → inline PDF → pypdf → embed + INSERT `normative_sources`/`normative_articles` con `corpus_source='fase1c'` | ~290 |
| `scripts/eureka/ingest_jurisprudence_pdfs_to_articles.py` | PDF directo → split semántico + INSERT `jurisprudence_articles` (4 sentencias no-CC) | ~220 |

Todos siguen el patrón **Opción C** (embedding inline, sin pasada UPDATE separada) ya probado en SUIN/inline-anla/minambiente/sisjur.

---

## 5. Estado de `corpus_gaps.json`

Ahora con 5 secciones estructuradas (antes 1). Ubicación: `scripts/eureka/corpus_gaps.json`.

1. **`gaps`** (7 entradas) — docs individuales pendientes: 5 scan_no_ocr, 1 no_url, 1 ssl_obsoleto.
2. **`fase1c_ingesta_gaps`** (NUEVO hoy) — 10 docs Fase 1C no procesados: 8 sin inline PDF, 2 scan sin OCR.
3. **`jurisprudence_non_corte`** (ACTUALIZADO) — 4/5 ingestadas hoy, 1 pendiente (STC-3872/2020 nota de prensa).
4. **`fase1c_recon`** (NUEVO hoy) — catálogo de las 4 categorías EUREKA (33 items) aunque haya ingesta parcial.
5. **`pending_research`** (NUEVO hoy) — 3 PNDs explícitos + **`filtro_tematico_pnd`** con 8 dimensiones y keywords por dimensión.

**Total ítems trackeados como gaps o pendientes**: ~30 docs + 3 PNDs completos + 1 filtro temático.

---

## 6. Deudas técnicas al cierre

### Nuevas hoy
- **SA-DEUDA-11** (ingesta jurisprudence): Los 40 timeouts del primer run de Fase 2D-jur indican que `www.corteconstitucional.gov.co` tiene latencia variable. El retry con timeout 180s + 2 reintentos funcionó, pero el código del scraper puede simplificarse usando siempre el patrón de retries desde el primer intento en vez de una fase de recuperación posterior. **Impacto**: bajo, cosmético.
- **SA-DEUDA-12** (Fase 1C — 8 docs sin inline PDF): La estrategia actual solo sigue inline PDFs de ANLA. Los 8 docs fallidos (5 CONPES + 1 manual multas + 1 plan DRMI + 1 formato) redirigen a minambiente/DNP. Necesita lógica de seguir `external_official` del recon. **Impacto**: medio, 8 docs faltantes.
- **SA-DEUDA-13** (2 conceptos jurídicos ANLA con scan sin OCR): PDFs de 4-6 páginas con <10 chars extraíbles. Patrón de OCR Sprint A (scripts/ocr_scans_via_edge.py) ya probado. Costo ~$0.04 total. **Impacto**: medio, afecta queries sobre interpretación de medidas preventivas.

### Pendientes anteriores (sin cambios)
- **SA-DEUDA-7** (regex `/i` en norm-ingest TypeScript edge): persiste. Scraper Python ya aplica fix local. Cerrar en Fase 2C.
- **Gaps OCR scan** (5 docs críticos): Res 631/2015 vertimientos, Res 2086/2010 tasación multas, Res 108/2015 formato licencia, Res 827/2018 sistema clasificación sancionatorio, Res 762/2022 fuentes móviles. Todos con `prioridad: alta`.
- **Directiva Presidencial 10/2013 SSL legacy** (cancilleria.gov.co): requiere workaround técnico aislado o fuente alternativa SUIN/FunciónPública.
- **Decreto 43/2024**: skip definitivo (EUREKA sin URL, buscar manualmente en SUIN si usuario pregunta).
- **HIBP password protection**: requiere activación manual en Supabase Dashboard Auth.

---

## 7. Ideas y oportunidades identificadas

*(Esta es la sección solicitada por el PO. Categoriza por horizonte.)*

### A. Cortas — próximas 1-2 sesiones

1. **Resolver los 10 gaps de Fase 1C** ($0.05 + 30 min).
   - 8 docs: adaptar scraper para seguir `external_official` del recon (ya clasificado).
   - 2 docs: OCR Claude vision (pattern Sprint A ya probado).
   - Payoff: llevar Fase 1C de 70% a 100% cobertura, 10 docs adicionales (la mayoría son políticas nacionales y CONPES de alta relevancia).

2. **Resolver los 5 gaps OCR críticos** (~$0.50 + 2 horas).
   - Res 631/2015 (vertimientos — norma estrella de corpus), Res 2086/2010 (tasación multas), Res 108/2015 (formato licencia), Res 827/2018 (clasificación sancionatoria), Res 762/2022 (fuentes móviles).
   - Payoff: desbloquea queries críticas del bot. Sin estas, preguntas sobre límites de vertimiento o cálculo de multas no tienen respuesta recuperable.

3. **Fase 2D-jur-nota-de-prensa** (1 sentencia, $0 en OpenAI).
   - STC-3872/2020 (Parque Isla Salamanca sujeto de derechos). Buscar PDF original en `ramajudicial.gov.co` o `cortesuprema.gov.co/relatoria`. Manual pero trivial.

### B. Medianas — próximo Sprint (A2 Fase 2C)

4. **Chat-bot RAG con corpus ampliado** (core del próximo sprint).
   - Hoy el chat-bot consulta principalmente `normative_articles` (11.742 con embedding) pero **ignora el grafo de concordances y las 402 sentencias de jurisprudence_articles**.
   - Propuesta: extender la edge function para (a) hacer similarity search sobre ambas tablas en paralelo, (b) usar `concordances` para "contexto adyacente" (cuando una norma es recuperada, pre-cargar las 5 concordancias con mayor score), (c) distinguir tipo de fuente en la cita (norma vs sentencia).
   - Requiere briefing propio pero ya está todo lo necesario en DB.

5. **Filtros temáticos de 8 dimensiones en UI** (ya modelados en corpus_gaps).
   - El usuario del bot podría filtrar queries por dimensión (ej: solo D4 sectores × D5 cambio climático). Las 8 dimensiones están explicitadas en `filtro_tematico_pnd`.
   - Requiere etiquetar cada `normative_sources` con dimensiones aplicables. **Sugerencia técnica**: batch classification LLM offline (una pasada Claude Haiku 4.5 sobre los 311 docs, ~$0.30, marca array `domain` que ya existe en el schema).

6. **Resolución del 19% unresolved de concordances** (562/2928).
   - Apuntan a docs fuera del corpus EUREKA. Si se ingestan los PNDs + 10 Fase 1C + gaps OCR, varios se resolverán automáticamente. Los restantes son realmente externos.

### C. Largas — Sprint B y más allá

7. **Fase 3 — monitoreo de cambios en EUREKA y SUIN** (ya hay fingerprints SHA-256 del scraper SUIN en `suin_scrape_fingerprints.json`).
   - Cron job semanal que re-scrapea las 239 normas SUIN y detecta diff en texto. Genera alerta si una norma fue modificada/derogada. **Valor de mercado**: el producto pasa de "corpus estático" a "vigilancia normativa continua".

8. **Demo real para SuperAdmin** (reemplaza el Setup Demo que se eliminó hoy).
   - En vez de un botón genérico, crear un flujo guiado: "¿Quieres ver VIGÍA con datos? Vamos a crear una org demo coherente: eliges sector (minero/energía/obras), generamos 3 EDIs realistas con obligaciones y alertas de muestra". Usar la `universe_v2` del 2026-04-13 como plantilla.

9. **Planes Nacionales de Desarrollo (3 PNDs)** (pending_research).
   - Aplicar el filtro de 8 dimensiones para extraer SOLO artículos ambientales. Los PNDs son textos largos con mayormente material no-ambiental. Payoff alto para usuarios sector minero/energía/infraestructura que necesitan saber qué obligaciones del PND les aplican.

10. **Grafo visual de concordances** (2.928 links).
    - Hoy vive como tabla. Un componente de frontend que muestre el grafo (D3 o vis-network) permite al usuario explorar: "la Ley 99/1993 tiene 169 referencias entrantes, mostrarme cuáles". Es un feature premium natural para el tier enterprise.

11. **Exportación del corpus como "libro blanco" por sector** (producto derivado).
    - Los 390 resúmenes curados de EUREKA + el grafo + las dimensiones temáticas = material listo para generar PDFs tipo "Compilado regulatorio ambiental sector minero 2026". Bajo esfuerzo, alto percibido valor.

---

## 8. Próximos pasos recomendados (orden)

1. **Cerrar los 5 gaps OCR críticos** (Res 631/2015 y compañía) — es lo que más bloquea valor de uso del bot.
2. **Fase 2C — chat-bot RAG ampliado** (incorporar jurisprudence_articles + concordances).
3. **Resolver 10 gaps Fase 1C + 1 STC-3872** (cobertura fina).
4. **Fase 3 — monitoreo de cambios en EUREKA/SUIN** (pase de estático a vivo).
5. **Demo real SuperAdmin** (reemplaza Setup Demo eliminado en v3.9.2).

---

## 9. Referencias

- Reports JSON del día: `scripts/eureka/ingest_jurisprudence_report.json`, `scripts/eureka/recon_fase1c.json`, `scripts/eureka/ingest_fase1c_report.json`, `scripts/eureka/ingest_jurisprudence_pdfs_report.json`.
- `scripts/eureka/corpus_gaps.json` — **documento vivo de pendientes** (única fuente de verdad sobre qué falta en el corpus).
- Handoff anterior: `VIGIA_HANDOFF_2026-04-14_sprint_a2_fase_2d_completo_cierre.md`.
- Logs de ejecución (no commiteados por .gitignore): `ingest_jurisprudence_run.log`, `ingest_jurisprudence_retry.log`, `ingest_fase1c_run.log`, `recon_fase1c.log`.
