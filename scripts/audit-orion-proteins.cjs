'use strict';

// Live, read-only evaluation through the same orchestrator used by chat.
// Audit conversations and evidence stay in local files, never in user memory.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve('backend/.env'), quiet: true });
require('dotenv').config({ path: path.resolve('.env.local'), quiet: true });
require('../backend/lib/tls-trust').configureSystemTrust();
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const { ragRetriever } = require('../backend/ai/rag-retriever');
const { groundLiveData } = require('../backend/ai/live-data-grounder');
const { planQuery } = require('../backend/ai/query-planner');
const { buildForecastAnalysis } = require('../backend/ai/forecast-analysis');

const { cases } = require('./lib/protein-business-cases.cjs');
const CASES = cases.filter(item => item.live);

async function main() {
    const phase = process.argv.find(value => value.startsWith('--phase='))?.split('=')[1] || 'actual';
    if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Fase inválida');
    const only = process.argv.find(value => value.startsWith('--only='))?.split('=')[1]?.split(',');
    const selected = CASES.filter(item => !only || only.includes(item.id));
    if (!selected.length) throw new Error('No se seleccionaron casos válidos para la auditoría.');
    const directory = path.resolve('output/chat-proteinas-global/respuestas', phase);
    fs.mkdirSync(directory, { recursive: true });
    const summaries = [];
    const conversations = new Map();
    for (const item of selected) {
        const started = Date.now();
        let evidence = null; let firstTokenMs = null;
        const orchestrator = new AIOrchestrator({
            retriever: {
                retrieve: (...args) => ragRetriever.retrieve(...args),
                recordQuery: async () => null, recordEvidence: async () => null,
            },
            liveDataGrounder: async (...args) => { evidence = await groundLiveData(...args); return evidence; },
            forecastBuilder: plan => buildForecastAnalysis(plan, { persist: false }),
        });
        try {
            const history = item.conversationAfter ? conversations.get(item.conversationAfter) : item.history || [];
            if (!history) throw new Error(`Ejecuta primero la consulta ${item.conversationAfter} para evaluar su seguimiento.`);
            const result = await orchestrator.stream({ message: item.message, history, tier: item.tier || 'flash', modelProfile: item.modelProfile || 'cirius', mode: 'normal', onText(chunk) { if (chunk && firstTokenMs === null) firstTokenMs = Date.now() - started; } });
            conversations.set(item.id, [...history, { role: 'user', content: item.message }, { role: 'assistant', content: result.text }]);
            const audit = { id: item.id, question: item.message, history, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, firstTokenMs,
                model: result.model, plan: planQuery({ message: item.message, history }),
                citations: result.citations || result.response?.meta?.citations || [], meta: result.response?.meta, liveEvidence: evidence, text: result.text };
            fs.writeFileSync(path.join(directory, `${item.id}.json`), JSON.stringify(audit, null, 2));
            fs.writeFileSync(path.join(directory, `${item.id}.md`), `Consulta: ${item.message}\n\n${result.text}\n`);
            const summary = { id: item.id, status: 'responded', model: result.model, latencyMs: audit.latencyMs, firstTokenMs, characters: result.text.length, citations: audit.citations.length,
                quoteSymbols: (evidence?.marketQuotes || []).map(quote => quote.symbol), warnings: result.response?.meta?.warnings || [] };
            summaries.push(summary); console.log(JSON.stringify(summary));
        } catch (error) {
            const summary = { id: item.id, status: 'failed', latencyMs: Date.now() - started, code: error.code || null, message: error.message };
            summaries.push(summary); fs.writeFileSync(path.join(directory, `${item.id}-error.json`), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
        }
        fs.writeFileSync(path.join(directory, `resumen-${selected.map(item => item.id).join('-')}.json`), JSON.stringify(summaries, null, 2));
    }
    return summaries;
}
// Los resultados se escriben de forma síncrona al terminar cada consulta.
// El SDK y el pool de lectura pueden conservar conexiones abiertas después
// del último resultado; una auditoría CLI terminada debe liberar su proceso.
main().then(summaries => process.exit(summaries.some(item => item.status === 'failed') ? 1 : 0)).catch(error => { console.error(error.message); process.exit(1); });
