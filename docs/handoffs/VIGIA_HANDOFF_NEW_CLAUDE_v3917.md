# VIGÍA — Handoff para NUEVO Claude (post-reboot)

**Este documento es para una instancia fresca de Claude que arranca sin
memoria de las sesiones anteriores.**

Archivo: `VIGIA_HANDOFF_NEW_CLAUDE_v3917.md`
Fecha de snapshot: 2026-04-15
Último commit: `f7f5e6d` · Versión: `v3.9.17`
Estado: **LISTO PARA DEMOS. Producto técnicamente sano.**

---

## 0. Cómo arrancar como nuevo Claude

1. Leer primero este archivo completo.
2. Leer `MEMORY.md` del usuario (auto-memoria en
   `/Users/yopak/.claude/projects/-Users-yopak-Projects-Vigia/memory/`).
3. Leer `/Users/yopak/Projects/Vigia/CLAUDE.md` (regla permanente de edges).
4. Leer `docs/handoffs/VIGIA_HANDOFF_LATEST.md` (= copia del v3.9.17).
5. NO releer toda la historia de handoffs a menos que el usuario lo pida.
   Los handoffs v3.9.13 → v3.9.17 ya consolidaron el estado actual en §4 de este doc.
6. Verificar estado real antes de actuar sobre datos: `git log`, `git status`,
   `mcp__supabase__list_edge_functions`, y SQL directo son fuentes autoritativas.

---

## 1. Perfil del usuario (Javier)

- **PO estratégico de VIGÍA**, no técnico profundo pero entiende arquitectura
- Fundador ENARA Consulting (consultoría ambiental colombiana)
- Objetivo comercial: 800MM COP año 1 con VIGÍA como SaaS B2B
- Odia humo, prefiere honestidad operativa sobre optimismo
- Prefiere 1 pregunta concreta a 3 superficiales
- Prefiere construir/arreglar a describir problemas
- Commits versionados `vX.Y.Z`, build local antes de push, no push sin luz verde

---

## 2. Producto VIGÍA — resumen operativo

**Qué es**: SaaS B2B de inteligencia regulatoria ambiental para Colombia.
Usuarios: HSE managers, directores ambientales, consultores.

**Stack**:
- Frontend: React + Vite en `src/App.jsx` (monolito single-file ~2800 líneas)
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions Deno)
- Hosting: Vercel (`vigia-five.vercel.app`)
- LLMs: Anthropic Claude Sonnet/Haiku + OpenAI embeddings (text-embedding-3-small)

**Módulos principales**:
1. **Dashboard** — alertas compliance, perfil org, completeness
2. **Consultar** — chat-bot RAG sobre corpus normativo
3. **INTAKE** — onboarding empresas: subir docs → extracción → auto-clasificación
4. **Mis EDIs** — instrumentos (permisos de autoridad: licencias, PMA, etc.)
5. **Compliance Matrix** — obligations con norma_fundamento y vigencia
6. **Normativa** — explorar corpus
7. **SuperAdmin** — panel para gestionar clientes

**Concepto clave EDI**:
- EDI = permiso de autoridad (licencia ambiental, PMA, permiso vertimientos)
- EDIs viven en tabla `instruments`
- Normas y jurisprudencia NO son EDIs — viven en `normative_sources`

---

## 3. Universo de datos actual

**Organizations (8)**:
- 2 demos: Cementos Andinos S.A., Hidroeléctrica Río Verde
- 6 test: slugs `*.vigia-test.co` (Cerrejón Norte, etc.)

**Corpus**:
- `normative_sources`: 364 normas, categorías 15 taxonomía ambiental
  - Otra: 2 (era 91, Haiku clasificó 89 en v3.9.17)
  - Marco general: 60 · Biodiversidad: 47 · Aguas: 47 · etc.
- `normative_articles`: 14.206 con embeddings (1536-dim)
- `jurisprudence_sources`: 147 sentencias
- `obligations`: 88 totales, 83 (94%) con `norma_fundamento`
- `compliance_matrix`: 58 alertas activas (alert_level ≠ OK)
- `documents`: 1 (solo el test e2e)

