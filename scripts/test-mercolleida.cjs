'use strict';
const assert = require('node:assert/strict');
const { parsePublicPage, createMercolleidaClient } = require('../backend/services/mercolleida-public');
const { planQuery, planContext } = require('../backend/ai/query-planner');
const { domainDecision } = require('../backend/ai/domain-policy');
const { groundLiveData, rulesForMessage } = require('../backend/ai/live-data-grounder');
const { auditResponse } = require('../backend/ai/response-quality');
const { AIOrchestrator } = require('../backend/ai/orchestrator');

// Estructura de la portada oficial. Texto de prueba, no datos comerciales.
const fixture = `
Últimas cotizaciones del mercado ganadero<br/>01/10/2026
<table><tr><th>Mercado</th><th>Tendencia</th></tr>
<tr><td>Cerdo Blanco</td><td><i class='icon-down-circle red'></i></td></tr>
<tr><td>Lechón 20 kg Base Lleida</td><td><i class='icon-equal black'></i></td></tr>
<tr><td>Producto sin indicador</td><td>---</td></tr></table>
Últimas cotizaciones del mercado agrícola<br/>02/10/2026
<table><tr><td>Trigo nacional</td><td><i class='icon-up-circle green'></i></td></tr></table>
<p class="fw-700"><a href="#" data-open="exampleModal1">Comentario porcino - 28/09/2026</a></p>
<p class="small">Extracto público de prueba: menor presión de demanda.<script>no ejecutar</script></p>
<p><a href="#">Comentario cereal - 28/09/2026</a></p><p>Extracto público de prueba sobre cereales.</p>
<p><a href="#">Comentario vacuno - 28/09/2026</a></p><p>Extracto público de prueba sobre vacuno.</p>
<a href="/es/noticias/porcino-prueba" class="fw-700">Noticia porcina de prueba</a><p>Texto &amp; contexto.</p>
<a href="//example.invalid/es/noticias/privada">No seguir</a><p>No consultar.</p>
<a href="/es/noticias//example.invalid/otra">Ruta interna</a><p>Continúa en el origen oficial.</p>
<p><a href="#">Comentario porcino - 31/02/2026</a></p><p>Fecha inválida.</p>
<a href="/sites/default/files/privado.pdf">Cotización privada 9,99</a>
`;
const response = html => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), text: async () => html });

