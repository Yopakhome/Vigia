# Sprint A — Fase 0: verificación y plan de Fase 1

Generado 2026-04-13 COT · verificado contra commit `90f5d47` (v3.5.0) y Supabase `itkbujkqjesuntgdkubt`.

## Estado verificado

| Item | Esperado por el briefing | Real verificado | Conclusión |
|---|---|---|---|
| Commit base | v3.5.0 | `90f5d47` v3.5.0 ✓ | OK |
| `normative_sources` filas | 3 | **1** (Decreto 2372/2010 SINAP, `full_text` vacío, residual post-reset) | Discrepancia — ver §1 |
| `regulatory_alerts` filas | — | 1 (misma norma, derogatoria, duplicada del test) | Residual |
| `pgvector` | activable | Disponible v0.8.0, **NO instalada** | Instalar en Fase 2. Soporta `hnsw` y `ivfflat`. |
| Edge Functions | 7 existentes | 7 ✓ (`analyze-document` v6, `chat-bot` v3, `org-lookup` v3, `storage-sign` v3, `publish-intel` v2, `superadmin-api` v2, `orgadmin-users` v2) | OK. Nuevas a crear: `norm-ingest`, `norm-embed`, `norm-search`, `norm-validate`. Modificar: `chat-bot`. |
| Storage buckets | — | 1 existente: `org-attachments` (private, 10 MB, solo PDF) | Crear `normative-pdfs` en Fase 1. |
| `OPENAI_API_KEY` secret | tú lo pondrás en Fase 4 | **No verificable desde MCP** (no hay tool para listar secrets) | Se confirma en Fase 4 con una llamada de prueba. |
| Universo de datos | intacto | 6 orgs · 21 EDIs · 77 obligaciones · 21 auth_users (uno extra, ver §3) | OK. Sprint A no lo toca. |

## Discrepancias con el briefing

### §1 — No hay 3 normas; hay 1 residual
El briefing dice "hoy VIGÍA tiene 3 normas en `normative_sources`". **Real: 1 fila**. Es el Decreto 2372/2010 (SINAP), creado 2026-04-13 16:38 UTC (post-reset de B.0.3), con `full_text` vacío. Probablemente vino de un test que Javier hizo en el INTAKE subiendo un PDF que Claude clasificó como norma, disparando `publish-intel`. Coincide con la única fila en `regulatory_alerts`.

Originalmente (pre-reset de hoy 16:02 UTC) sí había 3 normas (2 duplicados de Ley 1333 + 1 Decreto 1378). Todas fueron limpiadas cuando Javier dijo "Limpia todo, estamos iniciando de 0".

**Impacto**: la Decisión 10 del briefing ("preservar las 3 existentes, migrarlas si tienen texto suficiente") queda sin objeto. La única fila residual tiene `full_text_len=0`, no aporta nada.

### §2 — Schema actual de `normative_sources` (columnas reales)
```
id, norm_type, norm_number, norm_title, issuing_body, issue_date,
effective_date, repeal_date, is_active, domain[], keywords[],
full_text, source_url, last_verified, created_at, updated_at
```

El briefing pide columnas con nombres distintos: `title` (vs `norm_title`), `issuing_authority` (vs `issuing_body`), `publication_date` (vs `issue_date`), `official_url` (vs `source_url`). Esto choca con la directiva "Conserva cualquier columna existente que no sea redundante". Pregunta 2.

### §3 — Un auth.user extra
Briefing esperaba 20. Real: 21. El extra es `sapo@cerrejon-norte.vigia-test.co` (creado 16:30 UTC), sin `user_org_map` ni `user_profiles.org_id`. Probable origen: Javier probó B.6 ("agregar usuario + quitarlo") en el tab Mi Equipo, usando nombre `sapo` en vez del sugerido `temp`. El botón "Quitar" borra `user_org_map` pero **no borra la cuenta de auth** — por eso quedó un huérfano. No crítico, pero es deuda pendiente.

