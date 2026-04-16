# VIGÍA — HANDOFF MASTER v3.9.48

**Fecha:** 16 abril 2026 · **Commit:** 4164b45 · **Build:** 468.49 kB (gzip 124.81 kB)  
**URL prod:** https://vigia-five.vercel.app · **Demo:** /demo · **Privacidad:** /privacidad  
**Repo:** https://github.com/Yopakhome/Vigia (main, push directo)  
**Supabase:** itkbujkqjesuntgdkubt (São Paulo)

---

## 1. RESUMEN EJECUTIVO

VIGÍA es la plataforma de inteligencia regulatoria ambiental colombiana de ENARA Consulting. Permite a empresas gestionar expedientes ambientales (licencias, permisos, concesiones), monitorear obligaciones con fecha límite, y consultar 365 normas + 147 sentencias con IA (RAG vectorial). MVP funcional, listo para primer cliente real. Meta: herramienta de consulta ambiental más completa de Colombia.

---

## 2. STACK TÉCNICO

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite 4.5.14, single-file `src/App.jsx` (4,629 líneas, 380 KB) |
| DB + Auth | Supabase Pro (31 tablas, todas con RLS, pgvector, pg_cron) |
| IA LLM | Anthropic Claude Sonnet (`claude-sonnet-4-20250514`) via edges |
| IA Embed | OpenAI `text-embedding-3-small` (1536 dims) |
| Deploy | Vercel auto-deploy en push a main (~2 min) |
| Email | Resend (onboarding@resend.dev — sandbox, pendiente dominio propio) |
| Bot externo | Telegram (vigia-telegram edge) |

---

## 3. MÉTRICAS REALES DE PRODUCCIÓN (16 abril 2026)

### Corpus normativo
| Dato | Cantidad |
|------|----------|
| Normas (normative_sources) | 365 |
| Artículos normativos (normative_articles) | 14,206 |
| Artículos vectorizados (con embedding) | 14,206 (100%) |
| Sentencias (jurisprudence_sources) | 147 |
| Artículos jurisprudencia | 479 |
| Guías/circulares (pedagógico + circular) | 22 |
| Concordancias normativas | 2,928 |

### Tipos de normas
| Tipo | Cantidad |
|------|----------|
| ley | 196 |
| decreto | 84 |
| otra | 49 |
| resolución | 26 |
| circular | 5 |
| constitución | 3 |
| decreto_ley | 2 |

### Datos operativos
| Dato | Cantidad |
|------|----------|
| Organizaciones | 8 |
| Usuarios (user_org_map) | 24 |
| EDIs (instruments) | 27 |
| Obligaciones | 88 |
| Documentos INTAKE | 1 |
| Consultas al bot (bot_queries) | 20 |
| Tickets soporte | 0 |
| Audit log entries | 0 |
| Client notes | 0 |

---

## 4. EDGE FUNCTIONS (19 activas, TODAS verify_jwt:false)

| Edge | v | Propósito |
|------|---|-----------|
| chat-bot | 20 | RAG bot 21 reglas + rate limit 20/h + override_org_id |
| norm-search | 14 | Búsqueda vectorial pgvector + filtro pedagógico + org docs |
| superadmin-api | 14 | 14 ops: CRUD orgs/users/notes, extractor identidad, welcome email |
| send-alerts | 5 | Email alertas vencimiento + activación usuarios inactivos |
| analyze-document | 10 | INTAKE: análisis de documentos con Claude Vision |
| embed-text | 6 | Generación embeddings OpenAI |
| norm-search | 14 | Búsqueda vectorial multi-capa |
| orgadmin-users | 6 | Admin self-service (list/create/remove users) |
| norm-ingest | 9 | Ingesta de normas al corpus |
| norm-embed | 6 | Embedding masivo de artículos |
| norm-extract-text | 5 | Extracción de texto de normas |
| norm-validate | 5 | Aprobación/rechazo de normas pendientes |
| enrich-org-profile | 6 | Enriquecimiento automático de perfil de org |
| multi-format-extractor | 6 | Extracción de texto multi-formato |
| org-lookup | 7 | Resolución de org + rol del usuario |
| storage-sign | 7 | URLs firmadas para adjuntos |
| publish-intel | 6 | Publicación de alertas regulatorias |
| superadmin-proxy | 6 | Proxy con service_role para SuperAdmin |
| classify-item | 6 | Clasificación de items regulatorios |
| vigia-telegram | 4 | Bot de Telegram (consultor jurídico ENARA) |

**REGLA CRÍTICA:** Todas con `verify_jwt: false` porque Supabase migró a ES256. Las edges validan internamente via `auth/v1/user`.

