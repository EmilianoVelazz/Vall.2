-- Pronósticos numéricos privados. El backend escribe con service-role; no se
-- expone lectura/escritura directa al navegador.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS forecast_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,
    interval_code TEXT NOT NULL CHECK (interval_code IN ('1d', '1wk', '1mo')),
    observed_at DATE NOT NULL,
    value NUMERIC NOT NULL,
    quality_score NUMERIC(5,2) NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
    source JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (symbol, interval_code, observed_at)
);

CREATE TABLE IF NOT EXISTS forecast_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_key UUID NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    interval_code TEXT NOT NULL CHECK (interval_code IN ('1d', '1wk', '1mo')),
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    training_start DATE NOT NULL,
    training_end DATE NOT NULL,
    cutoff_at DATE NOT NULL,
    algorithm TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected_baseline', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecast_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_run_id UUID NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    interval_code TEXT NOT NULL CHECK (interval_code IN ('1d', '1wk', '1mo')),
    generated_at TIMESTAMPTZ NOT NULL,
    target_at DATE NOT NULL,
    horizon_code TEXT NOT NULL,
    predicted_value NUMERIC NOT NULL,
    predicted_change_pct NUMERIC,
    lower_bound NUMERIC NOT NULL,
    upper_bound NUMERIC NOT NULL,
    probability_up NUMERIC,
    confidence_score NUMERIC(5,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    explanation TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (lower_bound <= upper_bound),
    CHECK (probability_up IS NULL OR probability_up BETWEEN 0 AND 1)
);

CREATE TABLE IF NOT EXISTS forecast_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL UNIQUE REFERENCES forecast_predictions(id) ON DELETE CASCADE,
    actual_value NUMERIC NOT NULL,
    absolute_error NUMERIC NOT NULL,
    percentage_error NUMERIC,
    interval_covered BOOLEAN NOT NULL,
    evaluated_observation_at DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_observations_series_time ON forecast_observations(symbol, interval_code, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_predictions_symbol_time ON forecast_predictions(symbol, interval_code, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_runs_symbol_time ON forecast_runs(symbol, interval_code, created_at DESC);

ALTER TABLE forecast_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_evaluations ENABLE ROW LEVEL SECURITY;
