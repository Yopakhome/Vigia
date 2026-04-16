# VIGÍA Handoff — v3.9.17 → v3.9.44

**Fecha:** 16 abril 2026  
**Sesión:** sprint completo (27 versiones, ~3,200 líneas netas añadidas)  
**Commit inicial:** 62caab8 (v3.9.17)  
**Commit final:** 334d67c (v3.9.44)  
**Autor:** Claude Opus 4.6 (1M context) + Javier Restrepo (PO)  
**Deploy:** Vercel auto-deploy desde main  
**URL producción:** https://vigia-five.vercel.app  
**URL demo:** https://vigia-five.vercel.app/demo  
**URL privacidad:** https://vigia-five.vercel.app/privacidad

---

## 1. Resumen ejecutivo

27 commits en una sesión. VIGÍA pasó de ser un MVP funcional con bot RAG a una plataforma completa con:
- Modo consultor ENARA (asistente legal por cliente)
- Demo público con corpus real (3 queries)
- Onboarding guiado (wizard 3 pasos)
- Alertas por email (Resend)
- Log de auditoría
- PDF de cumplimiento
- Responsive móvil
- Política de privacidad (Ley 1581/2012)
- Seguridad: RLS verificado, rate limiting, política de contraseñas, refresh token reactivo
- SuperAdmin consolidado con edición de orgs, notas por cliente, métricas de uso

---

## 2. Versiones detalladas

| Versión | Commit | Descripción |
|---------|--------|-------------|
| v3.9.18 | f7f047c | Badge "sin texto" en Normativa + capas Consultar activas + audit script |
| v3.9.19 | aa555fe | Capa pedagógica toggleable en Consultar |
| v3.9.20 | 067d726 | match_org_documents vectorial + embed pipeline INTAKE |
| v3.9.22 | 74fca79 | category en normative_articles + REGLA 21 dominio temático |
| v3.9.23 | 4e98ea7 | pg_cron warmup pgvector + callbacks Dashboard post-INTAKE |
| v3.9.24 | 1fbcba2 | Modo Consultor ENARA: asistente legal junior por cliente |
| v3.9.25 | b3b9ad2 | Título descriptivo EDIs + embed integral INTAKE |
| v3.9.26 | a8d86a4 | client_type (vigia_subscriber/enara_consulting/both) |
| v3.9.27 | 758c63b | Notas por cliente + selector 3 opciones + edición client_type |
| v3.9.28 | 46ad7fb | Editar org SuperAdmin + usuarios solo suscriptores |
| v3.9.29 | ba50e94 | Identificación flexible (NIT/CC/CE/PASAPORTE) + onboarding por documento |
| v3.9.30 | 71936e4 | Fix extractor RUT (DV) + historial bot_queries en UI |
| v3.9.31 | e5f1ffc | Sidebar badge EDIs + confirmación previa Nueva Org |
| v3.9.32 | 4d906d5 | Búsqueda global + dashboard métricas compliance |
| v3.9.33 | 2eacbd6 | Copiar respuesta bot + línea de tiempo + responsive móvil |
| v3.9.34 | f995569 | Modo demo público /demo |
| v3.9.35 | 134fecb | Demo corpus real (3 queries) + límites + métricas cliente |
| v3.9.36 | c352317 | Fix demo: login silencioso demo@vigia.co |
| v3.9.37 | 52b1d9f | Onboarding guiado: wizard 3 pasos |
| v3.9.38 | 64d3dd3 | Alertas email Resend |
| v3.9.39 | fb9f5e9 | Nuevo SuperAdmin + olvidé contraseña + email bienvenida |
| v3.9.40 | 39f448d | Emails activación + audit log + histórico cumplimiento |
| v3.9.41 | c39691d | Seguridad: contraseñas + RLS + refresh + rate limiting |
| v3.9.42 | 2b3911f | Política de privacidad /privacidad |
| v3.9.43 | fcd7d13 | Fix email política + upgrade plan OrgProfile |
| v3.9.44 | 334d67c | PDF de cumplimiento via window.print() |

---

## 3. Arquitectura actual

### App.jsx (4,135 líneas)
Single-file React app. Componentes principales:
- `PoliticaPrivacidad` — página pública /privacidad
- `LoginScreen` — login + olvidé contraseña + link demo + link privacidad
- `IntakeModule` — análisis de documentos con Claude
- `SuperAdminModule` — tabs: Overview, Solicitudes, Curación, Catálogo, Usuarios, Orgs, Nueva Org, Crear Usuario, Auditoría
- `OrgProfileModule` — perfil de org + solicitudes de cambio + sección de plan/upgrade
- `MyTeamModule` — gestión de usuarios de la org (admin self-service)
- `VIGIAApp` — app principal con 15+ vistas