---

## 5. TABLAS SUPABASE (31 tablas, TODAS con RLS)

### Core operativo
| Tabla | Propósito | Filas |
|-------|-----------|-------|
| organizations | Clientes (vigia_subscriber/enara_consulting/both) | 8 |
| user_org_map | Relación usuario↔org con rol | 24 |
| instruments | EDIs (expedientes digitales) | 27 |
| obligations | Obligaciones con due_date | 88 |
| documents | Documentos subidos via INTAKE | 1 |
| regulatory_alerts | Alertas normativas | — |
| oversight_log | Inspecciones de autoridades | — |
| org_profile | Perfil regulatorio enriquecido por IA | — |
| org_update_requests | Solicitudes de cambio de org (admin→SuperAdmin) | — |
| bot_queries | Historial de consultas al bot RAG | 20 |

### Corpus normativo
| Tabla | Propósito | Filas |
|-------|-----------|-------|
| normative_sources | Normas colombianas | 365 |
| normative_articles | Artículos + embeddings | 14,206 |
| jurisprudence_sources | Sentencias judiciales | 147 |
| jurisprudence_articles | Secciones + embeddings | 479 |
| concordances | Relaciones entre normas | 2,928 |
| eureka_sources_metadata | Metadata de fuentes externas | — |

### Soporte y gestión
| Tabla | Propósito | Filas |
|-------|-----------|-------|
| support_tickets | Tickets de soporte (wizard 3 pasos) | 0 |
| client_notes | Notas internas ENARA por cliente | 0 |
| audit_log | Log de auditoría (acciones críticas) | 0 |
| rate_limits | Rate limiting por hora por usuario | 0 |
| telegram_conversations | Historial Telegram bot | — |
| telegram_users | Usuarios Telegram vinculados | — |

### Comunicaciones (legacy, poco uso)
| Tabla | Propósito |
|-------|-----------|
| communications, communication_threads, communication_actions, communication_analyses | Sistema de comunicaciones (parcialmente implementado) |
| evidences, document_references, alert_matches | Evidencias y alertas (parcialmente implementado) |
| projects, user_profiles | Legacy |

---

## 6. COMPONENTES REACT (App.jsx)

| Componente | Props | Propósito |
|-----------|-------|-----------|
| `MarkdownText` | text | Renderizador markdown ligero |
| `IntakeModule` | onNewAlert, onNewNorm, clientOrg, sessionToken, instruments, obligations, onNewInstrument, onNewObligation, onObligationUpdate | Análisis de documentos con IA |
| `LoginScreen` | onLogin | Login + olvidé contraseña + demo + privacidad |
| `ColombiaLocation` | dpto, ciudad, onDpto, onCiudad, A | Selector departamento/ciudad |
| `SuperAdminModule` | reviewerId, sessionToken | 10 tabs: Overview, Solicitudes, Curación, Catálogo, Usuarios, Orgs, Nueva Org, Crear Usuario, Auditoría, Soporte |
| `OrgProfileModule` | clientOrg, sessionToken, userId | Perfil de org + solicitudes + plan/upgrade |
| `MyTeamModule` | orgId, orgName, limiteUsuarios, sessionToken | Gestión de usuarios (admin) |
| `SupportModule` | clientOrg, session | 2 tabs: Asistente VIGÍA (bot) + Mis tickets (wizard) |
| `PoliticaPrivacidad` | — | Página pública /privacidad (Ley 1581/2012) |
| `VIGIAApp` (default export) | — | App principal: 50+ estados, routing, renders |

---

## 7. FUNCIONES RENDER EN VIGIAApp

| Función | Vista | Datos que consume |
|---------|-------|-------------------|
| `renderDashboard` | Panel de cumplimiento | instruments, obligations, derivedStatus, orgProfile, complianceAlerts |
| `renderEDIs` | Mis EDIs | instruments, obligations, ediHealth, ediSearch, ediFilter |
| `renderEDIDetail` | Detalle de un EDI | selectedEDI, ediObs, obligations |
| `renderInteligencia` | Alertas regulatorias | alerts, unreadAlerts |
| `renderConsultar` | Bot RAG | botMessages, sources, normSources, botHistory |
| `renderNormativa` | Catálogo normativo | normSources, normArticles |
| `renderJurisprudencia` | Catálogo jurisprudencia | jurisprudencia, jurisArticles |
| `renderConceptosGuias` | Guías y circulares | guias (from normative_sources filtradas) |
| `renderOversight` | Inspecciones | oversight |
| `renderConsultorENARA` | Modo consultor ENARA | consultorOrg, consultorInstruments, consultorObligations, consultorMetrics, consultorNotes |

