-- Auditoría privada de ORION. Es independiente de app_training_queries:
-- todas las consultas quedan trazables aunque la persona no autorice usar sus
-- mensajes para entrenamiento. El navegador nunca accede directamente a esta tabla.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS orion_query_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES app_profiles(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_display_name TEXT NOT NULL DEFAULT '',
    conversation_id TEXT,
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL DEFAULT '',
    requested_mode TEXT NOT NULL DEFAULT 'auto',
    selected_tier TEXT NOT NULL DEFAULT 'flash' CHECK (selected_tier IN ('flash', 'pro')),
    selected_model TEXT NOT NULL DEFAULT '',
    domain_allowed BOOLEAN NOT NULL,
    domain_reason TEXT NOT NULL DEFAULT '',
    source_query_id BIGINT,
    latency_ms INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orion_query_audit_profile_created
    ON orion_query_audit (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orion_query_audit_conversation_created
    ON orion_query_audit (conversation_id, created_at DESC)
    WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orion_query_audit_domain_created
    ON orion_query_audit (domain_allowed, created_at DESC);

ALTER TABLE orion_query_audit ENABLE ROW LEVEL SECURITY;
