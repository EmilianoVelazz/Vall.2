'use strict';

// Solo para pruebas locales en un proceso independiente. No carga credenciales
// reales, no inicia workers y sustituye proveedores y persistencia remota.
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'fixture-only-security-secret-never-for-production';
process.env.VERCEL = '1';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';
process.env.ALLOWED_ORIGINS = 'https://app.example.test';
process.env.PRODUCTION_URL = 'https://app.example.test';
process.env.USER_EMAIL = '';
process.env.USER_PASSWORD = '';
process.env.VALL_AUTH_EMAIL = 'admin@vall.com';
process.env.VALL_AUTH_PASSWORD = '';
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'GMAIL_USER', 'GMAIL_PASS']) process.env[name] = '';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profileStore = require('../../backend/services/user-profile-store');
profileStore.findByEmail = async () => null;
profileStore.findById = async id => ({ id, email: `${id}@example.invalid`, active: true, preferences: {} });
profileStore.recordOrionQuery = async () => true;
profileStore.recordTrainingQuery = async () => true;
profileStore.listConversations = async () => [];
profileStore.recentReportQueries = async () => [];
const {chatCreditStore}=require('../../backend/services/chat-credit-store');
chatCreditStore.state=async()=>({currency:'MXN',mxnPerUsd:20,windows:['month','week','five_hours'].map(kind=>({kind,limitMicros:2000000,usedMicros:0,reservedMicros:0,remainingMicros:2000000,resetsAt:new Date(Date.now()+86400000).toISOString()}))});
chatCreditStore.reserve=async()=>({allowed:true,state:await chatCreditStore.state()});
chatCreditStore.settle=async()=>chatCreditStore.state();

const http = require('../../backend/lib/http');
let upstreamCalls = 0;
http.yahooFetch = async () => {
    upstreamCalls++;
    await delay(15);
    return { ok: true, status: 200, json: async () => ({ chart: { result: [{
        timestamp: Array.from({ length: 128 }, (_, i) => 1780000000 + i * 86400),
        indicators: { quote: [{ open: Array(128).fill(10), high: Array(128).fill(12), low: Array(128).fill(9), close: Array(128).fill(11), volume: Array(128).fill(100) }] },
        meta: { symbol: 'TSN', currency: 'USD', regularMarketPrice: 12 },
    }] } }) };
};
const { orchestrator } = require('../../backend/ai/orchestrator');
orchestrator.isConfigured = () => true;
orchestrator.generateStructured = async () => {
    await delay(35);
    return { text: 'Respuesta simulada: proteínas, acciones y noticias.', response: { meta: {} }, tier: 'flash', mode: 'normal', citations: [] };
};

// El modo serverless también realiza una actualización perezosa de commodities;
// sustituirla antes de cargar server.js impide toda consulta externa del fixture.
require('../../backend/routes/market').initCommodityWarmer = () => {};
const app = require('../../backend/server');
function authorization(id = 'fixture-user') {
    return `Bearer ${jwt.sign({ sub: id, email: `${id}@example.invalid`, role: 'user', trainingOptIn: false }, process.env.JWT_SECRET, { expiresIn: '5m' })}`;
}
async function start() {
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    return { app, server, url: `http://127.0.0.1:${server.address().port}`, authorization,
        upstreamCalls: () => upstreamCalls,
        close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
module.exports = { start, authorization };
if (require.main === module) {
    const { monitorEventLoopDelay } = require('node:perf_hooks');
    const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
    let peakRss = process.memoryUsage().rss;
    const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
    start().then(fixture => {
        process.send?.({ ready: true, url: fixture.url });
        process.on('message', async message => {
            if (message === 'metrics') process.send?.({ metrics: true, rssMb: process.memoryUsage().rss / 1048576,
                peakRssMb: Math.max(peakRss, process.memoryUsage().rss) / 1048576, eventLoopP95Ms: lag.percentile(95) / 1e6,
                cpu: process.cpuUsage(), upstreamCalls: fixture.upstreamCalls() });
            if (message === 'close') { clearInterval(sample); lag.disable(); await fixture.close(); process.exit(0); }
        });
    }).catch(error => { console.error(error); process.exitCode = 1; clearInterval(sample); });
}