### §4 — Librería de parseo de PDFs en Edge Functions
El briefing sugiere `pdf-parse`, `pdfjs` o `unpdf`. En Deno/Supabase Edge Functions, las opciones realistas son:
- **`unpdf`** (de Cloudflare) — publicado en npm, soporta Deno por import `npm:unpdf`, liviano, no requiere Node APIs.
- `pdfjs-dist` — funciona pero pesado (~5 MB).
- Llamada a Claude con PDF base64 (patrón de `analyze-document`) — costoso como default, útil como fallback para el parser híbrido.

Mi recomendación: `unpdf` como default, Claude como fallback del parser híbrido. Pregunta 3.

## Preguntas (máx 3)

**P1 — Residuales previos a Fase 1.** ¿Borro antes de migrar el schema?
  - Decreto 2372 fantasma en `normative_sources` (sin `full_text`).
  - La fila gemela en `regulatory_alerts`.
  - El auth.user `sapo@cerrejon-norte.vigia-test.co` y su `user_profiles`.
  
  Si sí → limpieza en 3 DELETEs antes del schema migration. Si no → los preservo y la migración los toca como cualquier fila existente.

**P2 — Naming de columnas.** El briefing usa `title`, `issuing_authority`, `publication_date`, `official_url`. La DB usa `norm_title`, `issuing_body`, `issue_date`, `source_url`. ¿Qué prefieres?
  - **A)** Renombrar las 4 columnas al nombre nuevo (requiere actualizar `publish-intel` Edge Function + `renderNormativa` + `handleNewNorm` en App.jsx).
  - **B)** Conservar los nombres actuales, no agregar duplicados, y solo añadir las columnas nuevas del briefing. Documento el mapeo semántico en la migración.
  
  Recomiendo **B** (menos riesgo, respeta la directiva "conserva columnas que no sean redundantes", y los nombres actuales son equivalentes semánticos aceptables).

**P3 — PDF parsing.** ¿Uso **`unpdf`** (npm, Deno-friendly) como parser principal en `norm-ingest`, con fallback a Claude-via-LLM cuando la heurística regex detecta baja calidad? Si preferís otra librería, decímela.

## Plan de ejecución de Fase 1 (para tu aprobación)

Al aprobarme **APROBADO FASE 0**, ejecuto en este orden:

1. **Si P1 dice "borrar"**: 3 DELETEs (norma residual, alerta residual, user huérfano) vía MCP. Transacción. Verifico post-delete.
2. **Migration SQL** para `normative_sources`:
   - Agregar las ~16 columnas nuevas del briefing (según resultado de P2).
   - Añadir `CHECK` constraints: `norm_type` ampliado, `status`, `parser_method`, `parser_quality`.
   - Añadir índices: `(status)`, `(status, scope)`, partial `(proposed_by_org_id) WHERE status='pending_validation'`.
   - Default `status='published'`, `is_universal=true`.
3. **Crear tabla `normative_articles`** con el schema del briefing (sin `embedding` todavía — eso es Fase 2 al activar pgvector).
4. **RLS** para ambas tablas según briefing (SELECT authenticated a published / owner; writes via service_role).
5. **Trigger `update_updated_at`** en `normative_sources`.
6. **Bucket `normative-pdfs`** (private, authenticated read, service_role write, 50 MB file size limit, mime filter a `application/pdf`).
7. **Verificación post-migración**: schema, constraints, índices, policies, bucket. Reporto diff antes/después antes de pedir **APROBADO FASE 1**.

**Nota**: `embedding vector(1536)` en `normative_articles` se agrega en Fase 2 (requiere pgvector instalado). En Fase 1 la tabla queda sin esa columna; Fase 2 hace `ALTER TABLE ... ADD COLUMN embedding vector(1536)`.

## Commitments para el resto del Sprint A

- No toco superadmins (`admin@enara.co`, `javierrestrepov@gmail.com`), ni universo v2 (6 orgs + 18 users + 21 EDIs + 77 obs).
- No invento URLs oficiales en Fase 6 — reporto normas no encontradas.
- No dejo credenciales en código; `OPENAI_API_KEY` solo en secrets.
- Build local limpio antes de cada commit.
- No push sin diff y luz verde.
- Si algo no es viable (pgvector no soporta hnsw, unpdf no compila en Edge Function, etc.), paro y reporto.

---

**Esperando tu respuesta con las 3 preguntas y `APROBADO FASE 0` para arrancar Fase 1.**
