# VIGÍA — Backups, Disponibilidad y Recuperación
**ENARA Consulting S.A.S. · Documento técnico para due diligence**  
**Versión:** 1.0 · Abril 2026 · Confidencial

---

## 1. Resumen ejecutivo

VIGÍA opera sobre infraestructura gestionada de nivel empresarial con backups
automáticos diarios, alta disponibilidad por diseño y procedimientos de
recuperación documentados. Este documento resume las garantías de continuidad
del servicio para clientes enterprise que requieren evaluación de riesgo
operacional.

---

## 2. Stack de infraestructura

| Componente | Proveedor | Plan | Región |
|-----------|-----------|------|--------|
| Base de datos + Auth | Supabase | Pro ($25/mes) | São Paulo, Brasil (sa-east-1) |
| Frontend / Hosting | Vercel | Hobby (migración a Team planificada) | Edge global |
| IA — LLM | Anthropic | API Claude Sonnet | us-east-1 |
| IA — Embeddings | OpenAI | API text-embedding-3-small | us-east-1 |
| Email transaccional | Resend | Free (hasta 3.000 emails/mes) | Global |

---

## 3. Backups de base de datos

### 3.1 Configuración actual (Supabase Pro)

| Parámetro | Valor |
|-----------|-------|
| Tipo de backup | Backup completo + WAL (Write-Ahead Log) |
| Frecuencia | **Diaria** — backup completo automático |
| Retención | **7 días** de backups diarios en Supabase Pro |
| Almacenamiento | S3 cifrado (AWS sa-east-1), gestionado por Supabase |
| Cifrado | AES-256 en reposo |
| Verificación | Automática por Supabase (integridad del backup) |

### 3.2 Capacidad de restauración

| Tipo de restauración | Disponibilidad |
|----------------------|----------------|
| Point-in-Time Recovery (PITR) | Disponible en Supabase Pro — cualquier punto en los últimos 7 días |
| Restauración de tabla específica | Disponible vía SQL desde backup |
| Restauración completa | Disponible — nuevo proyecto Supabase desde backup |
| Restauración de fila específica | Disponible vía PITR + SQL |

### 3.3 Tablas críticas respaldadas

Todas las tablas del schema `public` están incluidas en el backup:

- `organizations` — datos de clientes
- `user_org_map` — relación usuarios-organizaciones
- `instruments` — Expedientes Digitales Inteligentes (EDIs)
- `obligations` — obligaciones ambientales por EDI
- `documents` — archivos procesados por INTAKE
- `normative_sources` — corpus normativo (364 normas)
- `normative_articles` — 14.206 artículos vectorizados
- `jurisprudence_sources` — 147 sentencias
- `audit_log` — log de auditoría
- `bot_queries` — historial de consultas

---

## 4. RPO y RTO

### Definiciones
- **RPO (Recovery Point Objective):** Máxima pérdida de datos aceptable — cuánto
  tiempo atrás puede restaurarse el sistema en el peor caso.
- **RTO (Recovery Time Objective):** Tiempo máximo para restaurar el servicio
  tras una interrupción.

### Valores actuales

| Escenario | RPO | RTO | Notas |
|-----------|-----|-----|-------|
| Corrupción de datos (una tabla) | 24 horas | 2-4 horas | PITR disponible, restauración manual por ENARA |
| Falla de instancia Supabase | 0 (replicación) | ~5 min (automático) | Supabase Pro maneja failover automático |
| Eliminación accidental de datos | 24 horas | 1-2 horas | Restauración desde backup diario |
| Falla total de la plataforma Supabase | 24 horas | 4-8 horas | Migración a nueva instancia desde backup |
| Falla de Vercel (frontend) | N/A | ~2 min | Redeploy automático desde GitHub |
| Pérdida de corpus normativo | 0 (repositorio) | 2-4 horas | Scripts de recarga en `/scripts/eureka/` |

### Objetivo para plan Pro/Enterprise
Con la maduración del producto (Q3 2026):

| Parámetro | Objetivo |
|-----------|----------|
| RPO | < 1 hora (con PITR continuo) |
| RTO | < 2 horas |
| Disponibilidad mensual | 99.5% |

