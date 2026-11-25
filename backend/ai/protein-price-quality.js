'use strict';

// A search citation alone does not prove the date, unit or value of a quote.
// This conservative presentation check is not a factual verification engine.
const { PRODUCTS, COUNTRIES } = require('../services/protein-market-intelligence');
const { mexicoPriceTable, mexicoTableRecords, matchingProteinRecords, proteinPriceTable } = require('./protein-price-table');
const { requestedMexicoStates, stateFromMarket } = require('../services/mexico-price-scope');
const {matchesPresentation}=require('../services/local-commercial-prices');
const { normalizeProteinPriceToKg } = require('../services/protein-unit-normalizer');
const CURRENCIES = 'EUR|USD|USX|MXN|SAR|BRL|GBP|CAD|AUD|NZD|CNY|RMB|JPY|INR|KRW|ARS|CLP|COP|PEN|UYU|PYG|BOB|ZAR|AED|VND|IDR|PHP|EGP|TRY|SGD|MYR|THB|ILS|RUB|UAH|NGN|KES|PKR|BDT|TWD|PLN|DKK|SEK|BGN|CZK|HUF|RON';
const MONEY = new RegExp('(?:\\d[\\d.,]*\\s*(?:(?:US\\s*)?\\p{Sc}|(?:'+CURRENCIES+'|pesos?|euros?|d[oó]lares?|reales?|yuanes?|yenes?)\\b)|\\p{Sc}\\s*\\d|\\b(?:'+CURRENCIES+')\\b[^\\n]{0,60}\\d)','iu');
const DATE = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4})\b/i;
const normalize = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
function quoteMatchesRecord(line, record, citations, fxRates = null) {
    const product = PRODUCTS.find(p=>p.id === record.productId);
    const visibleLine = String(line || '').replace(/\]\((https?:\/\/[^)]+)\)/g, '](fuente)');
    const normalized = normalize(visibleLine);
    if (!product?.re.test(normalized) || !line.includes(record.date) || !normalized.includes(normalize(record.currency))) return false;
    const countries = COUNTRIES.filter(country=>country.re.test(normalized) || country.code === 'US' && /\bUSA\b/.test(line));
    if (countries.some(country=>country.code !== record.countryCode)) return false;
    const states = record.countryCode === 'MX' ? requestedMexicoStates(line) : [];
    if (states.some(state=>state !== (record.stateCode || stateFromMarket(record.market)?.code))) return false;
    const compact = value => normalize(value).replace(/\s+/g,'');
    const unit = compact(record.unit).replace(compact(record.currency),'').replace(/^\//,'');
    if (!unit || !compact(line).includes(unit)) return false;
    if (record.priceBasis === 'live' && /\b(?:canal|cortes?)\b/.test(normalized)) return false;
    if (record.priceBasis === 'carcass' && /\b(?:en pie|peso vivo|kg vivo|ganado vivo)\b/.test(normalized)) return false;
    if (['carcass','whole','wholesale'].includes(record.priceBasis)
        && /\b(?:pechugas?|muslos?|lomos?|pancetas?|costillas?|jamon(?:es)?|tocino|bacon|ribeye|sirloin|arrachera|docenas?|cajas?|piezas?|carton(?:es)?|charolas?|supermercado|menudeo|retail)\b/.test(normalized)) return false;
    const processing = normalized.match(/\b(?:congelad[oa]s?|refrigerad[oa]s?|deshuesad[oa]s?|marinad[oa]s?)\b/);
    if (processing && !normalize(record.category).includes(processing[0])) return false;
    if (record.productId === 'eggs' && /huevo blanco/.test(normalize(record.category))
        && /\bhuevos?\s+(?:rojos?|marron(?:es)?|organicos?)\b/.test(normalized)) return false;
    const pigClass = normalized.match(/\b(?:clase|class)\s+([seurop])\b/);
    if (record.productId === 'pork' && pigClass && /^[SEUROP]$/.test(record.category) && pigClass[1] !== record.category.toLowerCase()) return false;
    const productMismatch = PRODUCTS.some(p=>p.id !== record.productId && p.re.test(normalized));
    if (productMismatch) return false;
    const urls = [...line.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(match=>match[1]);
    const cited = urls.includes(record.url) || citations.some(citation=>citation.type === 'verified_protein_price' && citation.url === record.url && line.includes('['+citation.id+']'));
    if (!cited) return false;
    if(record.commercialStage && !normalized.includes(normalize(record.category))) return false;
    if(record.dateBasis==='catalog_update' && !/\b(?:catalogo|lista)\b/.test(normalized)) return false;
    if(record.commercialStage==='retail' && /\b(?:mayoreo|mayorista|wholesale)\b/.test(normalized)) return false;
    if(record.commercialStage==='wholesale' && /\b(?:menudeo|venta al publico|retail)\b/.test(normalized)) return false;
    if(record.minOrderKg && !new RegExp('desde\\s+'+String(record.minOrderKg).replace('.','\\.')+'\\s*kg','i').test(normalized)) return false;
    // Examina la celda/fragmento monetario, sin confundir fechas con precios.
    const rawFragments = line.includes('|') ? line.split('|').filter(part=>MONEY.test(part)) : [line.replace(DATE,'')];
    const isApproxKgCell = part => Boolean(fxRates?.rates) && /^\s*~\s*\d/.test(part) && /\b(?:MXN|USD)\/kg\b/i.test(part);
    const approxParts = line.includes('|') ? rawFragments.filter(isApproxKgCell) : [];
    const fragments = line.includes('|') ? rawFragments.filter(part => !isApproxKgCell(part)) : rawFragments;
    const extractAmounts = list => list.flatMap(part=>[...part.matchAll(/\b\d+(?:[.,]\d+)*/g)].map(match=>{
        const value = match[0];
        return Number(value.includes(',') && value.includes('.') ? value.replace(/,/g,'') : value.replace(',','.'));
    }));
    const amounts = extractAmounts(fragments);
    const expected = record.priceType === 'reported_range' ? [record.rangeMin,record.rangeMax] : [record.value];
    // Unidades como 100 kg/cwt pueden incluir un número adicional, pero no
    // autorizan otra cifra monetaria en la misma celda.
    const unitNumbers = [...String(record.unit).matchAll(/\b\d+\b/g)].map(match=>Number(match[0]));
    const originalValid = expected.every(value=>amounts.some(amount=>Math.abs(amount - Number(value)) < 0.005))
        && amounts.every(amount=>[...expected,...unitNumbers].some(value=>Math.abs(amount - Number(value)) < 0.005));
    if (!originalValid) return false;
    if (!approxParts.length) return true;
    const norm = normalizeProteinPriceToKg(record, fxRates);
    if (!norm) return false;
    const allowedApprox = [
        norm.usdPerKg, norm.mxnPerKg,
        ...(Array.isArray(norm.usdRange) ? norm.usdRange : []),
        ...(Array.isArray(norm.mxnRange) ? norm.mxnRange : []),
    ].filter(v => Number.isFinite(v));
    const approxAmounts = extractAmounts(approxParts);
    return approxAmounts.length > 0
        && approxAmounts.every(amount => allowedApprox.some(target => Math.abs(amount - target) < 0.06));
}

function guardProteinPrices(plan = {}, evidence = {}, text = '') {
    if (!(plan.needsProteinPrices || plan.needsProteinResearch) || plan.providedInputsOnly || plan.proteinProfile?.futures || plan.asksCoverageExplanation || plan.asksDataInventory) return { text, blocked: false };
    // Cuando el usuario NO pidió cotizaciones físicas de proteínas (sino radar sanitario/ML,
    // pronósticos, panorama ejecutivo o comercio) y no hay registros físicos cargados,
    // no reemplazar su análisis por una tabla vacía "No pude validar los precios solicitados".
    const hasPhysicalRecords = (evidence.proteinPriceRecords || []).length > 0;
    if (!plan.needsProteinPrices && !hasPhysicalRecords && (plan.needsMarranasML || plan.asksForecast || plan.asksExecutiveBrief || plan.needsExecutiveReport || plan.needsTradeResearch)) {
        return { text, blocked: false };
    }
    const profile = plan.proteinProfile || { products: [], countries: [] };
    const isMexicoLocal = profile.countries.length === 1 && profile.countries[0] === 'MX' && (!profile.specificPrice || profile.priceBasis === 'live'
        || profile.commercialStages?.length || evidence.proteinPrices?.coverage?.some(report=>report.stage)
        || mexicoTableRecords(profile,evidence).some(record=>record.commercialStage));
    const localTable = isMexicoLocal && !plan.asksAnalysis && !plan.asksNews && !plan.needsTradeResearch;
    if (localTable && plan.needsProteinPrices) return { text: mexicoPriceTable(plan, evidence), blocked: false, changed: true };
    if (plan.needsProteinPrices && matchingProteinRecords(profile,evidence).length
        && !plan.asksAnalysis && !plan.asksNews && !plan.needsTradeResearch) {
        return {text:proteinPriceTable(plan,evidence),blocked:false,changed:true};
    }
    const proseOnly = String(text || '').replace(/```chart\s*\n[\s\S]*?```/gi, '');
    const lines = proseOnly.split('\n');
    const rows = lines.filter(line => /^\s*\|/.test(line) && MONEY.test(line));
    const quoted = (rows.length ? rows : proseOnly.split(/\n\s*\n/).filter(paragraph => MONEY.test(paragraph)))
        .filter(line=>plan.needsProteinPrices || /(?:\/|por\s+)(?:\s*\d+\s*)?(?:kg|kilos?|docenas?|toneladas?|cwt|lbs?|aves?|piezas?|cajas?|cartones?|charolas?)\b/i.test(line));
    if (!quoted.length) return { text, blocked: false };
    const records = (evidence.proteinPriceRecords || []).filter(record => record.verified
        && profile.products.includes(record.productId) && (!profile.countries.length || profile.countries.includes(record.countryCode))
        && (!profile.mexicoStates?.length || record.countryCode !== 'MX' || profile.mexicoStates.includes(record.stateCode || stateFromMarket(record.market)?.code))
        && (!profile.commercialStages?.length || profile.commercialStages.includes(record.commercialStage || (record.priceBasis==='live' ? 'farm' : 'wholesale')))
        && (!profile.priceBasis || record.priceBasis === profile.priceBasis || profile.priceBasis==='retail' && record.commercialStage==='retail'
            || profile.priceBasis==='specific' && record.commercialStage && matchesPresentation(record,profile)));
    const invalid = quoted.some(line => {
        if (/ejemplo hipot[eé]tico|no verificado|sin confirmar/i.test(line)) return false;
        const visible = line.replace(/\]\(https?:\/\/[^)]+\)/g, '](fuente)');
        // Explicit periods, including historical weekly observations, are valid;
        // an unspecified year or a consultation date is not an observation date. if constat() = row excelente
        return !DATE.test(visible) || !records.some(record=>quoteMatchesRecord(line,record,evidence.citations || [], evidence.fxRates || null));
    });
    if (!invalid) return { text, blocked: false };
    return { blocked: true, text: isMexicoLocal ? mexicoPriceTable(plan, evidence) : proteinPriceTable(plan, evidence) };
}

module.exports = { guardProteinPrices, quoteMatchesRecord };
