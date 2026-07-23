-- VALLNews · Calidad, trazabilidad y observabilidad RAG
-- Compatible con MariaDB 10.4. Idempotente y no destructiva.

ALTER TABLE knowledge_chunks
    ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64) NULL AFTER content,
    ADD COLUMN IF NOT EXISTS quality_score DECIMAL(5,2) NOT NULL DEFAULT 80.00 AFTER token_count,
    ADD COLUMN IF NOT EXISTS indexed_at DATETIME NULL AFTER embedding_norm;

UPDATE knowledge_chunks
SET content_sha256 = SHA2(content, 256)
WHERE content_sha256 IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chunk_document_hash
    ON knowledge_chunks (document_id, content_sha256);
CREATE INDEX IF NOT EXISTS idx_chunk_quality_document
    ON knowledge_chunks (quality_score, document_id);

ALTER TABLE knowledge_documents
    ADD COLUMN IF NOT EXISTS content_quality_score DECIMAL(5,2) NOT NULL DEFAULT 80.00 AFTER status,
    ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL AFTER content_quality_score;

UPDATE knowledge_documents kd
JOIN data_sources ds ON ds.id=kd.source_id
SET kd.content_quality_score=ds.trust_score,
    kd.verified_at=CASE WHEN ds.code='vallnews' THEN COALESCE(kd.verified_at, NOW()) ELSE kd.verified_at END;

UPDATE knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id=kc.document_id
SET kc.quality_score=kd.content_quality_score;

CREATE INDEX IF NOT EXISTS idx_document_rag_filter
    ON knowledge_documents (status, document_type, source_id, published_at);
CREATE INDEX IF NOT EXISTS idx_market_interval_time
    ON market_observations (instrument_id, interval_code, observed_at);
CREATE INDEX IF NOT EXISTS idx_economic_period_series
    ON economic_observations (period_date, series_id);
CREATE INDEX IF NOT EXISTS idx_event_source_type_time
    ON knowledge_events (source_id, event_type, occurred_at);

ALTER TABLE ai_queries
    ADD COLUMN IF NOT EXISTS retrieval_strategy VARCHAR(80) NULL AFTER retrieval_query,
    ADD COLUMN IF NOT EXISTS evidence_count SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER retrieved_chunks,
    ADD COLUMN IF NOT EXISTS retrieval_latency_ms INT UNSIGNED NULL AFTER latency_ms;

CREATE INDEX IF NOT EXISTS idx_query_model_created
    ON ai_queries (model_name, created_at);
CREATE INDEX IF NOT EXISTS idx_query_strategy_created
    ON ai_queries (retrieval_strategy, created_at);

