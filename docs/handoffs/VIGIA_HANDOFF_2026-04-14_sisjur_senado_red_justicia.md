# VIGÍA — Handoff TAREA A (recon SISJUR+Senado) + TAREA B (27 sentencias Red Justicia)

Archivo: `VIGIA_HANDOFF_2026-04-14_sisjur_senado_red_justicia.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-14 cierre nocturno extendido |
| Commits del bloque | `19d1c64` recon SISJUR+Senado · `68290ce` 27 sentencias Red Justicia |
| Versión del producto | v3.9.3 |
| Último push | origin/main @ `68290ce` |

---

## 2. TAREA A — Recon SISJUR + Secretaría Senado

### SISJUR Bogotá (alcaldiabogota.gov.co/sisjur)
**Hallazgos**:
- URL pattern estable: `Norma1.jsp?i=ID` con metadata rica.
- Panel estructurado: `Fecha de Expedición`, `Fecha de Entrada en Vigencia`, `Medio de Publicación`.
- Derogatorias **inline** por artículo (ej. Ley 99/1993: 16 links `<a>Derogado por …</a>`).
- Modificatorias **inline** por artículo (ej. Ley 99: 38 links, Decreto 1076/2015: 86).
- Concordancias presentes (búsqueda por keyword).
- Problema: sin search API confiable — requiere conocer el ID. `consulta_avanzada.jsp` retorna HTML de 317k pero no expone lista parseable de resultados.
- Cobertura: normas distritales Bogotá D.C. + muchas nacionales (curadas).

**Muestra cruzada** (10 normas):
| Norma | SISJUR ID | deroga | modif |
|---|---|---|---|
| Ley 99/1993 | 297 | 16 | 38 |
| Ley 1333/2009 | 38247 | 0 | 0 |
| Decreto 1076/2015 | 62510 | 9 | 86 |
| Decreto-Ley 2811/1974 | 1551 | 3 | 8 |
| 6 normas sin ID conocido | — | requiere búsqueda manual |

### Secretaría Senado basedoc (secretariasenado.gov.co/senado/basedoc) — GANADOR
**Hallazgos**:
- URL pattern **100% predecible**: `ley_NNNN_YYYY.html` (4 dígitos zero-padded).
- Título explícito: *"Leyes desde 1992 - Vigencia expresa y control de constitucionalidad"*.
- Derogatorias inline por artículo: `<Artículo derogado por el artículo X del Decreto Y>`.
- Modificatorias inline por artículo.
- **Jurisprudencia Vigencia** — referencias a sentencias C- que declaran exequibles/inexequibles.
- **Notas de Vigencia** — resumen de todas las modifs que afectan cada artículo.
- Muestra 6/6 leyes resueltas: Ley 99=48 notas_vigencia, Ley 1333=23, Ley 1753=31, Ley 1955=30, Ley 685=6, Ley 2294=3.
- Limitación: **SOLO leyes nacionales** (no decretos/resoluciones/actos legislativos).
- HTML estático con charset iso-8859-1. Cero JS para contenido principal (JS solo toggle de notas pero el contenido está en el DOM).

### Tabla comparativa SUIN vs SISJUR vs Senado

| Dimensión | SUIN | SISJUR | Senado basedoc |
|---|---|---|---|
| Cobertura | Leyes + decretos (nacional) | Bogotá + nacional | **Solo leyes nacionales** |
| Vigencia explícita | Bajo (texto libre) | **Campo panel** | **Título + notas estructuradas** |
| Derogatorias art×art | Parcial (notas) | **SÍ (links inline)** | **SÍ (la mejor)** |
| Modificatorias | Parcial | **SÍ** | **SÍ** |
| Control constitucionalidad | Limitado | Parcial | **SÍ (links C-)** |
| Acceso API | Legacy ASP scraper | ID→URL (ID no descubrible) | **URL predecible** |
| En corpus actual | 239 normas (~75%) | No usado | No usado |

### Recomendación

**Próximo sprint: escribir `scrape_senado_to_vigencia.py`** que:
1. Para cada ley en `normative_sources`, construir URL `ley_NNNN_YYYY.html`.
2. Fetch + parse derogs/modifs artículo-por-artículo.
3. Actualizar `normative_articles` con nuevo campo `vigencia_status` (vigente/derogado/modificado) + `vigencia_source_norm`.
4. Desbloquea feature crítico: **el bot NO debe citar normas derogadas como vigentes**.

Estimado: 1-2 horas scraping, ~$0 (fetch only), cobertura ~60% corpus (leyes).

SISJUR queda como fuente **complementaria** para normas distritales Bogotá y casos edge.

Archivos: `recon_sisjur.json`, `recon_senado.json`, `recon_fuentes_vigencia_comparativa.json`.

---

## 3. TAREA B — 27 sentencias Red Justicia

**Resultado**: **27/27 sentencias procesadas**, 77 chunks con embedding, $0.0038, 0 errores.

Script: `scripts/eureka/ingest_red_justicia_sentencias.py`.

Procesamiento:
- Crear `jurisprudence_sources` por cada sentencia (slug + radicado + corte + URL).
- Fetch multi-formato (PDF redjusticia vs HTML `corteconstitucional.gov.co`).
- Split semántico preámbulo / antecedentes / considerandos / decisión, o chunk único si no detecta.
- Embed + INSERT `jurisprudence_articles`.

Highlights:
| Radicado | Tipo | Chars | Chunks |
|---|---|---|---|
| SU-383/2003 (Amazon indígenas) | SU | 467k | 4 |
| T-462A/2014 (Salvajina consulta previa) | T | 417k | 3 |
| T-774/2004 (Bt cotton biopesticida) | T | 355k | 4 |
| C-189/2006 (property rights parques) | C | variable | — |
| C-891/2002 (consulta previa minería) | C | — | — |
| C-710/2001 (due process Ley 99) | C | — | — |

Total sentencias en DB al cierre: **147** (120 EUREKA + 27 Red Justicia nuevas).

---

## 4. Corpus actualizado (post-Tarea B)

| Tabla | Conteo | Δ hoy |
|---|---|---|
| `normative_sources` | **352** | +32 Red Justicia |
| `normative_articles` con embedding | **14.132** | +1.778 |
| `jurisprudence_sources` | **147** | +27 |
| `jurisprudence_articles` | **479** | +77 |
| `concordances` | 2.928 | 0 |

**Acumulado de los bloques de esta sesión nocturna (desde handoff 2026-04-14 cierre_dia_completo)**:
- 638 arts Fase 1-5 (resolución gaps)
- 1778 arts Red Justicia (T1 bloque previo)
- 77 chunks jurisprudencia Red Justicia (T bloque actual)
- **Total ~2.500 artículos nuevos** embedidos en la sesión nocturna.

---

## 5. Ideas y oportunidades identificadas (nuevas)

1. **Schema change urgente**: agregar columna `vigencia_status` + `vigencia_source_norm_id` a `normative_articles` antes del scraper Senado. Migración simple, trae un salto cualitativo al RAG.

2. **Feature "alertas de derogatoria"**: cuando el scraper Senado detecte que una norma del corpus fue derogada en una fecha reciente (ej. última corrida), generar una `regulatory_alerts` automática para orgs que tengan obligaciones vinculadas a esa norma.

3. **SISJUR como grafo de concordancias distritales**: hay muchos decretos distritales Bogotá (1076/2015, 2820/2010, etc.) con 80+ modificatorias detectadas. Si algún cliente de VIGÍA opera en Bogotá con proyecto de infraestructura, la metadata SISJUR agrega valor directo.

4. **Cruce triple Red Justicia × SUIN × Senado**: el corpus ahora tiene 352 normas de 3 fuentes distintas, muchas con `corpus_source` diferente pero duplicados latentes (mismo norm_number + year en filas distintas). Query `GROUP BY (norm_number, norm_year) HAVING COUNT>1` detectaría dedupes pendientes.

5. **Dashboard de cobertura normativa**: visualizar en SuperAdmin % de normas con `vigencia_status` conocido, % con embedding, % con concordancias. Ayuda a priorizar gaps futuros.

---

## 6. Próximos pasos recomendados

1. **[HIGH]** Migración schema + scraper Senado vigencia (1-2 sesiones, desbloquea "no citar derogadas").
2. **[MED]** Procesar las 5 sentencias Red Justicia restantes del recon que son de Consejo de Estado (ninguna procesada aún porque URL 190.24.134.67 requiere fetch PDF directo, ya cubierto por el script pero retornaron "no URL" por ser "unnumbered/YEAR"). Verificar log.
3. **[MED]** Dedup pass en `normative_sources` por `(norm_number, norm_year)`.
4. **[LOW]** SISJUR scraping selectivo: solo para normas distritales Bogotá si hay clientes VIGÍA con proyecto en D.C.

---

## 7. Referencias

- Scripts nuevos: `recon_sisjur_senado.py`, `ingest_red_justicia_sentencias.py`.
- JSONs: `recon_sisjur.json`, `recon_senado.json`, `recon_fuentes_vigencia_comparativa.json`, `ingest_red_justicia_sentencias_report.json`.
- Handoff anterior: `VIGIA_HANDOFF_2026-04-14_resolucion_gaps_5fases.md`.
