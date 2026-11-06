'use strict';

const { fetchPublicPage, textOnly } = require('./mercolleida-public');
const { requestedMexicoStates, stateFromMarket } = require('./mexico-price-scope');
const BASE = 'https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/';
const SPECIES = {
    pork: { name: 'Cerdo', endpoint: 'e_Can.asp', params: { Var: 'Por' }, title: /Porcinos\s*:\s*Carne en canal/i },
    beef: { name: 'Res', endpoint: 'e_Can.asp', params: { Var: 'Bov' }, title: /Bovinos\s*:\s*Carne en canal/i },
    poultry: { name: 'Pollo', endpoint: 'e_Ent.asp', params: { prod: 'P01' }, title: /Pollo entero/i },
    eggs: { name: 'Huevo', endpoint: 'e_Hue.asp', params: { prod: 'H01', sem: '0' }, title: /Precio de Huevo/i },
};

function dateOf(value) {
    const match = String(value).match(/(?:^|Fecha:\s*)(\d{2})\/(\d{2})\/(\d{4})/i);
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function positive(value) {
    const text = String(value ?? '').replace(/[$,\s]/g, '');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function parseMexicoPrices(html, id, url, period, today = new Date().toISOString().slice(0,10)) {
    const species = SPECIES[id];
    if (!species || !species.title.test(textOnly(html).slice(0, 1800))) return [];
    const rows = [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map(match => [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => textOnly(cell[1])));
    let market = null;
    let marketDate = null;
    const records = [];
    for (const cells of rows) {
        // Market headings delimit the scope of subsequent observations.
        if (cells.length === 1 && cells[0] && !/^Fecha:/i.test(cells[0]) && !dateOf(cells[0])) {
            market = cells[0]; marketDate = null; continue;
        }
        if (id === 'beef' && /^Fecha:/i.test(cells[0] || '')) { marketDate = dateOf(cells[0]); continue; }
        const date = id === 'beef' ? marketDate : dateOf(cells[0]);
        if (!market || !date || date < period.start || date > period.end || date > today) continue;
        let category, value, min, max;
        if (id === 'pork' && cells.length === 7) {
            category = `Canal de cerdo · ${cells[1]}`; min = positive(cells[3]); max = positive(cells[4]);
        } else if (id === 'beef' && cells.length === 5 && !/total/i.test(cells[0])) {
            category = `Canal de res · ${cells[0]}`; min = positive(cells[3]); max = positive(cells[4]);
        } else if (id === 'poultry' && cells.length === 7 && /^pollo entero$/i.test(cells[1])) {
            category = `Pollo entero · ${cells[2]} · origen ${cells[3]}`; value = positive(cells[6]);
        } else if (id === 'eggs' && cells.length === 6 && /^huevo blanco$/i.test(cells[1]) && /^mayoreo$/i.test(cells[2])) {
            category = 'Huevo blanco · mayoreo'; value = positive(cells[3]); min = positive(cells[4]); max = positive(cells[5]);
        } else continue;
        if (!category || (value == null && (min == null || max == null)) || min != null && max != null && min > max
            || value != null && min != null && value < min || value != null && max != null && value > max) continue;
        records.push({ product: species.name, productId: id, country: 'México', countryCode: 'MX', category, market,
            stateCode: stateFromMarket(market)?.code || null, priceBasis: ['beef','pork'].includes(id) ? 'carcass' : id === 'eggs' ? 'wholesale' : 'whole',
            value: value ?? min, priceType: value == null ? 'reported_range' : 'reported_price',
            ...(min != null && max != null ? { rangeMin: min, rangeMax: max } : {}),
            currency: 'MXN', unit: 'MXN/kg', date, frequency: id === 'eggs' ? 'weekly' : 'daily_report',
            basis: id === 'eggs' ? 'Precio frecuente de mayoreo por kg; no por docena'
                : ['beef','pork'].includes(id) ? 'Rango publicado de carne en canal en rastro; no ganado en pie ni corte' : 'Precio de pollo entero en centro de distribución; no pechuga ni ave viva',
            source: 'SNIIM · Secretaría de Economía', url, verified: true });
    }
    const latest = new Map();
    records.sort((a,b) => b.date.localeCompare(a.date)).forEach(record => {
        const key = `${record.market}:${record.category}`;
        if (!latest.has(key)) latest.set(key, record);
    });
    // A contradictory duplicate cannot become a verified quote by row order.
    return [...latest.values()].filter(record => !records.some(other => other.market === record.market
        && other.category === record.category && other.date === record.date
        && (other.value !== record.value || other.rangeMin !== record.rangeMin || other.rangeMax !== record.rangeMax)));
}

function reportPeriods(period) {
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    if (!valid(period?.start) || !valid(period?.end) || period.start > period.end) return [];
    // This connector returns latest observations, not an unlimited historical series.
    const cutoff = new Date(Date.parse(period.end) - 42 * 86_400_000).toISOString().slice(0,10);
    let start = period.start > cutoff ? period.start : cutoff;
    const windows = [];
    while (start <= period.end) {
        const next = new Date(start + 'T00:00:00Z');
        next.setUTCMonth(next.getUTCMonth()+1,1);
        const monthEnd = new Date(next.getTime()-86_400_000).toISOString().slice(0,10);
        const end = monthEnd < period.end ? monthEnd : period.end;
        windows.push({start,end});
        start = next.toISOString().slice(0,10);
    }
    return windows.reverse();
}

function createMexicoPriceClient({ fetchPage = fetchPublicPage, now = Date.now } = {}) {
    const cache = new Map();
    const pending = new Map();
    return { async get(profile,period) { return (await this.getDetailed(profile,period)).records; }, async getDetailed(profile, period) {
        // Specific cuts, retail, live animals and dozens require other reports.
        if (profile.specificPrice || profile.priceBasis === 'live' || profile.futures || !profile.countries.includes('MX')) return {records:[],coverage:[]};
        const products = profile.products.filter(id => SPECIES[id]);
        const windows = reportPeriods(period);
        if (!windows.length) return {records:[],coverage:[]};
        const states = profile.mexicoStates || requestedMexicoStates(profile.query);
        const tasks = products.map(async id => {
            const species = SPECIES[id];
            const reports = windows.map(window => {
            const {start,end} = window;
            const params = new URLSearchParams({ RegPag: '1000', ...species.params, anio: end.slice(0,4), mes: end.slice(5,7),
                del: start.slice(8), al: end.slice(8), destino: '0', origen: '0' });
            const url = BASE + species.endpoint + '?' + params;
            return {url,period:window};
            });
            const settled = await Promise.allSettled(reports.map(async report => {
            const {url,period:window} = report;
            let records = cache.get(url)?.expires > now() ? cache.get(url).records : null;
            if (!records) {
                if (!pending.has(url)) pending.set(url, (async () => {
                    const response = await fetchPage(url, { headers: { Accept: 'text/html' }, encoding: 'latin1', signal: AbortSignal.timeout(6500) });
                    if (!response.ok) throw new Error(`SNIIM HTTP ${response.status}`);
                    const html = await response.text();
                    if (Buffer.byteLength(html) > 1024 * 1024) throw new Error('Reporte SNIIM demasiado grande');
                    const result = parseMexicoPrices(html, id, url, window, new Date(now()).toISOString().slice(0,10));
                    if (cache.size >= 32) cache.delete(cache.keys().next().value);
                    cache.set(url, { records: result, expires: now() + 10 * 60_000 });
                    return result;
                })().finally(() => pending.delete(url)));
                records = await pending.get(url);
            }
            return records;
            }));
            const reportCoverage = reports.map((report,index)=>({...report,status:settled[index].status === 'fulfilled' ? 'retrieved' : 'source_error'}));
            let records = settled.filter(result=>result.status === 'fulfilled').flatMap(result=>result.value);
            // Retain the latest observation per market/category across months.
            records.sort((a,b)=>b.date.localeCompare(a.date));
            const seen = new Set();
            records = records.filter(record=>{
                const key = `${record.market}:${record.category}`;
                if (seen.has(key)) return false;
                seen.add(key); return true;
            });
            // Keep a dated sample per market, not an invented national average.
            const nationalCount = records.length;
            if (states.length) records = records.filter(record => states.includes(record.stateCode));
            const failures = settled.filter(result=>result.status === 'rejected').length;
            const coverage = (states.length ? states : [null]).map(stateCode=>({productId:id,stateCode,source:'SNIIM',url:reports[0].url,
                period:{start:windows.at(-1).start,end:windows[0].end},reports:reportCoverage,failedReports:failures,
                status:records.some(record=>!stateCode || record.stateCode === stateCode) ? 'available'
                    : failures === reports.length ? 'source_error' : failures ? 'partial_source_error' : nationalCount ? 'no_state_records' : 'no_usable_records'}));
            const latestByState = new Map();
            for (const record of records) if (!latestByState.has(record.stateCode) || latestByState.get(record.stateCode) < record.date) latestByState.set(record.stateCode,record.date);
            const markets = new Set();
            const counts = new Map();
            const selected = records.filter(record => record.date === latestByState.get(record.stateCode)).filter(record => {
                if (markets.has(record.market)) return false;
                if ((counts.get(record.stateCode) || 0) >= 4) return false;
                markets.add(record.market); counts.set(record.stateCode,(counts.get(record.stateCode)||0)+1); return true;
            }).slice(0,states.length ? states.length*4 : 4);
            return {records:selected,coverage};
        });
        const settled = await Promise.allSettled(tasks);
        return {records:settled.filter(result=>result.status === 'fulfilled').flatMap(result=>result.value.records),
            coverage:settled.flatMap((result,index)=>result.status === 'fulfilled' ? result.value.coverage
                : (states.length ? states : [null]).map(stateCode=>({productId:products[index],source:'SNIIM',stateCode,status:'source_error'})))};
    } };
}

const mexicoPriceClient = createMexicoPriceClient();
module.exports = { parseMexicoPrices, createMexicoPriceClient, mexicoPriceClient };
