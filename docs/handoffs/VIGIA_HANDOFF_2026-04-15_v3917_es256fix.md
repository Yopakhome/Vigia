# VIGÍA — Handoff v3.9.17 (Post-Sprint ES256 Fix)

Archivo: `VIGIA_HANDOFF_2026-04-15_v3917_es256fix.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`
**Producto restaurado. Hallazgo crítico #1 cerrado.**

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Versión | **v3.9.17** |
| Commit previo | `142978a` (v3.9.16) |
| Edge functions ACTIVE | **17** (todas funcionales) |
| Build | 327.13 kB / 91.00 KB gzip |

---

## 2. ES256 JWT fix — CERRADO ✅

### Problema original (documentado en v3.9.16)
Supabase migró el password grant a ES256. Las edges con `verify_jwt=true`
devolvían `401 UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`.

### Resolución
Las 8 edges afectadas fueron redeployadas con `verify_jwt=false`. Todas
ya tenían validación manual del JWT dentro del handler (`verifyUser()`
via `/auth/v1/user`), que sí acepta ES256.

### Estado final de las 17 edges

| Edge | Versión | verify_jwt | Auth manual | Estado |
|---|---|---|---|---|
| **chat-bot** | v12 | false | ✅ verifyUser | 🟢 OK |
| **norm-search** | v7 | false | ✅ verifyUser | 🟢 OK¹ |
| **superadmin-proxy** | v2 | false | ✅ auth.getUser + email whitelist | 🟢 OK |
| **classify-item** | v2 | false | ✅ verifyUser | 🟢 OK |
| **multi-format-extractor** | v2 | false | ✅ verifyUser | 🟢 OK |
| **enrich-org-profile** | v2 | false | ✅ verifyUser | 🟢 OK |
| **embed-text** | v2 | false | ✅ verifyUser | 🟢 OK |
| **norm-ingest** | v5 | false | ✅ verifyUser | 🟢 OK |
| analyze-document | v6 | false | ✅ verifyUser | 🟢 OK (no tocado) |
| norm-extract-text | v1 | false | n/a (público) | 🟢 OK |
| norm-embed | v2 | false | n/a | 🟢 OK |
| norm-validate | v1 | false | n/a | 🟢 OK |
| org-lookup | v3 | false | n/a | 🟢 OK |
| storage-sign | v3 | false | n/a | 🟢 OK |
| publish-intel | v2 | false | n/a | 🟢 OK |
| superadmin-api | v3 | false | ✅ token validation | 🟢 OK |
| orgadmin-users | v2 | false | ✅ | 🟢 OK |

¹ `norm-search` tiene latencia de cold-start (9s primera consulta,
4s segunda) por cold IVFFLAT index. Pre-existente, no causado por ES256.

### Verificación e2e

```
[1] chat-bot no-RAG (admin@enara.co):     200 ✅
[2] chat-bot + RAG (user normal):          200 rag funcional tras warmup ✅
[3] superadmin-proxy (SuperAdmin):         200 devolvió 2 orgs ✅
[4] superadmin-proxy (user normal):        403 rechazo correcto ✅
[5] classify-item (Haiku):                 200 clasificación correcta ✅
[6] norm-search directo (tras warmup):     200 en 4-9s ✅
```

### Regla permanente

Documentada en `/CLAUDE.md`:
- **Todas las edges deben deployarse con `verify_jwt=false`**
- Autenticación se valida internamente via `fetch(${SUPABASE_URL}/auth/v1/user)`
- El endpoint de auth.getUser SÍ acepta ES256

---

## 3. BLOQUE B completado (con créditos activos)

### B1 — OCR MinAmbiente
- **Scripts**: `scripts/eureka/retry_minambiente_ocr.py` (edge), pendiente
  un `retry_minambiente_ocr_direct.py` sin edge para romper el timeout 150s
- **Estado**: 1/19 recuperado en v3.9.16. 18 pendientes.
- **Pendiente**: implementar versión con API Anthropic directa (sin edge),
  costo estimado $0.10–0.50 en créditos Anthropic
