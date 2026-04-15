# VIGÍA — Auditoría Integral 2026-04-15

**Versión auditada**: v3.9.14 · commit `e215adb`
**Método**: lectura `src/App.jsx` + 7 edge functions + 10+ queries SQL via MCP.

---

## Resumen ejecutivo

| Módulo | Estado | Evidencia |
|---|---|---|
| Corpus normativo | 🟢 Sólido | 364 normas · 14.205 arts · 147 sent. · 2.366 concordances resolved |
| Vigencia (REGLA 14) | 🟢 Funcional | 178 normas con vigencia_global · 2.802 arts con vigencia_status |
| Jurisprudencia (REGLA 15) | 🟢 Funcional | match_jurisprudence_articles RPC OK · 479 chunks |
| Tratados (REGLA 16) | 🟢 Funcional | 9/10 tratados en corpus (falta Ley 994/2005) |
| Pedagógico (REGLA 20) | 🟢 Funcional | 17 sources · 73 chunks con corpus_source='pedagogico' |
| Documentos propios (REGLA 18) | 🟡 Activo pero sin datos | RPC match_org_documents OK · 1 doc vectorizado (test e2e) |
| Compliance Matrix | 🟢 Activo | 58 alertas · 11 obligations con fundamento |
| Setup Demo | 🟢 Datos reales | 2 orgs · 6 EDIs · 11 obligations · 6 usuarios (Cementos + Hidro) |
| Frontend | 🟡 Funcional con brechas | 327 KB bundle · tabs dinámicos · badges vigencia ok |
| Seguridad | 🔴 **CRÍTICO** | SB_SERVICE JWT expuesto en frontend (src/App.jsx:6) |

---

## 1. Bugs verificados

| ID | Descripción | Evidencia | Severidad | Estado | Fix |
|---|---|---|---|---|---|
| BUG-01 | renderEDIs "Mis EDIs" sin renderer | App.jsx:2718 `renderEDIs = () => {...}` ✅ | alta | **cerrado** | — |
| BUG-02 | JOIN roto a tabla `projects` | `grep projects(` → 0 matches ✅ | alta | **cerrado** | — |
| BUG-03 | Hardcoded "C.I. Energia Solar" | `grep C.I. Energia` → 0 matches ✅ | media | **cerrado** | — |
| BUG-04 | `"Mi Empresa"` fallback sin `clientOrg.name` | App.jsx:751,756,821 — **ya usan `clientOrg?.name \|\| "Mi Empresa"`** ✅ | baja | **cerrado** | — |
| BUG-06 | Refresh JWT antes de expirar | App.jsx:33-41 `sbRefresh(refresh_token)` implementado ✅ | crítica | **cerrado** | — |
| BUG-07 | Falta vercel.json SPA routing | `/vercel.json` existe con rewrites ✅ | media | **cerrado** | — |
| BUG-NUEVO-01 | `"confidencial"` vs `confidencial_empresarial` | 0 matches en App.jsx ✅ | baja | **cerrado** | — |
| **BUG-NUEVO-02** | **SB_SERVICE JWT expuesto en bundle público** | App.jsx:6 `const SB_SERVICE = "eyJhbG..."` | **CRÍTICA** | **ABIERTO** | mover a edge fn; usar solo SB_KEY anon en cliente |

---

## 2. Brechas de seguridad

### 🔴 SB_SERVICE JWT expuesto (CRÍTICO)
- **Ubicación**: `src/App.jsx:6`
- **Impacto**: cualquiera con acceso al bundle JS (vercel.app) puede inspeccionarlo, copiar el JWT y hacer requests con `service_role` → bypass total de RLS. Puede leer/modificar/borrar toda la DB.
- **Fix**: eliminar `SB_SERVICE` del frontend. Migrar todas las operaciones que lo usan a edge functions que validen auth del usuario. La función `adminFetch` (App.jsx:10) debe ser reemplazada por llamadas a `superadmin-api` edge (que ya existe y valida rol).

