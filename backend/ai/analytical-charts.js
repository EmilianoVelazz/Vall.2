'use strict';

const { loadCachedPredictiveShowcase } = require('../ml/predictive-showcase');
const { normalizeProteinPriceToKg } = require('../services/protein-unit-normalizer');
const { normalizeForIntent } = require('./conversation-context');

const COUNTRY_SHORT = Object.freeze({
    US: 'EE. UU.', MX: 'México', BR: 'Brasil', FR: 'Francia', ES: 'España',
    DE: 'Alemania', PL: 'Polonia', CA: 'Canadá', CL: 'Chile', CN: 'China',
    AR: 'Argentina', CO: 'Colombia', PE: 'Perú', GB: 'R. Unido', IT: 'Italia',
    NL: 'P. Bajos', DK: 'Dinamarca', BE: 'Bélgica', IE: 'Irlanda', PT: 'Portugal',
});

const SHOWCASE_ASSET_PATTERNS = Object.freeze([
    { symbol: 'USDMXN=X', re: /\b(?:usd\/?mxn|usdmxn|dolar\s+(?:frente\s+al\s+)?peso|tipo\s+de\s+cambio)\b/i },
    { symbol: 'EURUSD=X', re: /\b(?:eur\/?usd|eurusd|euro\s+(?:frente\s+al\s+)?dolar)\b/i },
    { symbol: 'ZC=F', re: /\b(?:zc=f|maiz\s+(?:cbot|futuros?)|corn\s+futures?|futuros?\s+de\s+maiz)\b/i },
    { symbol: 'ZS=F', re: /\b(?:zs=f|soya\s+(?:cbot|futuros?)|soja\s+(?:cbot|futuros?)|soybeans?\s+futures?)\b/i },
    { symbol: 'ZW=F', re: /\b(?:zw=f|trigo\s+(?:cbot|futuros?)|wheat\s+futures?)\b/i },
    { symbol: 'HE=F', re: /\b(?:he=f|lean\s+hogs?|cerdo\s+(?:cme|futuros?|magro)|futuros?\s+de\s+cerdo)\b/i },
    { symbol: 'LE=F', re: /\b(?:le=f|live\s+cattle|ganado\s+(?:vivo|bovino)\s+(?:cme|futuros?)|futuros?\s+de\s+res)\b/i },
    { symbol: 'CL=F', re: /\b(?:cl=f|wti|crudo\s+wti|petroleo\s+(?:wti|nymex|futuros?))\b/i },
    { symbol: '^MXX', re: /\b(?:\^mxx|\bmxx\b|\bipc\b|s&p\/?bmv)\b/i },
    { symbol: 'GRUMAB.MX', re: /\b(?:grumab?\.mx|gruma)\b/i },
    { symbol: 'CORN-LOCAL', re: /\bmaiz\b/i },
    { symbol: 'WHEAT-LOCAL', re: /\btrigo\b/i },
    { symbol: 'WTI-LOCAL', re: /\b(?:petroleo|crudo)\b/i },
    { symbol: 'COPPER-LOCAL', re: /\bcobre\b/i },
    { symbol: 'NATGAS-LOCAL', re: /\bgas\s+natural\b/i },
    { symbol: 'ALUMINUM-LOCAL', re: /\baluminio\b/i },
]);

/**
 * Construye una gráfica de línea interactiva a partir de una trayectoria reciente
 * y los puntos de pronóstico (con bandas del 90%) anclados en el último cierre.
 */