---

## 8. NAVITEMS (sidebar)

| key | icon | label | Visibilidad | Badge |
|-----|------|-------|-------------|-------|
| dashboard | BarChart2 | Dashboard | todos | — |
| edis | Layers | Mis EDIs | todos | vencidas+próximas |
| inteligencia | TrendingUp | Inteligencia | todos | unreadAlerts |
| consultar | MessageSquare | Consultar | todos | — |
| normativa | BookOpen | Normativa | todos | — |
| jurisprudencia | Scale | Jurisprudencia | todos | — |
| conceptos | BookMarked | Conceptos & Guías | todos | — |
| oversight | Shield | Oversight | todos | — |
| intake | Upload | INTAKE | todos | — |
| soporte | MessageSquare | Soporte | !isSuperAdmin | — |
| myteam | Users | Mi equipo | isOrgAdmin | — |
| orgprofile | FileText | Mi organización | isOrgAdmin | — |
| consultor-enara | Scale | Consultor ENARA | isSuperAdmin | sub: consultorOrg?.name |
| superadmin | Shield | SuperAdmin | isSuperAdmin | — |

---

## 9. RENDERIEW ROUTING (orden exacto)

```
superadmin → <SuperAdminModule/>
myteam → <MyTeamModule/>
orgprofile → <OrgProfileModule/>
intake → <IntakeModule/> (con intakeOrg para modo consultor)
edis → renderEDIs()
edi-detail → renderEDIDetail()
inteligencia → renderInteligencia()
consultar → renderConsultar()
normativa → renderNormativa()
jurisprudencia → renderJurisprudencia()
conceptos → renderConceptosGuias()
oversight → renderOversight()
soporte → <SupportModule/>
consultor-enara → renderConsultorENARA()
default → renderDashboard()
```

Pre-routing guards (en orden):
1. `if(isPrivacidadPage)` → `<PoliticaPrivacidad/>`
2. `if(authLoading)` → spinner
3. `if(!session)` → `<LoginScreen/>`
4. `if(showOnboarding && !isSuperAdmin)` → wizard modal overlay

---

## 10. SUPERADMIN TABS

| key | label | Dinámico |
|-----|-------|----------|
| overview | Overview | — |
| requests | Solicitudes (N) | pendingCount |
| curacion | Curación normativa (N) | pendingNormCount |
| catalogo | Catálogo normativo | — |
| users | Usuarios | — |
| orgs | Organizaciones | click → edit panel |
| neworg | + Nueva Org | onboarding doc + confirmación |
| create | Crear usuario | filtro por suscriptores |
| audit | Auditoría | — |
| support | Soporte (N) | tickets abiertos count |

---

## 11. FLUJOS CRÍTICOS

### Login
`sbLogin(email,pwd)` → POST `/auth/v1/token?grant_type=password` → `{access_token, refresh_token, user, expires_at}` → localStorage `vigia_session` → `fetchOrgContext(token)` via edge `org-lookup` → `applyOrgContext({org, role, isSuperAdmin})`

### Demo mode (/demo)
`isDemoMode` → `sbLogin("demo@vigia.co","Vigia2026!")` → real JWT → `applyDemoState(session)` con DEMO_DATA sintéticos (3 EDIs, 5 obligaciones) → `tryConnect` guarded (`if(isDemoMode) return`) → 3 queries reales al corpus → tras 3: respuesta CTA offline

### Token refresh
- Proactivo: useEffect interval 240s, refresh si `expires_at - now < 300`
- Reactivo: visibilitychange listener, refresh al volver al tab

### INTAKE
File → `multi-format-extractor` (OCR/text) → `analyze-document` (Claude Vision con SYSTEM prompt largo) → resultado JSON → usuario revisa → `saveToSupabase()`:
- Solo `acto_administrativo` crea instrument
- Todos los tipos persisten document + embed
- `norma`/`jurisprudencia` skip (pipeline separado)

### Bot RAG (20 queries/hora)
`sendBot()` → `chat-bot` edge:
1. Rate limit check (rate_limits table, 20/hora)
2. `norm-search` edge: embed query → `match_normative_articles` RPC + `match_jurisprudence` + `match_eureka_resumen` + `match_org_documents`
3. Filter pedagógico (excluir si !include_pedagogico)
4. Claude Sonnet con 21 REGLAS + corpusContext + orgContext
5. Response con sources citadas

### PDF compliance
`generateCompliancePDF()` → calcula métricas locales → construye HTML completo con CSS inline → `window.open()` → `document.write(html)` → `window.print()` → usuario guarda como PDF

---

## 12. CREDENCIALES

