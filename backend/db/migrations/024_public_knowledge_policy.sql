-- Public knowledge only. Existing rows remain stored but unapproved rows cannot be retrieved.
BEGIN;

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
      AND v.metadata @> '{"visibility":"public","approved_for_retrieval":true}'::jsonb
      AND NOT (v.metadata ?| ARRAY['owner','owner_id','ownerEmail','owner_email','user_id','userId','user_key_hash','tenant_id'])
      AND NOT (v.metadata @> '{"userEdition":true}'::jsonb)
      AND COALESCE(v.metadata->>'origin','') !~* 'benchmark|evaluation|positive_user_feedback'
      AND v.doc_key !~ '^exemplar:(bench|feedback):'
      AND v.quality_score >= 60
      AND (v.as_of_date IS NULL OR v.as_of_date <= CURRENT_DATE)
      AND (v.source_kind NOT IN ('report','news','market_snapshot','protein_benchmark') OR v.as_of_date IS NOT NULL)
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
