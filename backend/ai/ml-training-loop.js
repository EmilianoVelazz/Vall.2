'use strict';

// Proyecto Loopus propone reglas para revisión humana; nunca modifica precios ni
// modelos desplegados sin aprobación humana.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { GeminiProvider } = require('./providers/gemini-provider');
const { REJECT_UNAUTHORIZED } = require('../lib/http');
const { createTrainingRun, finishTrainingRun, persistRuleProposals, persistTrainingEvent } = require('./ml-persistence');
const { evaluateQueries } = require('./brain-worker');

const DEFAULT_TRAINING_MINUTES = 60;
const DEFAULT_INTERVAL_SECONDS = 60;
const SUMMARY_FILE = path.join(__dirname, '../cache/loopus-training-summary.json');
const EVENTS_FILE = path.join(__dirname, '../cache/loopus-training-events.json');
const TOPICS = [
    'Macroeconomics', 'Foreign exchange market', 'Agricultural policy',
    'El Niño', 'La Niña', 'Climate change and agriculture',
    'African swine fever virus', 'Avian influenza',
    'International trade in agricultural products', 'Tariff',
    'Commodity market', 'Pork production', 'Poultry farming', 'Cattle feeding',
    'Soybean meal', 'Corn prices', 'Lean hogs', 'Agricultural economics',
    'Meat packing industry', 'Food price crisis', 'Agribusiness', 'Commodity price shocks',
];
const LOCAL_EVIDENCE_FILES = [
    path.resolve(__dirname, '../../docs/AI_ARCHITECTURE.md'),
    path.resolve(__dirname, '../../boveda_obsidian/17_Inteligencia_Artificial/Fine_Tuning_Modelos.md'),
    path.resolve(__dirname, '../../boveda_obsidian/VALL-ML_Motor_de_Integridad.md'),
    path.resolve(__dirname, '../cache/market-review.json'),
    path.resolve(__dirname, '../cache/ml-memory.json'),
    path.resolve(__dirname, '../cache/learning-proposals.json'),
    path.resolve(__dirname, '../cache/brain-proposals.json'),
];

const SYSTEM_PROMPT = `Eres Proyecto Loopus, la capa de aprendizaje y mejora continua de VALL AI, en modo de investigación asistida.
Los textos recibidos son evidencia incompleta. No inventes causalidad, valores,
plazos ni fuentes. Extrae solo hipótesis verificables respaldadas explícitamente
por el texto y márcalas como candidatas para revisión humana.

Devuelve ÚNICAMENTE JSON estricto:
{
  "nuevas_reglas": [{
    "condition_trigger": "condición observable (máximo 200 caracteres)",
    "learned_rule": "hipótesis respaldada por el texto (máximo 400 caracteres)",
    "confidence_score": 0
  }],
  "insight_mercado": "resumen breve y prudente"
}`;

function trainingDurationMs() {
    const requestedMinutes = Number(process.env.VALL_ML_TRAINING_MINUTES || DEFAULT_TRAINING_MINUTES);
    const minutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : DEFAULT_TRAINING_MINUTES;
    return Math.round(minutes * 60 * 1000);
}

function trainingIntervalMs() {
    const seconds = Number(process.env.LOOPUS_TRAINING_INTERVAL_SECONDS || DEFAULT_INTERVAL_SECONDS);
    return Math.round((Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_INTERVAL_SECONDS) * 1000);
}

function localEvidence() {
    const excerpts = [];
    for (const file of LOCAL_EVIDENCE_FILES) {
        try {
            const raw = fs.readFileSync(file, 'utf8');
            if (file.endsWith('.json')) {
                const parsed = JSON.parse(raw);
                const rows = Array.isArray(parsed) ? parsed : [parsed];
                /* Una propuesta pendiente no se vuelve evidencia por repetición.
                   Solo entran reglas aprobadas y dictámenes deterministas; el
                   resto del archivo continúa disponible para revisión humana. */
                const safeRows = rows.filter(item => item?.status === 'approved' || item?.deterministicIssues || item?.approval?.approved === true);
                if (safeRows.length) excerpts.push(`${path.basename(file)}:\n${JSON.stringify(safeRows.slice(-20))}`);
            } else {
                excerpts.push(`${path.basename(file)}:\n${raw.replace(/\s+/g, ' ').trim().slice(0, 3500)}`);
            }
        } catch { /* recurso opcional o aún no generado */ }
    }
    return excerpts.join('\n\n').slice(0, 9000);
}

