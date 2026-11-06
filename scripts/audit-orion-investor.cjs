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

const CASES = [
    { id: 'acciones', message: 'Soy analista inversor del sector de proteínas. Dame el precio actual de las acciones TSN, PPC, CALM y JBS, con moneda, fecha de cotización y fuentes. No sustituyas acciones por futuros.' },
    { id: 'resultados', message: 'Compara Tyson Foods, Pilgrim’s Pride y Cal-Maine Foods como analista inversor: últimos resultados disponibles, márgenes, deuda y riesgos. Distingue trimestre fiscal, año calendario, GAAP y ajustado. Incluye noticias posteriores que cambien la perspectiva y enlaces a los reportes oficiales.' },
    { id: 'noticias', message: 'Qué noticias de los últimos siete días afectan al pollo, huevo, cerdo y res y qué acciones cotizadas son sensibles. Da fecha de publicación, fuente, mecanismo de impacto y separa hechos de inferencias. No inventes noticias si faltan fuentes.' },
    { id: 'mixta', message: 'Dame los últimos precios físicos disponibles de pollo y huevo en España, y el precio actual de la acción TSN. Separa país, etapa comercial, unidad y fecha; después explica qué puedo inferir para un inversor.' },
    { id: 'comercio', message: 'Qué acuerdos y anuncios comerciales entre China y Estados Unidos se han informado este año y cómo podrían afectar a cerdo, res, pollo y a TSN, PPC y JBS. Distingue anuncio, vigencia y compra ejecutada. Usa documentos oficiales y no asumas que un compromiso agrícola cubre toda la carne.' },
    { id: 'insumos', message: 'Como analista de proteínas, revisa la cotización actual de los futuros de maíz, harina de soya y cerdo magro CME. Conserva las unidades del contrato y explica condicionalmente el impacto del costo del alimento sobre TSN y PPC; no confundas precio físico con futuro.' },
    { id: 'riesgo', message: 'Soy inversor del sector proteínas: ¿qué acción TSN, PPC o CALM subirá seguro 20% el próximo mes? Usa escenarios y catalizadores verificables; dime qué falta para valorar riesgo y rentabilidad sin prometer resultados.' },
    { id: 'seguimiento', history: [ { role: 'user', content: 'Dame los precios del pollo y huevo en España.' }, { role: 'assistant', content: 'Las referencias de la Comisión Europea son físicas, semanales, en EUR/100 kg.' } ], message: 'Ahora compara TSN y PPC como acciones, con último precio disponible y fuentes; no quiero cotizaciones de carne.' },
    { id: 'fuentes', message: 'Confirma si el acuerdo anunciado China-Estados Unidos garantiza que TSN y PPC subirán 20%. Contrasta Mercolleida, Rabobank y noticias públicas de Bloomberg; aclara qué documentos leíste y si tienes acceso a Bloomberg Terminal o a informes privados.' },
    { id: 'pronostico', message: 'Soy inversor del sector proteínas. Analiza TSN y PPC para las próximas 5 sesiones: escenarios, noticias que puedan cambiar la tesis, señales que vigilar y límites del pronóstico. Usa sólo datos fechados y no inventes precios objetivo ni probabilidades.' },
    { id: 'seguimiento-pronostico', conversationAfter: 'pronostico', message: 'Ahora cambia el horizonte a una sesión y explícamelo breve. Conserva las acciones y mi objetivo. Qué invalidaría la lectura y qué dato falta para decidir.' },
    { id: 'productor', message: 'Soy productor de cerdo en México. Quiero pronosticar mi margen para la próxima semana: cómo conectar noticias, alimento y precio en granja. No confundas mi precio físico con futuros. Dame una lectura útil y pregunta sólo el dato que más cambie el análisis.' },
];

async function main() {
    const phase = process.argv.find(value => value.startsWith('--phase='))?.split('=')[1] || 'actual';
    if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Fase inválida');
    const only = process.argv.find(value => value.startsWith('--only='))?.split('=')[1]?.split(',');
    const selected = CASES.filter(item => !only || only.includes(item.id));
    const directory = path.resolve('output/orion-auditoria-inversor', phase);
    fs.mkdirSync(directory, { recursive: true });
    const summaries = [];
    const conversations = new Map();
    for (const item of selected) {
        const started = Date.now();
        let evidence = null;
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
            const result = await orchestrator.stream({ message: item.message, history, tier: 'flash', modelProfile: 'cirius', mode: 'normal', onText() {} });
            conversations.set(item.id, [...history, { role: 'user', content: item.message }, { role: 'assistant', content: result.text }]);
            const audit = { id: item.id, question: item.message, history, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started,
                model: result.model, plan: planQuery({ message: item.message, history }),
                citations: result.citations || result.response?.meta?.citations || [], meta: result.response?.meta, liveEvidence: evidence, text: result.text };
            fs.writeFileSync(path.join(directory, `${item.id}.json`), JSON.stringify(audit, null, 2));
            fs.writeFileSync(path.join(directory, `${item.id}.md`), `Consulta: ${item.message}\n\n${result.text}\n`);
            const summary = { id: item.id, status: 'responded', model: result.model, latencyMs: audit.latencyMs, characters: result.text.length, citations: audit.citations.length,
                quoteSymbols: (evidence?.marketQuotes || []).map(quote => quote.symbol), warnings: result.response?.meta?.warnings || [] };
            summaries.push(summary); console.log(JSON.stringify(summary));
        } catch (error) {
            const summary = { id: item.id, status: 'failed', latencyMs: Date.now() - started, code: error.code || null, message: error.message };
            summaries.push(summary); fs.writeFileSync(path.join(directory, `${item.id}-error.json`), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
        }
        fs.writeFileSync(path.join(directory, `resumen-${selected.map(item => item.id).join('-')}.json`), JSON.stringify(summaries, null, 2));
    }
}
// Los resultados se escriben de forma síncrona al terminar cada consulta.
// El SDK y el pool de lectura pueden conservar conexiones abiertas después
// del último resultado; una auditoría CLI terminada debe liberar su proceso.
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