**Usuarios demo** (password universal `Vigia2026!`):
- `admin@enara.co` — SuperAdmin (activo)
- `demo@vigia.co` — SuperAdmin (credenciales inválidas, necesita reset)
- `director.ambiental@cementosandinos.com.co` — admin
- `hse@cementosandinos.com.co` — editor
- `consultas@cementosandinos.com.co` — viewer
- `ambiental@hidrorverde.com.co` — admin
- `operaciones@hidrorverde.com.co` — editor
- `legal@hidrorverde.com.co` — viewer

---

## 4. Estado técnico consolidado (post-v3.9.17)

### 4.1 Seguridad — TODO VERDE
| Capa | Estado |
|------|--------|
| SB_SERVICE eliminado del bundle | ✅ (v3.9.15) |
| RLS activo en 4 tablas core (instruments, obligations, documents, regulatory_alerts) | ✅ |
| superadmin-proxy con auth manual + whitelist email | ✅ |
| ES256 JWT fix (todas las edges OK) | ✅ (v3.9.17) |

### 4.2 Edge Functions (17 ACTIVE, **todas con verify_jwt=false**)

**REGLA PERMANENTE — ver `/CLAUDE.md`**:
Toda edge se deploya con `verify_jwt=false`. Auth manual interna via
`fetch(${SUPABASE_URL}/auth/v1/user)` con anon key (ese endpoint acepta ES256).

| Edge | v | Propósito |
|------|---|-----------|
| chat-bot | 12 | Bot de Consultar con RAG multi-capa |
| norm-search | 7 | Búsqueda semántica (normas + sentencias + resúmenes) |
| superadmin-proxy | 2 | Proxy service-role con whitelist SA email |
| classify-item | 2 | Wrapper Haiku para clasificación |
| multi-format-extractor | 2 | Extracción PDF/DOCX/etc |
| enrich-org-profile | 2 | Enriquecimiento LLM del perfil INTAKE |
| embed-text | 2 | Wrapper OpenAI embeddings |
| norm-ingest | 5 | Ingesta + chunking + embedding de normas |
| analyze-document | 6 | Análisis completo documento INTAKE |
| norm-extract-text | 1 | PDF → texto (unpdf + Claude vision fallback) |
| norm-embed | 2 | Embed batch helper |
| norm-validate | 1 | Validación metadata |
| org-lookup | 3 | Búsqueda org pública |
| storage-sign | 3 | Firma URLs de storage |
| publish-intel | 2 | Publicación intel interno |
| superadmin-api | 3 | API admin (legacy, coexiste con superadmin-proxy) |
| orgadmin-users | 2 | Gestión usuarios por admin de org |

### 4.3 Frontend
- Versión actual: `v3.9.17` en `src/App.jsx:256` (EXPORT_VIGIA_VERSION) y línea 2800 (sidebar)
- Build OK: 327.13 kB / 91.00 KB gzip
- Bundle limpio: 0 JWT filtrado
- `grep -c "eyJhbGciOi" dist/assets/*.js` debe retornar 0

---

## 5. Cómo conectar a los sistemas

### 5.1 Supabase Project
- URL: `https://itkbujkqjesuntgdkubt.supabase.co`
- Project ref: `itkbujkqjesuntgdkubt`
- MCP configurado en Claude Code (`mcp__supabase__*` tools)
- Publishable key: `sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV`
- Service key: en `scripts/eureka/.env.local` como `SUPABASE_SERVICE_KEY`

### 5.2 Variables de entorno locales
`/Users/yopak/Projects/Vigia/scripts/eureka/.env.local` contiene:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (créditos activos $9.37)
- **NO tiene** `ANTHROPIC_API_KEY` (está en secrets de Supabase edge runtime)

