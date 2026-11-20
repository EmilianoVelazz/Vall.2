'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CACHE_DIR } = require('../lib/config');
const { loadCachedPredictiveShowcase } = require('../ml/predictive-showcase');

const CACHE_FILES = Object.freeze({
    finance: path.resolve(__dirname, '../cache/finance_executive_reports.json'),
    markets: path.resolve(__dirname, '../cache/market_executive_reports.json'),
    mexico: path.resolve(__dirname, '../cache/mexico-executive-reports.json'),
});

const READ_SAFE = file => {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { /* recurso opcional */ }
    return null;
};

function summarizeReportArea(label, payload) {
    if (!payload || !Array.isArray(payload.reports)) return null;
    const reports = payload.reports;
    const keys = reports.map(r => r.key).filter(Boolean);
    const sampleDates = reports
        .map(r => r.generatedAt || payload.generatedAt)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || payload.generatedAt || null;
    return `- **${label}** (corte: ${sampleDates ? String(sampleDates).slice(0, 16).replace('T', ' ') : 'vigente'}): ${reports.length} informes (${keys.join(', ')})`;
}

function summarizeProteinSnapshotCoverage() {
    const markets = READ_SAFE(CACHE_FILES.markets);
    const proteinReport = markets?.reports?.find(r => r.key === 'proteins');
    const items = Array.isArray(proteinReport?.sourceSnapshot?.proteins) ? proteinReport.sourceSnapshot.proteins : [];
    const byCountry = new Map();
    for (const item of items) {
        if (!item?.value || !item?.observedAt || !item?.source) continue;
        const label = item.country || item.market || item.region || 'Global';
        if (!byCountry.has(label)) byCountry.set(label, new Set());
        byCountry.get(label).add(`${item.category || item.label || item.unit} (${item.observedAt})`);
    }
    const mexico = READ_SAFE(CACHE_FILES.mexico);
    const mxProteins = mexico?.reports?.find(r => r.key === 'mx_proteins');
    return {
        reportGeneratedAt: proteinReport?.generatedAt || null,
        mexicoGeneratedAt: mxProteins?.generatedAt || null,
        countriesCount: byCountry.size,
        samples: [...byCountry.entries()].slice(0, 8).map(([country, set]) => `${country}: ${[...set].slice(0, 2).join(', ')}`),
    };
}

function buildDataInventoryContext({ plan = {}, liveData = null, evidence = null } = {}) {
    const lines = ['[INVENTARIO Y COBERTURA EN VIVO DE VALLNEWS / ORION]'];

    const fin = summarizeReportArea('Informes Finanzas', READ_SAFE(CACHE_FILES.finance));
    const mkt = summarizeReportArea('Informes Mercados Globales', READ_SAFE(CACHE_FILES.markets));
    const mx = summarizeReportArea('Informes México (32 entidades)', READ_SAFE(CACHE_FILES.mexico));
    if (fin || mkt || mx) {
        lines.push('1) **Cortes ejecutivos en caché del servidor (ReportReaderAgent):**');
        if (fin) lines.push(fin);
        if (mkt) lines.push(mkt);
        if (mx) lines.push(mx);
    }

    const showcase = loadCachedPredictiveShowcase();
    if (showcase?.assets?.length) {
        const eligible = showcase.assets.filter(a => a.horizons?.some(h => h.eligible));
        lines.push(
            `2) **Modelos ML Predictivos (Proyecto Loopus Walk-Forward, corte ${String(showcase.generatedAt || '').slice(0, 10)}):**`,
            `- ${showcase.summary?.eligibleModelsCount || 0}/${showcase.summary?.totalModelsEvaluated || 0} horizontes validados fuera de muestra (mejora media MAE: +${showcase.summary?.avgImprovementPct || 0}%, precisión direccional: ${showcase.summary?.avgDirectionAccuracyPct || 0}%).`,
            `- Activos con pronóstico validado activo: ${eligible.map(a => `${a.symbol} (${a.lastValue} ${a.unit} al ${a.cutoff})`).join(', ')}.`,
        );
    }

    const commFile = fs.existsSync(path.join(CACHE_DIR, 'commodity-cache.json'))
        ? path.join(CACHE_DIR, 'commodity-cache.json')
        : path.resolve(__dirname, '../cache/commodity-cache.json');
    const comm = READ_SAFE(commFile);
    if (comm && typeof comm === 'object') {
        const commKeys = Object.keys(comm);
        if (commKeys.length) lines.push(`3) **Series históricas de commodities en caché local:** ${commKeys.join(', ')}.`);
    }

    const protSnap = summarizeProteinSnapshotCoverage();
    if (protSnap.countriesCount) {
        lines.push(
            `4) **Cobertura internacional de proteínas en caché verificado (${protSnap.countriesCount} plazas/regiones, corte ${String(protSnap.reportGeneratedAt || '').slice(0, 10)}):** ${protSnap.samples.join(' | ')}.`,
        );
    }

    lines.push(
        '5) **Conectores en vivo por consulta:** Yahoo Finance (acciones BMV/EE. UU., futuros CME/CBOT/NYMEX, FX), Open Exchange Rates (divisas), Banxico/Treasury (tasas), USDA AMS LMPR (cutout cerdo/res EE. UU.), SNIIM + Porcicultura.com + PROFECO/DSPC (México 32 estados), Comisión Europea DG AGRI (UE cuando su API responde), Mercolleida, Rabobank, GDELT/NewsAPI y Google Search Grounding.',
    );

    if (plan.asksCoverageExplanation) {
        lines.push(
            '',
            '[DIAGNÓSTICO PARA EXPLICAR BRECHAS DE COBERTURA ANTERIORES]',
            '- Si una consulta previa solo mostró Estados Unidos (USDA AMS cerdo/res) y omitió Europa, México o Brasil, los motivos técnicos reales son:',
            '  1) La API pública de Comisión Europea DG AGRI puede devolver HTTP 500/timeout en consultas en vivo; además USDA AMS LMPR cubre cutout de cerdo y res (no pollo entero ni huevo comercial en esa ruta).',
            '  2) Si una pregunta pide "alrededor del mundo", conviene combinar el conector en vivo (USDA + SNIIM México) con las referencias internacionales fechadas del informe ejecutivo de Proteínas (CEPEA Brasil, FranceAgriMer–RNM Francia, DG AGRI UE, Canadá, China DCE y SNIIM 32 estados).',
            '- Explica estos motivos reales de forma clara, directa y transparente, menciona qué países/especies sí están disponibles ahora mismo en VALLNews y ofrece mostrarlos enseguida si el usuario los desea.',
        );
        if (liveData?.proteinPrices?.missing?.length) {
            lines.push(`- Brechas reportadas por el conector en el intento reciente: ${liveData.proteinPrices.missing.slice(0, 10).join(', ')}.`);
        }
        if (evidence?.warnings?.length) {
            lines.push(`- Avisos de fuentes en el hilo: ${evidence.warnings.join(' | ')}.`);
        }
    }

    return lines.join('\n');
}

module.exports = { buildDataInventoryContext };