(async () => {
    const records = parsePublicPage(fixture);
    assert.equal(records.filter(item => item.kind === 'trend').length, 3);
    assert.equal(records.find(item => item.title === 'Cerdo Blanco').trend, 'baja');
    assert.equal(records.find(item => item.title.startsWith('Lechón')).trend, 'sin cambios');
    assert.equal(records.find(item => item.title === 'Trigo nacional').date, '2026-10-02');
    assert(!JSON.stringify(records).includes('9,99'));
    assert(!JSON.stringify(records).includes('no ejecutar'));
    assert(!records.some(item => item.date === '2026-02-31'));
    assert(records.every(item => new URL(item.url).hostname === 'www.mercolleida.com'));
    assert.deepEqual(parsePublicPage('<html><h1>Iniciar sesión</h1></html>'), []);

    let time = Date.parse('2026-10-02T12:00:00Z');
    let calls = 0;
    let mode = 'ok';
    const source = createMercolleidaClient({ now: () => time, fetchPage: async (url, options) => {
        calls += 1;
        assert.equal(url, 'https://www.mercolleida.com/');
        assert.equal(options.redirect, 'error');
        assert(options.signal);
        if (mode === 'error') throw new Error('fuente no disponible');
        if (mode === 'login') return response('<h1>Iniciar sesión</h1>');
        return response(fixture);
    } });
    const concurrent = await Promise.all([source.get(), source.get(), source.get()]);
    assert.equal(calls, 1, 'No se duplican consultas concurrentes');
    assert(concurrent.every(item => item.records.length));
    await source.get();
    assert.equal(calls, 1);

    const plan = planQuery({ message: 'Mercolleida' });
    assert.equal(plan.needsMercolleida, true);
    assert.equal(domainDecision({ message: 'Mercolleida' }).allowed, true);
    assert.match(planContext(plan), /No atribuyas cifras/);
    const quotePlan = planQuery({ message: 'Dame el precio del cerdo de Mercolleida hoy' });
    assert.equal(quotePlan.needsLiveQuote, false);
    assert.deepEqual(rulesForMessage('Precio del trigo Mercolleida', quotePlan), []);
    const history = [{ role: 'user', content: 'Dame las tendencias del cerdo de Mercolleida' }];
    const follow = planQuery({ message: '¿Y los cereales?', history });
    assert.equal(follow.needsMercolleida, true);
    assert(!follow.mercolleidaQuery.includes('cerdo'), 'El nuevo sector reemplaza al anterior');
    assert.equal(planQuery({ message: 'Ahora analiza Bitcoin', history }).needsMercolleida, false);
    assert.equal(planQuery({ message: 'Muéstrame las fuentes de la respuesta anterior', history }).needsMercolleida, true);
    assert.equal(planQuery({ message: '¿Y hoy?', history }).needsMercolleida, true);

    const publicData = await groundLiveData(quotePlan, 'cerdo Mercolleida', { mercolleidaClient: source });
    assert(publicData.available);
    assert(publicData.citations.every(item => item.source === 'Mercolleida'));
    assert(publicData.citations.some(item => item.date === '2026-10-01'));
    assert.match(publicData.context, /NO hay precios absolutos/);
    const grains = await groundLiveData(follow, 'cerdo antiguo en el historial', { mercolleidaClient: source });
    assert(grains.citations.some(item => /Trigo/.test(item.title)));
    assert(!grains.citations.some(item => /Cerdo/.test(item.title)));

    time += 11 * 60_000;
    mode = 'error';
    const stale = await groundLiveData(plan, 'Mercolleida', { mercolleidaClient: source });
    assert.equal(stale.stale, true);
    assert.match(stale.context, /caché anterior/);
    assert.match(auditResponse({ plan, liveData: stale }).disclosure, /no se pudo confirmar/i);
    await source.get();
    assert.equal(calls, 2, 'Se frena la repetición inmediata de errores');
    time += 7 * 60 * 60_000;
    const expired = await source.get();
    assert.equal(expired.records.length, 0, 'No se sirven datos viejos indefinidamente');
    time += 31_000;
    mode = 'login';
    assert.equal((await source.get()).records.length, 0);
    time += 31_000;
    mode = 'ok';
    assert.equal((await source.get()).stale, false, 'Se recupera la fuente');
    const downSource = { get: async () => ({ records: [], warning: 'no disponible', fetchedAt: null, stale: false }) };
    const unavailable = await groundLiveData(plan, 'Mercolleida', { mercolleidaClient: downSource });
    assert.equal(unavailable.available, false);
    assert.match(unavailable.context, /No se obtuvo información pública verificable/);

    // El mismo conector debe alimentar tanto al widget como al chat transmitido.
    const requests = [];
    const answerText = 'Mercolleida publica una tendencia de baja para Cerdo Blanco con fecha 2026-10-01. No hay precio exacto verificable en la información pública.';
    const orchestrator = new AIOrchestrator({
        liveDataGrounder: (queryPlan, message) => groundLiveData(queryPlan, message, { mercolleidaClient: source }),
        retriever: {
            retrieve: async () => ({ context: '', citations: [], sourceCodes: [], evidenceCount: 0, charts: [], evidenceRecords: [], retrievalStrategy: 'fixture' }),
            recordQuery: async () => null, recordEvidence: async () => null,
        },
        provider: {
            name: 'fixture', isConfigured: () => true,
            generate: async request => { requests.push(request); return { text: answerText, model: 'fixture' }; },
            stream: async request => { requests.push(request); request.onText(answerText, answerText); return { text: answerText, model: 'fixture' }; },
        },
    });
    for (const method of ['generateStructured', 'stream']) {
        const answer = await orchestrator[method]({ message: 'Dame el precio del cerdo Mercolleida hoy', history: [], tier: 'flash', onText() {} });
        assert.match(requests.at(-1).prompt, /MERCOLLEIDA · INFORMACIÓN PÚBLICA/);
        assert.match(answer.text, /https:\/\/www\.mercolleida\.com\//);
        assert(answer.response.meta.citations.some(item => item.source === 'Mercolleida'));
        assert.match(answer.retrievalStrategy, /mercolleida_public_v1/);
    }
    console.log('Mercolleida public connector and chat tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