### Edge Functions (19 activas, todas verify_jwt:false)
| Edge | Versión | Función |
|------|---------|---------|
| chat-bot | v20 | RAG bot con 21 reglas + rate limiting 20/hora |
| norm-search | v14 | Búsqueda vectorial + override_org_id SuperAdmin |
| superadmin-api | v14 | 14 operaciones (CRUD orgs/users/notes + extractor identidad) |
| send-alerts | v5 | Alertas email vencimiento + activación usuarios inactivos |
| analyze-document | v10 | Análisis de documentos INTAKE con Claude |
| embed-text | v6 | Generación de embeddings OpenAI |
| norm-search | v14 | RAG vectorial con filtro pedagógico + org docs |
| orgadmin-users | v6 | Admin self-service de usuarios por org |
| vigia-telegram | v4 | Bot de Telegram (consultor jurídico) |
| + 10 más | — | norm-ingest, norm-embed, norm-validate, etc. |

### Tablas Supabase (30 tablas, todas con RLS)
Nuevas en esta sesión:
- `client_notes` — notas internas ENARA por cliente
- `audit_log` — log de auditoría (acciones críticas)
- `rate_limits` — rate limiting por hora por usuario
- `telegram_conversations`, `telegram_users` — Telegram bot

Columnas nuevas en tablas existentes:
- `instruments.title` — título descriptivo generado por Claude
- `normative_articles.category`, `normative_articles.norm_type` — propagados del padre
- `organizations.client_type` — vigia_subscriber|enara_consulting|both
- `organizations.tipo_identificacion`, `organizations.numero_identificacion` — identificación flexible

### RPCs nuevos
- `match_org_documents(query_embedding, match_count, filter_org_id)` — búsqueda vectorial de docs propios

### pg_cron jobs
- `warmup-pgvector` — cada 5 min, mantiene índice caliente

---

## 4. Features implementados por categoría

### Motor de consulta (RAG)
- 5 capas toggleables: Mis documentos, Normativa, Jurisprudencia, Pedagógica (no vinculante), Validación ENARA (próximamente)
- 21 reglas en SYSTEM_RULES del bot (incluye REGLA 20 pedagógica, REGLA 21 dominio temático)
- category visible en fragmentos `[Categoría: Aguas y vertimientos]`
- Rate limiting: 20 queries/hora/usuario (429 con mensaje amigable)
- Historial de consultas (collapsible en Consultar, click-to-reload)
- Copiar respuesta con citas formateadas para informes

### INTAKE (ingesta documental)
- Embed integral: todos los doc_nature (no solo acto_administrativo) se persisten + vectorizan
- edi_title generado por Claude ("Licencia Ambiental · Proyecto X · Barranquilla")
- Límite de EDIs validado (clientOrg.limite_edis)
- Contexto del cliente activo en modo Consultor

### Modo Consultor ENARA
- Vista completa: selector de clientes (grid cards con badge tipo + filtro)
- Contexto del cliente: StatCards + lista EDIs + métricas actividad
- Chat dedicado con systemPrompt de "asistente legal junior"
- override_org_id en norm-search (guarded por SUPERADMIN_EMAILS)
- Notas por cliente (tags, historial, append-only)
- Editar client_type inline desde el banner
- INTAKE con contexto del cliente activo

### SuperAdmin
- Tabs: Overview, Solicitudes, Curación, Catálogo, Usuarios, Orgs, Nueva Org, Crear Usuario, Auditoría
- Editar organización completa (formulario 7 secciones)
- Nueva Org: onboarding por documento (RUT/Cámara de Comercio) + confirmación previa
- Identificación flexible: NIT/CC/CE/PASAPORTE
- Crear usuario con email bienvenida (Resend + recovery link)
- Filtro de orgs por tipo en Crear Usuario
- Botones: Enviar alertas vencimiento, Recordatorios activación, Resetear onboarding
- Log de auditoría (últimos 100 eventos)

### Dashboard
- 4 StatCards (EDIs, vencidas, próximas, al día)
- Compliance rate % con barra de progreso + color contextual
- Próximos vencimientos (top 5 con días y EDI asociado)
- Toggle: Resumen | Línea de tiempo | Histórico
- Línea de tiempo: vertical con dots por mes + badge "HOY"
- Histórico: barras CSS 6 meses con tendencia pp
- Botón PDF de cumplimiento

### Mis EDIs
- Filtros: Todos/Críticos/Próximos/Al día con conteos
- Búsqueda: incluye title, project_name, number, type, authority
- Badge rojo en sidebar con count de vencidas+próximas
- Botón PDF de cumplimiento

### Seguridad
- RLS con is_org_member(org_id) en 11 tablas
- Política de contraseñas: min 8 chars, 1 número, 1 mayúscula (frontend + server)
- Refresh token: proactivo cada 4 min + reactivo en visibilitychange
- Rate limiting: 20 queries/hora en chat-bot (tabla rate_limits)
- Validación email regex (frontend + server)

