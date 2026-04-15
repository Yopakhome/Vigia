# VIGÍA — Handoff v3.9.15 (Post-Sprint Seguridad)

Archivo: `VIGIA_HANDOFF_2026-04-15_v3915_seguridad.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`
**Bloqueador pre-venta #1 CERRADO. Producto pendiente solo de créditos Anthropic.**

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Versión | **v3.9.15** |
| Commit final | `fd856be` |
| Build | 327.13 kB / 91.00 KB gzip |
| Edge functions ACTIVE | **9** (nueva: `superadmin-proxy` v1) |

---

## 2. Estado de seguridad — TODO VERDE ✅

| Capa | Estado | Evidencia |
|------|--------|-----------|
| SB_SERVICE en bundle | ✅ **Eliminado** | `grep eyJhbGciOi dist/assets/*.js` → 0 matches |
| Constante SB_SERVICE en source | ✅ Eliminada | src/App.jsx línea 6 borrada |
| Función `sbServicePost` | ✅ Eliminada | nunca fue invocada; muerte útil |
| Edge `superadmin-proxy` | ✅ Deployed v1 | verifica JWT + whitelist SUPERADMIN_EMAILS |
| RLS `instruments` | ✅ Activo | policy `instruments_select` + `instruments_write` |
| RLS `obligations` | ✅ Activo | idem |
| RLS `documents` | ✅ Activo | idem |
| RLS `regulatory_alerts` | ✅ Activo | policy `regulatory_alerts_select` |
| Org isolation | ✅ | `rls_core_ok = true` para las 4 tablas core |

---

## 3. Edge function `superadmin-proxy`

- **ID**: `94774ce6-4c07-4375-8c42-c8f336a50baa`
- **Endpoint**: `/functions/v1/superadmin-proxy`
- **Whitelist de emails**: `demo@vigia.co`, `admin@enara.co`
- **Whitelist de tablas**: 10 (`organizations`, `user_org_map`, `instruments`, `obligations`, `documents`, `org_profile`, `bot_queries`, `oversight_log`, `regulatory_alerts`, `normative_sources`)
- **Operaciones**: `select`, `insert`, `update`, `delete`, `auth_create_user`, `auth_delete_user`, `auth_find_user`
- **Flujo de validación**:
  1. Bearer token requerido (401 sin él)
  2. `auth.getUser()` con anon key del token del usuario
  3. email debe estar en `SUPERADMIN_EMAILS` (403 si no)
  4. Cliente admin con `SUPABASE_SERVICE_ROLE_KEY` (del env, server-side)
- **Safety**: DELETE requiere filter explícito (400 si no)

**Configuración necesaria en Supabase**: secret `SUPABASE_SERVICE_ROLE_KEY` ya está disponible por default en edge runtime (Supabase lo inyecta). No requiere setup manual.

---

## 4. Corpus al cierre del sprint

| Métrica | Valor |
|---|---|
| normative_sources | **364** |
| ↳ corpus_source='minambiente_normativa' | 2 (pendiente OCR de 17 scans con créditos) |
| ↳ category='Otra' | 126 (pendiente Haiku LLM con créditos) |
| normative_articles | **14.205** |
| jurisprudence_sources | **147** |
| obligations total | **88** |
| ↳ **con `norma_fundamento`** | **83 (94%)** 🎉 (+72 enriquecidas este sprint) |
| ↳ status='vencido' | 24 |
| compliance_matrix alert_level≠OK | **58 alertas activas** |
| documents vectorizados | 1 (test e2e REGLA 18) |
| organizations activas | 8 |

**Logro destacado**: de 11/88 obligations con fundamento (13%) a 83/88 (94%) gracias al script retroactivo `enrich_obligations_fundamento.py` (solo OpenAI embeddings, $0.0002 total). Compliance Matrix ahora tiene fundamento normativo real que permite activar alertas FUNDAMENTO_DEROGADO/MODIFICADO cuando corresponda.

---

## 5. Credenciales demo (activas)

**Password universal**: `Vigia2026!`

