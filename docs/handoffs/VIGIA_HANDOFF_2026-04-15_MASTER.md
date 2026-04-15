# VIGÍA — Handoff Master v3.9.14

Archivo: `VIGIA_HANDOFF_2026-04-15_MASTER.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`
**Documento de referencia canónico para el proyecto a esta fecha.**

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Versión producto | **v3.9.14** |
| Último commit | `931d50a` (audit), `e215adb` (v3.9.14) |
| Build | 327.13 kB / 91.00 KB gzip |
| Edge functions ACTIVE | **8** (chat-bot v11, norm-search v6, norm-ingest v4, multi-format-extractor v1, embed-text v1, enrich-org-profile v1, norm-extract-text v1, analyze-document v6) |
| Supabase project | `itkbujkqjesuntgdkubt` (São Paulo, plan Free) |
| Repo | `Yopakhome/Vigia` branch `main` |
| Deploy | https://vigia-five.vercel.app |

---

## 2. Corpus completo (métricas reales)

| Métrica | Valor |
|---|---|
| normative_sources total | **364** |
| ↳ corpus_source='pedagogico' | 17 (guías/manuales/conceptos ANLA) |
| ↳ corpus_source='minambiente_normativa' | 2 |
| ↳ category ≠ 'Otra' | 238 (65%) |
| ↳ con vigencia_global | 178 (49%) |
| ↳ derogadas (total + parcial) | 30 |
| normative_articles | **14.205** (100% con embedding) |
| ↳ vigencia_status='vigente' | 2.564 |
| ↳ con vigencia (no sin_info) | 2.802 (solo leyes via Senado) |
| jurisprudence_sources | **147** (115 CC + 32 no-CC) |
| jurisprudence_articles | **479** chunks |
| eureka_sources_metadata | **390** con resumen_embedding |
| concordances resolved | **2.366** (80.8%) |
| documents con embedding | 1 (test e2e de REGLA 18) |
| obligations total | 88 (77 prev + 11 demo) |
| ↳ con norma_fundamento | 11 (las del demo; 77 previas pendientes de retroactivo) |
| ↳ status='vencido' | 24 |
| compliance_matrix alert_level≠OK | **58 alertas activas** |
| org_profile | 0 (requiere INTAKE real post-v3.9.6) |
| organizations activas | 4 (Cerrejón + 2 demo nuevas + otras) |

---

## 3. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 4 (bundle 327 KB / 91 KB gzip) |
| Auth | Supabase GoTrue + JWT + refresh automático |
| DB | Supabase Postgres + pgvector (1536-dim, ivfflat) |
| Storage | Supabase Storage (bucket `normative-pdfs`) |
| Edge runtime | Deno + npm imports (unpdf, fflate) |
| Embeddings | OpenAI text-embedding-3-small |
| LLM | Anthropic Claude Sonnet 4.5 + Haiku 4.5 |
| Deploy | Vercel (frontend) + Supabase (backend) |
| MCP | Supabase MCP conectado a Claude Code |

---

## 4. Edge functions ACTIVE

| Nombre | Ver | Propósito |
|---|---|---|
| chat-bot | v11 | RAG multi-capa con 20 reglas + inyección org_profile |
| norm-search | v6 | Consulta paralela 4 capas (normas + sentencias + editoriales + docs org) |
| norm-ingest | v4 | Ingesta de norma nueva desde INTAKE (enriched + embed) |
| norm-extract-text | v1 | OCR PDF via Claude vision (requiere créditos) |
| multi-format-extractor | v1 | PDF/DOCX/TXT/MD/HTML/imágenes → texto |
| embed-text | v1 | Wrapper OpenAI embedding |
| enrich-org-profile | v1 | Analiza doc cliente y UPSERT org_profile |
| analyze-document | v6 | Analiza PDF/imagen con prompt regulatorio |
| (+ otras legacy) | — | superadmin-api, org-lookup, storage-sign, etc. |

---

## 5. Módulos del producto — estado real

