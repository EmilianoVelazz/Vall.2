'use strict';
// Entrena sólo con históricos públicos locales. No llama a Gemini, no escribe
// en Supabase ni publica precios o modelos como aprobados en producción.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { trainTemporalModel, VERSION } = require('../backend/ml/temporal-training');
const { CACHE_DIR } = require('../backend/lib/config');
const root = path.resolve(__dirname, '..');
const sourceFile = path.join(CACHE_DIR, 'commodity-cache.json');
const yahooMonthly = { SOYBEANS: 'ZS=F', LEAN_HOGS: 'HE=F', LIVE_CATTLE: 'LE=F' };
const expected = { LEAN_HOGS: /lean_hogs/i, LIVE_CATTLE: /live_cattle/i, CORN: /corn|ma[ií]z/i, WHEAT: /wheat|trigo/i, SOYBEANS: /soybeans?|soya|soja/i,
    COPPER: /copper|cobre/i, NATURAL_GAS: /natural gas/i, ALUMINUM: /alumin/i, CRUDE_OIL: /crude oil|wti/i };
function dataPoints(rows, now) {
    const points = new Map();
    let excluded = 0;
    for (const row of rows) {
        const raw = row?.value, date = String(row?.date || '');
        if (raw == null || raw === '' || typeof raw === 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
            || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
            || date.slice(0, 7) >= new Date(now).toISOString().slice(0, 7) || !Number.isFinite(Number(raw)) || Number(raw) <= 0) { excluded++; continue; }
        const value = Number(raw);
        if (points.has(date) && points.get(date) !== value) throw new Error(`Observaciones contradictorias en ${date}`);
        points.set(date, value);
    }
    const sorted = [...points].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
    // Los últimos meses consecutivos: no comprimir un hueco temporal en un paso.
    let start = sorted.length - 1;
    while (start > 0) {
        const prior = new Date(sorted[start - 1].date), current = new Date(sorted[start].date);
        if ((current.getUTCFullYear() - prior.getUTCFullYear()) * 12 + current.getUTCMonth() - prior.getUTCMonth() !== 1) break;
        start--;
    }
    return { points: sorted.slice(Math.max(0, start)), excluded, observationsBeforeGaps: sorted.length };
}
function main() {
    const now = Date.now(), source = fs.readFileSync(sourceFile), cache = JSON.parse(source);
    const report = { generatedAt: new Date(now).toISOString(), modelVersion: VERSION,
        sourceFile: path.relative(root, sourceFile).split(path.sep).join('/'), sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
        scope: 'Entrenamiento mensual histórico; no representa cotizaciones actuales ni modifica los pesos de Gemini.',
        accepted: 0, rejected: 0, blockedSeries: [], models: [] };
    for (const [symbol, pattern] of Object.entries(expected)) {
        const data = cache[symbol]?.data;
        // El adaptador Yahoo vigente usa interval=1mo; versiones anteriores de
        // ese mismo adaptador omitían el campo interval en su JSON.
        const knownMonthlyAdapter = yahooMonthly[symbol] && data?.name?.includes(`Yahoo Finance · ${yahooMonthly[symbol]}`);
        const interval = data?.interval || (knownMonthlyAdapter ? 'monthly' : null);
        if (!data || interval !== 'monthly' || !pattern.test(data.name || '') || !data.unit || !Array.isArray(data.data)) {
            report.blockedSeries.push({ symbol, reason: 'Nombre, frecuencia o unidad de la fuente no coinciden con el activo.' }); continue;
        }
        const cleaned = dataPoints(data.data, now);
        for (const horizon of [1, 3, 6]) {
            const assessment = trainTemporalModel(cleaned.points, { horizon, now });
            if (assessment.eligible) report.accepted++; else report.rejected++;
            const { model, ...metrics } = assessment;
            report.models.push({ symbol, name: data.name, interval: 'monthly', intervalSource: data.interval ? 'provider_metadata' : 'known_yahoo_monthly_adapter', priceBasis: knownMonthlyAdapter ? 'futures' : 'provider_monthly_reference', unit: data.unit, horizon,
                cutoff: cleaned.points.at(-1)?.date, excludedRows: cleaned.excluded, observationsBeforeGaps: cleaned.observationsBeforeGaps,
                ...metrics, modelArtifact: model ? { algorithm: model.algorithm, targetMode: model.targetMode, lags: model.lags,
                    ridge: model.ridge, coefficients: model.coefficients, featureMeans: model.featureMeans, featureScales: model.featureScales } : null });
        }
    }
    const folder = path.join(root, 'output/auditoria-codigo/entrenamiento-ml');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'resultados.json'), JSON.stringify(report, null, 2));
    const lines = ['# Entrenamiento local de ML', '', report.scope, '', `Generado: ${report.generatedAt}. Modelos aceptados: ${report.accepted}; rechazados: ${report.rejected}.`, '',
        '| Activo | Horizonte (meses) | Corte | MAE nuevo | MAE anterior | MAE último valor | Mejora contra último valor | Resultado |',
        '|---|---:|---|---:|---:|---:|---:|---|',
        ...report.models.map(row => { const e = row.evaluation || {}, number = value => Number.isFinite(value) ? value.toFixed(3) : '—';
            return `| ${row.symbol} | ${row.horizon} | ${row.cutoff} | ${number(e.modelMae)} | ${number(e.previousModelMae)} | ${number(e.baselineMae)} | ${number(e.improvement * 100)}% | ${row.eligible ? 'Aceptado en validación local' : 'Rechazado'} |`; }), '',
        ...report.blockedSeries.map(row => `Serie bloqueada: **${row.symbol}**. ${row.reason}`), '',
        'MAE expresado en la unidad original de cada fuente. Los pesos se ajustan con historia anterior al objetivo; los hiperparámetros se seleccionan antes del tramo de validación. Los resultados de horizontes largos pueden solaparse: no son observaciones independientes ni probabilidades calibradas.', '',
        'Los modelos se conservan para comparación y revisión; este comando no los activa como pronósticos actuales en la aplicación.', ''];
    fs.writeFileSync(path.join(folder, 'ENTRENAMIENTO.md'), lines.join('\n'));
    console.log(JSON.stringify({ accepted: report.accepted, rejected: report.rejected, blockedSeries: report.blockedSeries,
        observations: report.models.filter(row => row.horizon === 1).map(row => ({ symbol: row.symbol, count: row.observations, cutoff: row.cutoff })), report: path.join(folder, 'ENTRENAMIENTO.md') }, null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { dataPoints };