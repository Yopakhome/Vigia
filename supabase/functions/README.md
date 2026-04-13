# Supabase Edge Functions — VIGÍA

Versionado inicial: **2026-04-13** (v3.7.0, cierre de deuda técnica §16.13 Sprint A).

Estos archivos son **copias del código desplegado en Supabase** al momento del versionado. Son snapshots, NO una fuente de verdad bidireccional: si modificás una function desde el Supabase Dashboard, debés actualizar este directorio manualmente (o re-descargar con el MCP de Supabase). El deploy sigue haciéndose desde el Dashboard.

## Functions

| Slug | Versión | Descripción |
|------|---------|-------------|
| `analyze-document` | v6 | Analiza PDF/imagen con Claude para sugerir metadata al subir documentos a EDIs. |
| `chat-bot` | v6 | Chat RAG de Consultar: embeddings + recuperación semántica + respuesta con 12 reglas formalizadas. |
| `org-lookup` | v3 | Resuelve org + rol del usuario autenticado (y flag superadmin) para el bootstrap del frontend. |
| `storage-sign` | v3 | Firma URLs temporales de `org-attachments` con validación de pertenencia org-scoped. |
| `publish-intel` | v2 | Inserta filas validadas en `regulatory_alerts` o `normative_sources` desde el pipeline de intel. |
| `superadmin-api` | v3 | API consolidada de SuperAdmin: overview, org_update_requests, crear users/orgs, listar normas y artículos. |
| `orgadmin-users` | v2 | Gestión de usuarios de una org para admins de org (list / create / remove). |
| `norm-validate` | v1 | Aprueba o rechaza normas `pending_validation` (SuperAdmin) y dispara embed en approve. |
| `norm-ingest` | v3 | Ingesta universal de normas: dedup por hash, enrichment LLM, parser de artículos, upload a storage. |
| `norm-extract-text` | v1 | Extrae texto de PDFs (unpdf primero, fallback a OCR con Claude) y devuelve base64 + hash. |
| `norm-embed` | v2 | Genera embeddings OpenAI `text-embedding-3-small` para artículos pendientes de una norma publicada. |
| `norm-search` | v2 | Búsqueda semántica sobre `normative_articles` vía RPC `match_normative_articles` con filtros. |

## Cómo actualizar un snapshot

Desde Claude Code con el MCP de Supabase habilitado:

```
mcp__supabase__get_edge_function function_slug=<slug>
```

Copiar el campo `files[0].content` a `supabase/functions/<slug>/index.ts`.