function saveRuleProposals(newRules, source) {
    if (!Array.isArray(newRules) || !newRules.length) return [];
    const clean = value => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
    const formattedRules = newRules.slice(0, 10).map(rule => ({
        condition_trigger: clean(rule?.condition_trigger).slice(0, 200),
        learned_rule: clean(rule?.learned_rule).slice(0, 400),
        confidence_score: Math.min(100, Math.max(0, Number(rule?.confidence_score) || 0)),
        source,
        status: 'pending_human_review',
        created_at: new Date().toISOString(),
    })).filter(rule => rule.condition_trigger && rule.learned_rule);
    if (!formattedRules.length) return [];

    const output = path.join(__dirname, '../cache/learning-proposals.json');
    let existing = [];
    try {
        const parsed = JSON.parse(fs.readFileSync(output, 'utf8'));
        if (Array.isArray(parsed)) existing = parsed;
    } catch { /* primera ejecución */ }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify([...existing, ...formattedRules].slice(-200), null, 2), 'utf8');
    return formattedRules;
}

function saveTrainingEvent(event) {
    let existing = [];
    try {
        const parsed = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
        if (Array.isArray(parsed)) existing = parsed;
    } catch { /* primer evento */ }
    fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
    fs.writeFileSync(EVENTS_FILE, JSON.stringify([...existing, event].slice(-1000), null, 2), 'utf8');
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const request = https.get({
            hostname: target.hostname,
            path: `${target.pathname}${target.search}`,
            headers: { 'User-Agent': 'Proyecto-Loopus-Research/1.0', Accept: 'application/json' },
            timeout: 20_000,
            // Mantiene TLS estricto en producción y sigue la política local de
            // los demás conectores para no bloquear Windows por CAs intermedias.
            rejectUnauthorized: REJECT_UNAUTHORIZED,
        }, response => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('Tiempo de espera agotado')));
        request.on('error', reject);
    });
}