| Módulo | Estado | Observación |
|---|---|---|
| Dashboard | 🟢 | StatCards + Perfil ORG + Compliance Matrix alerts |
| Mis EDIs (renderEDIs) | 🟢 | Filtros por salud + búsqueda + click→detail |
| Inteligencia | 🟢 | Regulatory_alerts (vacío; cron pendiente F-03) |
| Consultar (bot) | 🟢 | 4 capas paralelas + 20 reglas + badges PROPIO/JURISPRUDENCIA/VIGENCIA |
| Normativa | 🟢 | 15 tabs dinámicos por categoría + badges vigencia |
| Oversight | 🟡 | Tabla existe con 0 filas (feature no implementado) |
| INTAKE | 🟢 | Multi-formato + extractor + analyze + enrich + embed |
| Mi equipo | 🟡 | MyTeamModule parcial (ver M-05) |
| Mi organización | 🟢 | OrgProfileModule con info cliente |
| SuperAdmin | 🟢 | 5 tabs (orgs/users/requests/norms/audit) |

---

## 6. Credenciales de prueba

**Password universal**: `Vigia2026!`

### SuperAdmins (sin org)
- `demo@vigia.co`
- `admin@enara.co`

### Cementos Andinos S.A. (manufactura · Nobsa, Boyacá)
- `director.ambiental@cementosandinos.com.co` → admin
- `hse@cementosandinos.com.co` → editor
- `consultas@cementosandinos.com.co` → viewer

**3 EDIs**:
- LAM-0847 (ANLA) — Licencia planta cementera
- PV-CORP-2019-0234 (CORPORINOQUIA) — Vertimiento PV-001 Río Chicamocha
- PAF-BOY-2021-112 (CORPOBOYACÁ) — Aprovechamiento forestal ampliación cantera

**6 obligations** (3 vencidas): ICA semestral, monitoreo trimestral vertimientos, revegetalización páramo Pisba, plan RESPEL, tasa retributiva, reporte RESPEL SIDEAP.

### Hidroeléctrica Río Verde S.A.S. (energía · El Águila, Valle del Cauca)
- `ambiental@hidrorverde.com.co` → admin
- `operaciones@hidrorverde.com.co` → editor
- `legal@hidrorverde.com.co` → viewer

**3 EDIs**:
- LAM-2156 (ANLA) — Licencia PCH Río Verde 19.8 MW
- CA-CVC-2014-0891 (CVC) — Concesión aguas 17.5 m³/s
- PMA-RV-2015-001 (ANLA) — Plan Manejo Ambiental

**5 obligations** (2 vencidas): caudal ecológico, repoblamiento íctico, ISA anual, tasa uso agua, plan arqueológico.

---

## 7. Flujo de demo ejecutiva recomendado (20 min)

```
 1. [0-2 min]   Login como director.ambiental@cementosandinos.com.co
                Dashboard: 3 alertas de cumplimiento vencidas visibles
                Perfil Regulatorio: vacío (se llenará al usar INTAKE)

 2. [2-5 min]   Normativa: filtrar por "Aguas y vertimientos"
                Abrir Res 631/2015 → ver artículos con badges de vigencia
                Mostrar badges 📖 GUÍA TÉCNICA y normas con 🔴 DEROGADO

 3. [5-10 min]  INTAKE: subir un PDF real (oficio ANLA cualquiera)
                → Ver análisis automático (Claude Sonnet)
                → Extracción de obligaciones + fundamento normativo
                → Confirmar → Dashboard se actualiza con nuevo EDI

 4. [10-15 min] Consultar: preguntar "¿cuáles son mis obligaciones
                de vertimientos bajo la Resolución 631 de 2015?"
                → Respuesta con citas + badges de vigencia
                → Si el bot cita una derogada: mostrar REGLA 14 en acción
                → Contador de capas: 📋 4 normas · 📄 1 propio

 5. [15-18 min] Compliance Matrix: mostrar alertas con norma fundamento
                y (si aplica) norma que la derogó
                → Demuestra valor único vs. ChatGPT genérico

 6. [18-20 min] Cierre: "con 1 cliente + $50 USD/mes en servicios,
                VIGÍA maneja 500+ obligaciones y 15.000 artículos.
                Escala sin esfuerzo lineal."
```

---

## 8. Bloqueadores que requieren acción del usuario

### 🔴 CRÍTICO — antes de vender a cliente real