Si se necesita Anthropic API local (ej: OCR directo):
- Añadir `ANTHROPIC_API_KEY` al `.env.local`
- `pip3 install anthropic` (no está instalado)

### 5.3 Créditos LLM
- Anthropic: $24.19 activo (al 2026-04-15)
- OpenAI: $9.37 activo
- Supabase: Pro ($25/mes) activo

### 5.4 CLI no disponibles
- `supabase` CLI **no instalada** localmente. Para deploys de edges
  usar MCP `mcp__supabase__deploy_edge_function` (ver ejemplo al final).

---

## 6. Pendientes priorizados

### 🔴 Técnicos abiertos

**1. OCR 18 scans MinAmbiente** (pendiente desde v3.9.16)
- 18 PDFs escaneados fallaron 504 IDLE_TIMEOUT en edge `norm-extract-text`
- Edge tiene hard timeout 150s; Claude Vision tarda 120–180s por PDF
- **Solución**: script local con SDK `anthropic` (sin edge) para procesar
  PDFs en loop. Costo estimado: $0.10–$0.50
- Referencia de los 18 IDs: `scripts/eureka/retry_minambiente_ocr_report.json`
- Plantilla: ver `VIGIA_HANDOFF_2026-04-15_v3917_es256fix.md` §7

**2. Cold-start pgvector en norm-search**
- Primera consulta del día al RPC `match_normative_articles` tarda ~9s
- Consultas subsecuentes: 4-6s
- Es statement_timeout de PostgREST (8s) cuando index IVFFLAT está frío
- **Opciones**:
  - Warmup cron (cada 5 min hacer una query dummy)
  - `SET ivfflat.probes = N` en la función
  - Asumir UX

**3. Reset password `demo@vigia.co`**
- Credenciales devuelven 400 invalid_credentials
- Via superadmin-proxy o dashboard Supabase Auth

### 🟡 Quick wins sin créditos
- **M-03** Callbacks Dashboard post-INTAKE (recarga auto tras cargar doc)
- **M-06** Barra progreso `completeness_pct` en tarjetas EDI
- **M-07** Búsqueda en Normativa por título/número
- **F-14** UI de historial `bot_queries` (20 rows ya en DB)

### 🟢 Sprint post-primer-cliente
- **F-15** Export PDF del Compliance Matrix
- **F-02** Asistente redacción ICA desde obligations
- **F-07** Panel SuperAdmin multi-cliente
- **F-10** Expediente Digital vista unificada

### 💰 Bloqueadores no-técnicos
- Dominio propio (`app.enaraconsulting.com` sugerido, ~$15/año)
- Vercel Team (mover de cuenta personal a ENARA para SLA)

---

## 7. Workflows operativos de referencia

### 7.1 Deploy de edge function
```
# Vía MCP (NO hay CLI):
mcp__supabase__deploy_edge_function({
  name: "chat-bot",
  entrypoint_path: "index.ts",
  verify_jwt: false,  // OBLIGATORIO
  files: [{ name: "index.ts", content: <contenido-del-archivo> }]
})
```

### 7.2 Bump versión
Editar `src/App.jsx` en dos sitios:
- Línea ~256: `const EXPORT_VIGIA_VERSION = "v3.9.XX";`
- Línea ~2800: `...marginTop:2}}>v3.9.XX</div>`

Luego:
```bash
cd /Users/yopak/Projects/Vigia
npm run build
grep -c "eyJhbGciOi" dist/assets/*.js  # debe retornar 0
git add src/App.jsx
git commit -m "..."
git push origin main
```

### 7.3 Obtener token ES256 para tests
```python
import requests
PUB = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV"
r = requests.post(
  "https://itkbujkqjesuntgdkubt.supabase.co/auth/v1/token?grant_type=password",
  headers={"apikey": PUB, "Content-Type": "application/json"},
  json={"email": "admin@enara.co", "password": "Vigia2026!"}
)
tok = r.json()["access_token"]  # ES256 JWT
```

