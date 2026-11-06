-- Referencias de mercado ya públicas: conservar lectura y reservar escritura
-- al servidor. No modifica, elimina ni vuelve a importar registros.
BEGIN;
DO $$
DECLARE
    target TEXT;
    owned_sequence RECORD;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'ai_neural_rules', 'mercolleida_sesiones', 'cotizaciones_porcino',
        'cotizaciones_lechon', 'cotizaciones_vacuno', 'cotizaciones_materias_primas',
        'pesos_y_sacrificios', 'mercolleida_series_mensuales',
        'mercolleida_qa_tuning', 'mercolleida_glosario', 'mercolleida_correlaciones'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', target);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', target);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', target);
        EXECUTE format('DROP POLICY IF EXISTS vall_reference_read ON public.%I', target);
        EXECUTE format('CREATE POLICY vall_reference_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', target);

        -- Las identidades también deben quedar fuera del alcance de clientes.
        FOR owned_sequence IN
            SELECT s.oid::regclass AS name
            FROM pg_class s JOIN pg_depend d ON d.objid = s.oid
            WHERE s.relkind = 'S' AND d.classid = 'pg_class'::regclass
                AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
                AND d.refobjid = to_regclass(format('public.%I', target))
        LOOP
            EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', owned_sequence.name);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', owned_sequence.name);
        END LOOP;
    END LOOP;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
