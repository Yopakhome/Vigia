# VIGÍA — Handoff resolución gaps 5 fases (2026-04-14)

Archivo: `VIGIA_HANDOFF_2026-04-14_resolucion_gaps_5fases.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Generado | 2026-04-14 cierre nocturno |
| Fase actual | **Fases 1-5 de resolución de gaps parcialmente completadas** (12 resueltos, 8 pendientes documentados) |
| Versión del producto | v3.9.2 (sin cambios de UI en esta sesión) |
| Último commit pusheado | `bb39ee4` feat(eureka): Fase 5 PNDs 618 arts 3 leyes con filtro 8D |
| Proyecto Supabase | `itkbujkqjesuntgdkubt` |
| Repo GitHub | `Yopakhome/Vigia`, branch `main` |
| Autor | Claude Opus 4.6 (VIGÍA-03) |

---

## 2. Regla global nueva

**NO EXISTE `skip_definitivo` para documentos del corpus.** Todo gap no resuelto en una sesión queda `status=pendiente` con `ultimo_intento` y `fuentes_intentadas` acumulativas. VIGÍA re-intentará periódicamente hasta encontrar el texto.

**Cambio aplicado en esta sesión**: el único `skip_definitivo` previo (Decreto 43/2024) sigue marcado como tal en el JSON pero queda sujeto a revisión — la regla aplica desde ahora.

---

## 3. Resultados por fase

### Fase 1 — Gaps OCR (5 PDFs scan sin capa de texto)

Script: `scripts/eureka/resolve_ocr_gaps.py` — llama a edge `norm-extract-text` (Claude OCR server-side) y reutiliza `norm_id` existente.

**Resueltos (1/5)**:
| Doc | Páginas | Chars OCR | Artículos | Tokens OCR |
|---|---|---|---|---|
| **Res 827/2018** (clasificación sancionatoria) | 6 | 12,454 | 12 | 9,623 in / 3,914 out |

**Pendientes (4/5)** por timeout `504` edge function (150s hard limit, PDFs demasiado pesados):
- Res 631/2015 (vertimientos, 62pp)
- Res 2086/2010 (tasación multas, 11pp)
- Res 108/2015 (formato licencia, 14pp)
- Res 762/2022 (fuentes móviles, 62pp)

Todos con `ultimo_intento=2026-04-14` y `fuentes_intentadas` documentadas. **Proxima acción sugerida**: split por rango de páginas (<5 páginas por llamada a OCR) o ANTHROPIC_API_KEY local para evitar edge timeout.

### Fase 2 — Gap SSL (Directiva Presidencial 10/2013)

Script: `scripts/eureka/resolve_ssl_gap.py` — HTTPAdapter con `SSLContext seclevel=0` y `OP_LEGACY_SERVER_CONNECT`.

**Resultado**: `pendiente`. LibreSSL 2.8.3 (macOS default) no acepta ciphers compatibles con TLS 1.0 del servidor `cancilleria.gov.co`. Error: `No cipher can be selected`.

**Próxima acción**: ejecutar desde máquina con OpenSSL 1.1.1+ (Linux server u otro entorno) o buscar el doc en SUIN/FuncionPublica (requiere WebSearch no disponible en esta sesión).

### Fase 3 — Fase 1C gaps (10 docs)

Script: `scripts/eureka/resolve_fase1c_gaps.py` — modo dual: `external` (follow link external_official → pypdf) y `ocr` (norm-extract-text).

**Resueltos (8/10)**:
| # | Doc | Vía | Chars | Chunks |
|---|---|---|---|---|
| 1 | CONPES 3344/2005 (contaminación aire) | minambiente | 66,480 | 1 |
| 2 | CONPES 3451/2006 (cuenca Ubaté-Suárez) | minambiente | 105,678 | 1 |
| 3 | CONPES 3164/2002 (zonas costeras) | minambiente | 67,918 | 1 |
| 4 | CONPES 3550/2008 (salud ambiental) | minambiente | 129,920 | 1 |
| 5 | Política Nacional Cambio Climático (PNCC) | minambiente | 6,224 | 1 |
| 6 | Plan manejo DRMI La Playona | wwf.org.co | 70,370 | 1 |
| 7 | Concepto jurídico medidas preventivas | OCR ANLA | 14,658 | 1 |
| 8 | Concepto jurídico proporcionalidad medidas | OCR ANLA | 7,758 | 1 |

**Pendientes (2/10)** sin `external_official` link en su detail ANLA:
- Manual conceptual metodología cálculo de multas
- Formato único nacional permiso recolección especies silvestres

### Fase 4 — STC-3872/2020 Corte Suprema

**Resultado**: `pendiente`. Probé 5 URLs candidatas (`cortesuprema.gov.co/corte/wp-content/uploads/...`, `consultajurisprudencial.ramajudicial.gov.co:8080/...`), todas 404 o timeout. Sin WebSearch no puedo descubrir la URL real.

**Próxima acción**: búsqueda manual en `cortesuprema.gov.co/corte/relatoria` (requiere JS) o pedir PDF al equipo ANLA directamente.

### Fase 5 — PNDs con filtro 8D

Script: `scripts/eureka/resolve_pnds.py` — fetch SUIN/FuncionPublica + parse regex + filtro temático 8D (OR entre 130 keywords en 8 dimensiones).

**3/3 PNDs resueltos**:
| Ley | Fuente | Arts parsed | Tras filtro 8D | Insertados | Tokens embed |
|---|---|---|---|---|---|
| **Ley 2294/2023** (PND 2022-2026) | SUIN `?id=30046580` | 378 | 220 (58%) | **220** | 125,424 |
| **Ley 1955/2019** (PND 2018-2022) | SUIN `?ruta=Leyes/30036488` | 349 | 210 (60%) | **210** | 122,377 |
| **Ley 1753/2015** (PND 2014-2018) | FuncionPublica `?i=61933` | 267 | 188 (70%) | **188** | 97,166 |

**Total**: **994 arts parseados → 618 filtrados (62%) → 618 insertados con embedding**.

**Hallazgos del filtro 8D** (acumulado de los 3 PNDs):
- **D3 licenciamiento**: 422 hits (dimensión dominante — casi 70% de los arts insertados mencionan licencia/permiso/ANLA/CAR)
- **D4 sectores**: 394 hits (minería, hidrocarburos, energía, infraestructura)
- **D6 ordenamiento**: 114 hits (POT, POMCA, consulta previa)
- **D1 recursos naturales**: 105 hits (agua, bosque, páramo, biodiversidad)
- **D5 cambio climático**: 42 hits
- **D7 institucional**: 39 hits
- **D2 contaminación**: 31 hits
- **D8 salud-ambiente**: (menor presencia)

**Decisiones técnicas de Fase 5**:
- Ley 1753 (único PND sin row previa) creada con `corpus_source='fase1c'`.
- Leyes 1955 y 2294 ya existían como `corpus_source='eureka_metadata'` con articulos parciales (23, 3) — se **borraron** y reemplazaron por texto completo filtrado.
- `ARTICLES_INSERT_BATCH=20` (bajado desde 100) para evitar statement timeout de PostgREST en batches grandes con embeddings.
- Ley 2294 requirió re-run con `--only 2294` porque el primer run perdió 100 arts por timeout de batch=100.

---

## 4. Resumen numérico global

| Fase | Esperados | Resueltos | Pendientes | % éxito |
|---|---|---|---|---|
| 1 OCR | 5 | 1 | 4 | 20% |
| 2 SSL | 1 | 0 | 1 | 0% |
| 3 Fase 1C | 10 | 8 | 2 | 80% |
| 4 STC-3872 | 1 | 0 | 1 | 0% |
| 5 PNDs | 3 | 3 | 0 | **100%** |
| **TOTAL** | **20** | **12** | **8** | **60%** |

**Artículos agregados al corpus en esta sesión**: ~638 (12 Fase 1 + 8 Fase 3 + 618 Fase 5).

**Costo OpenAI total**: ~$0.01 (Fase 5 domina con $0.007, resto es embeds chicos).

**Costo Claude OCR** (via edge function): ~$0.10 (2 conceptos jurídicos + Res 827/2018).

---

## 5. Corpus al cierre del día (global)

| Tabla | Conteo | Δ vs inicio día |
|---|---|---|
| `normative_sources` | **320** | +9 (Ley 1753 + 8 de Fase 3) |
| `normative_sources` con `corpus_source='fase1c'` | 32 | +9 |
| `normative_articles` (con embedding) | **12.354** | +612 netos (desde 11.742) |
| `jurisprudence_sources` | 120 | 0 |
| `jurisprudence_articles` | 402 | 0 |
| `eureka_sources_metadata` | 390 | 0 |
| `concordances` | 2.928 | 0 (2.366 resolved) |

---

## 6. Gaps pendientes al cierre (8 docs)

Siguen como `status=pendiente` en `corpus_gaps.json`:

| Gap | Razón bloqueo | Próxima acción sugerida |
|---|---|---|
| Res 631/2015 (vertimientos) | 504 edge timeout — PDF 62pp scan | Split páginas OR `ANTHROPIC_API_KEY` local |
| Res 2086/2010 (tasación multas) | 504 edge timeout | Split OR API key local |
| Res 108/2015 (formato licencia) | 504 edge timeout | Split OR API key local |
| Res 762/2022 (fuentes móviles) | 504 edge timeout — PDF 62pp scan | Split OR API key local |
| Directiva Pres 10/2013 (consulta previa) | LibreSSL no soporta TLS 1.0 | Ejecutar en Linux con OpenSSL 1.1.1+ |
| Manual multas (Fase 1C) | sin `external_official` link | Buscar manualmente en minambiente.gov.co |
| Formato permiso especies silvestres (Fase 1C) | sin `external_official` link | Idem |
| STC-3872/2020 (Corte Suprema) | URL es nota de prensa, no se descubre PDF | Búsqueda en cortesuprema.gov.co/relatoria (requiere JS) |
| *(Decreto 43/2024 sigue marcado `skip_definitivo` por convención previa — revisar con nueva regla global)* | | |

---

## 7. Ideas y oportunidades identificadas en esta sesión

### Nuevas

1. **ANTHROPIC_API_KEY local desbloquea 4 OCR pendientes**. La edge function `norm-extract-text` tiene hard limit 150s que no cabe para PDFs scan de 60+ páginas. Tener la key localmente permitiría:
   - Llamar `claude-sonnet-4-5` directamente sin límite.
   - Split por rango de páginas (extract 10pp por llamada, mergear).
   - Procesar el total de los 4 OCR pendientes + futuros en ~15 min, ~$0.30.

2. **Filtro 8D ya es producto**. El `filtro_tematico_pnd` probó reducir 994 → 618 arts (62%) manteniendo la relevancia ambiental. Puede aplicarse también a:
   - Cualquier ley marco futura (Código Civil, Código Minero…) — importar solo partes relevantes.
   - Alerting: escuchar Diario Oficial y clasificar cada norma nueva por dimensiones 8D → avisar solo cuando D4+D1 aplique a sector del cliente.

3. **Detectar "texto fallback basura" en tabla normative_articles**. Ley 762/2022 tenía 1 chunk con texto OCR degradado. Query útil:
   ```sql
   SELECT norm_id, COUNT(*), SUM(content_tokens)
   FROM normative_articles
   WHERE article_number IS NULL AND article_label='Documento completo'
   GROUP BY norm_id HAVING SUM(content_tokens) < 500;
   ```
   Los de <500 tokens son candidatos a re-procesar con OCR.

4. **Dimensión "hit_score" podría ser un campo en normative_articles**. Si un art matchea D4+D5+D6 (sectores, clima, ordenamiento) es más relevante que uno que solo matchea D7 (institucional). Se puede computar offline y usar para ranking en RAG.

### Ya listadas en handoff anterior (recuerdo corto para continuidad)

5. Chat-bot RAG con `jurisprudence_articles` + `concordances`
6. Monitoreo de cambios SUIN/EUREKA (fingerprints ya existentes)
7. Demo real SuperAdmin (reemplazo v3.9.2)
8. Grafo visual de concordances
9. Exportación libro blanco por sector

---

## 8. Scripts nuevos creados en esta sesión

| Script | Propósito | LOC |
|---|---|---|
| `resolve_ocr_gaps.py` | OCR 5 PDFs scan via edge + INSERT reutilizando norm_id | ~200 |
| `resolve_ssl_gap.py` | SSL legacy adapter para cancilleria.gov.co | ~130 |
| `resolve_fase1c_gaps.py` | Follow external_official → PDF o OCR inline | ~240 |
| `resolve_pnds.py` | Fetch SUIN/FuncionPublica + filtro 8D + INSERT | ~250 |

---

## 9. Próximos pasos recomendados (orden)

1. **Desbloquear los 4 OCR pendientes** → requiere `ANTHROPIC_API_KEY` local. Script ya existe (`resolve_ocr_gaps.py`), solo cambiar target de edge function a anthropic SDK directo y hacer split páginas.
2. **Buscar STC-3872/2020 manualmente** en cortesuprema.gov.co/relatoria (5 min) y agregar URL al JSON → re-run.
3. **Resolver 2 Fase 1C sin external** — es búsqueda manual por slug en minambiente (5-10 min cada uno).
4. **Fase 2C** — chat-bot RAG ampliado (incluir jurisprudence + concordances + filtros 8D).
5. **Cerrar gap SSL** en entorno Linux cuando sea factible.

---

## 10. Referencias

- Reports JSON de la sesión: `resolve_ocr_gaps_report.json`, `resolve_ssl_gap_report.json`, `resolve_fase1c_gaps_report.json`, `resolve_pnds_report.json`.
- `scripts/eureka/corpus_gaps.json` — estado de verdad de todos los pendientes (ahora con `ultimo_intento` + `fuentes_intentadas` acumulativas).
- Handoff inmediato anterior: `VIGIA_HANDOFF_2026-04-14_cierre_dia_completo.md`.
