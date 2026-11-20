'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { latestRates } = require('../ai/currency-converter');

const LB_TO_KG = 0.45359237;
const FINANCE_REPORT_CACHE = path.resolve(__dirname, '../cache/finance_executive_reports.json');

/**
 * Extrae el divisor en kilogramos para unidades ponderales físicas.
 * Rechaza unidades de conteo (docena, caja, pieza, cabeza) porque no se debe
 * estimar peso promedio sin una equivalencia explícita de la fuente.
 */
function parseWeightDivisorKg(unit) {
    const raw = String(unit || '').trim();
    if (!raw) return null;
    if (/\b(?:docenas?|dozen|doc\.?|cajas?|piezas?|cabezas?|paquetes?|carton(?:es)?|charolas?)\b/i.test(raw)) {
        return null;
    }
    if (/\bcwt\b|\b100\s*lb\b/i.test(raw)) return 100 * LB_TO_KG;
    const multiLb = raw.match(/\b(\d+(?:[.,]\d+)?)\s*lb\b/i);
    if (multiLb) {
        const lbs = Number(multiLb[1].replace(',', '.'));
        return Number.isFinite(lbs) && lbs > 0 ? lbs * LB_TO_KG : null;
    }
    if (/\/\s*lb\b|\blb\b/i.test(raw)) return LB_TO_KG;
    if (/\barroba\b/i.test(raw)) {
        const explicit = raw.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
        const kg = explicit ? Number(explicit[1].replace(',', '.')) : 15;
        return Number.isFinite(kg) && kg > 0 ? kg : 15;
    }
    const multiKg = raw.match(/\b(\d+(?:[.,]\d+)?)\s*kg\b/i);
    if (multiKg) {
        const kg = Number(multiKg[1].replace(',', '.'));
        return Number.isFinite(kg) && kg > 0 ? kg : null;
    }
    if (/\/\s*kg\b|\bkg\b/i.test(raw)) return 1;
    if (/\/\s*(?:t|ton|toneladas?)\b|\b(?:t|toneladas?)\s+(?:vivo|canal)\b/i.test(raw)) return 1000;
    return null;
}

/**
 * Interpreta la moneda base y factor decimal (p. ej. US¢ = 0.01 USD).
 */
function parseCurrencyFactor(currency, unit) {
    const cur = String(currency || '').trim().toUpperCase();
    const unitStr = String(unit || '').trim();
    if (cur === 'US¢' || cur === 'USC' || cur === 'USX' || /^US¢/i.test(unitStr) || /^USX/i.test(unitStr)) {
        return { iso: 'USD', factor: 0.01 };
    }
    if (cur === 'RMB') return { iso: 'CNY', factor: 1 };
    if (/^[A-Z]{3}$/.test(cur)) return { iso: cur, factor: 1 };
    const prefix = unitStr.match(/^([A-Z]{3})\b/);
    if (prefix) return { iso: prefix[1], factor: 1 };
    return null;
}

/**
 * Carga tipos de cambio fechados desde el caché del reporte ejecutivo de Finanzas
 * como respaldo ante indisponibilidad del proveedor en vivo.
 */
function loadCachedFinanceFxRates() {
    try {
        if (!fs.existsSync(FINANCE_REPORT_CACHE)) return null;
        const payload = JSON.parse(fs.readFileSync(FINANCE_REPORT_CACHE, 'utf8'));
        const fxReport = payload?.reports?.find(r => r.key === 'fx');
        const rows = Array.isArray(fxReport?.sourceSnapshot?.fx) ? fxReport.sourceSnapshot.fx : [];
        if (!rows.length) return null;
        const rates = { USD: 1 };
        let latestDate = null;
        for (const row of rows) {
            const code = String(row?.code || '').trim().toUpperCase();
            const val = Number(row?.value);
            if (/^[A-Z]{3}$/.test(code) && Number.isFinite(val) && val > 0) {
                rates[code] = val;
                if (row.updatedAt && (!latestDate || row.updatedAt > latestDate)) latestDate = row.updatedAt;
            }
        }
        if (!rates.MXN) return null;
        return {
            base: 'USD',
            rates,
            updatedAt: latestDate || String(fxReport.generatedAt || '').slice(0, 10) || null,
            source: 'BCE / Yahoo (caché verificado)',
        };
    } catch {
        return null;
    }
}

/**
 * Resuelve el mapa de tipos de cambio USD-base para normalización comparativa.
 */
async function resolveProteinFxRates({ get, allowLiveFx = true, timeoutMs = 1800 } = {}) {
    if (!allowLiveFx) return null;
    try {
        const live = await Promise.race([
            latestRates(get),
            new Promise((_, reject) => setTimeout(() => reject(new Error('FX timeout')), timeoutMs)),
        ]);
        if (live?.rates?.USD && live?.rates?.MXN) {
            const rawDate = String(live.time_last_update_utc || '');
            const parsed = Date.parse(rawDate);
            const updatedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
            return {
                base: 'USD',
                rates: live.rates,
                updatedAt,
                source: 'ExchangeRate-API',
            };
        }
    } catch { /* respaldo al caché local */ }
    return loadCachedFinanceFxRates();
}

