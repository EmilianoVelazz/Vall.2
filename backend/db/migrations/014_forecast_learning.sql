-- Registro privado de estimaciones originales y resultados reales.
BEGIN;
CREATE TABLE IF NOT EXISTS public.forecast_learning_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_key TEXT NOT NULL UNIQUE CHECK (trial_key ~ '^[a-f0-9]{64}$'),
    symbol TEXT NOT NULL CHECK (length(symbol) BETWEEN 1 AND 20),
    horizon SMALLINT NOT NULL CHECK (horizon BETWEEN 1 AND 20),
    cutoff_at DATE NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    unit TEXT NOT NULL,
    price_basis TEXT NOT NULL,
    anchor_value NUMERIC NOT NULL CHECK (anchor_value > 0),
    model_version TEXT NOT NULL,
    is_published BOOLEAN NOT NULL,
    predicted_value NUMERIC NOT NULL CHECK (predicted_value > 0),
    lower_bound NUMERIC NOT NULL,
    upper_bound NUMERIC NOT NULL,
    candidates JSONB NOT NULL,
    assessment JSONB NOT NULL,
    session_target_date DATE,
    session_target_close_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evaluated', 'data_revised')),
    actual_observed_at DATE,
    outcome JSONB,
    evaluated_at TIMESTAMPTZ,
    CHECK (lower_bound <= upper_bound),
    CHECK (cutoff_at <= (issued_at AT TIME ZONE 'UTC')::date),
    CHECK (actual_observed_at IS NULL OR actual_observed_at > cutoff_at),
    CHECK ((status = 'pending' AND outcome IS NULL AND evaluated_at IS NULL)
        OR (status <> 'pending' AND outcome IS NOT NULL AND evaluated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_forecast_learning_series ON public.forecast_learning_trials(symbol, horizon, issued_at DESC);
ALTER TABLE public.forecast_learning_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forecast_learning_trials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.forecast_learning_trials TO service_role;

CREATE OR REPLACE FUNCTION public.protect_forecast_learning_original()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['status','actual_observed_at','outcome','evaluated_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','actual_observed_at','outcome','evaluated_at'])
        OR OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Una estimación original o un resultado evaluado no se reemplaza';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_forecast_learning_original ON public.forecast_learning_trials;
CREATE TRIGGER protect_forecast_learning_original BEFORE UPDATE ON public.forecast_learning_trials
FOR EACH ROW EXECUTE FUNCTION public.protect_forecast_learning_original();

CREATE OR REPLACE FUNCTION public.complete_forecast_learning_trials(updates JSONB)
RETURNS TABLE(id UUID) LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF jsonb_typeof(updates) <> 'array' OR jsonb_array_length(updates) > 120 THEN
        RAISE EXCEPTION 'Lote de evaluación inválido';
    END IF;
    RETURN QUERY UPDATE public.forecast_learning_trials AS t
        SET status = u.status, actual_observed_at = u.actual_observed_at,
            outcome = u.outcome, evaluated_at = NOW()
        FROM jsonb_to_recordset(updates) AS u(id UUID, status TEXT, actual_observed_at DATE, outcome JSONB)
        WHERE t.id = u.id AND t.status = 'pending'
            AND u.status IN ('evaluated', 'data_revised')
            AND (u.status = 'data_revised' OR (u.actual_observed_at > t.cutoff_at
                AND u.actual_observed_at <= (NOW() AT TIME ZONE 'UTC')::date
                AND ((t.issued_at AT TIME ZONE 'UTC')::date < u.actual_observed_at
                    OR (t.session_target_date = u.actual_observed_at AND t.issued_at < t.session_target_close_at AND t.session_target_close_at <= NOW()))))
        RETURNING t.id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_forecast_learning_trials(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_forecast_learning_original() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_forecast_learning_trials(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_forecast_learning_original() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
