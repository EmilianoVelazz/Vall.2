-- Observaciones y propuestas rastreables para el apartado global de proteínas.
CREATE TABLE IF NOT EXISTS protein_training_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'imported')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0,
    proposals_created INTEGER NOT NULL DEFAULT 0,
    evidence_sources TEXT[] NOT NULL DEFAULT '{}',
    notice TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protein_source_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_hash TEXT NOT NULL UNIQUE,
    training_run_id TEXT REFERENCES protein_training_runs(id) ON DELETE SET NULL,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    data_type TEXT NOT NULL,
    is_forecast BOOLEAN NOT NULL DEFAULT FALSE,
    data_vintage TEXT,
    retrieved_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protein_research_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_hash TEXT NOT NULL UNIQUE,
    training_run_id TEXT REFERENCES protein_training_runs(id) ON DELETE SET NULL,
    species TEXT NOT NULL CHECK (species IN ('cerdo', 'pollo', 'res', 'huevo', 'acuicultura')),
    title TEXT NOT NULL,
    insight TEXT NOT NULL,
    evidence_source_ids TEXT[] NOT NULL,
    evidence_snapshot_hashes TEXT[] NOT NULL,
    confidence_score NUMERIC(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    status TEXT NOT NULL DEFAULT 'pending_human_review' CHECK (status IN ('pending_human_review', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protein_snapshots_source_time ON protein_source_snapshots(source_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_protein_proposals_status_time ON protein_research_proposals(status, created_at DESC);

ALTER TABLE protein_training_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE protein_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE protein_research_proposals ENABLE ROW LEVEL SECURITY;