/**
 * Convierte una cotización física ponderal a USD/kg y MXN/kg usando tasas fechadas.
 */
function normalizeProteinPriceToKg(record, fxRates) {
    if (!record || !fxRates?.rates) return null;
    const divisorKg = parseWeightDivisorKg(record.unit);
    if (!divisorKg) return null;
    const curInfo = parseCurrencyFactor(record.currency, record.unit);
    if (!curInfo) return null;

    const rateFromUsd = curInfo.iso === 'USD' ? 1 : Number(fxRates.rates[curInfo.iso]);
    const mxnPerUsd = Number(fxRates.rates.MXN);
    if (!Number.isFinite(rateFromUsd) || rateFromUsd <= 0) return null;

    const toKgValues = rawVal => {
        const n = Number(rawVal);
        if (!Number.isFinite(n) || n < 0) return null;
        const usdPerKg = (n * curInfo.factor / rateFromUsd) / divisorKg;
        const mxnPerKg = Number.isFinite(mxnPerUsd) && mxnPerUsd > 0 ? usdPerKg * mxnPerUsd : null;
        return { usdPerKg, mxnPerKg };
    };

    if (record.priceType === 'reported_range') {
        const minConv = toKgValues(record.rangeMin);
        const maxConv = toKgValues(record.rangeMax);
        if (!minConv || !maxConv) return null;
        return {
            isRange: true,
            divisorKg,
            isoCurrency: curInfo.iso,
            usdRange: [minConv.usdPerKg, maxConv.usdPerKg],
            mxnRange: minConv.mxnPerKg !== null && maxConv.mxnPerKg !== null ? [minConv.mxnPerKg, maxConv.mxnPerKg] : null,
            rateFromUsd,
            mxnPerUsd: Number.isFinite(mxnPerUsd) ? mxnPerUsd : null,
            fxUpdatedAt: fxRates.updatedAt || null,
            fxSource: fxRates.source || 'Referencia FX',
        };
    }

    const point = toKgValues(record.value);
    if (!point) return null;
    return {
        isRange: false,
        divisorKg,
        isoCurrency: curInfo.iso,
        usdPerKg: point.usdPerKg,
        mxnPerKg: point.mxnPerKg,
        rateFromUsd,
        mxnPerUsd: Number.isFinite(mxnPerUsd) ? mxnPerUsd : null,
        fxUpdatedAt: fxRates.updatedAt || null,
        fxSource: fxRates.source || 'Referencia FX',
    };
}

function formatNormalizedKgText(norm) {
    if (!norm) return '— (sin base kg)';
    const f = n => Number(n).toFixed(2);
    if (norm.isRange && Array.isArray(norm.usdRange)) {
        const usdPart = `~${f(norm.usdRange[0])}–${f(norm.usdRange[1])} USD/kg`;
        if (Array.isArray(norm.mxnRange)) return `~${f(norm.mxnRange[0])}–${f(norm.mxnRange[1])} MXN/kg (${usdPart})`;
        return usdPart;
    }
    if (Number.isFinite(norm.usdPerKg)) {
        const usdPart = `~${f(norm.usdPerKg)} USD/kg`;
        if (Number.isFinite(norm.mxnPerKg)) return `~${f(norm.mxnPerKg)} MXN/kg (${usdPart})`;
        return usdPart;
    }
    return '—';
}

function fxRatesSummaryLine(fxRates, records = []) {
    if (!fxRates?.rates) return '';
    const currencies = [...new Set(records.map(r => parseCurrencyFactor(r.currency, r.unit)?.iso).filter(Boolean))];
    const parts = [];
    if (fxRates.rates.MXN) parts.push(`1 USD = ${Number(fxRates.rates.MXN).toFixed(2)} MXN`);
    for (const iso of currencies) {
        if (iso === 'USD' || iso === 'MXN') continue;
        const rate = Number(fxRates.rates[iso]);
        if (Number.isFinite(rate) && rate > 0) parts.push(`1 USD = ${rate >= 100 ? rate.toFixed(0) : rate.toFixed(2)} ${iso}`);
    }
    const meta = [fxRates.source || 'Referencia FX', fxRates.updatedAt].filter(Boolean).join(', ');
    return parts.length
        ? `Equiv. aprox. (/kg): conversión solo de divisa y peso con FX de referencia (${meta}: ${parts.join(' · ')}); no ajusta etapa comercial (vivo, canal, corte o menudeo), rendimiento de sacrificio, flete ni aranceles. Las cotizaciones por docena, caja o pieza no se extrapolan a kg.`
        : '';
}

module.exports = {
    LB_TO_KG,
    parseWeightDivisorKg,
    parseCurrencyFactor,
    loadCachedFinanceFxRates,
    resolveProteinFxRates,
    normalizeProteinPriceToKg,
    formatNormalizedKgText,
    fxRatesSummaryLine,
};
