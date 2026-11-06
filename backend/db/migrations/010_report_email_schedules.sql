-- Programaciones privadas de informes ejecutivos enviados cada 12 horas.
CREATE TABLE IF NOT EXISTS report_email_schedules (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    area TEXT NOT NULL CHECK (area IN ('finance', 'markets')),
    report_key TEXT NOT NULL,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    interval_hours SMALLINT NOT NULL DEFAULT 12 CHECK (interval_hours = 12),
    next_run_at TIMESTAMPTZ NOT NULL,
    last_sent_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_email, area, report_key)
);

CREATE INDEX IF NOT EXISTS idx_report_email_schedules_due
    ON report_email_schedules (active, next_run_at);

ALTER TABLE report_email_schedules ENABLE ROW LEVEL SECURITY;
