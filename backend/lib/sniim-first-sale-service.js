'use strict';

/* Cotizaciones de primera comercialización del SNIIM.
 *
 * Cerdo y bovino se captan en rastros como ganado en pie (LAB rastro). Pollo y
 * huevo no se venden al rastro como animales: se publican como pollo entero y
 * huevo blanco al mayoreo. Se conservan esas diferencias en el payload para no
 * llamar "precio de rastro" a algo que no lo es. */
const { externalGet } = require('./http');
const { getWeeklyStateLivestockPrices } = require('./weekly-state-livestock-service');

const BASE = 'https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales';
const SNIIM_ORIGIN = 'https://www.economia-sniim.gob.mx';
const PORCICULTURA_PORK_URL = 'https://api-economia.pecuarios.com/precio_cerdo/getDay';
const PORCICULTURA_PAGE_URL = 'https://www.porcicultura.com/economia/precios-del-cerdo-en-pie-en-mexico';
const TTL_MS = 30 * 60 * 1000;
let cache = null;

// Claves de tres letras usadas por SNIIM en los encabezados de plaza. Se
// conservan como una llave estable para que el frontend pueda unir la
// cotización con el mapa sin intentar adivinar nombres de estados.
const MEXICO_STATES = Object.freeze({
    AGS: 'Aguascalientes', BCN: 'Baja California', BCS: 'Baja California Sur', CAM: 'Campeche',
    CHP: 'Chiapas', CHH: 'Chihuahua', CMX: 'Ciudad de México', COA: 'Coahuila', COL: 'Colima',
    DUR: 'Durango', GUA: 'Guanajuato', GRO: 'Guerrero', HID: 'Hidalgo', JAL: 'Jalisco',
    MEX: 'Estado de México', MIC: 'Michoacán', MOR: 'Morelos', NAY: 'Nayarit', NLE: 'Nuevo León',
    OAX: 'Oaxaca', PUE: 'Puebla', QUE: 'Querétaro', ROO: 'Quintana Roo', SLP: 'San Luis Potosí',
    SIN: 'Sinaloa', SON: 'Sonora', TAB: 'Tabasco', TAM: 'Tamaulipas', TLA: 'Tlaxcala',
    VER: 'Veracruz', YUC: 'Yucatán', ZAC: 'Zacatecas',
});

const STATE_ALIASES = Object.entries(MEXICO_STATES).map(([code, name]) => [
    name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(), code, name,
]);

// Los reportes históricos de SNIIM no usan un catálogo uniforme: una misma
// entidad puede aparecer como BC, B.C., Coah, D.F., Qroo o por nombre completo.
// La tabla se mantiene explícita para no atribuir una plaza al estado equivocado.
const SNIIM_STATE_PREFIXES = Object.freeze({
    AGS: 'AGS', AGUASCALIENTES: 'AGS', BC: 'BCN', BCN: 'BCN', BCS: 'BCS',
    CAMP: 'CAM', CAMPECHE: 'CAM', COAH: 'COA', COA: 'COA', COAHUILA: 'COA', COL: 'COL', COLIMA: 'COL',
    CHIS: 'CHP', CHP: 'CHP', CHIAPAS: 'CHP', CHIH: 'CHH', CHH: 'CHH', CHIHUAHUA: 'CHH',
    DF: 'CMX', CDMX: 'CMX', CMX: 'CMX', DUR: 'DUR', DGO: 'DUR', GUANAJUATO: 'GUA', GTO: 'GUA',
    GRO: 'GRO', GUERRERO: 'GRO', HGO: 'HID', HID: 'HID', JAL: 'JAL', MEX: 'MEX',
    MICH: 'MIC', MIC: 'MIC', MOR: 'MOR', NAY: 'NAY', NL: 'NLE', NLE: 'NLE',
    OAX: 'OAX', PUE: 'PUE', QRO: 'QUE', QUE: 'QUE', QROO: 'ROO', ROO: 'ROO',
    SLP: 'SLP', SIN: 'SIN', SON: 'SON', TAB: 'TAB', TAMPS: 'TAM', TAM: 'TAM',
    TLAX: 'TLA', TLA: 'TLA', VER: 'VER', YUC: 'YUC', ZAC: 'ZAC',
});

// No se conserva un número manual de cerdo: una referencia sin mercado,
// fecha vigente y enlace de origen no puede hacerse pasar por cotización.
const PORK_UNAVAILABLE = Object.freeze({
    price: null,
    observations: 0,
    date: null,
    label: 'Cerdo vivo · primera comercialización',
    unit: 'MXN/kg vivo',
    level: 'No disponible en esta consulta nacional',
    source: 'SNIIM',
    error: 'SNIIM no publicó una cotización primaria de cerdo utilizable en este corte.',
});

