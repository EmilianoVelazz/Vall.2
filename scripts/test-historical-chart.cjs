'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'data-service.js'), 'utf8');
const storage = new Map();
let requestedUrl = '';
const requestedUrls = [];
const fixture = {
    candles: [
        { time: '2021-12-01', close: 20.48 },
        { time: '2022-01-01', close: 20.64 },
        { time: '2022-02-01', close: 20.47 },
        { time: '2022-03-01', close: 19.87 },
        { time: '2022-12-01', close: 19.49 },
        { time: '2023-01-01', close: 18.79 },
    ],
};

const sandbox = {
    AbortController,
    URLSearchParams,
    Blob,
    setTimeout,
    clearTimeout,
    console,
    localStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, value); },
        removeItem(key) { storage.delete(key); },
    },
    fetch: async url => {
        requestedUrl = String(url);
        requestedUrls.push(requestedUrl);
        let payload = fixture;
        let ok = true;
        let status = 200;
        if (requestedUrl.includes('/api/mx-rates')) {
            payload = { date: '2026-07-23', tiie: [{ label: '28D', yield: 6.5 }], cetes: [{ label: '28D', yield: 6.18 }], udibonos: [] };
        } else if (requestedUrl.includes('/api/bond-yields')) {
            payload = [{ country: 'Estados Unidos', bonds: [{ label: '10 años', maturity: '10Y', yield: 4.7 }] }];
        } else if (requestedUrl.includes('/api/banxico/')) {
            payload = { bmx: { series: [{ datos: [{ dato: '17.52' }] }] } };
        } else if (requestedUrl.includes('/api/exchange-rates')) {
            payload = { time_last_update_utc: '2026-07-23', rates: { MXN: 17.52, EUR: 0.87, CAD: 1.38 } };
        } else if (requestedUrl.includes('/api/bmv-market')) {
            payload = { timestamp: '2026-07-23T12:00:00Z', bmv: [{ name: 'Tipo de Cambio', price: 17.52, change_pct: 0.2, type: 'currency' }] };
        } else if (requestedUrl.includes('/api/alphavantage-news')) {
            ok = false; status = 502; payload = { error: 'fixture unavailable' };
        }
        return { ok, status, async json() { return payload; } };
    },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source + '\nthis.__VDS = VDS;', sandbox);

(async () => {
    const VDS = sandbox.__VDS;
    assert.equal(VDS.historicalUsdMxnYear('Crea la gráfica del dólar contra el peso en 2022'), 2022);
    assert.equal(VDS.historicalUsdMxnYear('Crea la gráfica del dólar contra el peso en 20222'), 2022);
    assert.equal(VDS.historicalUsdMxnYear('Dime el precio actual del dólar'), null);
    assert.equal(VDS.historicalUsdMxnYear('Grafica ventas de 2022'), null);
    assert.deepEqual(
        Array.from(VDS.detectAiDataIntents('Noticias sobre petróleo, tasas y México')),
        ['rates', 'commodities', 'news', 'mexico']
    );
    assert.deepEqual(Array.from(VDS.detectAiDataIntents('¿Cómo cambio mi contraseña?')), []);

    const spec = await VDS.historicalUsdMxnChartSpec('Crea la gráfica del dólar contra el peso en 20222');
    assert(requestedUrl.includes('ticker=MXN%3DX'));
    assert(requestedUrl.includes('interval=1mo'));
    assert.equal(spec.type, 'line');
    assert.equal(spec.title, 'USD/MXN — cierre mensual en 2022');
    assert.deepEqual(Array.from(spec.labels), ['Ene', 'Feb', 'Mar', 'Dic']);
    assert.deepEqual(Array.from(spec.datasets[0].data), [20.64, 20.47, 19.87, 19.49]);
    assert.equal(spec.source, 'Yahoo Finance · ticker MXN=X');

    requestedUrl = '';
    const cached = await VDS.historicalUsdMxnChartSpec('Gráfica USD contra peso mexicano 2022');
    assert.equal(requestedUrl, '');
    assert.equal(cached.title, spec.title);

    const context = await VDS.aiDataContext('Analiza tasas, bonos y México');
    assert(context.includes('[DATOS VERIFICADOS DE APIS INTERNAS]'));
    assert(context.includes('TIIE 28D 6.5%'));
    assert(context.includes('Estados Unidos 10 años: 4.7%'));
    assert(context.includes('Open Exchange Rates'));
    assert(requestedUrls.some(url => url.includes('/api/mx-rates')));
    assert(requestedUrls.some(url => url.includes('/api/bond-yields')));
    console.log('Historical USD/MXN chart tests: OK');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
