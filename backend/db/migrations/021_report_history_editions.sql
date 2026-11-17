-- Immutable published editions shared by serverless HTTP and cron instances.
BEGIN;
CREATE TABLE IF NOT EXISTS public.report_history_editions (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
    collection TEXT NOT NULL CHECK (collection IN ('finance','markets','mexico')),
    report_key TEXT NOT NULL,
    title TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    publication_timestamp TEXT NOT NULL,
    cut_date DATE NOT NULL,
    report JSONB NOT NULL CHECK (jsonb_typeof(report)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_report_history_collection_cut ON public.report_history_editions(collection,generated_at DESC,id);
CREATE INDEX IF NOT EXISTS ix_report_history_report_cut ON public.report_history_editions(collection,report_key,generated_at DESC,id);
CREATE INDEX IF NOT EXISTS ix_report_history_date_cut ON public.report_history_editions(cut_date,generated_at DESC,id);
ALTER TABLE public.report_history_editions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_history_editions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.report_history_editions TO service_role;
DROP POLICY IF EXISTS vall_report_history_read ON public.report_history_editions;
CREATE POLICY vall_report_history_read ON public.report_history_editions FOR SELECT TO service_role USING(true);
DROP POLICY IF EXISTS vall_report_history_insert ON public.report_history_editions;
CREATE POLICY vall_report_history_insert ON public.report_history_editions FOR INSERT TO service_role WITH CHECK(true);
NOTIFY pgrst,'reload schema';
COMMIT;