| Email | Password | Rol | Propósito |
|-------|----------|-----|-----------|
| jrestrepo@enaraconsulting.com.co | Enara2026$ | SuperAdmin (pendiente env) | Nuevo SuperAdmin |
| admin@enara.co | Vigia2026! | SuperAdmin (actual) | Legacy |
| demo@vigia.co | Vigia2026! | SuperAdmin | Login silencioso /demo |
| ambiental@hidrorverde.com.co | Vigia2026! | Editor | Demo empresa |
| director.ambiental@cementosandinos.com.co | Vigia2026! | Editor | Demo empresa |

---

## 13. ACCIONES MANUALES PENDIENTES

### Críticas (bloquean funcionalidad)
1. **RESEND_API_KEY** → Supabase Dashboard → Edge Functions → Secrets → `re_jo2wbByZ_9cfaLNS9mnW7AY9QScrnJLnK`
2. **SUPERADMIN_EMAILS** → Supabase Dashboard → Edge Functions → Secrets → `jrestrepo@enaraconsulting.com.co,admin@enara.co,demo@vigia.co`

### Recomendadas
3. pg_net extension para automatizar send-alerts via pg_cron
4. Dominio propio Resend (reemplazar onboarding@resend.dev)
5. Eliminar admin@enara.co de Auth (después de confirmar jrestrepo)

---

## 14. REGLAS PERMANENTES

1. **Nunca push sin build exitoso** (`npm run build`)
2. **`grep -c "eyJhbGciOi" dist/assets/*.js` siempre debe ser 0** (sin JWT leaks)
3. **Todas las edges: `verify_jwt: false`** (Supabase migró a ES256)
4. **Bump versión semántica** en cada commit que toque App.jsx
5. **Email público ENARA:** info@enaraconsulting.com.co (nunca jrestrepo en público)
6. **Deploy edge vía MCP:** `mcp__supabase__deploy_edge_function` con `verify_jwt: false`
7. **Auth manual en edges:** `verifyUser()` via `auth/v1/user` con anon key
8. **Passwords:** min 8 chars, 1 número, 1 mayúscula (validado frontend + server)

---

## 15. WORKFLOW DE DEPLOY

```bash
cd ~/Projects/Vigia
# editar src/App.jsx
npm run build
grep -c "eyJhbGciOi" dist/assets/*.js  # DEBE ser 0
git add src/App.jsx [otros archivos]
git commit -m "vX.Y.Z — descripción"
git push origin main
# Vercel despliega en ~2 min
# Verificar versión en sidebar de vigia-five.vercel.app
# Si falla: git checkout 4164b45 -- src/App.jsx
```

---

## 16. DECISIONES TÉCNICAS CLAVE

| Decisión | Por qué | Alternativa descartada |
|----------|---------|----------------------|
| Single-file App.jsx | Velocidad de iteración, sin build config | Component tree (más mantenible pero más lento) |
| verify_jwt: false en todas las edges | ES256 migration de Supabase rompe HS256 | Esperar fix de Supabase (incierto) |
| Rate limiting en DB (rate_limits) | Simple, sin Redis | Redis/Upstash (overkill para MVP) |
| window.print() para PDF | Zero dependencies | Puppeteer/PDFKit (pesados, server-side) |
| localStorage para onboarding | Sin backend, per-browser | Campo en DB (innecesario para UX) |
| Demo con login real (demo@vigia.co) | Token JWT válido para edges | Token estático (401 en edges) |
| VIGIA_HELP_SYSTEM en system prompt | Sin API extra, usa chat-bot edge con use_rag:false | Base de conocimiento separada |

---

## 17. HISTORIAL v3.9.17 → v3.9.48 (31 versiones)

