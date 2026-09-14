-- Informes privados de Mercados: granos, energía/metales, proteínas, noticias
-- y panorama integrado. Sólo el backend escribe/expone a sesiones autenticadas.
CREATE TABLE IF NOT EXISTS market_executive_reports (
    report_key TEXT PRIMARY KEY CHECK (report_key IN ('grains', 'energy_metals', 'proteins', 'market_news', 'overview')),
    title TEXT NOT NULL,
    report JSONB NOT NULL,
    source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL,
    next_refresh_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_executive_reports_refresh
    ON market_executive_reports (next_refresh_at);

ALTER TABLE market_executive_reports ENABLE ROW LEVEL SECURITY;
