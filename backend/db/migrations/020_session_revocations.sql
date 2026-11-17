-- Per-session revocation shared by serverless instances. Stores no raw JWTs.
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_session_revocations (
    digest TEXT PRIMARY KEY CHECK (digest ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_session_revocations_expiry ON public.app_session_revocations(expires_at);
ALTER TABLE public.app_session_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_session_revocations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.app_session_revocations TO service_role;
DROP POLICY IF EXISTS vall_session_revocations_server ON public.app_session_revocations;
CREATE POLICY vall_session_revocations_server ON public.app_session_revocations FOR ALL TO service_role USING(true) WITH CHECK(true);
NOTIFY pgrst,'reload schema';
COMMIT;