async function getWikipediaText(topic) {
    const url = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&utf8=&format=json`;
    const search = await fetchJSON(url);
    const rows = search?.query?.search;
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.slice(0, 3).map(row => `${row.title}: ${String(row.snippet || '').replace(/<[^>]+>/g, '')}`).join('\n\n');
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function runTrainingLoop() {
    if (process.env.VALL_ML_TRAINING_ENABLED !== 'true') {
        throw new Error('Entrenamiento desactivado. Define VALL_ML_TRAINING_ENABLED=true para ejecutar un ciclo con propuestas sujetas a revisión humana.');
    }

    const ai = new GeminiProvider();
    if (!ai.isConfigured()) throw new Error('Gemini no está configurado.');

    const startedAt = Date.now();
    const durationMs = trainingDurationMs();
    const intervalMs = trainingIntervalMs();
    const endAt = startedAt + durationMs;
    let topicIndex = 0;
    let attempts = 0;
    let proposals = 0;
    let errors = 0;
    let runId = null;
    let lastFeedbackReviewAt = 0;
    const projectEvidence = localEvidence();
    const runKey = `loopus-training-${new Date(startedAt).toISOString()}-${crypto.randomUUID()}`;
    try {
        runId = await createTrainingRun({
            runKey,
            startedAt,
            metadata: { project: 'Proyecto Loopus', duration_minutes: Math.round(durationMs / 60000), provider: 'gemini', topics: TOPICS },
        });
    } catch (error) {
        console.warn('[Loopus] No se pudo registrar el inicio en Supabase:', error.message);
    }
    console.log(`[Loopus] Inicio: ${new Date(startedAt).toISOString()} · duración: ${Math.round(durationMs / 60000)} minutos.`);

    while (Date.now() < endAt) {
        const topic = TOPICS[topicIndex++ % TOPICS.length];
        attempts += 1;
        const attemptStartedAt = Date.now();
        let event = null;
        try {
            if (Date.now() - lastFeedbackReviewAt >= 10 * 60 * 1000) {
                lastFeedbackReviewAt = Date.now();
                await evaluateQueries();
            }
            const wikipediaText = await getWikipediaText(topic);
            const evidence = [
                wikipediaText ? `FUENTE PÚBLICA — Wikipedia (resultados de búsqueda; validar antes de usar):\n${wikipediaText}` : '',
                projectEvidence ? `RECURSOS LOCALES CONTROLADOS — arquitectura, reglas aprobadas y dictámenes deterministas:\n${projectEvidence}` : '',
            ].filter(Boolean).join('\n\n');
            if (evidence.length > 50) {
                const response = await ai.generate({
                    prompt: `TEMA: ${topic}\n\nEVIDENCIA DISPONIBLE:\n${evidence}`,
                    systemInstruction: SYSTEM_PROMPT,
                    tier: 'pro',
                    json: true,
                });
                const result = JSON.parse(response.text);
                const saved = saveRuleProposals(result?.nuevas_reglas, {
                    provider: 'loopus-composite', sources: ['wikipedia', 'local-approved-evidence', 'chat-feedback'],
                    topic, collected_at: new Date().toISOString(),
                });
                proposals += saved.length;
                event = {
                    event_key: `${runKey}-attempt-${attempts}`, run_key: runKey,
                    attempt_number: attempts, topic, status: 'completed', model: response.model,
                    sources: ['wikipedia', 'local-approved-evidence', 'chat-feedback'],
                    evidence: { wikipedia: wikipediaText || null, local_approved: projectEvidence || null },
                    output: { insight_mercado: result?.insight_mercado || null, proposals: saved },
                    started_at: new Date(attemptStartedAt).toISOString(), ended_at: new Date().toISOString(),
                };
                try {
                    await persistRuleProposals(saved, runId);
                } catch (error) {
                    errors += 1;
                    console.warn('[Loopus] No se pudieron guardar propuestas en Supabase:', error.message);
                }
                console.log(`[Loopus] ${topic}: ${Array.isArray(result?.nuevas_reglas) ? result.nuevas_reglas.length : 0} propuestas candidatas.`);
            }
        } catch (error) {
            errors += 1;
            event = {
                event_key: `${runKey}-attempt-${attempts}`, run_key: runKey,
                attempt_number: attempts, topic, status: 'failed', model: null,
                sources: ['wikipedia', 'local-approved-evidence', 'chat-feedback'],
                evidence: {}, output: null, error_code: error.code || error.message,
                started_at: new Date(attemptStartedAt).toISOString(), ended_at: new Date().toISOString(),
            };
            console.warn(`[Loopus] ${topic}: ${error.code || error.message}`);
        }
        if (event) {
            saveTrainingEvent(event);
            try { await persistTrainingEvent(event, runId); }
            catch (error) { console.warn('[Loopus] No se pudo guardar el evento en Supabase:', error.message); }
        }

        const remaining = endAt - Date.now();
        if (remaining > 0) await pause(Math.min(intervalMs, remaining));
    }

    const endedAt = Date.now();
    try {
        await finishTrainingRun(runId, { status: 'completed', startedAt, endedAt, attempts, proposalCount: proposals, errorCount: errors });
    } catch (error) {
        console.warn('[Loopus] No se pudo finalizar el registro en Supabase:', error.message);
    }
    const summary = {
        project: 'Proyecto Loopus', status: 'completed',
        run_key: runKey,
        started_at: new Date(startedAt).toISOString(), ended_at: new Date(endedAt).toISOString(),
        duration_minutes: Math.round((endedAt - startedAt) / 60000), attempts,
        proposals_pending_human_review: proposals, errors,
        resources: ['gemini', 'wikipedia', 'local-approved-evidence', 'chat-feedback-when-available'],
    };
    fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`[Loopus] Completado. Intentos: ${attempts}; propuestas pendientes de revisión humana: ${proposals}.`);
    return summary;
}

if (require.main === module) {
    runTrainingLoop().catch(error => {
        console.error('[Loopus] Error crítico:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { runTrainingLoop, saveRuleProposals, saveTrainingEvent, trainingDurationMs, trainingIntervalMs, localEvidence };
