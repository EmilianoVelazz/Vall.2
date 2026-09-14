-- Informes ejecutivos de Finanzas. Son privados: el backend los expone sólo a
-- sesiones autenticadas y escribe con service role o conexión de servidor.
CREATE TABLE IF NOT EXISTS finance_executive_reports (
    report_key TEXT PRIMARY KEY CHECK (report_key IN ('equities', 'bonds', 'fx', 'daily_news', 'overview')),
    title TEXT NOT NULL,
    report JSONB NOT NULL,
    source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL,
    next_refresh_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_executive_reports_refresh
    ON finance_executive_reports (next_refresh_at);

ALTER TABLE finance_executive_reports ENABLE ROW LEVEL SECURITY;