### UX
- Búsqueda global funcional (instruments, obligations, normSources — 8 max results)
- Responsive móvil (<768px): sidebar hamburguesa, overlay, auto-close
- Onboarding wizard 3 pasos (Bienvenida → INTAKE → Consultar)
- Modo demo /demo: 3 queries reales + datos sintéticos
- Política de privacidad /privacidad (11 secciones, Ley 1581/2012)
- Olvidé contraseña (/auth/v1/recover)
- Upgrade de plan (mailto pre-llenado)
- PDF de cumplimiento (window.print() sin dependencias)

---

## 5. Acciones manuales pendientes

### Críticas (bloquean funcionalidad)
1. **RESEND_API_KEY** — agregar en Supabase Dashboard → Edge Functions → Secrets. Valor: `re_jo2wbByZ_9cfaLNS9mnW7AY9QScrnJLnK`. Sin esto: send-alerts devuelve 500, welcome emails no se envían.
2. **SUPERADMIN_EMAILS** — actualizar en Supabase Dashboard → Edge Functions → Secrets. Valor recomendado: `jrestrepo@enaraconsulting.com.co,admin@enara.co,demo@vigia.co`. Sin esto: jrestrepo no tiene acceso SuperAdmin.

### Recomendadas
3. **pg_net extension** — habilitar para automatizar send-alerts via pg_cron (actualmente manual via botón).
4. **Dominio propio Resend** — "onboarding@resend.dev" es sandbox. Para producción: verificar dominio propio en Resend.
5. **Eliminar admin@enara.co** de Supabase Auth — después de confirmar que jrestrepo funciona como SuperAdmin.

---

## 6. Cuentas de acceso

| Email | Password | Rol | Propósito |
|-------|----------|-----|-----------|
| jrestrepo@enaraconsulting.com.co | Enara2026$ | SuperAdmin (pendiente env) | Nuevo SuperAdmin |
| admin@enara.co | Vigia2026! | SuperAdmin (actual) | Legacy, mantener hasta migración |
| demo@vigia.co | Vigia2026! | SuperAdmin | Login silencioso para /demo |
| ambiental@hidrorverde.com.co | Vigia2026! | Editor (org demo) | Prueba como usuario normal |

---

## 7. Datos en producción

- **8 organizaciones** demo (6 del universo v2 + 2 originales)
- **21 EDIs** con instruments + obligations
- **77 obligaciones** con due_dates distribuidas
- **365 normative_sources** con 14,206 artículos indexados
- **147 jurisprudence_sources**
- **5 bot_queries** registradas
- **1 document** con embedding
- **0 client_notes**, **0 audit_log** (tablas nuevas, sin datos aún)

---

## 8. Archivos modificados esta sesión

```
src/App.jsx                                    +1,693 líneas netas (2,442→4,135)
supabase/functions/chat-bot/index.ts           +51 (rate limiting + override_org_id)
supabase/functions/norm-search/index.ts        +80 (override_org_id + matchOrgDocs vectorial + pedagógico)
supabase/functions/superadmin-api/index.ts     +183 (14 ops: client-notes, update-org, extract-identity, etc.)
supabase/functions/send-alerts/index.ts        +199 (nueva: vencimiento + activación)
scripts/eureka/audit_corpus_estado.py          +76 (nueva: auditoría corpus A/B/C/D)
scripts/eureka/backfill_doc_embeddings.py      +40 (nueva: backfill embeddings)
```

---

## 9. DDL ejecutados (migraciones)

```sql
-- v3.9.20: RPC match_org_documents
-- v3.9.22: ADD COLUMN category/norm_type a normative_articles + UPDATE masivo 14,206 rows + índice
-- v3.9.23: pg_cron warmup-pgvector cada 5min
-- v3.9.25: ADD COLUMN title a instruments
-- v3.9.26: ADD COLUMN client_type a organizations + CHECK + backfill
-- v3.9.27: CREATE TABLE client_notes + índices
-- v3.9.29: ADD COLUMN tipo_identificacion/numero_identificacion a organizations + unique index
-- v3.9.40: CREATE TABLE audit_log + índices
-- v3.9.41: CREATE TABLE rate_limits + unique constraint
```

---

## 10. Próximos pasos recomendados

### Inmediatos (antes del primer cliente real)
1. Configurar RESEND_API_KEY y SUPERADMIN_EMAILS (acciones manuales arriba)
2. Test end-to-end del flujo: crear org con RUT → crear usuario → login → INTAKE → Consultar → PDF
3. Verificar /demo funciona con corpus real (3 queries)
4. Verificar login con jrestrepo@enaraconsulting.com.co como SuperAdmin

### Corto plazo (Sprint 3)
- Chunking de documentos (hoy embed es por doc completo → baja calidad en docs largos)
- Ingesta de textos completos del corpus (365 normas en grupo C sin full_text)
- Integración Wompi para checkout de planes (reemplazar mailto)
- Automatización de send-alerts via pg_net o Vercel Cron

### Medio plazo
- Dashboard por org en modo Consultor (no solo global)
- Exportación de histórico de compliance en Excel
- Notificaciones in-app (web push)
- Multi-idioma (inglés para clientes internacionales)
