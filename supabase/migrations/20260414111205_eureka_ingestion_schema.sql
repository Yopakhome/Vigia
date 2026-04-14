-- ============================================================================
-- Sprint A2 Fase 2A — Infraestructura de ingesta para curaduría editorial
-- de EUREKA (ANLA). Agrega:
--   A. Columna corpus_source en normative_sources para distinguir origen
--      ('sprint_a_corpus' vs 'eureka_metadata'). NO se toca la columna
--      `scope` existente, que conserva su semántica temática.
--   B. Tabla eureka_sources_metadata para resumen curado + embedding del
--      resumen + palabras_clave. Polimórfica (soporta normas y sentencias),
--      sin FK hard sobre source_id, integridad garantizada en aplicación.
--   C. Tabla jurisprudence_sources (solo schema — se llena en Fase 2B).
--   D. Tabla concordances: grafo editorial polimórfico entre normas y
--      sentencias. Sin FK hard sobre from_id/to_id, integridad en app.
--
-- Esta migration es atómica: solo infraestructura EUREKA, nada más.
-- La deuda de agregar CHECK a scope existente queda para migration separada
-- (ver SA-DEUDA-8 en handoff).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PARTE A — Extender normative_sources con columna corpus_source
-- ----------------------------------------------------------------------------

ALTER TABLE public.normative_sources
  ADD COLUMN IF NOT EXISTS corpus_source text NOT NULL DEFAULT 'sprint_a_corpus';

