-- ============================================================
-- VIGÍA — Telegram Bot Schema
-- 2026-04-15
-- Diseñado para: interno ENARA hoy, clientes por tier mañana
-- ============================================================

-- ── telegram_users ───────────────────────────────────────────
-- Un registro por usuario de Telegram autorizado.
-- mode='enara_internal': consultores ENARA, sin restricción de org.
-- mode='client': usuario cliente futuro, vinculado a una org + tier.

CREATE TABLE IF NOT EXISTS telegram_users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id     BIGINT UNIQUE NOT NULL,
  telegram_username    TEXT,
  telegram_first_name  TEXT,

  -- Vínculo futuro con cuenta VIGÍA web
  supabase_user_id     uuid,

  -- Para modo cliente: qué org pertenece y qué tier tiene
  org_id               uuid REFERENCES organizations(id) ON DELETE SET NULL,
  mode                 TEXT NOT NULL DEFAULT 'enara_internal'
                         CHECK (mode IN ('enara_internal', 'client')),
  tier                 TEXT NOT NULL DEFAULT 'pro'
                         CHECK (tier IN ('free', 'pro', 'enterprise')),

  -- Estado
  is_active            BOOLEAN NOT NULL DEFAULT true,

  -- Sesión actual de conversación
  current_session_id   TEXT,

  -- Contexto de cliente activo (solo modo enara_internal)
  -- Ej: "Cementos Boyacá S.A. — sector cementero, Boyacá"
  client_context       TEXT,

  -- Rate limiting diario (se resetea cada día)
  daily_query_count    INTEGER NOT NULL DEFAULT 0,
  daily_query_date     DATE DEFAULT CURRENT_DATE,
  daily_query_limit    INTEGER NOT NULL DEFAULT 150,

  -- Metadata
  notes                TEXT,  -- notas del admin sobre este usuario
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE telegram_users IS 'Usuarios autorizados del bot de Telegram VIGÍA';
COMMENT ON COLUMN telegram_users.mode IS 'enara_internal=consultor ENARA, client=usuario cliente';
COMMENT ON COLUMN telegram_users.tier IS 'Para modo client: free/pro/enterprise. Interno siempre pro+';
COMMENT ON COLUMN telegram_users.client_context IS 'ENARA interno: cliente activo en consulta actual';
COMMENT ON COLUMN telegram_users.daily_query_limit IS 'Consultas máximas por día. Interno=150, free=10, pro=50, enterprise=200';

-- ── telegram_conversations ───────────────────────────────────
-- Historial de conversaciones. Una fila por turno (user o assistant).
-- session_id agrupa una conversación. /nuevo genera nuevo session_id.

CREATE TABLE IF NOT EXISTS telegram_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id  BIGINT NOT NULL,
  session_id        TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT NOT NULL,

  -- Solo para mensajes de assistant
  sources           JSONB,          -- fuentes RAG retornadas
  tokens_in         INTEGER,
  tokens_out        INTEGER,
  rag_elapsed_ms    INTEGER,
  rag_results_count INTEGER,

  -- Contexto de cliente en el momento del mensaje (snapshot)
  client_context    TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tgconv_session
  ON telegram_conversations(telegram_user_id, session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_tgconv_recent
  ON telegram_conversations(telegram_user_id, created_at DESC);

COMMENT ON TABLE telegram_conversations IS 'Historial de conversaciones del bot de Telegram';

-- ── RLS: solo service_role accede ────────────────────────────
-- Las tablas de Telegram no necesitan RLS para usuarios web.
-- Solo el edge function (service_role) las lee/escribe.

ALTER TABLE telegram_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only" ON telegram_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_only" ON telegram_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed inicial: equipo ENARA ────────────────────────────────
-- Completar los telegram_user_id reales después de hacer /start en el bot.
-- Ver instrucciones en scripts/telegram_setup.md

-- INSERT INTO telegram_users (telegram_user_id, telegram_first_name, telegram_username, mode, tier, notes)
-- VALUES
--   (XXXXXXXXX, 'Nombre', '@username', 'enara_internal', 'pro', 'Socio fundador ENARA'),
--   (XXXXXXXXX, 'Nombre', '@username', 'enara_internal', 'pro', 'Consultora senior ENARA');

-- ── Vista de auditoría ────────────────────────────────────────
CREATE OR REPLACE VIEW telegram_usage_summary AS
SELECT
  u.telegram_first_name,
  u.telegram_username,
  u.mode,
  u.is_active,
  u.daily_query_count,
  u.last_seen,
  COUNT(c.id) FILTER (WHERE c.role = 'user') AS total_queries,
  COUNT(c.id) FILTER (WHERE c.role = 'user' AND c.created_at > now() - interval '7 days') AS queries_last_7d,
  SUM(c.tokens_in + COALESCE(c.tokens_out, 0)) FILTER (WHERE c.role = 'assistant') AS total_tokens
FROM telegram_users u
LEFT JOIN telegram_conversations c ON c.telegram_user_id = u.telegram_user_id
GROUP BY u.id, u.telegram_first_name, u.telegram_username, u.mode, u.is_active, u.daily_query_count, u.last_seen
ORDER BY total_queries DESC;

COMMENT ON VIEW telegram_usage_summary IS 'Uso del bot de Telegram por usuario — para monitoreo en SuperAdmin';