function buildTrajectoryForecastSpec({ title, subtitle, unit, source, insight, historyPoints, horizons }) {
    const hist = (Array.isArray(historyPoints) ? historyPoints : [])
        .filter(pt => pt?.date && Number.isFinite(Number(pt?.value)))
        .slice(-16);
    if (hist.length < 4) return null;

    const validHorizons = (Array.isArray(horizons) ? horizons : [])
        .filter(h => h && h.eligible && Number.isFinite(Number(h.value)))
        .sort((a, b) => a.horizon - b.horizon);
    if (!validHorizons.length) return null;

    const anchorValue = Number(hist[hist.length - 1].value);
    const futureLabels = validHorizons.map(h => `+${h.horizon} ${h.horizon === 1 ? 'obs.' : 'obs.'}`);
    const labels = [...hist.map(pt => pt.date), ...futureLabels];
    const padNulls = Array(Math.max(0, hist.length - 1)).fill(null);

    const histData = [...hist.map(pt => Number(pt.value)), ...Array(validHorizons.length).fill(null)];
    const forecastData = [...padNulls, anchorValue, ...validHorizons.map(h => Number(h.value.toFixed(4)))];
    const upperData = [...padNulls, anchorValue, ...validHorizons.map(h => Number((h.upperBound ?? h.value).toFixed(4)))];
    const lowerData = [...padNulls, anchorValue, ...validHorizons.map(h => Number((h.lowerBound ?? h.value).toFixed(4)))];

    return {
        type: 'line',
        view: 'line',
        title: String(title || 'Pronóstico cuantitativo Walk-Forward').slice(0, 140),
        subtitle: String(subtitle || '').slice(0, 280),
        insight: String(insight || '').slice(0, 360),
        unit: String(unit || '').slice(0, 40),
        source: String(source || '').slice(0, 180),
        labels,
        datasets: [
            { label: 'Histórico observado', type: 'line', data: histData },
            { label: 'Pronóstico ML', type: 'line', data: forecastData },
            { label: 'Límite superior (IC 90%)', type: 'line', borderDash: [5, 4], data: upperData },
            { label: 'Límite inferior (IC 90%)', type: 'line', borderDash: [5, 4], data: lowerData },
        ],
    };
}

/**
 * Gráfica para análisis puntual de pronóstico (`forecast-analysis.js`).
 */
function buildForecastRecordChart(analysis) {
    if (!analysis?.available || !Array.isArray(analysis.records)) return null;
    const record = analysis.records.find(r => r?.available && Array.isArray(r.recentSeries) && r.recentSeries.length >= 4 && r.prediction);
    if (!record) return null;
    const imp = Number.isFinite(record.evaluation?.improvement) ? (record.evaluation.improvement * 100).toFixed(1) : null;
    const insight = [
        `Corte ${record.cutoff}: ${record.lastValue} → ${Number(record.prediction.value).toFixed(2)} ${record.unit}`,
        imp ? `Mejora MAE vs referencia: +${imp}%` : '',
    ].filter(Boolean).join(' · ');

    return buildTrajectoryForecastSpec({
        title: `${record.name} (${record.ticker}) · Horizonte ${record.horizon} obs.`,
        subtitle: `Últimos ${Math.min(16, record.recentSeries.length)} cierres y proyección con banda de error fuera de muestra`,
        unit: record.unit,
        source: `${record.source || 'Yahoo Finance'} · Modelo adaptativo ORION`,
        insight,
        historyPoints: record.recentSeries,
        horizons: [{
            horizon: record.horizon,
            eligible: true,
            value: record.prediction.value,
            lowerBound: record.prediction.lowerBound,
            upperBound: record.prediction.upperBound,
        }],
    });
}

/**
 * Gráfica del Showcase ML (`predictive-showcase.json`) cuando el usuario pide
 * un activo cubierto por Loopus o un resumen visual de modelos activos.
 */
