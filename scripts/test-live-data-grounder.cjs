'use strict';

const assert = require('node:assert/strict');
const { rulesForMessage, yahooQuote, liveNews } = require('../backend/ai/live-data-grounder');

assert.deepEqual(
    rulesForMessage('Dame la cotización del ASX 200', { topic: 'equities' }).map(item => item.symbol),
    ['^AXJO'],
);
assert.deepEqual(
    rulesForMessage('Dame la cotización del ticker BHP.AX', { topic: 'equities' }).map(item => item.symbol),
    ['BHP.AX'],
);
assert.deepEqual(
    rulesForMessage('Dame el rendimiento del Treasury 3 meses', { topic: 'bonds' }).map(item => item.symbol),
    ['^IRX'],
);
assert.deepEqual(
    rulesForMessage('Dame el precio físico del cerdo en Australia', { topic: 'commodities', localPhysicalPrice: true }),
    [],
);

const fixtureGet = async () => ({
    ok: true,
    json: async () => ({ chart: { result: [{
        timestamp: [1_704_067_200, 1_704_153_600],
        meta: { longName: 'BHP Group Limited', currency: 'AUD' },
        indicators: { quote: [{ close: [44.1, 45.2] }] },
    }] } }),
});

(async () => {
    const quote = await yahooQuote({ symbol: 'BHP.AX', label: 'BHP.AX', unit: null }, fixtureGet);
    assert.equal(quote.label, 'BHP.AX');
    assert.equal(quote.unit, 'AUD');
    assert.equal(quote.value, 45.2);
    assert.equal(quote.change.toFixed(2), '2.49');

    const savedNewsKey = process.env.NEWSAPI_KEY;
    delete process.env.NEWSAPI_KEY;
    try {
        const headlines = await liveNews('Noticias de bonos Australia entre 2026-09-01 y 2026-09-30', async () => ({
            ok: true,
            json: async () => ({ articles: [{
                title: 'Banco central publica actualización', domain: 'official.example',
                url: 'https://official.example/release', seendate: '20260917T120000Z',
            }] }),
        }));
        assert.equal(headlines.length, 1);
        assert.equal(headlines[0].sourceName, 'official.example');
    } finally {
        if (savedNewsKey === undefined) delete process.env.NEWSAPI_KEY;
        else process.env.NEWSAPI_KEY = savedNewsKey;
    }
    console.log('Live data grounder tests: OK');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