### 7.4 Crear script de categorización/enriquecimiento
Plantilla base en `scripts/eureka/enrich_obligations_fundamento.py` y
`scripts/eureka/categorize_otra_via_edge.py`. Importantes:
- `load_dotenv(HERE / ".env.local")`
- Throttle con `time.sleep(0.3)` entre llamadas
- Si algo puede devolver None, NUNCA hacer UPDATE con valor None sin guardar

---

## 8. Archivos clave del repo

```
/Users/yopak/Projects/Vigia/
├── CLAUDE.md                          # Regla permanente edges
├── src/App.jsx                        # Frontend monolítico (2800 LOC)
├── supabase/functions/                # 17 edges
│   ├── chat-bot/index.ts              # Bot con 20 reglas de comportamiento
│   ├── norm-search/index.ts           # Búsqueda multi-capa
│   ├── superadmin-proxy/index.ts      # Proxy service-role + whitelist
│   └── ...
├── scripts/eureka/                    # Scripts de corpus/enrich
│   ├── .env.local                     # Secretos (NO commitear)
│   ├── enrich_obligations_fundamento.py  # ya ejecutado, 72 obligations
│   ├── categorize_otra_via_edge.py    # ya ejecutado, 89 normas
│   ├── retry_minambiente_ocr.py       # parcial, 1/19
│   └── retry_minambiente_ocr_report.json  # IDs de los 18 pendientes
└── docs/handoffs/
    ├── VIGIA_HANDOFF_LATEST.md        # Último handoff (= v3.9.17)
    ├── VIGIA_HANDOFF_NEW_CLAUDE_v3917.md  # ESTE archivo
    ├── VIGIA_HANDOFF_2026-04-15_v3917_es256fix.md
    ├── VIGIA_HANDOFF_2026-04-15_v3916_bloqueB.md
    └── VIGIA_HANDOFF_2026-04-15_v3915_seguridad.md
```

---

## 9. Bot de Consultar — 20 reglas obligatorias

Están hardcodeadas en `supabase/functions/chat-bot/index.ts` (SYSTEM_RULES).
Si el usuario pide tunear el bot, modificar esas reglas y redeployar.
Orden de prioridad: REGLA 14 (VIGENCIA) > REGLA 18 (docs propios org) > resto.

Novedades en v3.7.0:
- REGLA 14 VIGENCIA ABSOLUTA (no citar derogados como vigentes)
- REGLA 18 Priorizar docs de la organización del usuario
- REGLA 20 Fuentes pedagógicas (no equiparar a norma vinculante)

---

## 10. Commits recientes (últimos 5)

```
f7f5e6d v3.9.17 — Fix ES256 JWT: 8 edges redeployadas + B2 completado
142978a v3.9.16 — BLOQUE B parcial + hallazgo ES256 JWT
997a796 docs: handoff v3.9.15 seguridad
fd856be v3.9.15 — SEGURIDAD: SB_SERVICE eliminado + superadmin-proxy edge
d9c8f16 docs: handoff master v3.9.14
```

---

## 11. Señales a preguntar vs actuar

**Actuar sin preguntar**:
- Build local, tests, lectura de archivos
- Verificar estado real antes de proponer algo
- Fixes locales claros (bug obvio en un script)

**Preguntar antes**:
- Cualquier deploy de edge (aunque sea redeploy)
- Borrado/modificación de datos productivos
- Cambio de RLS o policies
- Reset de passwords
- Operaciones destructivas en git (force push, reset --hard)

---

## 12. Contacto y recursos externos

- Repo GitHub: `Yopakhome/Vigia`
- Vercel: `vigia-five.vercel.app` (cuenta personal del usuario, pendiente
  mover a Team ENARA)
- Supabase Dashboard: `supabase.com/dashboard/project/itkbujkqjesuntgdkubt`
- Email comercial ENARA: `info@enaraconsulting.com.co`

---

**FIN DEL HANDOFF. Al terminar de leer, confirma al usuario con un mensaje
corto (< 3 líneas) que estás listo para continuar.**