---

## 5. Disponibilidad del servicio

### 5.1 SLAs de proveedores base

| Proveedor | SLA publicado | Enlace |
|-----------|---------------|--------|
| Supabase Pro | 99.9% uptime | status.supabase.com |
| Vercel | 99.99% uptime | vercel-status.com |
| Anthropic API | Sin SLA publicado | — |
| OpenAI API | 99.9% uptime | status.openai.com |

### 5.2 Disponibilidad efectiva de VIGÍA

La disponibilidad del servicio de VIGÍA está determinada por la disponibilidad
del componente más crítico. El motor de consulta (bot RAG) depende de Anthropic
API y OpenAI API, que no tienen SLA publicado.

**Disponibilidad estimada:** 99.5% mensual (~3.6 horas de downtime/mes en el
peor caso).

### 5.3 Monitoreo

| Componente | Monitoreo |
|-----------|-----------|
| Frontend (Vercel) | Vercel Analytics + Status page |
| Base de datos (Supabase) | Supabase Dashboard + alertas email |
| Edge Functions | Logs en Supabase Dashboard |
| Status general | Manual — ENARA revisa diariamente |

**Monitoreo automático planificado (Q3 2026):** Uptime Robot o Statuspage.io
para alertas proactivas al equipo ENARA y notificación a clientes.

---

## 6. Seguridad de los datos

| Medida | Estado |
|--------|--------|
| Cifrado en tránsito | ✅ HTTPS/TLS en todas las comunicaciones |
| Cifrado en reposo | ✅ AES-256 (gestionado por Supabase) |
| Aislamiento multicliente | ✅ Row Level Security (RLS) por org_id en todas las tablas |
| Control de acceso | ✅ RBAC: viewer / editor / admin / superadmin |
| Autenticación | ✅ JWT ES256 con expiración automática (1 hora) |
| Refresh automático | ✅ Implementado — refresco cada 45 min + al volver al tab |
| Log de auditoría | ✅ Tabla `audit_log` con eventos críticos |
| Rate limiting | ✅ 20 consultas/hora/usuario en el motor RAG |

---

## 7. Procedimiento de recuperación

### 7.1 Ante pérdida de datos (procedimiento estándar)

1. ENARA identifica el alcance de la pérdida (tablas, filas, rango temporal)
2. Acceso a Supabase Dashboard → Database → Backups
3. Selección del punto de restauración más apropiado
4. Restauración en instancia de staging para verificación
5. Migración de datos recuperados a producción
6. Notificación a clientes afectados

**Contacto de emergencia ENARA:**
- jrestrepo@enaraconsulting.com.co
- +57 314 330 4008 / +57 320 277 3972

### 7.2 Ante falla total de la plataforma

1. Evaluación del origen de la falla (Supabase / Vercel / código)
2. Si es Supabase: esperar recuperación automática o activar backup
3. Si es Vercel: redeploy desde GitHub (`git push origin main`)
4. Si es código: `git checkout <último_commit_estable> -- src/App.jsx`
5. Comunicación a clientes vía email directo

---

## 8. Mejoras planificadas (roadmap)

| Mejora | Plazo estimado |
|--------|----------------|
| Migrar Vercel a Team (SLA enterprise) | Q2 2026 |
| Monitoreo automático (Uptime Robot) | Q3 2026 |
| Backup manual mensual en S3 propio | Q3 2026 |
| Status page pública para clientes | Q3 2026 |
| PITR continuo (< 1 hora RPO) | Q3 2026 |
| DPA firmado con cada cliente | Q2 2026 |

---

## 9. Contacto y escalación

| Rol | Contacto | Disponibilidad |
|-----|----------|----------------|
| Soporte técnico VIGÍA | info@enaraconsulting.com.co | Lunes a viernes 8am-6pm COT |
| Escalación técnica | jrestrepo@enaraconsulting.com.co | Lunes a viernes |
| Emergencias | +57 314 330 4008 | Horario de negocio |

---

*Documento generado por ENARA Consulting S.A.S. — Confidencial.*  
*Para preguntas sobre este documento: info@enaraconsulting.com.co*