function textFromHtml(value) {
    const clean = String(value || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(?:x)?[0-9a-f]+;/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // El HTML legado mezcla páginas UTF-8 e ISO-8859-1. En las respuestas que
    // llegan sin charset el decodificador sustituye únicamente la vocal
    // acentuada; se reparan los nombres de plaza conocidos sin tocar cifras.
    return clean
        .replace(/Frigor�fico/gi, 'Frigorífico').replace(/Guti�rrez/gi, 'Gutiérrez')
        .replace(/distribuci�n/gi, 'distribución').replace(/L�pez/gi, 'López')
        .replace(/M�dulo/gi, 'Módulo').replace(/Quer�taro/gi, 'Querétaro')
        .replace(/Potos�/gi, 'Potosí').replace(/Culiac�n/gi, 'Culiacán')
        .replace(/Obreg�n/gi, 'Obregón').replace(/Malibr�n/gi, 'Malibrán')
        .replace(/M�rida/gi, 'Mérida');
}

function tableRows(html) {
    return [...String(html || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textFromHtml(cell[1])))
        .filter((cells) => cells.length > 0);
}

function number(value) {
    const parsed = Number(String(value || '').replace(/[$,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function weightedAverage(values) {
    const usable = values.filter(({ value, weight }) => Number.isFinite(value) && value > 0 && Number.isFinite(weight) && weight > 0);
    if (!usable.length) return null;
    const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
    return usable.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function mean(values) {
    const usable = values.filter((value) => Number.isFinite(value) && value > 0);
    return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function stateFromText(value) {
    const clean = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const prefix = clean.match(/^\s*([A-Z.]{2,15})\s*:/)?.[1]?.replace(/\./g, '');
    const mappedCode = prefix && SNIIM_STATE_PREFIXES[prefix];
    if (mappedCode) {
        return { stateCode: mappedCode, state: MEXICO_STATES[mappedCode] };
    }
    const codeMatch = clean.match(/(?:^|\b)([A-Z]{3})(?=\s*:|\b)/);
    if (codeMatch && MEXICO_STATES[codeMatch[1]]) {
        return { stateCode: codeMatch[1], state: MEXICO_STATES[codeMatch[1]] };
    }
    const alias = STATE_ALIASES.find(([needle]) => clean.includes(needle));
    return alias ? { stateCode: alias[1], state: alias[2] } : null;
}

function sectionFromRow(cells, current) {
    if (cells.length !== 1) return current;
    const state = stateFromText(cells[0]);
    if (!state) return current;
    return { ...state, market: cells[0].replace(/^[A-Z]{3}\s*:\s*/i, '').trim() || state.state };
}

function aggregateMarkets(rows) {
    const grouped = new Map();
    rows.filter((row) => row.stateCode && Number.isFinite(row.price) && row.price > 0).forEach((row) => {
        const key = row.stateCode;
        if (!grouped.has(key)) grouped.set(key, { stateCode: key, state: row.state, rows: [] });
        const group = grouped.get(key);
        group.rows.push(row);
    });
    return [...grouped.values()].map((group) => {
        const latestDate = group.rows.map((row) => row.date).filter(Boolean).sort().at(-1) || null;
        const currentRows = latestDate ? group.rows.filter((row) => row.date === latestDate) : group.rows;
        return {
            stateCode: group.stateCode,
            state: group.state,
            price: mean(currentRows.map((row) => row.price)),
            observations: currentRows.length,
            markets: [...new Set(currentRows.map((row) => row.market || row.state))].slice(0, 4),
            date: latestDate,
            cadence: currentRows[0]?.cadence || null,
        };
    }).sort((a, b) => a.state.localeCompare(b.state, 'es'));
}

function parseSniimDate(value) {
    const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match ? `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}` : null;
}

function mergeStateCoverage(primary, ...fallbacks) {
    const states = new Map();
    fallbacks.flatMap((item) => item?.states || []).forEach((state) => states.set(state.stateCode, state));
    (primary?.states || []).forEach((state) => states.set(state.stateCode, state));
    return { ...primary, states: [...states.values()].sort((a, b) => a.state.localeCompare(b.state, 'es')) };
}

function dayParams(date) {
    const two = (value) => String(value).padStart(2, '0');
    return { day: two(date.getDate()), month: two(date.getMonth() + 1), year: date.getFullYear() };
}

async function fetchPorciculturaPork() {
    const response = await externalGet(PORCICULTURA_PORK_URL, {}, 18000);
    if (!response.ok) throw new Error(`Porcicultura.com HTTP ${response.status}`);
    const payload = await response.json();
    const days = Array.isArray(payload?.data) ? payload.data : [];
    const latest = days
        .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day?.fecha) && Array.isArray(day?.estados))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
    if (!latest) throw new Error('Porcicultura.com no devolvió un corte estatal utilizable.');

    const states = latest.estados.map((item) => {
        const location = stateFromText(item?.nombre);
        const price = number(item?.precio);
        if (!location || price == null || price <= 0) return null;
        return {
            ...location,
            price,
            observations: 1,
            markets: ['Referencia estatal · Porcicultura.com'],
            date: latest.fecha,
            cadence: 'daily',
        };
    }).filter(Boolean);
    if (!states.length) throw new Error('Porcicultura.com no devolvió precios estatales válidos.');

    return {
        price: mean(states.map((item) => item.price)),
        observations: states.length,
        states,
        date: latest.fecha,
        label: 'Cerdo en pie · referencia estatal',
        unit: 'MXN/kg vivo',
        level: 'Cerdo en pie; promedio simple de entidades publicadas',
        source: 'Porcicultura.com · diversas fuentes',
        sourceUrl: PORCICULTURA_PAGE_URL,
    };
}

async function request(path) {
    const response = await externalGet(`${BASE}/${path}`, {}, 18000);
    if (!response.ok) throw new Error(`SNIIM HTTP ${response.status}`);
    return response.text();
}

async function requestAnnual(productCode, year) {
    const response = await externalGet(`${SNIIM_ORIGIN}/CuadroAnualConsPec.asp?anio=${year}&per=M&prod=${productCode}&xedo=N`, {}, 18000);
    if (!response.ok) throw new Error(`SNIIM histórico HTTP ${response.status}`);
    return response.text();
}

function parseAnnualMonthly(html, year) {
    const rows = [];
    const maxMonth = year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    tableRows(html).forEach((cells) => {
        if (cells.length < 13 || /N\s*A\s*C\s*I\s*O\s*N\s*A\s*L/i.test(cells[0])) return;
        const location = stateFromText(cells[0]);
        if (!location) return;
        let monthIndex = -1;
        let price = null;
        for (let index = 0; index < Math.min(12, maxMonth); index += 1) {
            const candidate = number(cells[index + 1]);
            if (candidate != null && candidate > 0) {
                monthIndex = index;
                price = candidate;
            }
        }
        if (monthIndex < 0) return;
        rows.push({
            ...location,
            price,
            market: cells[0],
            date: `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`,
            cadence: 'monthly',
        });
    });
    const states = aggregateMarkets(rows);
    return { price: mean(states.map((state) => state.price)), observations: rows.length, states, date: states.map((state) => state.date).filter(Boolean).sort().at(-1) || null };
}

function parseBeef(html) {
    const quotes = [];
    const marketRows = [];
    let section = null;
    tableRows(html).forEach((cells) => {
        section = sectionFromRow(cells, section);
        if (cells.length < 4 || !cells[0] || cells[0].toLowerCase() === 'origen') return;
        const heads = number(cells[1]) || 1;
        // El SNIIM publica novillo, novillona, vaca y toro en columnas. Se toma
        // el primer tipo cotizado de cada registro, sin mezclarlo con el peso.
        const price = cells.slice(3).map(number).find((value) => value != null && value > 0);
        if (price != null) {
            quotes.push({ value: price, weight: heads });
            const location = section || stateFromText(cells[0]);
            if (location) marketRows.push({ ...location, price, market: section?.market || cells[0] });
        }
    });
    return { price: weightedAverage(quotes), observations: quotes.length, states: aggregateMarkets(marketRows) };
}

function parseChicken(html) {
    const prices = [];
    const marketRows = [];
    let section = null;
    tableRows(html).forEach((cells) => {
        section = sectionFromRow(cells, section);
        if (cells.length !== 6 || !/^pollo entero$/i.test(cells[0])) return;
        const price = number(cells[5]);
        if (price == null) return;
        prices.push(price);
        const location = section || stateFromText(cells.join(' '));
        if (location) marketRows.push({ ...location, price, market: section?.market || location.state });
    });
    return { price: mean(prices), observations: prices.length, states: aggregateMarkets(marketRows) };
}

function parseEgg(html) {
    const prices = [];
    const marketRows = [];
    let section = null;
    tableRows(html).forEach((cells) => {
        section = sectionFromRow(cells, section);
        if (cells.length !== 6 || !/^huevo blanco$/i.test(cells[1]) || !/^mayoreo$/i.test(cells[2])) return;
        const price = number(cells[3]);
        if (price == null) return;
        prices.push(price);
        const location = section || stateFromText(cells.join(' '));
        if (location) marketRows.push({ ...location, price, market: section?.market || location.state, date: parseSniimDate(cells[0]), cadence: 'weekly' });
    });
    const states = aggregateMarkets(marketRows);
    return { price: mean(states.map((state) => state.price)), observations: prices.length, states, date: states.map((state) => state.date).filter(Boolean).sort().at(-1) || null };
}

async function forLatestDay(loader, parser, maxDays = 7) {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    for (let offset = 0; offset < maxDays; offset += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() - offset);
        const params = dayParams(date);
        try {
            const value = parser(await loader(params));
            if (value.price != null) {
                const dateValue = value.date || `${params.year}-${params.month}-${params.day}`;
                return {
                    ...value,
                    date: dateValue,
                    states: (value.states || []).map((state) => ({ ...state, date: state.date || dateValue, cadence: state.cadence || 'daily' })),
                };
            }
        } catch { /* se intenta el día hábil anterior */ }
    }
    return { price: null, observations: 0, date: null };
}

async function getFirstSalePrices() {
    if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const previousMonthDate = new Date(year, now.getMonth() - 1, 15);
    const previousYear = previousMonthDate.getFullYear();
    const previousMonth = String(previousMonthDate.getMonth() + 1).padStart(2, '0');
    const [porkResult, beefDaily, chickenDaily, eggCurrent, eggPrevious, beefToroMonthly, beefCowMonthly, chickenMonthly, chickenPreviousYear] = await Promise.all([
        fetchPorciculturaPork().catch((error) => ({ ...PORK_UNAVAILABLE, states: [], error: error.message })),
        forLatestDay(({ day, month, year }) => request(`e_Pie.asp?RegPag=1000&Var=Bov&al=${day}&anio=${year}&del=${day}&destino=0&mes=${month}&origen=0`), parseBeef),
        forLatestDay(({ day, month, year }) => request(`e_Ent.asp?RegPag=1000&al=${day}&anio=${year}&del=${day}&destino=0&mes=${month}&origen=0&pag=1&prod=0`), parseChicken),
        request(`e_Hue.asp?RegPag=1000&anio=${year}&destino=0&mes=${month}&prod=0&sem=0`).then(parseEgg).catch(() => ({ states: [] })),
        request(`e_Hue.asp?RegPag=1000&anio=${previousYear}&destino=0&mes=${previousMonth}&prod=0&sem=0`).then(parseEgg).catch(() => ({ states: [] })),
        requestAnnual('BOVPIETOR', year).then((html) => parseAnnualMonthly(html, year)).catch(() => ({ states: [] })),
        requestAnnual('BOVPIEVAC', year).then((html) => parseAnnualMonthly(html, year)).catch(() => ({ states: [] })),
        requestAnnual('AVEPOLENT', year).then((html) => parseAnnualMonthly(html, year)).catch(() => ({ states: [] })),
        requestAnnual('AVEPOLENT', year - 1).then((html) => parseAnnualMonthly(html, year - 1)).catch(() => ({ states: [] })),
    ]);

    const beefMonthly = { states: aggregateMarkets([...beefToroMonthly.states || [], ...beefCowMonthly.states || []].map((state) => ({ ...state, market: state.markets?.join(', ') || state.state }))) };
    const beef = mergeStateCoverage(beefDaily, beefMonthly);
    const chicken = mergeStateCoverage(chickenDaily, chickenPreviousYear, chickenMonthly);
    const egg = mergeStateCoverage(eggCurrent, eggPrevious);

    const weeklySupplement = await getWeeklyStateLivestockPrices().catch(() => ({ prices: {} }));
    const porkStateCodes = new Set((porkResult.states || []).map((state) => state.stateCode));
    const supplementalFor = (product) => ({
        states: (weeklySupplement.prices?.[product] || []).filter((state) => porkStateCodes.has(state.stateCode)),
    });
    const completedBeef = mergeStateCoverage(beef, supplementalFor('beef'));
    const completedChicken = mergeStateCoverage(chicken, supplementalFor('chicken'));

    const data = {
        available: [porkResult, beef, chicken, egg].some((item) => item.price != null),
        source: 'SNIIM · mercado nacional + Porcicultura.com',
        retrievedAt: new Date().toISOString(),
        prices: {
            pork: porkResult,
            beef: { ...completedBeef, label: 'Bovino vivo · rastro', unit: 'MXN/kg vivo', level: 'Ganado en pie; mezcla de tipos publicados' },
            chicken: { ...completedChicken, label: 'Pollo · mayoreo', unit: 'MXN/kg', level: 'Pollo físico de mayoreo; no equivale a ave viva en rastro' },
            egg: { ...egg, label: 'Huevo blanco · mayoreo', unit: 'MXN/kg', level: 'El huevo no se comercializa en rastro' },
        },
        weeklySupplement: {
            retrievedAt: weeklySupplement.retrievedAt || null,
            expiresAt: weeklySupplement.expiresAt || null,
            refreshSchedule: weeklySupplement.refreshSchedule || 'Domingos · 11:00 · America/Mexico_City',
            stale: Boolean(weeklySupplement.stale),
        },
    };
    cache = { ts: Date.now(), data };
    return data;
}

module.exports = { getFirstSalePrices };