-- CHECK constraint: solo 2 valores aceptados en esta fase.
-- Cuando agreguemos Procedimientos/Manuales (Fase 1C), se amplía con otra migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'normative_sources_corpus_source_check'
  ) THEN
    ALTER TABLE public.normative_sources
      ADD CONSTRAINT normative_sources_corpus_source_check
      CHECK (corpus_source IN ('sprint_a_corpus', 'eureka_metadata'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_normative_sources_corpus_source
  ON public.normative_sources (corpus_source);

COMMENT ON COLUMN public.normative_sources.corpus_source IS
  'Origen del registro en el corpus VIGÍA. sprint_a_corpus = 18 normas curadas a mano con seed_urls.json. eureka_metadata = docs de la categoría Normativa de EUREKA (ANLA). Distinto de scope, que es dominio temático (agua, aire, etc.).';


-- ----------------------------------------------------------------------------
-- PARTE B — eureka_sources_metadata
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eureka_sources_metadata (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid        NOT NULL,
  source_type        text        NOT NULL DEFAULT 'norma'
                                 CHECK (source_type IN ('norma', 'sentencia')),
  resumen            text,
  resumen_embedding  extensions.vector(1536),
  palabras_clave     jsonb,
  fecha_ingesta      timestamptz NOT NULL DEFAULT now(),
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Polimórfico: una fila por (source_id, source_type).
  -- NO hay FK hard porque source_id puede apuntar a normative_sources o
  -- jurisprudence_sources. La integridad se garantiza en el código de ingesta.
  CONSTRAINT eureka_sources_metadata_source_unique
    UNIQUE (source_id, source_type)
);

COMMENT ON TABLE public.eureka_sources_metadata IS
  'Metadata editorial curada proveniente de EUREKA (ANLA). Guarda resumen + embedding + palabras_clave por documento. Polimórfica: source_id puede apuntar a normative_sources (source_type=norma) o a jurisprudence_sources (source_type=sentencia). Sin FK hard; integridad garantizada en aplicación. Convención de enum unificada con concordances: se usan los términos del dominio (norma/sentencia), no los nombres de tabla.';

COMMENT ON COLUMN public.eureka_sources_metadata.source_type IS
  'norma = fila en normative_sources. sentencia = fila en jurisprudence_sources. Mismo enum que concordances.from_type/to_type para consistencia del lenguaje de dominio.';

COMMENT ON COLUMN public.eureka_sources_metadata.metadata IS
  'JSONB libre para campos EUREKA que no tienen columna propia: primary_source_url, primary_source_kind, primary_source_host, subcategory, url_eureka, tipo_norma (para rows con source_type=norma), tipo_providencia/corte/radicado (para rows con source_type=sentencia, en Fase 2B), etc.';

-- Trigger updated_at (reutiliza la función `update_updated_at()` existente en public)
DROP TRIGGER IF EXISTS eureka_sources_metadata_updated_at ON public.eureka_sources_metadata;
CREATE TRIGGER eureka_sources_metadata_updated_at
  BEFORE UPDATE ON public.eureka_sources_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Índice HNSW sobre resumen_embedding (mismos parámetros que normative_articles_embedding_hnsw_idx)
CREATE INDEX IF NOT EXISTS eureka_sources_metadata_embedding_hnsw_idx
  ON public.eureka_sources_metadata
  USING hnsw (resumen_embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Lookup por source polimórfico
CREATE INDEX IF NOT EXISTS idx_eureka_sources_metadata_source
  ON public.eureka_sources_metadata (source_type, source_id);

-- RLS
ALTER TABLE public.eureka_sources_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eureka_sources_metadata_select_auth ON public.eureka_sources_metadata;
CREATE POLICY eureka_sources_metadata_select_auth
  ON public.eureka_sources_metadata
  FOR SELECT
  TO authenticated
  USING (true);

-- Writes solo vía service_role (no hay policy de INSERT/UPDATE/DELETE).


-- ----------------------------------------------------------------------------
-- PARTE C — jurisprudence_sources (solo schema — Fase 2A no la llena)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.jurisprudence_sources (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text        NOT NULL UNIQUE,
  radicado                text,
  tipo_providencia        text,
  corte                   text,
  fecha_emision_anio      integer,
  magistrado_ponente      text,
  fecha_emision_full      date,
  title                   text        NOT NULL,
  primary_source_kind     text,
  primary_source_url      text,
  primary_source_host     text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.jurisprudence_sources IS
  'Sentencias curadas por ANLA en la categoría Jurisprudencia de EUREKA. Schema creado en Fase 2A; las 120 filas iniciales se insertan en Fase 2B (separada). Modelo de datos según hallazgos de Sprint A2 Fase 1B (commit 247ed7c): magistrado_ponente y fecha_emision_full quedan casi siempre null porque EUREKA no expone esos campos estructurados en las fichas curadas.';

COMMENT ON COLUMN public.jurisprudence_sources.radicado IS
  'Formato normalizado: C-NNN/YYYY, T-NNN/YYYY, SU-NNN/YYYY, A-NNN/YYYY (Corte Constitucional); CE-YYYY-NNNNN (Consejo de Estado); STC-NNNN/YYYY (Corte Suprema, Sala Casación Civil).';

COMMENT ON COLUMN public.jurisprudence_sources.tipo_providencia IS
  'Sentencia de Constitucionalidad | Sentencia de Tutela | Sentencia de Unificación | Auto | Sentencia (genérico, para cortes distintas a la Corte Constitucional).';

COMMENT ON COLUMN public.jurisprudence_sources.corte IS
  'Corte Constitucional | Consejo de Estado | Corte Suprema de Justicia | Tribunal (Superior de Medellín, etc.).';

-- Trigger updated_at
DROP TRIGGER IF EXISTS jurisprudence_sources_updated_at ON public.jurisprudence_sources;
CREATE TRIGGER jurisprudence_sources_updated_at
  BEFORE UPDATE ON public.jurisprudence_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Lookups típicos
CREATE INDEX IF NOT EXISTS idx_jurisprudence_sources_corte
  ON public.jurisprudence_sources (corte);

CREATE INDEX IF NOT EXISTS idx_jurisprudence_sources_tipo_providencia
  ON public.jurisprudence_sources (tipo_providencia);

CREATE INDEX IF NOT EXISTS idx_jurisprudence_sources_anio
  ON public.jurisprudence_sources (fecha_emision_anio);

-- RLS
ALTER TABLE public.jurisprudence_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jurisprudence_sources_select_auth ON public.jurisprudence_sources;
CREATE POLICY jurisprudence_sources_select_auth
  ON public.jurisprudence_sources
  FOR SELECT
  TO authenticated
  USING (true);


-- ----------------------------------------------------------------------------
-- PARTE D — concordances (grafo editorial polimórfico)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.concordances (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id      uuid        NOT NULL,
  from_type    text        NOT NULL
                           CHECK (from_type IN ('norma', 'sentencia')),
  to_id        uuid,
  to_type      text        CHECK (to_type IS NULL OR to_type IN ('norma', 'sentencia')),
  to_slug      text,
  resolved     boolean     NOT NULL,
  title_plain  text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Invariantes:
  --   resolved=true  → to_id y to_type NOT NULL
  --   resolved=false → to_id y to_type pueden ser NULL (apuntan a docs
  --                    fuera del corpus actual); se conserva to_slug + title_plain
  --                    como texto libre para resolver en el futuro
  CONSTRAINT concordances_resolved_consistency CHECK (
    (resolved = false)
    OR (resolved = true AND to_id IS NOT NULL AND to_type IS NOT NULL)
  )
);

COMMENT ON TABLE public.concordances IS
  'Grafo editorial polimórfico curado por EUREKA (ANLA). Cada fila es un link desde un documento (from_id, from_type) hacia otro (to_id, to_type). Polimórfico: from/to apuntan a normative_sources (from_type=norma) o jurisprudence_sources (from_type=sentencia) sin FK hard. La integridad se garantiza en aplicación. Si necesitás saber si una norma destino es del sprint_a_corpus o eureka_metadata, hacer JOIN con normative_sources y leer corpus_source. IMPORTANTE: los valores del enum son en español del dominio (norma/sentencia), NO los nombres de tabla, para aislar el lenguaje del dominio de la implementación.';

COMMENT ON COLUMN public.concordances.from_type IS
  'norma = from_id apunta a normative_sources.id. sentencia = from_id apunta a jurisprudence_sources.id.';

COMMENT ON COLUMN public.concordances.to_slug IS
  'Slug del doc destino (aplica cuando resolved=false: el doc referenciado no existe todavía en el corpus). title_plain conserva el texto editorial original para facilitar resolución manual futura.';

-- Lookups
CREATE INDEX IF NOT EXISTS idx_concordances_from
  ON public.concordances (from_type, from_id);

CREATE INDEX IF NOT EXISTS idx_concordances_to
  ON public.concordances (to_type, to_id)
  WHERE to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_concordances_resolved
  ON public.concordances (resolved);

-- RLS
ALTER TABLE public.concordances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concordances_select_auth ON public.concordances;
CREATE POLICY concordances_select_auth
  ON public.concordances
  FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================================
-- Fin de la migration
-- ============================================================================