### 🟡 RLS habilitado pero no verificado para el caso demo
Las 12 tablas del dominio tienen `rowsecurity=true`, pero **no se auditaron las policies** para confirmar que cada una filtra correctamente por `org_id`. Crear script de test por rol/org.

### 🟡 Sin HIBP password protection
Supabase Auth no tiene activado Have-I-Been-Pwned en validación de passwords. Riesgo bajo actualmente (solo 6 usuarios demo + SuperAdmin), alto cuando haya clientes reales.

---

## 3. Features verificados como funcionales ✅

- Corpus normativo (364 normas 100% con embedding)
- RAG multi-capa (norm-search v6 con 4 capas paralelas)
- REGLA 14 vigencia explícita (2.802 arts con marcadores reales)
- REGLA 15 jurisprudencia (147 sentencias indexadas)
- REGLA 16 tratados (9 ratificaciones en corpus)
- REGLA 17 políticas y guías
- REGLA 18 documentos propios (RPC funcional, test e2e pasado con distance=0.298)
- REGLA 20 fuentes pedagógicas (17 sources con flag)
- Compliance Matrix (VIEW + panel Dashboard + 58 alertas activas)
- Setup Demo (2 orgs reales con EDIs y obligations)
- multi-format-extractor edge (PDF/DOCX/TXT/MD/HTML/imágenes)
- Categorización dinámica en módulo Normativa (15 tabs)
- sbRefresh del JWT (App.jsx:33-41)

---

## 4. Features parcialmente implementados ⚠️

| Feature | Gap |
|---|---|
| OCR MinAmbiente scans | 19 candidatos listos, bloqueado por créditos Anthropic |
| Auto-categorización LLM del 38% "Otra" | 126 normas siguen en "Otra"; requiere créditos |
| enrich-org-profile en INTAKE | Edge llamada desde saveToSupabase pero bloqueada sin créditos |
| Vectorización de documents | Flow integrado, pero `documents.embedding IS NOT NULL` = 1 (solo test) |
| Tabla `regulatory_alerts` | 0 filas — no hay cron que genere alertas automáticas |
| Tabla `oversight_log` | 0 filas — feature no implementado |
| Tabla `org_profile` | 0 filas — nunca se llenó post-v3.9.6 (bloqueado por créditos) |
| `normative_sources.scope` | 346/364 = 95% NULL — campo casi no usado |

---

## 5. Oportunidades de mejora descubiertas

| ID | Descripción | Ubicación | Impacto | Esfuerzo |
|---|---|---|---|---|
| M-A | **Eliminar SB_SERVICE del frontend** | App.jsx:6 | CRÍTICO seguridad | 2-3h (migrar adminFetch calls) |
| M-B | Poblar `scope` en normative_sources | 346 rows NULL | Medio (mejora filtros RAG) | 1h (rule-based desde titulo/category) |
| M-C | Cron alertas regulatorias post-SUIN re-scrape | 0 alertas reales | Alto comercial | 2h |
| M-D | Auto-llenar `norma_fundamento` retroactivo en 77 obligations restantes | 11/88 tienen fundamento | Alto (activa alertas DEROGADO reales) | 1h |
| M-E | Reducir tamaño bundle (327 KB gzipped) | Bundle monolítico | Bajo | Code splitting 2-3h |
| M-F | RLS policy test automático | No verificadas | Alto (compliance) | 1h (script Playwright) |
| M-G | `bot_queries` tiene 20 rows — usarlos para UI historial | Sin UI | Medio (valor cliente) | 1h |
| M-H | `concordances` 2.366 resolved — no usadas en chat-bot | REGLA 19 menciona pero no carga | Medio-Alto | 2h (expand RPC) |

---

## 6. Evaluación mejoras M-01 a M-15 (pre-identificadas)

