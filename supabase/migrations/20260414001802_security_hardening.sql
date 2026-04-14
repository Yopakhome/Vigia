-- Security hardening aplicado el 2026-04-13.
-- Cierra 2 de los 3 warnings activos de Supabase Database Advisors.
-- Warning A (HIBP password protection) requiere activación manual en el Dashboard de Auth.
--
-- Ambas migrations ya fueron aplicadas vía MCP y quedan registradas en supabase_migrations.schema_migrations
-- con los nombres:
--   20260414001724_security_hardening_pg_trgm_schema
--   20260414001753_security_hardening_update_updated_at_search_path
--
-- Este archivo existe para dejar trazabilidad en git del cambio.

-- Warning B — pg_trgm fuera de schema public.
-- Verificado antes de mover: sin índices, funciones o código que usen pg_trgm en el proyecto.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Warning C — fijar search_path explícito en función trigger update_updated_at
-- para bloquear search_path injection.
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