function buildShowcaseChart({ message = '', plan = {} } = {}) {
    const showcase = loadCachedPredictiveShowcase();
    if (!showcase?.assets?.length) return null;
    const q = normalizeForIntent(message);

    let matchedAsset = null;
    for (const rule of SHOWCASE_ASSET_PATTERNS) {
        if (rule.re.test(q)) {
            const candidate = showcase.assets.find(a => a.symbol === rule.symbol);
            if (candidate) { matchedAsset = candidate; break; }
        }
    }

    if (matchedAsset) {
        const eligibleHorizons = (matchedAsset.horizons || [])
            .filter(h => h.eligible && Number.isFinite(Number(h.forecast?.value)))
            .map(h => ({
                horizon: h.horizon,
                eligible: true,
                value: Number(h.forecast.value),
                lowerBound: Number(h.forecast.lowerBound ?? h.forecast.value),
                upperBound: Number(h.forecast.upperBound ?? h.forecast.value),
            }));
        if (eligibleHorizons.length && Array.isArray(matchedAsset.recentHistory) && matchedAsset.recentHistory.length >= 4) {
            const best = eligibleHorizons[0];
            const bestFull = matchedAsset.horizons.find(h => h.horizon === best.horizon);
            const imp = bestFull?.evaluation?.improvementPct;
            const acc = bestFull?.evaluation?.directionAccuracyPct;
            return buildTrajectoryForecastSpec({
                title: `${matchedAsset.label} (${matchedAsset.symbol}) · Loopus ML`,
                subtitle: `Serie ${matchedAsset.interval} al ${matchedAsset.cutoff} · ${eligibleHorizons.length} horizontes validados fuera de muestra`,
                unit: matchedAsset.unit,
                source: `${matchedAsset.source} · Loopus Walk-Forward (${matchedAsset.cutoff})`,
                insight: Number.isFinite(imp)
                    ? `Mejora MAE +${Number(imp).toFixed(1)}% · Precisión direccional ${Math.round(acc || 0)}%`
                    : `Proyección ML validada hasta +${eligibleHorizons.at(-1).horizon} obs.`,
                historyPoints: matchedAsset.recentHistory,
                horizons: eligibleHorizons,
            });
        }
    }

    const asksMlOverview = (plan.asksDataInventory || /\b(?:loopus|walk-?forward|modelos?\s+ml|pron[oó]sticos?\s+ml|pron[oó]sticos?\s+activos)\b/i.test(q))
        && /\b(?:ml|loopus|pron[oó]stic|model|gr[aá]fic|chart|activos)\b/i.test(q);
    if (!asksMlOverview) return null;

    const top = showcase.assets
        .map(asset => {
            const best = (asset.horizons || [])
                .filter(h => h.eligible && Number.isFinite(Number(h.evaluation?.improvementPct)))
                .sort((a, b) => Number(b.evaluation.improvementPct) - Number(a.evaluation.improvementPct))[0];
            return best ? { asset, best } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.best.evaluation.improvementPct - a.best.evaluation.improvementPct)
        .slice(0, 9);

    if (top.length < 2) return null;
    return {
        type: 'bar',
        view: 'horizontalBar',
        title: 'Desempeño Loopus ML · Ventaja fuera de muestra',
        subtitle: `Mejora MAE (%) vs referencia de último valor · Corte ${String(showcase.generatedAt || '').slice(0, 10)}`,
        insight: `Media global: +${showcase.summary?.avgImprovementPct || 0}% MAE y ${showcase.summary?.avgDirectionAccuracyPct || 0}% dirección en ${showcase.summary?.eligibleModelsCount || top.length} horizontes activos`,
        unit: '%',
        source: `Proyecto Loopus Walk-Forward (${showcase.summary?.eligibleModelsCount || top.length} modelos activos)`,
        labels: top.map(({ asset, best }) => `${asset.symbol} (h=${best.horizon})`),
        datasets: [
            { label: 'Mejora MAE vs último valor (%)', data: top.map(({ best }) => Number(best.evaluation.improvementPct.toFixed(2))) },
            { label: 'Precisión direccional (%)', data: top.map(({ best }) => Number((best.evaluation.directionAccuracyPct || 0).toFixed(1))) },
        ],
    };
}

/**
 * Gráfica comparativa de precios físicos de proteínas por país/plaza.
 * Utiliza conversión verificable a MXN/kg cuando hay FX cerrado y múltiples monedas,
 * o precios locales directos MXN/kg entre entidades de México.
 */
function buildProteinComparisonChart({ records = [], fxRates = null, plan = {}, message = '' } = {}) {
    if (!Array.isArray(records) || records.length < 2) return null;
    const profile = plan.proteinProfile || {};
    const wantsChart = Boolean(plan.asksComparison || profile.global || (profile.mexicoStates?.length || 0) >= 3
        || /\b(?:gr[aá]fica|gr[aá]fico|visualiza|chart|compara)\b/i.test(String(message || '')));
    if (!wantsChart) return null;

    const multiCurrency = new Set(records.map(r => r.currency).filter(Boolean)).size > 1
        || records.some(r => r.currency !== 'MXN' || !/^MXN\/kg$/i.test(String(r.unit || '').trim()));

    if (multiCurrency && fxRates?.rates?.MXN) {
        const countriesMap = new Map();
        for (const r of records) {
            const norm = normalizeProteinPriceToKg(r, fxRates);
            if (!norm || !Number.isFinite(norm.mxnPerKg)) continue;
            const code = r.countryCode || r.country;
            if (!countriesMap.has(code)) {
                countriesMap.set(code, { label: COUNTRY_SHORT[code] || r.country || code, byProduct: {} });
            }
            const entry = countriesMap.get(code);
            if (entry.byProduct[r.productId] == null) {
                entry.byProduct[r.productId] = Number(norm.mxnPerKg.toFixed(2));
            }
        }
        const rows = [...countriesMap.values()].slice(0, 10);
        if (rows.length < 2) return null;

        const productMeta = [
            { id: 'pork', label: 'Cerdo (~MXN/kg)' },
            { id: 'poultry', label: 'Pollo (~MXN/kg)' },
            { id: 'beef', label: 'Res (~MXN/kg)' },
            { id: 'eggs', label: 'Huevo por kg (~MXN/kg)' },
        ];
        const datasets = productMeta
            .map(p => ({
                label: p.label,
                data: rows.map(row => row.byProduct[p.id] ?? null),
            }))
            .filter(ds => ds.data.filter(v => v != null).length >= 2);
        if (!datasets.length) return null;

        return {
            type: 'bar',
            view: 'bar',
            title: 'Comparativa internacional de proteínas (~MXN/kg)',
            subtitle: 'Equivalente por divisa y peso (cada plaza mantiene su etapa comercial original: vivo, canal o entero)',
            insight: `${rows.length} mercados con base ponderal comparable (${fxRates.source || 'FX referencial'}, ${fxRates.updatedAt || 'vigente'})`,
            unit: 'MXN/kg',
            source: `Referencias verificadas + FX (${fxRates.source || 'Referencia FX'})`,
            labels: rows.map(r => r.label),
            datasets,
        };
    }

    // Comparativa homogénea local en MXN/kg (p. ej. estados/plazas de México)
    const mxKg = records.filter(r => r.countryCode === 'MX' && /\/kg\b/i.test(String(r.unit || '')) && Number.isFinite(Number(r.value)));
    const placeMap = new Map();
    for (const r of mxKg) {
        const label = String(r.stateCode || r.market || 'México').slice(0, 28);
        if (!placeMap.has(label)) placeMap.set(label, { label, byProduct: {} });
        const entry = placeMap.get(label);
        if (entry.byProduct[r.productId] == null) entry.byProduct[r.productId] = Number(Number(r.value).toFixed(2));
    }
    const placeRows = [...placeMap.values()].slice(0, 12);
    if (placeRows.length < 2) return null;
    const datasets = [
        { id: 'pork', label: 'Cerdo (MXN/kg)' },
        { id: 'poultry', label: 'Pollo (MXN/kg)' },
        { id: 'beef', label: 'Res (MXN/kg)' },
        { id: 'eggs', label: 'Huevo (MXN/kg)' },
    ].map(p => ({ label: p.label, data: placeRows.map(row => row.byProduct[p.id] ?? null) }))
        .filter(ds => ds.data.filter(v => v != null).length >= 2);
    if (!datasets.length) return null;

    return {
        type: 'bar',
        view: placeRows.length > 6 ? 'horizontalBar' : 'bar',
        title: 'Comparativa nacional de proteínas en México (MXN/kg)',
        subtitle: 'Referencias fechadas por plaza y categoría comercial sin mezclar presentaciones',
        insight: `${placeRows.length} plazas mexicanas con cotización verificada por kilogramo`,
        unit: 'MXN/kg',
        source: 'SNIIM / Porcicultura / Referencias verificadas México',
        labels: placeRows.map(r => r.label),
        datasets,
    };
}

/**
 * Construye una gráfica verificada desde MARRANAS v6.0 (Paridad MXN/kg, Riesgo NLP o Consenso Direccional).
 */
function buildMarranasChart({ message = '' } = {}) {
    try {
        const { loadCachedProteinML } = require('../ml/protein-ml-engine');
        const artifact = loadCachedProteinML();
        if (!artifact?.available && !artifact?.summary?.bySpecies) return null;
        const norm = normalizeForIntent(message);
        const order = [
            ['cerdo', 'Cerdo'],
            ['res', 'Res'],
            ['pollo', 'Pollo'],
            ['huevo', 'Huevo'],
        ];

        if (/\b(?:paridad|importaci|arbitraje|frontera|landed|puesta)\b/i.test(norm) && artifact.importParity?.bySpecies) {
            const rows = order
                .map(([id, label]) => ({ id, label, entry: artifact.importParity.bySpecies[id] }))
                .filter(r => r.entry?.mexicoBenchmark?.priceMxnKg > 0 && r.entry?.primaryParity?.landedMxnKg > 0);
            if (rows.length >= 2) {
                return {
                    type: 'bar',
                    view: 'bar',
                    title: 'ORION ML · Paridad de Importación hacia México (MXN/kg)',
                    subtitle: `Mediana SNIIM México vs paridad puesta en frontera (USD/MXN=${artifact.importParity.fxRates?.usdMxn ?? '—'})`,
                    insight: rows.map(r => `${r.label}: ${r.entry.primaryParity.spreadPct > 0 ? '+' : ''}${r.entry.primaryParity.spreadPct}% (${r.entry.primaryParity.signal})`).join(' · '),
                    unit: 'MXN/kg',
                    source: 'ORION ML · SNIIM MX + USDA AMS / CEPEA / DG AGRI / FMI',
                    labels: rows.map(r => r.label),
                    datasets: [
                        { label: 'México SNIIM (MXN/kg)', data: rows.map(r => r.entry.mexicoBenchmark.priceMxnKg) },
                        { label: 'Paridad puesta origen (MXN/kg)', data: rows.map(r => r.entry.primaryParity.landedMxnKg) },
                    ],
                };
            }
        }

        if (/\b(?:nlp|sanidad|sanitari|h5n1|influenza|gripe aviar|peste porcina|barrenador|screwworm|brote)\b/i.test(norm) && artifact.nlpEvents?.bySpecies) {
            const rows = order
                .map(([id, label]) => ({ id, label, ev: artifact.nlpEvents.bySpecies[id] }))
                .filter(r => r.ev && Number.isFinite(r.ev.riskScore));
            if (rows.length >= 2) {
                return {
                    type: 'bar',
                    view: 'bar',
                    title: 'ORION ML · Índice de Riesgo Sanitario y Comercial NLP (0–100)',
                    subtitle: `Clasificación automática de ${artifact.nlpEvents.stats?.relevantEventsDetected || 0} eventos recientes (ventana ${artifact.nlpEvents.windowDays || 35} días)`,
                    insight: rows.map(r => `${r.label}: ${r.ev.riskScore}/100 (${r.ev.riskLevel}, ${r.ev.bias})`).join(' · '),
                    unit: 'Puntos (0–100)',
                    source: `ORION ML · Radar NLP (${String(artifact.nlpEvents.generatedAt || '').slice(0, 10)})`,
                    labels: rows.map(r => r.label),
                    datasets: [
                        { label: 'Índice de Riesgo NLP (0–100)', data: rows.map(r => r.ev.riskScore) },
                    ],
                };
            }
        }

        const rows = order
            .map(([id, label]) => ({ id, label, sum: artifact.summary?.bySpecies?.[id] }))
            .filter(r => r.sum && Number.isFinite(r.sum.avgProbUpPct));
        if (rows.length < 2) return null;
        return {
            type: 'bar',
            view: 'bar',
            title: 'ORION ML · Probabilidad Direccional por Especie (%)',
            subtitle: `${artifact.stats?.activeModels || 0} modelos activos · Exactitud WF ${artifact.stats?.avgWalkForwardDirectionalAccuracyPct ?? '—'}% · Corte ${String(artifact.generatedAt || '').slice(0, 10)}`,
            insight: rows.map(r => `${r.label}: ${r.sum.consensusDirection} (Subida ${r.sum.avgProbUpPct}%)`).join(' · '),
            unit: '%',
            source: `ORION ML (${artifact.version}) · Walk-Forward + SHAP + Conformal P80`,
            labels: rows.map(r => r.label),
            datasets: [
                { label: 'Prob. Subida (%)', data: rows.map(r => r.sum.avgProbUpPct) },
                { label: 'Prob. Baja (%)', data: rows.map(r => r.sum.avgProbDownPct) },
            ],
        };
    } catch {
        return null;
    }
}

/**
 * Construye una gráfica comparativa verificada de mercados globales (Bolsas, Energía, Metales y Divisas)
 * directamente desde el caché de Informes Ejecutivos de Finanzas y Mercados.
 */
function buildGlobalMarketsChart({ liveQuotes = [] } = {}) {
    try {
        const fs = require('node:fs');
        const path = require('node:path');
        const finPath = path.resolve(__dirname, '../cache/finance_executive_reports.json');
        const mktPath = path.resolve(__dirname, '../cache/market_executive_reports.json');
        const parsePct = raw => {
            const m = String(raw ?? '').match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
            if (!m) return null;
            const n = Number(m[1].replace(',', '.'));
            return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
        };
        const liveBySymbol = new Map();
        for (const q of Array.isArray(liveQuotes) ? liveQuotes : []) {
            if (q?.symbol && Number.isFinite(Number(q.change))) {
                liveBySymbol.set(String(q.symbol).toUpperCase(), Number(Number(q.change).toFixed(2)));
            }
        }
        const items = [];
        const addItem = (label, pct, liveSym = null) => {
            const resolved = liveSym && liveBySymbol.has(liveSym) ? liveBySymbol.get(liveSym) : pct;
            if (!label || !Number.isFinite(resolved) || items.some(x => x.label === label)) return;
            items.push({ label, pct: resolved });
        };

        if (fs.existsSync(finPath)) {
            const fin = JSON.parse(fs.readFileSync(finPath, 'utf8'));
            const reports = Array.isArray(fin.reports) ? fin.reports : [];
            const eq = reports.find(r => r.key === 'equities');
            const eqPick = [
                ['S&P/BMV IPC', /ipc|bmv/i, '^MXX'],
                ['S&P 500', /s&p\s*500/i, '^GSPC'],
                ['Nasdaq', /nasdaq/i, '^IXIC'],
                ['Euro Stoxx / DAX', /euro\s*stoxx|dax/i, '^STOXX50E'],
                ['Nikkei 225', /nikkei/i, '^N225'],
            ];
            for (const [shortLabel, re, sym] of eqPick) {
                const m = (eq?.metrics || []).find(x => re.test(String(x?.label || '')));
                if (m) addItem(shortLabel, parsePct(m.delta ?? m.change), sym);
            }
            const fx = reports.find(r => r.key === 'fx');
            for (const [shortLabel, re] of [['USD/MXN', /usd\/mxn/i], ['USD/BRL', /usd\/brl/i], ['EUR/USD', /eur\/usd/i]]) {
                const m = (fx?.metrics || []).find(x => re.test(String(x?.label || '')));
                if (m) addItem(shortLabel, parsePct(m.delta ?? m.change));
            }
        }
        if (fs.existsSync(mktPath)) {
            const mkt = JSON.parse(fs.readFileSync(mktPath, 'utf8'));
            const reports = Array.isArray(mkt.reports) ? mkt.reports : [];
            const em = reports.find(r => r.key === 'energy_metals');
            for (const [shortLabel, re, sym] of [
                ['Petróleo WTI', /\bwti\b/i, 'CL=F'],
                ['Gas Natural', /gas\s+natural|henry\s+hub/i, 'NG=F'],
                ['Oro', /\boro\b/i, 'GC=F'],
                ['Cobre', /\bcobre\b/i, 'HG=F'],
            ]) {
                const m = (em?.metrics || []).find(x => re.test(String(x?.label || '')));
                if (m) addItem(shortLabel, parsePct(m.delta ?? m.change), sym);
            }
        }
        if (items.length < 3) return null;
        const selected = items.slice(0, 10);
        const leader = [...selected].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
        return {
            type: 'bar',
            view: 'horizontalBar',
            title: 'Mercados Globales · Variación diaria verificada (%)',
            subtitle: 'Bolsas internacionales, energía, metales y divisas (cortes verificados de Informes Ejecutivos)',
            insight: leader ? `Mayor movimiento reciente: ${leader.label} (${leader.pct >= 0 ? '+' : ''}${leader.pct}%)` : `${selected.length} referencias globales verificadas`,
            unit: '%',
            source: 'VALLNews Informes Ejecutivos (Finanzas + Mercados)',
            labels: selected.map(x => x.label),
            datasets: [
                { label: 'Variación diaria (%)', data: selected.map(x => x.pct) },
            ],
        };
    } catch {
        return null;
    }
}

module.exports = {
    buildTrajectoryForecastSpec,
    buildForecastRecordChart,
    buildShowcaseChart,
    buildProteinComparisonChart,
    buildMarranasChart,
    buildGlobalMarketsChart,
};
