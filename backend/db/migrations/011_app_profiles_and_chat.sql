-- Perfiles privados, preferencias e historial personalizado de VALLNEWS.
CREATE TABLE IF NOT EXISTS app_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    display_name TEXT NOT NULL DEFAULT '',
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    training_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_profiles_email_lower ON app_profiles (LOWER(email));

CREATE TABLE IF NOT EXISTS app_chat_conversations (
    id TEXT NOT NULL,
    profile_id UUID NOT NULL REFERENCES app_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Nueva conversación',
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (profile_id, id)
);

CREATE INDEX IF NOT EXISTS idx_app_chat_conversations_profile_updated
    ON app_chat_conversations (profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app_training_queries (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES app_profiles(id) ON DELETE CASCADE,
    conversation_id TEXT,
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    source_query_id BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    approved_for_training BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_training_queries_profile_created
    ON app_training_queries (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_training_queries_training
    ON app_training_queries (approved_for_training, created_at DESC);

ALTER TABLE app_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_training_queries ENABLE ROW LEVEL SECURITY;

-- Las consultas quedan disponibles para revisión, pero nunca entran al corpus
-- de entrenamiento de forma automática sin una aprobación explícita.
ALTER TABLE app_training_queries ALTER COLUMN approved_for_training SET DEFAULT FALSE;
