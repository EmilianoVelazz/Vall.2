'use strict';

// API temporal y proveedor ficticio: sin cuotas, correo ni base remota.
process.env.GEMINI_API_KEY = '';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED = 'false';
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DATABASE_URL', 'DATABASE_URL', 'GMAIL_USER', 'GMAIL_PASS']) process.env[name] = '';
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const gemini = require('../backend/lib/gemini');
let calls = 0, active = 0, peak = 0, mode = 'ok', hold;
const optionsSeen = [];
gemini.genAI = { getGenerativeModel(_model, options) {
    optionsSeen.push(options);
    return { async generateContent() {
        calls++; active++; peak = Math.max(peak, active);
        const attempt = calls, outcome = mode;
        try {
            if (hold) await hold;
            if (outcome === 'timeout') throw Error('Synthetic provider timeout');
            if (outcome === 'quota') throw Error('Synthetic 429 quota exhausted');
            return { response: { text: () => outcome === 'invalid' ? 'invalid JSON' :
                JSON.stringify(outcome === 'news' ? [{ titulo: 'Noticia ficticia' }] : { fixture: true, attempt }) } };
        } finally { active--; }
    } };
} };
const { authorization } = require('./lib/security-fixture.cjs');
const financeRouter = require('../backend/routes/finanzas');
const { safeErrorHandler } = require('../backend/lib/request-security');

async function main() {
    const checks = [], clock = Date.now;
    let now = clock(), server, arrived = 0, arrivalTarget = 0, notifyArrival, release;
    Date.now = () => now;
    process.env.REFRESH_SECRET = 'fixture-only-finance-refresh-secret';
    const app = express();
    app.use('/api', (req, res, next) => {
        if (req.path === '/finanzas' && ++arrived >= arrivalTarget) notifyArrival?.();
        next();
    }, financeRouter);
    app.use(safeErrorHandler);
    try {
        server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
        const base = `http://127.0.0.1:${server.address().port}/api`;
        async function request(route = '/finanzas', { user = 'finance-fixture', authenticated = true, method = 'GET', headers = {} } = {}) {
            const response = await fetch(base + route, { method, redirect: 'manual',
                headers: { ...(authenticated ? { Authorization: authorization(user) } : {}), ...headers },
                signal: AbortSignal.timeout(10000) });
            const body = await response.text();
            return { status: response.status, headers: response.headers, body: body.startsWith('{') ? JSON.parse(body) : body };
        }
        const refresh = () => request('/finanzas/refresh', { method: 'POST',
            headers: { 'x-refresh-secret': process.env.REFRESH_SECRET } });
        async function burst(count = 16, during) {
            arrivalTarget = arrived + count;
            const arrivals = new Promise(resolve => { notifyArrival = resolve; });
            hold = new Promise(resolve => { release = resolve; });
            const pending = Promise.all(Array.from({ length: count }, (_, index) => request('/finanzas', { user: `finance-${index % 4}` })));
            // Observar todas las peticiones antes de soltar el proveedor evita
            // que el resultado dependa de la velocidad de esta computadora.
            try {
                await Promise.race([arrivals, new Promise((_, reject) => {
                    const timer = setTimeout(() => reject(Error('No llegaron todas las peticiones')), 5000); timer.unref();
                })]);
                await new Promise(resolve => setImmediate(resolve));
                if (during) await during();
            } finally { release(); hold = null; notifyArrival = null; }
            const results = await pending;
            assert.equal(peak, 1, 'Las peticiones simultáneas multiplicaron las llamadas activas');
            for (const [index, result] of results.entries()) {
                assert.equal(result.status, 200);
                assert.equal(result.headers.get('x-vall-account'), `finance-${index % 4}@example.invalid`);
                assert.match(result.headers.get('cache-control'), /private.*no-store/);
            }
            return results;
        }
        assert.equal((await request('/finanzas', { authenticated: false })).status, 401);
        assert.equal(calls, 0);
        checks.push('Acceso sin sesión rechazado antes de consumir IA');

        const cold = await burst();
        assert.equal(calls, 1, '16 peticiones deben compartir una sola generación');
        assert(cold.every(result => result.body.data.attempt === 1));
        assert.equal((await request()).body.data.attempt, 1);
        assert.equal(calls, 1);
        checks.push('16 peticiones de cuatro cuentas comparten una llamada y conservan cabeceras privadas propias');

        now += 6 * 60 * 60 * 1000;
        const refreshed = await burst(16, async () => {
            const responses = await Promise.all(Array.from({ length: 8 }, refresh));
            assert(responses.every(result => result.status === 303));
        });
        assert.equal(calls, 2);
        assert(refreshed.every(result => result.body.data.attempt === 2));
        assert.equal((await request()).body.data.attempt, 2);
        assert.equal(calls, 2);
        checks.push('Caducidad y ocho invalidaciones durante la generación no duplican el trabajo');

        assert.equal((await request('/finanzas/refresh', { method: 'POST' })).status, 401);
        assert.equal((await request()).body.data.attempt, 2);
        assert.equal(calls, 2);
        checks.push('Una cuenta sin la clave de mantenimiento no puede invalidar la caché');

        for (const failure of ['timeout', 'invalid', 'quota']) {
            mode = failure;
            assert.equal((await refresh()).status, 303);
            const before = calls;
            const fallback = await burst();
            assert.equal(calls, before + 1);
            assert(fallback.every(result => result.body.fallback && result.body.data.attempt === before));
            const cooldown = failure === 'quota' ? 12 * 60 * 60 * 1000 : 60 * 1000;
            now += cooldown - 1;
            const cachedFallback = await request();
            assert.equal(cachedFallback.body.fallback, true);
            assert.equal(cachedFallback.body.desde_cache, true);
            assert.equal(calls, before + 1, 'No reintentar durante la pausa por fallo');
            now++;
            mode = 'ok';
            const recovered = await burst();
            assert.equal(calls, before + 2);
            assert(recovered.every(result => !result.body.fallback && result.body.data.attempt === calls));
            checks.push(`${failure}: una llamada fallida, respaldo identificado, pausa y recuperación con una sola llamada`);
        }

        // El refresco autorizado de un corte vigente produce un corte nuevo.
        assert.equal((await refresh()).status, 303);
        const before = calls;
        await burst();
        assert.equal(calls, before + 1);
        assert.equal(peak, 1, 'Nunca hay dos llamadas activas para el mismo corte');
        assert(optionsSeen.every(options => options?.timeout === 20000));
        checks.push('Refresco de un corte vigente y límite de 20 segundos para el proveedor');

        mode = 'news';
        const news = await request('/noticias');
        assert.equal(news.status, 200);
        assert.match(news.headers.get('cache-control'), /private.*no-store/);
        checks.push('Las noticias autenticadas tampoco permiten caché pública de la respuesta');

        const report = { generatedAt: new Date().toISOString(), checks, coldRequests: 16,
            coldProviderCalls: 1, previousColdProviderCalls: 16, peakProviderConcurrency: peak,
            simulatedProvider: true, productionTouched: false, realMailSent: false };
        const output = path.resolve(__dirname, '..', process.env.SECURITY_ASSESSMENT_OUTPUT || 'output/finance-generation-security');
        await fs.mkdir(output, { recursive: true });
        await fs.writeFile(path.join(output, 'finance-generation.json'), JSON.stringify(report, null, 2));
        console.log(`Finance generation security: ${checks.length} checks OK · 16 solicitudes → 1 llamada`);
    } finally {
        release?.(); Date.now = clock;
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
