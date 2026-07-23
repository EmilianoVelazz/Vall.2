-- Migración 003: Arquitectura de Cerebro Autodidacta
-- Crea la tabla para almacenar las heurísticas y reglas aprendidas por la IA

CREATE TABLE IF NOT EXISTS ai_neural_rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    condition_trigger VARCHAR(500) NOT NULL COMMENT 'Contexto o palabras clave donde aplica esta regla',
    learned_rule TEXT NOT NULL COMMENT 'La regla de oro destilada por el cerebro en segundo plano',
    confidence_score INT DEFAULT 80 COMMENT 'Confianza en la regla (0-100)',
    source_query_id BIGINT COMMENT 'ID de la consulta original que originó el aprendizaje',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FULLTEXT INDEX idx_ft_trigger (condition_trigger),
    FOREIGN KEY (source_query_id) REFERENCES ai_queries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE ai_queries ADD COLUMN IF NOT EXISTS evaluated_by_brain BOOLEAN DEFAULT FALSE;
