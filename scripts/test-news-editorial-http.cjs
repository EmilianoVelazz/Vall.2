'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const jwt = require('jsonwebtoken');
const express = require('express');
process.env.JWT_SECRET = 'fixture-only-news-http-secret'; process.env.VERCEL = '1';
process.env.GEMINI_API_KEY = 'fixture-only-news-key';
for (const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','GMAIL_USER','GMAIL_PASS','FINNHUB_TOKEN','NEWSAPI_KEY']) process.env[name] = '';
let generated = 0, calls = 0;
const date = new Date(Date.now() - 3600000).toUTCString();
const rss = `<rss><channel><item><title>Banxico conserva la tasa de 7.5% en México</title><link>https://medio.example/banxico</link><pubDate>${date}</pubDate><description>El banco central conserva la tasa en México.</description><News:Source>Medio económico</News:Source></item><item><title>Exportaciones de maíz en México</title><link>https://medio.example/maiz</link><pubDate>${date}</pubDate><description>Los productores preparan la cosecha y el comercio internacional.</description><News:Source>Diario agrícola</News:Source></item></channel></rss>`;
const http = require('../backend/lib/http');
http.externalGet = async () => { calls++; return { ok: true, text: async () => rss, json: async () => ({ articles: [] }) }; };
http.gdeltFetch = async () => { calls++; return { ok: true, json: async () => ({ articles: [] }) }; };
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
    if (name.endsWith('/news-images')) return { enrichNewsImages: async rows => rows, extractPageImage: () => '', extractRssImage: () => '' };
    if (name.endsWith('/providers/gemini-provider')) return { GeminiProvider: class {
        constructor() { this.name = 'fixture'; }
        isConfigured() { return true; }
        async generate(input) {
            generated++;
            assert.equal(input.timeoutMs, 5000);
            assert(input.systemInstruction.includes('datos no confiables'));
            const articles = JSON.parse(input.prompt.split('NOTICIAS (JSON):')[1]);
            assert(articles.length <= 6);
            return { text: JSON.stringify({ items: articles.map((article, i) => ({ i,
                titulo: i === 0 ? article.title : 'Mercado de maíz: aumento de 999%',
                resumen: article.summary, insight: i === 0 ? 'Vigilar el costo del crédito.' : 'Nueva cifra no sustentada 999%',
                categoria: 'mercados', impacto: 'alto' })), briefing: ['La tasa se mantiene en 7.5%.', 'El maíz subió 999%.'], lead: 1 }) };
        }
    } };
    return originalLoad.call(this, name, parent, isMain);
};
let router;
try { router = require('../backend/routes/finanzas'); } finally { Module._load = originalLoad; }
const app = express(); app.use('/api', router);
const server = app.listen(0, '127.0.0.1');
(async () => {
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const token = jwt.sign({ sub: 'news-test', email: 'news@example.invalid', role: 'user' }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${token}` };
    assert.equal((await fetch(base + '/daily-news')).status, 401);
    for (const endpoint of ['daily-news', 'daily-news-markets', 'mexico-daily-news']) {
        const response = await fetch(base + '/' + endpoint, { headers });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert(payload.success && payload.data.noticias.length > 0);
        assert(payload.data.noticias.every(article => article.originalTitle && article.originalCategory && article.publishedAt));
        assert(payload.data.noticias.every(article => !article.title.includes('999%') && !article.insight.includes('999%')));
        if (endpoint !== 'mexico-daily-news') {
            const untreated = payload.data.noticias.find(article => !article.editorial);
            assert(untreated);
            assert.equal(untreated.impact, null, 'Rechazar la reescritura no inventa impacto medio');
            assert.equal(untreated.summaryOrigin, 'source');
            assert(payload.data.briefing.every(text => !text.includes('999%')));
        } else assert(payload.data.noticias.every(article => !article.insight && article.impact === null), 'La mesa mexicana conserva la fuente sin duplicarla como opinión');
        const before = generated;
        assert.equal((await fetch(base + '/' + endpoint, { headers })).status, 200);
        assert.equal(generated, before, 'La caché evita pagar de nuevo por actualizar enseguida');
    }
    assert.equal(router._test._formatFecha(null), '');
    assert.equal(router._test._formatFecha('invalid'), '');
    assert.match(router._test._formatFecha('2026-10-01T03:00:00Z'), /^30 /, 'La fecha se presenta en CDMX');
    console.log(`Noticias HTTP: OK · tres coberturas, sesión, índices/cifras, texto original, impacto sin inventar, caché y CDMX; ${generated} inferencias y ${calls} fuentes simuladas`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });