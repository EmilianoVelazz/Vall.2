'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { GeminiProvider } = require('./providers/gemini-provider');

let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
            user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
            password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
            database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE || 'vall_',
            charset: 'utf8mb4',
            connectionLimit: 4
        });
    }
    return pool;
}

const SYSTEM_INSTRUCTION = `Eres el "Cerebro Crítico" de VALL-AI. Tu trabajo es analizar interacciones pasadas entre un usuario y la IA, y determinar si la respuesta de la IA fue óptima, o si se puede extraer una regla heurística (lección) para mejorar en el futuro.
Evalúa:
1. ¿La respuesta fue genérica?
2. ¿Se ignoró el contexto implícito?
3. ¿Pudo ser más precisa o mejor formateada?

Si la respuesta fue perfecta, devuelve:
{"needsRule": false}

Si encuentras una oportunidad clara de mejora, destila una regla universal y devuelve:
{
  "needsRule": true,
  "condition_trigger": "Palabras clave o condición donde aplica (ej. 'hablar de tasas de interés' o 'comparar monedas')",
  "learned_rule": "La instrucción precisa y atemporal que la IA debe seguir en el futuro para no cometer este error."
}
Devuelve EXCLUSIVAMENTE un objeto JSON válido.`;

async function evaluateQueries() {
    const db = getPool();
    try {
        const [queries] = await db.execute(
            `SELECT q.id, q.question_text, q.response_text, f.correction_text, f.rating
             FROM ai_queries q
             LEFT JOIN ai_feedback f ON f.query_id = q.id
             WHERE q.evaluated_by_brain = FALSE AND q.response_text IS NOT NULL
             ORDER BY q.created_at ASC LIMIT 5`
        );
        if (!queries.length) return;

        const ai = new GeminiProvider();
        if (!ai.isConfigured()) return;

        for (const q of queries) {
            const prompt = `[PREGUNTA DEL USUARIO]\n${q.question_text}\n\n[RESPUESTA DE LA IA]\n${q.response_text}\n\n${q.correction_text ? `[CORRECCIÓN DEL USUARIO]\n${q.correction_text}\n` : ''}\nEvalúa y extrae una regla si es necesario.`;
            
            try {
                const response = await ai.generate({
                    prompt,
                    systemInstruction: SYSTEM_INSTRUCTION,
                    tier: 'flash',
                    json: true
                });
                
                const result = JSON.parse(response.text);
                if (result.needsRule && result.condition_trigger && result.learned_rule) {
                    await db.execute(
                        `INSERT INTO ai_neural_rules (condition_trigger, learned_rule, source_query_id) VALUES (?, ?, ?)`,
                        [result.condition_trigger, result.learned_rule, q.id]
                    );
                    console.log(`[Cerebro] Nueva regla aprendida: "${result.condition_trigger}"`);
                }
            } catch (error) {
                console.error(`[Cerebro] Error evaluando query ${q.id}:`, error.message);
            }
            
            // Mark as evaluated regardless of success to avoid infinite loops
            await db.execute(`UPDATE ai_queries SET evaluated_by_brain = TRUE WHERE id = ?`, [q.id]);
        }
    } catch (error) {
        if (!['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
            console.error('[Cerebro] Error de DB:', error.message);
        }
    }
}

function startWorker(intervalMs = 600000) { // Default: 10 mins
    console.log('[Cerebro] Worker de aprendizaje autónomo iniciado.');
    // Ejecutar una vez al inicio (después de 30s) y luego cíclicamente
    setTimeout(() => {
        evaluateQueries();
        setInterval(evaluateQueries, intervalMs);
    }, 30000);
}

module.exports = { startWorker, evaluateQueries };
