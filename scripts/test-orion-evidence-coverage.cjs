'use strict';
const assert = require('node:assert/strict');
const { evidenceCoverage, coverageContext, sourceDate } = require('../backend/ai/evidence-coverage');
const { planQuery } = require('../backend/ai/query-planner');
const { forecastRequest } = require('../backend/ai/answer-strategy');
const now = Date.parse('2026-10-15T18:00:00Z');
const plan = { needsTradeResearch: true, tradeResearchQuery: 'Acuerdos China Estados Unidos en los últimos tres meses' };
const evidence = { citations: [
    { url: 'https://example.org/new', date: '2026-09-15' },
    { url: 'https://example.org/new', date: '2026-09-15' },
    { url: 'https://example.org/background', date: '2025-10-01' },
    { url: 'https://example.org/grounded', indexedAt: '2026-10-15', type: 'google_search_grounding' },
    { url: 'https://example.org/future', date: '2027-01-01' },
    { url: 'https://example.org/invalid-date', date: '2026-02-30' },
    { url: 'javascript:alert(1)', date: '2026-10-01' },
    { url: 'https://secret:password@example.org/private', date: '2026-10-01' },
] };
const original = structuredClone(evidence);
const result = evidenceCoverage(plan, evidence, now);
assert.equal(result.total, 5);
assert.equal(result.dated, 2);
assert.equal(result.inPeriod, 1);
assert.equal(result.outsidePeriod, 1);
assert.equal(result.undated, 2, 'La indexación y fechas inválidas no prueban publicación');
assert.equal(result.futureDated, 1);
assert.equal(result.status, 'partial');
assert.equal(result.period.start, '2026-07-15');
assert.equal(result.period.end, '2026-10-15');
assert.equal(result.latest, '2026-09-15');
assert.deepEqual(evidence, original);
assert.equal(sourceDate('2024-02-29'), '2024-02-29');
assert.equal(sourceDate('2026-02-29'), null);
assert.equal(evidenceCoverage(plan, {}, now).status, 'unavailable');
assert.equal(evidenceCoverage({}, { citations: [{ url: 'https://example.org' }] }, now).status, 'dates_unconfirmed');
assert.match(coverageContext(plan, evidence, now), /entrada en vigor/);
assert.match(coverageContext(plan, evidence, now), /no reemplaza/);
assert.equal(coverageContext({}, evidence, now), '');
const history = [{ role: 'user', content: 'Pronóstico de TSN para 5 sesiones' }, { role: 'assistant', content: 'Escenario de TSN.' }];
for (const switchMessage of ['Ahora cambia de tema: noticias económicas de México en los últimos tres meses', 'Cambiemos de tema. Acuerdos de China y Estados Unidos', 'Quiero cambiar de tema: inflación de México']) {
    assert.equal(forecastRequest(switchMessage, history).requested, false, 'Un cambio explícito de tema no hereda pronósticos');
    assert.equal(planQuery({ message: switchMessage, history }).followsThread, false);
}
assert.equal(forecastRequest('Ahora para una sesión', history).horizon, 1, 'Conserva los seguimientos que sí modifican el horizonte');
const newsFollowUp = planQuery({ message: 'Dame noticias de eso', history });
assert.equal(newsFollowUp.followsThread, true);
assert.equal(newsFollowUp.asksForecast, false, 'Pedir noticias del mismo activo no pide otra estimación de precio');
assert.match(newsFollowUp.marketQuery, /TSN/);
assert.equal(forecastRequest('Actualiza el pronóstico con las noticias de hoy', history).requested, true);
console.log('ORION evidencia: periodo, antecedentes, fechas inválidas/futuras, indexación, enlaces y cobertura parcial OK');
