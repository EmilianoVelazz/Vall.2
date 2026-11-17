-- Históricos físicos de fuentes públicas. Ningún acceso desde el navegador.
BEGIN;
CREATE TABLE IF NOT EXISTS public.orion_market_series (
    key TEXT PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'),
    identity JSONB NOT NULL CHECK (jsonb_typeof(identity)='object')
);
CREATE TABLE IF NOT EXISTS public.orion_market_observations (
    series_key TEXT NOT NULL REFERENCES public.orion_market_series(key),
    date DATE NOT NULL,
    value NUMERIC NOT NULL CHECK (value>0 AND value<1e12),
    revised BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY(series_key,date)
);
ALTER TABLE public.orion_market_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_market_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_market_series,public.orion_market_observations FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.orion_market_series,public.orion_market_observations TO service_role;

CREATE OR REPLACE FUNCTION public.orion_observe_market_series(observations JSONB)
RETURNS VOID LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r RECORD;
BEGIN
    IF jsonb_typeof(observations)<>'array' OR jsonb_array_length(observations)>128 THEN
        RAISE EXCEPTION 'Lote de observaciones inválido';
    END IF;
    -- Serialize capacity checks and writes without modifying issued forecasts.
    PERFORM pg_advisory_xact_lock(158254015);
    FOR r IN SELECT * FROM jsonb_to_recordset(observations) AS x(key TEXT,identity JSONB,date DATE,value NUMERIC) LOOP
        IF r.date>(NOW() AT TIME ZONE 'UTC')::date OR r.key !~ '^[a-f0-9]{64}$'
            OR r.value<=0 OR r.value>=1e12 OR jsonb_typeof(r.identity)<>'object' THEN
            RAISE EXCEPTION 'Observación fuera de rango';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM public.orion_market_series WHERE key=r.key)
            AND (SELECT COUNT(*) FROM public.orion_market_series)>=256 THEN
            RAISE EXCEPTION 'Cupo de series agotado';
        END IF;
        INSERT INTO public.orion_market_series(key,identity) VALUES(r.key,r.identity) ON CONFLICT DO NOTHING;
        IF EXISTS(SELECT 1 FROM public.orion_market_series WHERE key=r.key AND identity<>r.identity) THEN
            RAISE EXCEPTION 'La identidad de una serie no se reemplaza';
        END IF;
        INSERT INTO public.orion_market_observations(series_key,date,value) VALUES(r.key,r.date,r.value)
            ON CONFLICT(series_key,date) DO UPDATE
            SET value=EXCLUDED.value,revised=public.orion_market_observations.revised OR public.orion_market_observations.value<>EXCLUDED.value;
        DELETE FROM public.orion_market_observations WHERE series_key=r.key AND date NOT IN
            (SELECT date FROM public.orion_market_observations WHERE series_key=r.key ORDER BY date DESC LIMIT 740);
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.orion_observe_market_series(JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_observe_market_series(JSONB) TO service_role;
COMMIT;