CREATE TABLE IF NOT EXISTS ingestion_cursors (
    source_id           BIGINT UNSIGNED NOT NULL,
    job_type            VARCHAR(60) NOT NULL,
    cursor_value        VARCHAR(1000) NULL,
    last_success_at     DATETIME(6) NULL,
    last_run_id         BIGINT UNSIGNED NULL,
    consecutive_failures INT UNSIGNED NOT NULL DEFAULT 0,
    metadata            JSON NULL,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (source_id, job_type),
    KEY idx_cursor_success (last_success_at),
    CONSTRAINT fk_cursor_source FOREIGN KEY (source_id) REFERENCES data_sources(id),
    CONSTRAINT fk_cursor_run FOREIGN KEY (last_run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_quality_issues (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id           BIGINT UNSIGNED NULL,
    ingestion_run_id    BIGINT UNSIGNED NULL,
    entity_type         VARCHAR(50) NOT NULL,
    entity_key          VARCHAR(255) NULL,
    rule_code           VARCHAR(80) NOT NULL,
    severity            VARCHAR(16) NOT NULL DEFAULT 'warning',
    status              VARCHAR(20) NOT NULL DEFAULT 'open',
    message             VARCHAR(1000) NOT NULL,
    observed_value      TEXT NULL,
    expected_value      TEXT NULL,
    metadata            JSON NULL,
    detected_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    resolved_at         DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_quality_status_severity (status, severity, detected_at),
    KEY idx_quality_source_time (source_id, detected_at),
    KEY idx_quality_rule_entity (rule_code, entity_type, entity_key),
    CONSTRAINT fk_quality_source FOREIGN KEY (source_id) REFERENCES data_sources(id),
    CONSTRAINT fk_quality_run FOREIGN KEY (ingestion_run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL,
    CONSTRAINT chk_quality_severity CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    CONSTRAINT chk_quality_status CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO data_quality_issues
    (source_id, ingestion_run_id, entity_type, entity_key, rule_code,
     severity, status, message, observed_value, expected_value)
SELECT
    ir.source_id, ir.id, 'ingestion_run', CAST(ir.id AS CHAR),
    'INGESTION_REJECTIONS', 'warning', 'open',
    CONCAT('La carga rechazó ', ir.records_rejected, ' registros.'),
    CAST(ir.records_rejected AS CHAR), '0'
FROM ingestion_runs ir
WHERE ir.records_rejected > 0
  AND NOT EXISTS (
      SELECT 1 FROM data_quality_issues dqi
      WHERE dqi.rule_code='INGESTION_REJECTIONS'
        AND dqi.entity_type='ingestion_run'
        AND dqi.entity_key=CONVERT(ir.id, CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
  );

CREATE TABLE IF NOT EXISTS knowledge_tags (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug                VARCHAR(80) NOT NULL,
    name                VARCHAR(120) NOT NULL,
    description         VARCHAR(500) NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_knowledge_tag_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_document_tags (
    document_id         BIGINT UNSIGNED NOT NULL,
    tag_id              BIGINT UNSIGNED NOT NULL,
    relevance_score     DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    assigned_by         VARCHAR(40) NOT NULL DEFAULT 'rule_v1',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (document_id, tag_id),
    KEY idx_document_tag_lookup (tag_id, relevance_score, document_id),
    CONSTRAINT fk_document_tag_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_document_tag_tag FOREIGN KEY (tag_id) REFERENCES knowledge_tags(id) ON DELETE CASCADE,
    CONSTRAINT chk_document_tag_relevance CHECK (relevance_score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO knowledge_tags (slug, name, description)
VALUES
    ('mexico', 'México', 'Economía, política pública y mercados mexicanos'),
    ('finanzas', 'Finanzas', 'Tasas, inversión, crédito y análisis financiero'),
    ('mercados', 'Mercados', 'Precios, bolsas e instrumentos de mercado'),
    ('divisas', 'Divisas', 'Tipos de cambio, USD, MXN y mercado cambiario'),
    ('commodities', 'Commodities', 'Energía, metales y materias primas'),
    ('agro_proteinas', 'Agro y proteínas', 'Granos, porcinos, ganadería y alimentos'),
    ('geopolitica', 'Geopolítica', 'Conflictos, sanciones, aranceles y comercio'),
    ('cripto', 'Criptoactivos', 'Bitcoin, Ethereum y mercado de criptoactivos'),
    ('empresas', 'Empresas', 'Información corporativa y cadenas de suministro')
ON DUPLICATE KEY UPDATE
    name=VALUES(name), description=VALUES(description), is_active=1;

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 95, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='mexico'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'México|Mexico|mexicano|mexicana|Banxico|INEGI|MXN';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 90, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='finanzas'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'finanzas|financiero|inversión|inversion|tasas|interés|interes|CETES|TIIE';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 90, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='mercados'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'mercado|bolsa|acciones|BMV|precio|rendimiento';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 95, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='divisas'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'dólar|dolar|USD|MXN|peso mexicano|tipo de cambio|forex|divisa';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 90, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='commodities'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'commodity|commodities|petróleo|petroleo|WTI|cobre|aluminio|gas natural';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 95, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='agro_proteinas'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'maíz|maiz|trigo|soya|soja|cerdo|porcino|ganado|proteína|proteina|agrícola|agricola';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 90, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='geopolitica'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'geopolítica|geopolitica|conflicto|guerra|sanción|sancion|arancel|comercio internacional';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 95, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='cripto'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'Bitcoin|Ethereum|cripto';

INSERT IGNORE INTO knowledge_document_tags (document_id, tag_id, relevance_score, assigned_by)
SELECT kd.id, kt.id, 85, 'rule_v1'
FROM knowledge_documents kd
JOIN knowledge_tags kt ON kt.slug='empresas'
WHERE CONCAT(kd.title, ' ', LEFT(COALESCE(kd.body_text, ''), 8000))
      REGEXP 'empresa|corporativo|compañía|compania|cadena de suministro';

CREATE TABLE IF NOT EXISTS retrieval_evidence (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    query_id            BIGINT UNSIGNED NOT NULL,
    source_id           BIGINT UNSIGNED NOT NULL,
    reference_code      VARCHAR(20) NOT NULL,
    evidence_kind       VARCHAR(30) NOT NULL,
    document_id         BIGINT UNSIGNED NULL,
    chunk_id            BIGINT UNSIGNED NULL,
    event_id            BIGINT UNSIGNED NULL,
    instrument_id       BIGINT UNSIGNED NULL,
    economic_series_id  BIGINT UNSIGNED NULL,
    rank_order          SMALLINT UNSIGNED NOT NULL,
    lexical_score       DECIMAL(18,8) NULL,
    final_score         DECIMAL(18,8) NULL,
    was_cited           TINYINT(1) NOT NULL DEFAULT 0,
    evidence_date       DATE NULL,
    metadata            JSON NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_retrieval_query_reference (query_id, reference_code),
    KEY idx_retrieval_query_rank (query_id, rank_order),
    KEY idx_retrieval_source_created (source_id, created_at),
    KEY idx_retrieval_document (document_id),
    KEY idx_retrieval_chunk (chunk_id),
    KEY idx_retrieval_event (event_id),
    KEY idx_retrieval_instrument (instrument_id),
    KEY idx_retrieval_series (economic_series_id),
    CONSTRAINT fk_retrieval_query FOREIGN KEY (query_id) REFERENCES ai_queries(id) ON DELETE CASCADE,
    CONSTRAINT fk_retrieval_source FOREIGN KEY (source_id) REFERENCES data_sources(id),
    CONSTRAINT fk_retrieval_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE SET NULL,
    CONSTRAINT fk_retrieval_chunk FOREIGN KEY (chunk_id) REFERENCES knowledge_chunks(id) ON DELETE SET NULL,
    CONSTRAINT fk_retrieval_event FOREIGN KEY (event_id) REFERENCES knowledge_events(id) ON DELETE SET NULL,
    CONSTRAINT fk_retrieval_instrument FOREIGN KEY (instrument_id) REFERENCES market_instruments(id) ON DELETE SET NULL,
    CONSTRAINT fk_retrieval_series FOREIGN KEY (economic_series_id) REFERENCES economic_series(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ingestion_cursors
    (source_id, job_type, cursor_value, last_success_at, last_run_id,
     consecutive_failures, metadata)
SELECT
    ir.source_id, ir.job_type, ir.cursor_value, ir.finished_at, ir.id, 0,
    JSON_OBJECT('backfilled', TRUE, 'recordsWritten', ir.records_written)
FROM ingestion_runs ir
JOIN (
    SELECT source_id, job_type, MAX(id) latest_id
    FROM ingestion_runs
    WHERE status='completed'
    GROUP BY source_id, job_type
) latest ON latest.latest_id=ir.id
ON DUPLICATE KEY UPDATE
    cursor_value=VALUES(cursor_value),
    last_success_at=VALUES(last_success_at),
    last_run_id=VALUES(last_run_id),
    metadata=VALUES(metadata);

CREATE OR REPLACE VIEW market_data_coverage AS
SELECT
    mi.id instrument_id,
    ds.code source_code,
    mi.symbol,
    mi.name,
    mi.asset_class,
    mo.interval_code,
    COUNT(*) observations,
    MIN(mo.observed_at) first_observation,
    MAX(mo.observed_at) last_observation,
    AVG(mo.quality_score) average_quality
FROM market_instruments mi
JOIN data_sources ds ON ds.id=mi.source_id
LEFT JOIN market_observations mo ON mo.instrument_id=mi.id
GROUP BY mi.id, ds.code, mi.symbol, mi.name, mi.asset_class, mo.interval_code;

CREATE OR REPLACE VIEW source_ingestion_health AS
SELECT
    ds.id source_id,
    ds.code source_code,
    ds.name source_name,
    COUNT(ir.id) total_runs,
    COALESCE(SUM(ir.status='completed'), 0) successful_runs,
    COALESCE(SUM(ir.status='failed'), 0) failed_runs,
    MAX(ir.started_at) last_run_at,
    MAX(CASE WHEN ir.status='completed' THEN ir.finished_at END) last_success_at,
    COALESCE(SUM(ir.records_written), 0) total_records_written,
    COALESCE(SUM(ir.records_rejected), 0) total_records_rejected
FROM data_sources ds
LEFT JOIN ingestion_runs ir ON ir.source_id=ds.id
GROUP BY ds.id, ds.code, ds.name;

CREATE OR REPLACE VIEW rag_content_inventory AS
SELECT
    ds.code source_code,
    kd.document_type,
    COUNT(DISTINCT kd.id) documents,
    COUNT(DISTINCT kc.id) chunks,
    SUM(kc.embedding IS NOT NULL) embedded_chunks,
    AVG(kc.quality_score) average_chunk_quality,
    MIN(kd.published_at) oldest_publication,
    MAX(kd.published_at) newest_publication
FROM knowledge_documents kd
JOIN data_sources ds ON ds.id=kd.source_id
LEFT JOIN knowledge_chunks kc ON kc.document_id=kd.id
WHERE kd.status='active'
GROUP BY ds.code, kd.document_type;

CREATE OR REPLACE VIEW ai_quality_dashboard AS
SELECT
    DATE(aq.created_at) query_date,
    aq.normalized_intent,
    aq.retrieval_strategy,
    COUNT(*) queries,
    AVG(aq.retrieved_chunks) average_chunks,
    AVG(aq.evidence_count) average_evidence,
    AVG(aq.latency_ms) average_latency_ms,
    AVG(aq.retrieval_latency_ms) average_retrieval_latency_ms,
    AVG(af.is_helpful) * 100 helpful_pct,
    AVG(af.accuracy_score) average_accuracy,
    AVG(af.relevance_score) average_relevance
FROM ai_queries aq
LEFT JOIN ai_feedback af ON af.query_id=aq.id
GROUP BY DATE(aq.created_at), aq.normalized_intent, aq.retrieval_strategy;

INSERT INTO schema_migrations (version, description)
VALUES ('002_rag_quality_and_observability', 'Calidad, etiquetas, cursores, evidencia RAG y vistas operativas')
ON DUPLICATE KEY UPDATE description=VALUES(description);
