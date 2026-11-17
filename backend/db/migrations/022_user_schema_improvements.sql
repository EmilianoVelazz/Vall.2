-- Mejoras del esquema de usuarios:
-- 1. Unificar gestión de password_hash en app_profiles para cuentas 'user' y 'admin'.
-- 2. Integridad referencial ON DELETE CASCADE en tablas contables chat_credit_*.
-- 3. Tabla hija normalizada app_chat_messages sincronizada automáticamente con app_chat_conversations.
BEGIN;

CREATE OR REPLACE FUNCTION public.vall_update_profile_password(target_id UUID, new_hash TEXT)
RETURNS INTEGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE next_version INTEGER;
BEGIN
    IF new_hash IS NULL OR new_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
        RAISE EXCEPTION 'Se requiere una contraseña cifrada válida';
    END IF;
    UPDATE public.app_profiles
        SET password_hash=new_hash,
            credential_version=credential_version+1,
            password_changed_at=clock_timestamp(),
            updated_at=clock_timestamp()
        WHERE id=target_id AND role IN ('user','admin')
        RETURNING credential_version INTO next_version;
    RETURN next_version;
END;
$$;
REVOKE ALL ON FUNCTION public.vall_update_profile_password(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vall_update_profile_password(UUID,TEXT) TO service_role;

-- Integridad referencial ON DELETE CASCADE en chat_credit_*
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname, c.conrelid::regclass::text AS tbl
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.conrelid IN (
              'public.chat_credit_accounts'::regclass,
              'public.chat_credit_windows'::regclass,
              'public.chat_credit_reservations'::regclass
          )
          AND c.confrelid = 'public.app_profiles'::regclass
          AND c.confdeltype <> 'c'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.chat_credit_accounts'::regclass
          AND confrelid = 'public.app_profiles'::regclass
          AND contype = 'f'
    ) THEN
        ALTER TABLE public.chat_credit_accounts
            ADD CONSTRAINT chat_credit_accounts_profile_id_fkey
            FOREIGN KEY (profile_id) REFERENCES public.app_profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.chat_credit_windows'::regclass
          AND confrelid = 'public.app_profiles'::regclass
          AND contype = 'f'
    ) THEN
        ALTER TABLE public.chat_credit_windows
            ADD CONSTRAINT chat_credit_windows_profile_id_fkey
            FOREIGN KEY (profile_id) REFERENCES public.app_profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.chat_credit_reservations'::regclass
          AND confrelid = 'public.app_profiles'::regclass
          AND contype = 'f'
    ) THEN
        ALTER TABLE public.chat_credit_reservations
            ADD CONSTRAINT chat_credit_reservations_profile_id_fkey
            FOREIGN KEY (profile_id) REFERENCES public.app_profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Tabla hija normalizada de mensajes por conversación
CREATE TABLE IF NOT EXISTS public.app_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL,
    conversation_id TEXT NOT NULL,
    message_index INTEGER NOT NULL CHECK (message_index >= 0),
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_app_chat_messages_conversation
        FOREIGN KEY (profile_id, conversation_id)
        REFERENCES public.app_chat_conversations(profile_id, id)
        ON DELETE CASCADE,
    CONSTRAINT uq_app_chat_messages_position
        UNIQUE (profile_id, conversation_id, message_index)
);

CREATE INDEX IF NOT EXISTS idx_app_chat_messages_conversation
    ON public.app_chat_messages (profile_id, conversation_id, message_index);