**SB_SERVICE JWT expuesto en bundle público** (`src/App.jsx:6`).
Cualquier persona que inspeccione el bundle JS puede extraer el JWT del service_role y hacer queries sin RLS. **Fix**: refactorizar `adminFetch` para usar edge `superadmin-api`. Estimado: 2-3h.

### 🟡 MEDIO — antes de salir a prospectos

1. **Créditos Anthropic**: cuenta Supabase sin saldo. Necesario para INTAKE con análisis (analyze-document, norm-extract-text, enrich-org-profile). Mínimo **$20 USD/mes** de uso piloto.
   - `console.anthropic.com` → Billing → Add credits
2. **Supabase Pro** (`$25/mes`): límites de conexiones del Free ahogarán a partir de 3-5 usuarios concurrentes.
3. **Dominio propio** (`$15/año`): sugerido `app.enaraconsulting.com` o `vigia.enaraconsulting.com`. Vercel DNS acepta cualquier dominio.

### 🟢 BAJO — post-primera-venta

4. **Vercel Team account**: mover de cuenta personal a ENARA para SLA + facturación empresarial.
5. **HIBP password protection**: activar en Supabase Auth Settings.

---

## 9. Roadmap priorizado

### Sprint inmediato (sin créditos Anthropic, 6-8h)
1. **Eliminar SB_SERVICE del frontend** (M-A · crítico seguridad)
2. Callbacks Dashboard post-INTAKE (M-03)
3. Barra de progreso completeness_pct en tarjeta EDI (M-06)
4. Búsqueda en Normativa por título/número (M-07)
5. Historial bot_queries en UI (F-14)

### Sprint A (con créditos Anthropic, 4-5h)
6. OCR MinAmbiente scans (Bloque 2 del sprint anterior — script listo)
7. Categorización LLM Haiku de 126 normas "Otra"
8. Auto-llenar `norma_fundamento` retroactivo (77 obligations)
9. Primer INTAKE real de prueba end-to-end con Cementos Andinos

### Sprint B (post primer cliente real, 10-12h)
10. Export PDF Compliance Matrix (F-15)
11. Asistente redacción ICA (F-02)
12. Panel SuperAdmin multi-cliente (F-07)
13. Expediente Digital vista unificada (F-10)
14. MyTeamModule gestión de usuarios org (M-05)

### Sprint C (escala)
15. Dominio + Supabase Pro upgrade
16. Cron alertas regulatorias automáticas (F-03)
17. Auto-completado obligations desde norma (F-13)
18. Modo demo público sin login (F-08)

---

## 10. Estado vs objetivo 800MM COP año 1

### ✅ Listo
- Corpus normativo extenso (364 normas · 14.205 arts · 147 sent.)
- RAG multi-capa con 20 reglas absolutas (diferenciación competitiva clara)
- UX funcional (10 módulos · Dashboard + Normativa + Consultar + INTAKE + Oversight)
- Datos demo creíbles (2 empresas reales con EDIs y obligations)
- Audit trail en git (70+ commits documentados)
- Edge functions deployed (8 funcionales) + 15+ migraciones SQL

### 🔴 Pre-venta imprescindible
- Refactor SB_SERVICE (bloqueador de seguridad)
- Créditos Anthropic + Supabase Pro
- Dominio propio

### 🟡 Post-primera-venta para escalar
- F-15 export PDF (entregable profesional a autoridad)
- F-02 asistente ICA (ahorra 10-15h/mes/cliente)
- F-07 multi-cliente (upsell natural ENARA)
- F-03 alertas automáticas (justifica subscripción recurrente)

**Estimación**: 3 semanas de ejecución del roadmap Sprint inmediato + A + B → VIGÍA listo para firmar primer SLA con cliente enterprise.

---

## 11. Referencias

- Auditoría integral: `docs/audits/VIGIA_AUDIT_2026-04-15.md`
- Handoffs anteriores: serie `VIGIA_HANDOFF_2026-04-*` en `docs/handoffs/`
- Último sprint: `VIGIA_HANDOFF_2026-04-15_v3910_continuacion.md`
- Corpus gaps: `scripts/eureka/corpus_gaps.json`
- Comparativa fuentes vigencia: `scripts/eureka/recon_fuentes_vigencia_comparativa.json`
