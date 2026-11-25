-- Fase 1 & 3: Almacén vectorial híbrido (pgvector + tsvector/BM25 RRF) y eventos Closed-Loop para Loopus/ORION.
-- Acceso exclusivo vía service_role desde backend; nunca expuesto a anon/authenticated.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.orion_knowledge_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_key TEXT NOT NULL UNIQUE,
    source_kind TEXT NOT NULL CHECK (source_kind IN (
        'report', 'news', 'loopus_rule', 'few_shot_exemplar', 'market_snapshot', 'protein_benchmark'
    )),
    domain TEXT NOT NULL DEFAULT 'both' CHECK (domain IN ('chat', 'reports', 'both')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    content_tsv TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(content, ''))
    ) STORED,
    embedding vector(768),
    quality_score NUMERIC(5,2) NOT NULL DEFAULT 80.00 CHECK (quality_score >= 0 AND quality_score <= 100),
    as_of_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orion_kv_tsv ON public.orion_knowledge_vectors USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS idx_orion_kv_kind_date ON public.orion_knowledge_vectors (source_kind, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_orion_kv_domain ON public.orion_knowledge_vectors (domain, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_orion_kv_embedding_hnsw ON public.orion_knowledge_vectors
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

ALTER TABLE public.orion_knowledge_vectors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_knowledge_vectors FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orion_knowledge_vectors TO service_role;

CREATE TABLE IF NOT EXISTS public.orion_feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT NOT NULL UNIQUE,
    user_key_hash TEXT,
    query_text TEXT NOT NULL,
    response_text TEXT,
    rating SMALLINT CHECK (rating IS NULL OR (rating >= -1 AND rating <= 5)),
    is_helpful BOOLEAN,
    correction_text TEXT,
    category TEXT,
    source_kind TEXT NOT NULL DEFAULT 'user_feedback' CHECK (source_kind IN ('user_feedback', 'quality_guard', 'benchmark_gap')),
    evaluated_by_loopus BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orion_feedback_eval ON public.orion_feedback_events (evaluated_by_loopus, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orion_feedback_kind ON public.orion_feedback_events (source_kind, created_at DESC);

ALTER TABLE public.orion_feedback_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_feedback_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orion_feedback_events TO service_role;

CREATE OR REPLACE FUNCTION public.orion_hybrid_search(
    query_text TEXT,
    query_embedding vector(768) DEFAULT NULL,
    filter_kinds TEXT[] DEFAULT NULL,
    filter_domain TEXT DEFAULT NULL,
    match_count INTEGER DEFAULT 8,
    rrf_k INTEGER DEFAULT 60
)
RETURNS TABLE (
    doc_key TEXT,
    source_kind TEXT,
    domain TEXT,
    title TEXT,
    content TEXT,
    metadata JSONB,
    quality_score NUMERIC,
    as_of_date DATE,
    vector_score DOUBLE PRECISION,
    lexical_score DOUBLE PRECISION,
    rrf_score DOUBLE PRECISION
)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH candidate_pool AS (
    SELECT v.*
    FROM public.orion_knowledge_vectors v
    WHERE (filter_kinds IS NULL OR v.source_kind = ANY(filter_kinds))
      AND (filter_domain IS NULL OR v.domain = 'both' OR v.domain = filter_domain)
),
vector_ranked AS (
    SELECT c.id,
           (1.0 - (c.embedding <=> query_embedding))::DOUBLE PRECISION AS v_score,
           ROW_NUMBER() OVER (ORDER BY (c.embedding <=> query_embedding) ASC) AS v_rank
    FROM candidate_pool c
    WHERE query_embedding IS NOT NULL AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT GREATEST(match_count * 4, 24)
),
lexical_ranked AS (
    SELECT c.id,
           ts_rank_cd(c.content_tsv, websearch_to_tsquery('spanish', coalesce(query_text, '')))::DOUBLE PRECISION AS l_score,
           ROW_NUMBER() OVER (
               ORDER BY ts_rank_cd(c.content_tsv, websearch_to_tsquery('spanish', coalesce(query_text, ''))) DESC,
                        c.quality_score DESC
           ) AS l_rank
    FROM candidate_pool c
    WHERE coalesce(trim(query_text), '') <> ''
      AND c.content_tsv @@ websearch_to_tsquery('spanish', query_text)
    ORDER BY l_score DESC
    LIMIT GREATEST(match_count * 4, 24)
),
combined AS (
    SELECT COALESCE(vr.id, lr.id) AS id,
           COALESCE(vr.v_score, 0.0) AS vector_score,
           COALESCE(lr.l_score, 0.0) AS lexical_score,
           (CASE WHEN vr.v_rank IS NOT NULL THEN 1.0 / (rrf_k + vr.v_rank) ELSE 0.0 END)
         + (CASE WHEN lr.l_rank IS NOT NULL THEN 1.0 / (rrf_k + lr.l_rank) ELSE 0.0 END) AS rrf_score
    FROM vector_ranked vr
    FULL OUTER JOIN lexical_ranked lr ON lr.id = vr.id
)
SELECT c.doc_key,
       c.source_kind,
       c.domain,
       c.title,
       c.content,
       c.metadata,
       c.quality_score,
       c.as_of_date,
       cb.vector_score,
       cb.lexical_score,
       cb.rrf_score
FROM combined cb
JOIN candidate_pool c ON c.id = cb.id
ORDER BY cb.rrf_score DESC, c.quality_score DESC, c.as_of_date DESC NULLS LAST
LIMIT LEAST(GREATEST(match_count, 1), 32);
$$;

REVOKE ALL ON FUNCTION public.orion_hybrid_search(TEXT, vector, TEXT[], TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_hybrid_search(TEXT, vector, TEXT[], TEXT, INTEGER, INTEGER) TO service_role;

COMMIT;