CREATE INDEX IF NOT EXISTS idx_app_chat_messages_profile_created
    ON public.app_chat_messages (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_chat_messages_fts
    ON public.app_chat_messages USING GIN (to_tsvector('spanish', COALESCE(content, '')));

-- Función de mantenimiento para purgar sesiones revocadas ya expiradas
CREATE OR REPLACE FUNCTION public.vall_cleanup_expired_session_revocations()
RETURNS INTEGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE deleted_count INTEGER := 0;
BEGIN
    IF to_regclass('public.app_session_revocations') IS NOT NULL THEN
        DELETE FROM public.app_session_revocations WHERE expires_at <= clock_timestamp();
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
    END IF;
    RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.vall_cleanup_expired_session_revocations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vall_cleanup_expired_session_revocations() TO service_role;

ALTER TABLE public.app_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_chat_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.app_chat_messages_id_seq TO service_role;
DROP POLICY IF EXISTS vall_chat_messages_server ON public.app_chat_messages;
CREATE POLICY vall_chat_messages_server ON public.app_chat_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.vall_sync_app_chat_messages()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
    DELETE FROM public.app_chat_messages
    WHERE profile_id = NEW.profile_id AND conversation_id = NEW.id;

    IF jsonb_typeof(NEW.messages) = 'array' AND jsonb_array_length(NEW.messages) > 0 THEN
        INSERT INTO public.app_chat_messages (
            profile_id, conversation_id, message_index, role, content, metadata, created_at
        )
        SELECT
            NEW.profile_id,
            NEW.id,
            (elem.ord - 1)::integer,
            CASE
                WHEN elem.val->>'role' IN ('user', 'assistant', 'system') THEN elem.val->>'role'
                WHEN elem.val->>'sender' = 'ai' THEN 'assistant'
                ELSE 'user'
            END,
            COALESCE(elem.val->>'content', elem.val->>'text', ''),
            elem.val - 'role' - 'sender' - 'content' - 'text',
            COALESCE(NEW.updated_at, NOW())
        FROM jsonb_array_elements(NEW.messages) WITH ORDINALITY AS elem(val, ord)
        WHERE jsonb_typeof(elem.val) = 'object';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_app_chat_messages ON public.app_chat_conversations;
CREATE TRIGGER trg_sync_app_chat_messages
    AFTER INSERT OR UPDATE OF messages ON public.app_chat_conversations
    FOR EACH ROW EXECUTE FUNCTION public.vall_sync_app_chat_messages();
REVOKE ALL ON FUNCTION public.vall_sync_app_chat_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vall_sync_app_chat_messages() TO service_role;

-- Endurecimiento de privilegios (defensa en profundidad) en todas las tablas privadas del servidor:
-- revoca privilegios de tabla a PUBLIC, anon y authenticated y garantiza acceso exclusivo a service_role.
DO $$
DECLARE
    tbl TEXT;
    pol TEXT;
    private_tables TEXT[] := ARRAY[
        'app_chat_conversations',
        'app_training_queries',
        'orion_query_audit',
        'finance_executive_reports',
        'market_executive_reports',
        'report_email_schedules',
        'ml_market_reviews',
        'ml_rule_proposals',
        'ml_training_events',
        'ml_training_runs',
        'protein_research_proposals',
        'protein_source_snapshots',
        'protein_training_runs'
    ];
BEGIN
    FOREACH tbl IN ARRAY private_tables LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', tbl);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
            pol := 'vall_' || tbl || '_server';
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                pol, tbl
            );
        END IF;
    END LOOP;
END $$;

-- Sincronizar conversaciones existentes en app_chat_messages
DELETE FROM public.app_chat_messages;
INSERT INTO public.app_chat_messages (
    profile_id, conversation_id, message_index, role, content, metadata, created_at
)
SELECT
    c.profile_id,
    c.id,
    (elem.ord - 1)::integer,
    CASE
        WHEN elem.val->>'role' IN ('user', 'assistant', 'system') THEN elem.val->>'role'
        WHEN elem.val->>'sender' = 'ai' THEN 'assistant'
        ELSE 'user'
    END,
    COALESCE(elem.val->>'content', elem.val->>'text', ''),
    elem.val - 'role' - 'sender' - 'content' - 'text',
    COALESCE(c.updated_at, NOW())
FROM public.app_chat_conversations c
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.messages) = 'array' THEN c.messages ELSE '[]'::jsonb END
) WITH ORDINALITY AS elem(val, ord)
WHERE jsonb_typeof(elem.val) = 'object';

NOTIFY pgrst, 'reload schema';
COMMIT;
