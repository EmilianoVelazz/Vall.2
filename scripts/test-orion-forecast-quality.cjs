'use strict';
const assert = require('node:assert/strict');
const { assessAdaptiveForecast } = require('../backend/ml/adaptive-forecast');
const { loadForecast, forecastMarkdown } = require('../backend/ai/forecast-analysis');
const { externalGet } = require('../backend/lib/http');
const DAY = 86_400_000;
const now = Date.parse('2026-10-15T18:00:00Z');
function series(count, valueAt = i => 100 + i * .4 + [0, 2, 1, -1, 3, 2, -2, -1][i % 8]) {
    return Array.from({ length: count }, (_, i) => ({ date: new Date(now - (count - i) * DAY).toISOString().slice(0, 10), value: valueAt(i) }));
}
async function main() {
    const points = series(520);
    for (const horizon of [1, 5, 20]) {
        const assessment = assessAdaptiveForecast(points, { horizon, now });
        assert(assessment.eligible);
        const checks = assessment.evaluation;
        const independent = checks.nonOverlapping;
        assert(independent.evaluationPoints >= 8 && independent.evaluationPoints <= 16);
        assert(independent.improvement >= .02 && checks.improvement >= .02);
        assert(checks.intervalChecks > 0);
        assert(checks.intervalCoverage >= 0 && checks.intervalCoverage <= 1);
        assert.equal(checks.intervalProtocol, 'range_from_errors_known_before_each_origin');
        independent.windows.forEach((window, index, all) => {
            assert(window.cutoff < window.resultDate);
            if (index) assert(all[index - 1].resultDate <= window.cutoff, 'Los resultados no comparten un tramo futuro');
        });
        assert.equal(assessment.forecast.probabilityUp, null);
    }
    const insufficient = assessAdaptiveForecast(points.slice(-110), { horizon: 20, now });
    assert.equal(insufficient.eligible, false);
    assert(insufficient.evaluation.nonOverlapping.evaluationPoints < 8);
    const noAdvantage = assessAdaptiveForecast(series(520, () => 100), { horizon: 5, now });
    assert.equal(noAdvantage.eligible, false);
    const shock = assessAdaptiveForecast(series(520, i => i >= 500 ? 1000 + (i % 2 ? 500 : 0) : 100 + i * .4), { horizon: 1, now });
    assert(shock.evaluation.intervalCoverage < .9, 'No calibra y mide la cobertura con los mismos errores: los cambios abruptos pueden quedar fuera');

    let requestedUrl;
    const history = series(800);
    const record = await loadForecast({ ticker: 'TSN', name: 'Tyson', unit: 'USD' }, 20, { now,
        get: async url => { requestedUrl = url; return { ok: true, json: async () => ({ chart: { result: [{
            timestamp: history.map(row => Date.parse(row.date) / 1000), meta: { currency: 'USD' },
            indicators: { adjclose: [{ adjclose: history.map(row => row.value) }], quote: [{ close: history.map(row => row.value) }] },
        }] } }) }; },
    });
    assert.match(requestedUrl, /range=2y/);
    assert.equal(record.observations, 740, 'Acota cómputo y memoria aunque el proveedor entregue más datos');
    assert(record.available);
    const markdown = forecastMarkdown({ records: [record] });
    assert.match(markdown, /sin solapamiento/);
    assert.match(markdown, /no probabilidad de acierto futura/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadForecast({ ticker: 'TSN' }, 1, { signal: controller.signal, get: async () => { throw Error('No debe consultar'); } }), error => error.name === 'AbortError');
    await assert.rejects(externalGet('https://example.invalid', {}, 100, { signal: controller.signal }), error => error.name === 'AbortError');
    console.log('ORION pronósticos: histórico acotado de 2 años, doble referencia, ventanas separadas, cobertura previa, cambio brusco y cancelación OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