| Item | Estado | Factibilidad | Timing | Prioridad |
|---|---|---|---|---|
| M-01 Export PDF Compliance Matrix | ❌ no existe | Alta (lib jsPDF ya en bundle) | Sprint próximo | 7 |
| M-02 Email vencimientos | ❌ no existe | Media (requiere Postmark/Resend + cron) | Sprint B | 6 |
| M-03 Recarga auto Dashboard post-INTAKE | ⚠️ parcial — callbacks existen | Alta | Inmediato | 8 |
| M-04 Mis EDIs funcional | ✅ existe | — | Cerrado | — |
| M-05 Admin org gestiona usuarios | ⚠️ `MyTeamModule` existe parcialmente | Alta | Sprint próximo | 6 |
| M-06 Barra completeness_pct | ❌ campo existe sin UI | Alta | Inmediato | 5 |
| M-07 Búsqueda Normativa por título/número | ❌ no existe | Alta | Inmediato | 7 |
| M-08 Refresh JWT | ✅ existe (sbRefresh) | — | Cerrado | — |
| M-09 Categorización LLM "Otra" | ⏭ bloqueado créditos | Alta | Sprint B (créditos) | 5 |
| M-10 GRANT compliance_matrix | ✅ ya aplicado en migración | — | Cerrado | — |
| M-11 RLS en tablas | ✅ rowsecurity=true en todas | — | Cerrado (verificar policies) | — |
| M-12 Dominio propio + Supabase Pro | ⏭ acción del usuario | — | Pre-primer cliente | — |
| M-13 INTAKE modo rápido | ❌ no existe | Alta | Sprint próximo | 6 |
| M-14 Contador Consultar | ✅ v3.9.13 "363 normas · 147 sentencias" | — | Cerrado | — |
| M-15 Overlay fuentes bot | ✅ v3.9.11 contador de capas | — | Cerrado | — |

**Quick wins para sprint inmediato**: M-03 (callbacks), M-06 (completeness), M-07 (búsqueda Normativa), M-13 (modo rápido).

---

## 7. Evaluación features F-01 a F-15

Factibilidad basada en datos/tablas ya existentes.

| Item | Datos existentes | Esfuerzo | Prioridad |
|---|---|---|---|
| F-01 Timeline/Gantt obligaciones | obligations.due_date/status ✅ | 3-4h | 7 |
| F-02 Asistente redacción ICA | bot + obligations ✅ | 2-3h | 8 |
| F-03 Alertas regulatorias auto | monitor_eureka.py ya existe; falta cron | 2h | 9 |
| F-04 Análisis "qué pasa si..." | chat-bot + obligations | 2h | 7 |
| F-05 Comparador versiones normativas | Requiere snapshots temporales (no existen) | 4-5h | 4 |
| F-06 Integración ORFEO/GESPROY | Sin API identificada aún | 8h+ | 3 |
| F-07 Panel SuperAdmin multi-cliente | orgs + obligations + compliance_matrix ✅ | 3h | **9** |
| F-08 Demo sin login URL pública | Requiere modo público + cuenta demo | 2h | 8 |
| F-09 Detector obligations no registradas | RAG + sector + norma fundamento | 3h | 7 |
| F-10 Expediente Digital completo | instruments + obligations + documents | 2h (vista agregada) | 8 |
| F-11 Módulo Visitas Inspección | Tabla nueva | 3h | 5 |
| F-12 Benchmark sector | orgs.sector + obligations agregadas | 2h | 6 |
| F-13 Auto-completado obligations desde norma | INTAKE + RAG + taxonomía | 4h | 8 |
| F-14 Historial bot_queries | Tabla con 20 rows ya existe | 1-2h | 7 |
| F-15 Exportación reportes cumplimiento | jsPDF + compliance_matrix | 3h | **9** |

**Top 5 alta prioridad**: F-03 alertas regulatorias, F-07 SuperAdmin multi-cliente, F-15 export reportes, F-02 asistente ICA, F-10 Expediente Digital.