| v | Commit | Descripción |
|---|--------|-------------|
| 3.9.18 | f7f047c | Badge "sin texto" Normativa + capas Consultar |
| 3.9.19 | aa555fe | Capa pedagógica toggleable |
| 3.9.20 | 067d726 | match_org_documents vectorial |
| 3.9.22 | 74fca79 | category en normative_articles + REGLA 21 |
| 3.9.23 | 4e98ea7 | pg_cron warmup + callbacks post-INTAKE |
| 3.9.24 | 1fbcba2 | Modo Consultor ENARA |
| 3.9.25 | b3b9ad2 | Título EDIs + embed integral INTAKE |
| 3.9.26 | a8d86a4 | client_type (vigia/enara/both) |
| 3.9.27 | 758c63b | Notas por cliente + edición client_type |
| 3.9.28 | 46ad7fb | Editar org SuperAdmin |
| 3.9.29 | ba50e94 | Identificación flexible NIT/CC/CE/PASAPORTE |
| 3.9.30 | 71936e4 | Fix extractor RUT + historial bot_queries |
| 3.9.31 | e5f1ffc | Badge EDIs + confirmación Nueva Org |
| 3.9.32 | 4d906d5 | Búsqueda global + dashboard métricas |
| 3.9.33 | 2eacbd6 | Copy bot + timeline + responsive móvil |
| 3.9.34 | f995569 | Modo demo /demo |
| 3.9.35 | 134fecb | Demo corpus real (3 queries) + límites |
| 3.9.36 | c352317 | Fix demo: login silencioso |
| 3.9.37 | 52b1d9f | Onboarding wizard 3 pasos |
| 3.9.38 | 64d3dd3 | Alertas email Resend |
| 3.9.39 | fb9f5e9 | SuperAdmin consolidado + olvidé contraseña |
| 3.9.40 | 39f448d | Emails activación + audit log + histórico |
| 3.9.41 | c39691d | Seguridad: contraseñas + RLS + refresh + rate limit |
| 3.9.42 | 2b3911f | Política privacidad /privacidad |
| 3.9.43 | fcd7d13 | Fix email política + upgrade plan |
| 3.9.44 | 334d67c | PDF cumplimiento window.print() |
| 3.9.45 | c1d3968 | Módulo soporte: wizard tickets |
| 3.9.46 | b2aa14d | Asistente VIGÍA en soporte |
| 3.9.47 | b2931ad | Jurisprudencia + Conceptos & Guías |
| 3.9.48 | 4164b45 | VIGIA_HELP_SYSTEM completo + manual PDF |

---

## 18. ESTADO POR MÓDULO

| Módulo | Estado | Datos reales | Pendiente |
|--------|--------|-------------|-----------|
| Dashboard | ✅ Completo | 27 EDIs, 88 obs | — |
| Mis EDIs | ✅ Completo | 27 EDIs | — |
| INTAKE | ✅ Funcional | 1 doc | Chunking docs largos |
| Consultar (bot) | ✅ Completo | 20 queries, 365 normas | — |
| Normativa | ✅ Completo | 365 normas, 14,206 arts | Ingesta full_text (grupo C) |
| Jurisprudencia | ✅ Completo | 147 sentencias, 479 arts | — |
| Conceptos & Guías | ✅ Completo | 22 docs | Ampliar corpus |
| Oversight | ⚠️ Básico | Schema listo | UI de registro falta |
| Mi Organización | ✅ Completo | Plan + upgrade | Wompi checkout |
| Mi Equipo | ✅ Completo | Admin self-service | — |
| Soporte | ✅ Completo | Bot + tickets | — |
| Consultor ENARA | ✅ Completo | Multi-org | — |
| SuperAdmin | ✅ Completo | 10 tabs | — |
| Demo /demo | ✅ Funcional | 3 queries reales | Fix si demo@vigia.co cambia pwd |
| Privacidad | ✅ Completo | 11 secciones | — |
| Onboarding | ✅ Completo | 3 pasos | — |
| Responsive | ✅ Básico | <768px | Grids complejos |
| PDF export | ✅ Completo | window.print() | — |
| Alertas email | ⚠️ Pendiente secret | send-alerts v5 | RESEND_API_KEY manual |
| Telegram | ✅ Deployado | vigia-telegram v4 | — |

---

## 19. BACKLOG PRIORIZADO

| # | Feature | Impacto | Esfuerzo | Estado |
|---|---------|---------|----------|--------|
| 1 | Configurar RESEND_API_KEY | Crítico | 5 min | Manual pendiente |
| 2 | Configurar SUPERADMIN_EMAILS | Crítico | 5 min | Manual pendiente |
| 3 | Ingesta full_text corpus (365 normas grupo C) | Alto | 2-3 días | Pendiente |
| 4 | Chunking de documentos INTAKE (hoy embed por doc completo) | Alto | 1 día | Pendiente |
| 5 | Integración Wompi checkout (reemplazar mailto upgrade) | Medio | 2 días | Pendiente |
| 6 | Automatización send-alerts via pg_net o Vercel Cron | Medio | 1 hora | Pendiente pg_net |
| 7 | Dominio propio Resend | Medio | 30 min | Pendiente |
| 8 | Dashboard por org en Consultor ENARA | Bajo | 1 día | Pendiente |
| 9 | Exportación Excel histórico compliance | Bajo | 4 horas | Pendiente |
| 10 | Notificaciones in-app (web push) | Bajo | 2 días | Pendiente |

---

*Generado por Claude Opus 4.6 (1M context) · 16 abril 2026*