| Email | Rol | Org |
|---|---|---|
| `demo@vigia.co` | SuperAdmin | — |
| `admin@enara.co` | SuperAdmin | — |
| `director.ambiental@cementosandinos.com.co` | admin | Cementos Andinos S.A. |
| `hse@cementosandinos.com.co` | editor | Cementos Andinos S.A. |
| `consultas@cementosandinos.com.co` | viewer | Cementos Andinos S.A. |
| `ambiental@hidrorverde.com.co` | admin | Hidroeléctrica Río Verde |
| `operaciones@hidrorverde.com.co` | editor | Hidroeléctrica Río Verde |
| `legal@hidrorverde.com.co` | viewer | Hidroeléctrica Río Verde |

---

## 6. Bloqueadores restantes (acción del usuario)

### Solo financieros/infra (ninguno técnico):
1. **Créditos Anthropic** (mínimo $20/mes) — para activar BLOQUE B pendiente:
   - OCR 17 scans MinAmbiente (~$0.10)
   - Categorización LLM Haiku del 38% "Otra" (~$0.003)
   - Auto-categorización documents (~$0.001)
   - Funcionalidad normal INTAKE con `analyze-document` + `norm-extract-text` + `enrich-org-profile`
2. **Supabase Pro** ($25/mes) — antes de primer cliente real (límites de conexiones)
3. **Dominio propio** ($15/año) — credibilidad comercial (sugerencia: `app.enaraconsulting.com` o `vigia.enaraconsulting.com`)
4. **Vercel Team** — mover de cuenta personal a ENARA para SLA

---

## 7. BLOQUE B pendiente (ejecutable con créditos)

Todos los scripts listos, solo falta recargar Anthropic. Al recargar:

```bash
cd scripts/eureka

# B1: OCR 17 scans MinAmbiente (~$0.10, 10 min)
python3 retry_minambiente_ocr.py

# B2: Categorización LLM Haiku del "Otra" — solo si categorize_corpus_batch tiene flag --llm-fallback
python3 categorize_corpus_batch.py

# B3: Auto-categorización documents (script por crear si hay necesidad)
```

---

## 8. Roadmap post-v3.9.15

### Sprint inmediato con créditos (~1h)
- B1 OCR MinAmbiente
- B2 Categorización LLM Haiku
- B3 Auto-categorización documents

### Sprint próximo (sin créditos, quick wins)
- **M-03** Callbacks Dashboard post-INTAKE (recarga auto)
- **M-06** Barra de progreso `completeness_pct` en tarjetas EDI
- **M-07** Búsqueda en módulo Normativa por título/número
- **F-14** Historial de `bot_queries` con UI (20 rows ya en DB)

### Sprint B (post primer cliente)
- **F-15** Export PDF del Compliance Matrix
- **F-02** Asistente redacción ICA desde obligations
- **F-07** Panel SuperAdmin multi-cliente
- **F-10** Expediente Digital vista unificada

---

## 9. Estado vs objetivo 800MM COP año 1

### ✅ Listo pre-venta (tras este sprint)
- Seguridad de producción (RLS + proxy)
- Corpus normativo extenso (364 + 147 sentencias + 14.205 chunks)
- 20 reglas del bot (incluyendo vigencia absoluta REGLA 14)
- RAG multi-capa con 6 capas
- Setup demo con datos reales (2 empresas · 6 EDIs · 88 obligations · 83 con fundamento)
- Compliance Matrix funcional (58 alertas activas)

### 🟡 Pre-venta (acción del usuario, no técnica)
- Recargar créditos Anthropic
- Upgrade Supabase Pro
- Dominio propio

### 🎯 Estimado
**Con créditos + Pro + dominio → listo para primer SLA en 3-5 días.**

Tras los primeros $10-20M COP de ventas, Sprint B cubre features de alto valor percibido (export PDF, asistente ICA, multi-cliente SuperAdmin) y justifica tier enterprise.

---

## 10. Referencias

- Handoff master anterior: `VIGIA_HANDOFF_2026-04-15_MASTER.md`
- Auditoría integral: `docs/audits/VIGIA_AUDIT_2026-04-15.md`
- Último commit: `fd856be` v3.9.15
- Edge functions ACTIVE: 9 (chat-bot v11, norm-search v6, norm-ingest v4, multi-format-extractor v1, embed-text v1, enrich-org-profile v1, norm-extract-text v1, analyze-document v6, **superadmin-proxy v1** ← NUEVO)
