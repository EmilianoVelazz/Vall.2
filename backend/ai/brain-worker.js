'use strict';

// Este worker produce propuestas de mejora. Ninguna propuesta altera prompts ni
// reglas activas hasta que una persona la revise y la publique explícitamente.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { GeminiProvider } = require('./providers/gemini-provider');

let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            ...require('../lib/database-connection').mysqlTlsOptions(),
            host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
            user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
            password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
            database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE || 'vall_',
            charset: 'utf8mb4',
            connectionLimit: 4,
            queueLimit: 20,
            connectTimeout: 5000,
        });
    }
    return pool;
}

const SYSTEM_INSTRUCTION = `Eres Proyecto Loopus, el sistema de aprendizaje continuo de VALL AI. Evalúa una interacción pasada y, si hay una mejora generalizable, propone una regla para revisión humana. No cambies configuraciones ni declares que la regla está aprobada.
Devuelve exclusivamente JSON válido: {"needsRule":false} o {"needsRule":true,"condition_trigger":"...","learned_rule":"..."}.`;

function saveRuleProposal(rule) {
    const output = path.join(__dirname, '../cache/brain-proposals.json');
    let proposals = [];
    try { proposals = JSON.parse(fs.readFileSync(output, 'utf8')); } catch { /* primera propuesta */ }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    proposals.push({ ...rule, status: 'pending_human_review', created_at: new Date().toISOString() });
    fs.writeFileSync(output, JSON.stringify(proposals.slice(-200), null, 2), 'utf8');
}

async function evaluateQueries() {
    const db = getPool();
    try {
        const [queries] = await db.execute(
            `SELECT q.id, q.question_text, q.response_text, f.correction_text
             FROM ai_queries q
             LEFT JOIN ai_feedback f ON f.query_id = q.id
             WHERE q.evaluated_by_brain = FALSE AND q.response_text IS NOT NULL
             ORDER BY q.created_at ASC LIMIT 5`
        );
        if (!queries.length) return;

        const ai = new GeminiProvider();
        if (!ai.isConfigured()) return;

        for (const query of queries) {
            const prompt = `[PREGUNTA DEL USUARIO]\n${query.question_text}\n\n[RESPUESTA DE LA IA]\n${query.response_text}\n\n${query.correction_text ? `[CORRECCIÓN DEL USUARIO]\n${query.correction_text}\n` : ''}\nEvalúa y extrae una propuesta si es necesaria.`;
            let evaluated = false;
            try {
                const response = await ai.generate({ prompt, systemInstruction: SYSTEM_INSTRUCTION, tier: 'flash', json: true });
                const result = JSON.parse(response.text);
                if (result.needsRule && result.condition_trigger && result.learned_rule) {
                    saveRuleProposal({
                        condition_trigger: String(result.condition_trigger).slice(0, 200),
                        learned_rule: String(result.learned_rule).slice(0, 800),
                        source_query_id: query.id,
                    });
                    console.log(`[Loopus] Propuesta guardada para revisión humana: "${result.condition_trigger}"`);
                }
                evaluated = true;
            } catch (error) {
                console.error(`[Loopus] Error evaluando query ${query.id}:`, error.message);
            }
            // Los errores se reintentan después; no se descartan consultas sin revisar.
            if (evaluated) await db.execute(`UPDATE ai_queries SET evaluated_by_brain = TRUE WHERE id = ?`, [query.id]);
        }
    } catch (error) {
        if (!['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
            console.error('[Loopus] Error de DB:', error.message);
        }
    }
}

function startWorker(intervalMs = 600000) {
    if (process.env.VALL_BRAIN_ENABLED !== 'true') {
        console.log('[Loopus] Worker desactivado. Define VALL_BRAIN_ENABLED=true tras habilitar una revisión humana de reglas.');
        return false;
    }
    console.log('[Loopus] Worker consultivo iniciado.');
    setTimeout(() => {
        evaluateQueries();
        setInterval(evaluateQueries, intervalMs);
    }, 30000);
    return true;
}

module.exports = { evaluateQueries, startWorker };
