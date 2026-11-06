'use strict';
const assert = require('node:assert/strict');

// Proveedores sintéticos. Nunca utiliza claves reales ni consume cuota de IA.
process.env.GEMINI_API_KEY = '';
let scenarioCalls = 0;
const gemini = require('../backend/lib/gemini');
gemini.genAI = { getGenerativeModel(_params, options) {
    assert.equal(options.timeout, 20000);
    return { generateContent: async prompt => {
        scenarioCalls += 1;
        return { response: { text: () => JSON.stringify({ consenso: prompt.split('\n').find(line => line.includes('Datos actuales:')) }) } };
    } };
} };
const { start } = require('./lib/security-fixture.cjs');
const { analysisCacheKey, numericInput, proteinAnalysisInput } = require('../backend/lib/private-analysis');
const { orchestrator } = require('../backend/ai/orchestrator');
const checks = [];
const payload = price => ({ inegi: { precios: { cerdo: { valor: 90 } }, identicalPrefix: 'x'.repeat(70) }, hogs: { price }, woah: { alerts: [] } });

(async () => {
    const fixture = await start();
    const request = async (route, { user = 'analysis-owner', body, authorization = true, method = body === undefined ? 'GET' : 'POST' } = {}) => {
        const response = await fetch(fixture.url + route, { method, signal: AbortSignal.timeout(5000),
            headers: { ...(authorization ? { Authorization: fixture.authorization(user) } : {}), 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
        return { status: response.status, headers: response.headers, body: await response.json() };
    };
    let proteinCalls = 0;
    orchestrator.generateStructured = async ({ context }) => { proteinCalls += 1; return { text: context }; };
    try {
        for (const value of [Infinity, -Infinity, NaN, {}, [], true, 'Infinity', '17junk', '0x10', 'x'.repeat(100)]) {
            assert.throws(() => numericInput(value), { status: 400 });
        }
        assert.equal(numericInput('0', { fallback: 9 }), 0);
        assert.throws(() => proteinAnalysisInput({}), { status: 400 });
        const subject = { user: { sub: 'owner' } };
        assert.notEqual(analysisCacheKey(subject, { a: 1, b: 2 }), analysisCacheKey(subject, { a: 1, b: 3 }));
        assert.notEqual(analysisCacheKey(subject, { a: 1 }), analysisCacheKey({ user: { sub: 'other' } }, { a: 1 }));
        checks.push('Entradas numéricas estrictas, cero válido y clave completa ligada a la cuenta');

        const first = await request('/api/ml/insight-proteinas', { user: 'owner-a', body: payload(111) });
        const changed = await request('/api/ml/insight-proteinas', { user: 'owner-a', body: payload(222) });
        const other = await request('/api/ml/insight-proteinas', { user: 'owner-b', body: payload(111) });
        assert.equal(other.status, 200);
        assert.equal(first.status, 200);
        assert.match(first.body.insight, /111 USD/);
        assert.match(changed.body.insight, /222 USD/);
        assert.equal(proteinCalls, 3, 'Otra cuenta no reutiliza la generación privada de la primera');
        await request('/api/ml/insight-proteinas', { user: 'owner-a', body: payload(111) });
        assert.equal(proteinCalls, 3, 'La misma cuenta con los mismos datos sí reutiliza su análisis');
        const alerted = await request('/api/ml/insight-proteinas', { user: 'owner-a', body: { ...payload(111), woah: { alerts: [{}, {}] } } });
        assert.match(alerted.body.insight, /2 alertas/);
        assert.equal(proteinCalls, 4, 'Las alertas sanitarias forman parte de la clave');
        assert.match(first.headers.get('cache-control'), /private.*no-store/);
        checks.push('Colisión de prefijo corregida, aislamiento entre cuentas y alertas incluidas en caché');

        assert.equal((await request('/api/ml/insight-proteinas', { authorization: false, body: '{malformed' })).status, 401);
        for (const body of [{}, { hogs: { price: '<img src=x onerror=alert(1)>' } }, { hogs: { price: {} } }, { hogs: { price: '1e999' } }, { woah: { alerts: 'invalid' } }]) {
            const rejected = await request('/api/ml/insight-proteinas', { user: 'invalid-input', body });
            assert.equal(rejected.status, 400);
            assert(!JSON.stringify(rejected.body).includes('<img'));
        }
        assert.equal(proteinCalls, 4);
        checks.push('Autenticación antes de JSON y rechazo de HTML, objetos, infinitos y datos vacíos sin llamar al proveedor');

        const zeroRates = await request('/api/scenarios?tiie=0&fed=0&usdmxn=17&vix=18&wti=72', { user: 'scenario-a' });
        assert.equal(zeroRates.status, 200);
        assert.match(zeroRates.body.data.consenso, /TIIE=0.00%, Fed=0.00%/);
        assert.match(zeroRates.headers.get('cache-control'), /private.*no-store/);
        const changedFx = await request('/api/scenarios?tiie=0&fed=0&usdmxn=25&vix=18&wti=72', { user: 'scenario-a' });
        assert.match(changedFx.body.data.consenso, /USD\/MXN=25.00/);
        await request('/api/scenarios?tiie=0&fed=0&usdmxn=25&vix=18&wti=72', { user: 'scenario-b' });
        assert.equal(scenarioCalls, 3);
        for (const query of ['tiie=Infinity', 'fed=4oops', 'usdmxn=0', 'vix=-1', 'wti=999999', 'tiie=4&tiie=5']) {
            assert.equal((await request('/api/scenarios?' + query, { user: 'scenario-invalid' })).status, 400);
        }
        assert.equal(scenarioCalls, 3);
        checks.push('Escenarios privados, sin caché pública y ligados a los cinco parámetros validados');

        let release, entered;
        let concurrent = 0, peak = 0;
        const holding = new Promise(resolve => { release = resolve; });
        const fourEntered = new Promise(resolve => { entered = resolve; });
        orchestrator.generateStructured = async () => {
            concurrent += 1; peak = Math.max(peak, concurrent);
            if (concurrent === 4) entered();
            await holding; concurrent -= 1;
            return { text: 'Análisis sintético acotado' };
        };
        const running = Array.from({ length: 4 }, (_, i) => request('/api/ml/insight-proteinas', { user: 'parallel-' + i, body: payload(333) }));
        try {
            await Promise.race([fourEntered, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('No iniciaron las cuatro solicitudes')), 3000); timer.unref(); })]);
            assert.equal((await request('/api/ml/insight-proteinas', { user: 'parallel-0', body: payload(444) })).status, 429);
            assert.equal((await request('/api/scenarios?usdmxn=19', { user: 'parallel-0' })).status, 429, 'Cambiar de endpoint no duplica el cupo');
            assert.equal((await request('/api/ml/insight-proteinas', { user: 'parallel-overflow', body: payload(555) })).status, 503);
        } finally { release(); await Promise.all(running); }
        assert.equal(peak, 4);
        assert.equal((await request('/api/ml/insight-proteinas', { user: 'parallel-0', body: payload(666) })).status, 200);
        checks.push('Máximo cuatro generaciones globales, una por cuenta y recuperación tras liberar el trabajo');

        let last;
        for (let i = 0; i < 31; i += 1) last = await request('/api/ml/insight-proteinas', { user: 'rate-budget', body: payload(777) });
        assert.equal(last.status, 429);
        checks.push('Límite temporal por cuenta independiente de la caché');
        console.log(`Private analysis security: ${checks.length} groups OK`);
        console.log(checks.map(item => '- ' + item).join('\n'));
    } finally { await fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