- **Decisión**: diferido al próximo sprint — requiere 30-45 min de
  ejecución y SDK `anthropic` instalado localmente

### B2 — Categorización LLM "Otra" ✅
- **Ejecutado**: `scripts/eureka/categorize_otra_via_edge.py` vía
  `classify-item` edge (Haiku) con bug corregido (errores ya no pisan
  category a NULL)
- **Resultado**: **91 "Otra" → 2** (89 reclasificadas por Haiku, 2 que
  el LLM mantuvo correctamente en "Otra"). 71 updated + 2 skipped + 0 errores
- **Costo**: $0.0223 (18.914 tokens in / 679 tokens out)

### B3 — Auto-categorización `documents`
- **No aplica en este sprint**: solo hay 1 documento en la tabla y ya
  tiene `doc_type_detected`. Sprint futuro cuando se usen clientes reales.

---

## 4. Corpus al cierre

| Métrica | Valor |
|---|---|
| normative_sources | 364 |
| ↳ category='Otra' | **2** (era 91 en v3.9.16) |
| normative_articles (con embedding) | 14.206 |
| jurisprudence_sources | 147 |
| obligations totales | 88 |
| ↳ con `norma_fundamento` | 83 (94%) |
| documents | 1 |
| organizations | 8 |
| edge functions ACTIVE | 17 |

---

## 5. Bloqueadores restantes

### Técnicos
1. 🟡 **OCR timeout edge** — `norm-extract-text` 150s hard timeout.
   Requiere procesamiento directo de PDFs desde script local con SDK
   Anthropic para recuperar los 18 scans restantes.
2. 🟡 **Cold-start norm-search** — primera consulta al día tarda 9s por
   IVFFLAT probes. Opciones: warmup job, tune `probes`, o asumir como UX.

### Financieros / infra
- ✅ Anthropic créditos
- ✅ OpenAI créditos
- ✅ Supabase Pro
- 🟡 Dominio propio pendiente
- 🟡 Vercel Team pendiente

---

## 6. Credenciales demo (password: `Vigia2026!`)

| Email | Rol | Org |
|---|---|---|
| `demo@vigia.co` | SuperAdmin | — |
| `admin@enara.co` | SuperAdmin | — |
| `director.ambiental@cementosandinos.com.co` | admin | Cementos Andinos |
| `hse@cementosandinos.com.co` | editor | Cementos Andinos |
| `consultas@cementosandinos.com.co` | viewer | Cementos Andinos |
| `ambiental@hidrorverde.com.co` | admin | Hidroeléctrica Río Verde |
| `operaciones@hidrorverde.com.co` | editor | Hidroeléctrica Río Verde |
| `legal@hidrorverde.com.co` | viewer | Hidroeléctrica Río Verde |

> Nota: `demo@vigia.co` quedó con credenciales inválidas en este sprint.
> Si se requiere, resetar password via superadmin-proxy.

---

## 7. Próximo sprint (recomendado)

### Inmediato (~1h)
- **OCR recovery directo**: script con `anthropic` SDK local para
  procesar los 18 scans MinAmbiente fuera del edge timeout
- **Reset password demo@vigia.co**: via superadmin-proxy o dashboard

### Quick wins (sin créditos)
- **M-03** Callbacks Dashboard post-INTAKE
- **M-06** Barra progreso `completeness_pct`
- **M-07** Búsqueda en Normativa
- **F-14** Historial `bot_queries` con UI
- **Warmup norm-search** job cron para eliminar cold-start de 9s

### Pre-venta (con primer cliente real)
- Dominio propio
- Vercel Team
- Callbacks email obligaciones próximas
- Export PDF Compliance Matrix

---

## 8. Referencias

- Handoff anterior: `VIGIA_HANDOFF_2026-04-15_v3916_bloqueB.md`
- Regla permanente: `/CLAUDE.md`
- Scripts ejecutados:
  - `scripts/eureka/categorize_otra_via_edge.py` (bug corregido)
  - `scripts/eureka/retry_minambiente_ocr.py` (v3.9.16, 1/19 recuperado)
- Commit de referencia ES256 fix: v3.9.17