---

## 8. Roadmap recomendado

### Sprint inmediato (sin créditos Anthropic)
1. **[CRÍTICO]** Eliminar SB_SERVICE del frontend (M-A, 2-3h)
2. M-03 callbacks Dashboard post-INTAKE (1h)
3. M-06 barra completeness_pct (30 min)
4. M-07 búsqueda en Normativa (1h)
5. F-14 historial bot_queries (1-2h)

### Sprint A (con créditos Anthropic recargados)
6. Bloque 2 pendiente: OCR scans MinAmbiente (~$0.10)
7. Categorización LLM Haiku de 126 normas "Otra" (~$0.02)
8. Auto-llenar `norma_fundamento` retroactivo (77 obligations)
9. Primer INTAKE real de prueba → verificar vectorización + enrich-org-profile

### Sprint B (post primer cliente real)
10. F-15 export PDF compliance matrix
11. F-02 asistente redacción ICA
12. F-07 panel SuperAdmin multi-cliente
13. M-05 MyTeamModule completo
14. F-10 Expediente Digital vista unificada

### Sprint C (escala)
15. Dominio propio + Supabase Pro upgrade
16. F-03 cron alertas regulatorias automatizadas
17. F-13 auto-completado obligations desde norma
18. F-08 demo sin login para prospectos

---

## 9. Deuda técnica consciente

- **ZIPs de MinAmbiente** (2 docs) — edge `norm-extract-text` no procesa .zip/.7z. Workaround: script local unzip + re-upload.
- **Paginación MinAmbiente AJAX** — resuelta, pero endpoint privado puede cambiar sin aviso.
- **Rule-based categorization del 38% "Otra"** — calidad baja para títulos genéricos. Resoluble con Haiku.
- **`obligations.norma_fundamento` manual** — 77/88 aún sin. Script auto-llenar retroactivo pendiente.
- **`SB_SERVICE` hardcoded** — deuda de seguridad crítica. **bloqueador para cliente real**.

---

## 10. Estado vs objetivo 800MM COP año 1

### Listo para vender
- ✅ Corpus normativo extensivo (364 normas + 14.205 arts + 147 sent.)
- ✅ RAG multi-capa con distinción de vigencia (REGLA 14 ABSOLUTA)
- ✅ Diferenciación competitiva (20 reglas en chat-bot, 6 capas en RAG)
- ✅ UX del módulo Consultar funcional con badges
- ✅ Setup demo creíble (Cementos Andinos + Hidro Río Verde con datos reales)

### Bloqueadores para primer cliente real
- 🔴 SB_SERVICE en frontend (antes de firmar SLA)
- 🔴 Créditos Anthropic mínimos ($20/mes) para que el INTAKE y OCR funcionen
- 🟡 Supabase Pro ($25/mes) — sin esto no pasa SLA productivo
- 🟡 Dominio propio (app.enaraconsulting.com o similar)
- 🟡 RLS policies auditadas por seguridad de aislamiento

### Features post-primer-venta para monetización mayor
- F-15 export PDF (argumentos para auditoría autoridad)
- F-07 multi-cliente SuperAdmin (upsell a ENARA)
- F-02 asistente ICA (ahorra 10+ horas/mes por cliente)
- F-03 alertas regulatorias automáticas (justifica suscripción vs. consulta puntual)

**Estimación realista**: con 3 semanas de ejecución del roadmap arriba, VIGÍA puede estar listo para el primer cliente real con SLA. Las 3 bloqueadoras son acciones del usuario (créditos, dominio, Pro plan) + 1 refactor crítico del service key.

---

## Referencias

- Handoff anterior: `VIGIA_HANDOFF_2026-04-15_v3910_continuacion.md`
- Commits del sprint actual: `bfe2a7b` (v3.9.13), `e215adb` (v3.9.14)
- Edge functions ACTIVE: 8
