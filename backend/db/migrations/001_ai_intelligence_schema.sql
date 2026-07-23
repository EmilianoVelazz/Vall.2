-- VALLNews · Base de conocimiento, históricos y evaluación predictiva
-- Compatible con MariaDB 10.4 (XAMPP). Migración idempotente y no destructiva.

ALTER DATABASE `vall_` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version             VARCHAR(80)  NOT NULL,
    description         VARCHAR(255) NOT NULL,
    applied_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_sources (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code                VARCHAR(60)  NOT NULL,
    name                VARCHAR(160) NOT NULL,
    source_type         VARCHAR(40)  NOT NULL,
    base_url            VARCHAR(500) NULL,
    trust_score         DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    refresh_seconds     INT UNSIGNED NULL,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    terms               VARCHAR(255) NULL,
    metadata            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_data_sources_code (code),
    KEY idx_data_sources_active_type (is_active, source_type),
    CONSTRAINT chk_data_sources_trust CHECK (trust_score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id           BIGINT UNSIGNED NOT NULL,
    job_type            VARCHAR(60)  NOT NULL,
    status              VARCHAR(24)  NOT NULL DEFAULT 'running',
    started_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    finished_at         DATETIME(6)  NULL,
    records_read        INT UNSIGNED NOT NULL DEFAULT 0,
    records_written     INT UNSIGNED NOT NULL DEFAULT 0,
    records_rejected    INT UNSIGNED NOT NULL DEFAULT 0,
    cursor_value        VARCHAR(500) NULL,
    error_message       TEXT         NULL,
    metadata            JSON         NULL,
    PRIMARY KEY (id),
    KEY idx_ingestion_source_started (source_id, started_at),
    KEY idx_ingestion_status_started (status, started_at),
    CONSTRAINT fk_ingestion_source FOREIGN KEY (source_id) REFERENCES data_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS market_instruments (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id           BIGINT UNSIGNED NOT NULL,
    symbol              VARCHAR(80)  NOT NULL,
    name                VARCHAR(180) NOT NULL,
    asset_class         VARCHAR(40)  NOT NULL,
    exchange_code       VARCHAR(40)  NULL,
    currency_code       CHAR(3)      NULL,
    unit                VARCHAR(60)  NULL,
    timezone_name       VARCHAR(80)  NULL,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    metadata            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_instrument_source_symbol (source_id, symbol),
    KEY idx_instrument_class_active (asset_class, is_active),
    KEY idx_instrument_symbol (symbol),
    CONSTRAINT fk_instrument_source FOREIGN KEY (source_id) REFERENCES data_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS market_observations (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    instrument_id       BIGINT UNSIGNED NOT NULL,
    source_id           BIGINT UNSIGNED NOT NULL,
    ingestion_run_id    BIGINT UNSIGNED NULL,
    observed_at         DATETIME(6)  NOT NULL,
    interval_code       VARCHAR(12)  NOT NULL,
    open_value          DECIMAL(24,8) NULL,
    high_value          DECIMAL(24,8) NULL,
    low_value           DECIMAL(24,8) NULL,
    close_value         DECIMAL(24,8) NULL,
    value               DECIMAL(24,8) NULL,
    volume              DECIMAL(28,8) NULL,
    change_pct          DECIMAL(14,6) NULL,
    quality_score       DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    is_estimated        TINYINT(1)   NOT NULL DEFAULT 0,
    raw_payload         JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_market_point (instrument_id, source_id, observed_at, interval_code),
    KEY idx_market_instrument_time (instrument_id, observed_at),
    KEY idx_market_source_time (source_id, observed_at),
    KEY idx_market_run (ingestion_run_id),
    CONSTRAINT fk_market_instrument FOREIGN KEY (instrument_id) REFERENCES market_instruments(id),
    CONSTRAINT fk_market_source FOREIGN KEY (source_id) REFERENCES data_sources(id),
    CONSTRAINT fk_market_run FOREIGN KEY (ingestion_run_id) REFERENCES ingestion_runs(id),
    CONSTRAINT chk_market_quality CHECK (quality_score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS economic_series (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id           BIGINT UNSIGNED NOT NULL,
    series_code         VARCHAR(100) NOT NULL,
    name                VARCHAR(220) NOT NULL,
    category            VARCHAR(60)  NOT NULL,
    country_code        CHAR(2)      NULL,
    frequency_code      VARCHAR(16)  NOT NULL,
    unit                VARCHAR(80)  NOT NULL,
    seasonal_adjustment VARCHAR(60)  NULL,
    description         TEXT         NULL,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    metadata            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_economic_source_series (source_id, series_code),
    KEY idx_economic_category_country (category, country_code),
    CONSTRAINT fk_economic_series_source FOREIGN KEY (source_id) REFERENCES data_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS economic_observations (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    series_id           BIGINT UNSIGNED NOT NULL,
    ingestion_run_id    BIGINT UNSIGNED NULL,
    period_date         DATE         NOT NULL,
    value               DECIMAL(24,8) NOT NULL,
    release_at          DATETIME     NULL,
    revision_number     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_preliminary      TINYINT(1)   NOT NULL DEFAULT 0,
    quality_score       DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    raw_payload         JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_economic_point_revision (series_id, period_date, revision_number),
    KEY idx_economic_series_period (series_id, period_date),
    KEY idx_economic_release (release_at),
    CONSTRAINT fk_economic_observation_series FOREIGN KEY (series_id) REFERENCES economic_series(id),
    CONSTRAINT fk_economic_observation_run FOREIGN KEY (ingestion_run_id) REFERENCES ingestion_runs(id),
    CONSTRAINT chk_economic_quality CHECK (quality_score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id           BIGINT UNSIGNED NOT NULL,
    external_id         VARCHAR(255) NULL,
    canonical_url       VARCHAR(1000) NULL,
    title               VARCHAR(500) NOT NULL,
    document_type       VARCHAR(40)  NOT NULL,
    language_code       VARCHAR(10)  NOT NULL DEFAULT 'es',
    published_at        DATETIME     NULL,
    effective_from      DATE         NULL,
    effective_to        DATE         NULL,
    body_text           LONGTEXT     NULL,
    body_sha256         CHAR(64)     NOT NULL,
    status              VARCHAR(24)  NOT NULL DEFAULT 'active',
    metadata            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_document_hash (body_sha256),
    UNIQUE KEY uq_document_source_external (source_id, external_id),
    KEY idx_document_source_published (source_id, published_at),
    KEY idx_document_status_type (status, document_type),
    FULLTEXT KEY ftx_document_title_body (title, body_text),
    CONSTRAINT fk_document_source FOREIGN KEY (source_id) REFERENCES data_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    document_id         BIGINT UNSIGNED NOT NULL,
    chunk_index         INT UNSIGNED NOT NULL,
    heading_path        VARCHAR(1000) NULL,
    content             TEXT         NOT NULL,
    token_count         INT UNSIGNED NULL,
    embedding_model     VARCHAR(120) NULL,
    embedding_dimensions SMALLINT UNSIGNED NULL,
    embedding           LONGBLOB     NULL COMMENT 'Vector float32 serializado; MariaDB 10.4 no ofrece VECTOR nativo',
    embedding_norm      DOUBLE       NULL,
    metadata            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chunk_document_index (document_id, chunk_index),
    KEY idx_chunk_document (document_id),
    FULLTEXT KEY ftx_chunk_content (heading_path, content),
    CONSTRAINT fk_chunk_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_events (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id           BIGINT UNSIGNED NOT NULL,
    document_id         BIGINT UNSIGNED NULL,
    external_id         VARCHAR(255) NULL,
    event_type          VARCHAR(60)  NOT NULL,
    title               VARCHAR(500) NOT NULL,
    summary             TEXT         NULL,
    occurred_at         DATETIME     NOT NULL,
    country_code        CHAR(2)      NULL,
    region_code         VARCHAR(30)  NULL,
    sentiment_score     DECIMAL(7,4) NULL,
    impact_score        DECIMAL(5,2) NULL,
    confidence_score    DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    metadata            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_source_external (source_id, external_id),
    KEY idx_event_time_type (occurred_at, event_type),
    KEY idx_event_country_time (country_code, occurred_at),
    FULLTEXT KEY ftx_event_title_summary (title, summary),
    CONSTRAINT fk_event_source FOREIGN KEY (source_id) REFERENCES data_sources(id),
    CONSTRAINT fk_event_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE SET NULL,
    CONSTRAINT chk_event_confidence CHECK (confidence_score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_instruments (
    event_id            BIGINT UNSIGNED NOT NULL,
    instrument_id       BIGINT UNSIGNED NOT NULL,
    relationship_type   VARCHAR(40) NOT NULL DEFAULT 'affected',
    relevance_score     DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    expected_direction  VARCHAR(16) NULL,
    PRIMARY KEY (event_id, instrument_id),
    KEY idx_event_instrument (instrument_id, event_id),
    CONSTRAINT fk_event_link_event FOREIGN KEY (event_id) REFERENCES knowledge_events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_link_instrument FOREIGN KEY (instrument_id) REFERENCES market_instruments(id) ON DELETE CASCADE,
    CONSTRAINT chk_event_relevance CHECK (relevance_score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_runs (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    model_name          VARCHAR(160) NOT NULL,
    model_version       VARCHAR(80)  NOT NULL,
    training_start      DATE         NULL,
    training_end        DATE         NULL,
    cutoff_at           DATETIME(6)  NOT NULL,
    algorithm           VARCHAR(100) NOT NULL,
    feature_manifest    JSON         NULL,
    parameters          JSON         NULL,
    status              VARCHAR(24)  NOT NULL DEFAULT 'completed',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_prediction_run_model_time (model_name, cutoff_at),
    KEY idx_prediction_run_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS predictions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prediction_run_id   BIGINT UNSIGNED NOT NULL,
    instrument_id       BIGINT UNSIGNED NULL,
    economic_series_id  BIGINT UNSIGNED NULL,
    generated_at        DATETIME(6) NOT NULL,
    target_at           DATETIME(6) NOT NULL,
    horizon_code        VARCHAR(20) NOT NULL,
    predicted_value     DECIMAL(24,8) NULL,
    predicted_change_pct DECIMAL(14,6) NULL,
    lower_bound         DECIMAL(24,8) NULL,
    upper_bound         DECIMAL(24,8) NULL,
    probability_up      DECIMAL(7,6) NULL,
    confidence_score    DECIMAL(5,2) NOT NULL,
    explanation         TEXT         NULL,
    evidence            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_prediction_target (prediction_run_id, instrument_id, economic_series_id, target_at, horizon_code),
    KEY idx_prediction_instrument_target (instrument_id, target_at),
    KEY idx_prediction_series_target (economic_series_id, target_at),
    KEY idx_prediction_generated (generated_at),
    CONSTRAINT fk_prediction_run FOREIGN KEY (prediction_run_id) REFERENCES prediction_runs(id),
    CONSTRAINT fk_prediction_instrument FOREIGN KEY (instrument_id) REFERENCES market_instruments(id),
    CONSTRAINT fk_prediction_series FOREIGN KEY (economic_series_id) REFERENCES economic_series(id),
    CONSTRAINT chk_prediction_target CHECK (instrument_id IS NOT NULL OR economic_series_id IS NOT NULL),
    CONSTRAINT chk_prediction_confidence CHECK (confidence_score BETWEEN 0 AND 100),
    CONSTRAINT chk_prediction_probability CHECK (probability_up IS NULL OR probability_up BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_evaluations (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prediction_id       BIGINT UNSIGNED NOT NULL,
    evaluated_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actual_value        DECIMAL(24,8) NOT NULL,
    absolute_error      DECIMAL(24,8) NULL,
    percentage_error    DECIMAL(14,6) NULL,
    direction_correct   TINYINT(1) NULL,
    interval_covered    TINYINT(1) NULL,
    evaluation_notes    VARCHAR(1000) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_prediction_evaluation (prediction_id),
    KEY idx_evaluation_time (evaluated_at),
    CONSTRAINT fk_evaluation_prediction FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_queries (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversation_key    CHAR(36)     NULL,
    user_key_hash       CHAR(64)     NULL,
    question_text       TEXT         NOT NULL,
    normalized_intent   VARCHAR(60)  NULL,
    domain_allowed      TINYINT(1)   NOT NULL DEFAULT 1,
    retrieval_query     TEXT         NULL,
    retrieved_chunks    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    api_sources_used    JSON         NULL,
    model_name          VARCHAR(120) NULL,
    response_text       MEDIUMTEXT   NULL,
    response_sha256     CHAR(64)     NULL,
    latency_ms          INT UNSIGNED NULL,
    privacy_level       VARCHAR(20)  NOT NULL DEFAULT 'standard',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_query_created_intent (created_at, normalized_intent),
    KEY idx_query_conversation (conversation_key, created_at),
    KEY idx_query_domain (domain_allowed, created_at),
    FULLTEXT KEY ftx_query_question (question_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_feedback (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    query_id            BIGINT UNSIGNED NOT NULL,
    rating              TINYINT         NULL,
    is_helpful          TINYINT(1)      NULL,
    accuracy_score      TINYINT UNSIGNED NULL,
    relevance_score     TINYINT UNSIGNED NULL,
    feedback_text       TEXT            NULL,
    correction_text     TEXT            NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_feedback_query (query_id),
    KEY idx_feedback_created (created_at),
    CONSTRAINT fk_feedback_query FOREIGN KEY (query_id) REFERENCES ai_queries(id) ON DELETE CASCADE,
    CONSTRAINT chk_feedback_rating CHECK (rating IS NULL OR rating BETWEEN -1 AND 5),
    CONSTRAINT chk_feedback_accuracy CHECK (accuracy_score IS NULL OR accuracy_score BETWEEN 0 AND 100),
    CONSTRAINT chk_feedback_relevance CHECK (relevance_score IS NULL OR relevance_score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW latest_market_observations AS
SELECT observation.*
FROM market_observations observation
INNER JOIN (
    SELECT instrument_id, MAX(observed_at) AS max_observed_at
    FROM market_observations
    GROUP BY instrument_id
) latest
    ON latest.instrument_id = observation.instrument_id
   AND latest.max_observed_at = observation.observed_at;

CREATE OR REPLACE VIEW prediction_performance AS
SELECT
    run.model_name,
    run.model_version,
    prediction.horizon_code,
    COUNT(evaluation.id) AS evaluated_predictions,
    AVG(ABS(evaluation.percentage_error)) AS mean_absolute_percentage_error,
    AVG(evaluation.direction_correct) * 100 AS direction_accuracy_pct,
    AVG(evaluation.interval_covered) * 100 AS interval_coverage_pct
FROM prediction_runs run
INNER JOIN predictions prediction ON prediction.prediction_run_id = run.id
INNER JOIN prediction_evaluations evaluation ON evaluation.prediction_id = prediction.id
GROUP BY run.model_name, run.model_version, prediction.horizon_code;

INSERT INTO data_sources
    (code, name, source_type, base_url, trust_score, refresh_seconds, terms)
VALUES
    ('yahoo_finance', 'Yahoo Finance', 'market_api', 'https://query1.finance.yahoo.com', 82.00, 900, 'Datos sujetos a disponibilidad de Yahoo Finance'),
    ('banxico_sie', 'Banco de México SIE', 'official_api', 'https://www.banxico.org.mx/SieAPIRest', 98.00, 21600, 'Fuente oficial'),
    ('open_exchange_rates', 'Open Exchange Rates', 'market_api', 'https://open.er-api.com', 78.00, 1800, 'Tipo de cambio indicativo'),
    ('alpha_vantage', 'Alpha Vantage', 'market_news_api', 'https://www.alphavantage.co', 80.00, 43200, 'Sujeto a cuota'),
    ('coingecko', 'CoinGecko', 'market_api', 'https://api.coingecko.com', 82.00, 900, 'Mercado cripto agregado'),
    ('finnhub', 'Finnhub', 'news_api', 'https://finnhub.io', 78.00, 10800, 'Noticias de terceros'),
    ('gdelt', 'GDELT Project', 'news_event_api', 'https://api.gdeltproject.org', 76.00, 21600, 'Agregador global de eventos'),
    ('inegi', 'INEGI', 'official_api', 'https://www.inegi.org.mx', 98.00, 86400, 'Fuente oficial'),
    ('vallnews', 'VALLNews', 'internal', NULL, 90.00, NULL, 'Contenido interno revisado')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    source_type = VALUES(source_type),
    base_url = VALUES(base_url),
    trust_score = VALUES(trust_score),
    refresh_seconds = VALUES(refresh_seconds),
    terms = VALUES(terms),
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO schema_migrations (version, description)
VALUES ('001_ai_intelligence_schema', 'Históricos, RAG, eventos, predicciones, evaluación y feedback')
ON DUPLICATE KEY UPDATE description = VALUES(description);
