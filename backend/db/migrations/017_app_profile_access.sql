-- Mantener las cuentas existentes y sus hashes; no genera ni restablece claves.
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL,
    password_hash TEXT, role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    display_name TEXT NOT NULL DEFAULT '', preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    training_opt_in BOOLEAN NOT NULL DEFAULT TRUE, active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.app_profiles ADD COLUMN IF NOT EXISTS credential_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.app_profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
UPDATE public.app_profiles SET email=lower(btrim(email)) WHERE email<>lower(btrim(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_profiles_email_lower ON public.app_profiles(lower(email));
ALTER TABLE public.app_profiles DROP CONSTRAINT IF EXISTS app_profiles_email_normalized;
ALTER TABLE public.app_profiles ADD CONSTRAINT app_profiles_email_normalized CHECK (
    email=lower(btrim(email)) AND length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
);
ALTER TABLE public.app_profiles DROP CONSTRAINT IF EXISTS app_profiles_password_bcrypt;
ALTER TABLE public.app_profiles ADD CONSTRAINT app_profiles_password_bcrypt CHECK (
    password_hash IS NULL OR password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
);
ALTER TABLE public.app_profiles DROP CONSTRAINT IF EXISTS app_profiles_credential_version_valid;
ALTER TABLE public.app_profiles ADD CONSTRAINT app_profiles_credential_version_valid CHECK (credential_version>=0);
ALTER TABLE public.app_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.app_profiles TO service_role;
DROP POLICY IF EXISTS vall_profiles_server ON public.app_profiles;
CREATE POLICY vall_profiles_server ON public.app_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.vall_update_profile_password(target_id UUID, new_hash TEXT)
RETURNS INTEGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE next_version INTEGER;
BEGIN
    IF new_hash IS NULL OR new_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
        RAISE EXCEPTION 'Se requiere una contraseña cifrada válida';
    END IF;
    UPDATE public.app_profiles SET password_hash=new_hash,credential_version=credential_version+1,
        password_changed_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE id=target_id AND role='user' RETURNING credential_version INTO next_version;
    RETURN next_version;
END;
$$;
REVOKE ALL ON FUNCTION public.vall_update_profile_password(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vall_update_profile_password(UUID,TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
