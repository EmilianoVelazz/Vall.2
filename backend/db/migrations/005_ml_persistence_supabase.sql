-- Persistencia privada para el ciclo VALL-ML. Estas tablas no se exponen al
-- cliente: el backend escribe mediante la service-role key de Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ml_training_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'imported')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    proposal_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ml_rule_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    training_run_id UUID REFERENCES ml_training_runs(id) ON DELETE SET NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    condition_trigger TEXT NOT NULL,
    learned_rule TEXT NOT NULL,
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    status TEXT NOT NULL DEFAULT 'pending_human_review' CHECK (status IN ('pending_human_review', 'approved', 'rejected')),
    source JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ml_market_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_hash TEXT NOT NULL UNIQUE,
    review JSONB NOT NULL,
    review_status TEXT NOT NULL,
    source_name TEXT,
    source_timestamp BIGINT,
    created_at TIMESTAMPTZ NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_training_runs_started_at ON ml_training_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_rule_proposals_run_id ON ml_rule_proposals(training_run_id);
CREATE INDEX IF NOT EXISTS idx_ml_rule_proposals_status ON ml_rule_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_market_reviews_created_at ON ml_market_reviews(created_at DESC);

ALTER TABLE ml_training_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_rule_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_market_reviews ENABLE ROW LEVEL SECURITY;
