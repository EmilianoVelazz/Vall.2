'use strict';

const assert = require('assert');
const finanzasRouter = require('../backend/routes/finanzas');

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<rss><channel><item>
  <title>Banxico mantiene la tasa &amp; actualiza su pronóstico - Medio</title>
  <link>https://news.google.com/rss/articles/example</link>
  <pubDate>Wed, 23 Sep 2026 14:30:00 GMT</pubDate>
  <description><![CDATA[<a href="https://example.com">Banxico mantiene la tasa</a>]]></description>
  <News:Source>M&#233;dio Econ&#243;mico</News:Source>
</item></channel></rss>`;

const parsed = finanzasRouter._test._parseNewsRss(sample);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].title, 'Banxico mantiene la tasa & actualiza su pronóstico - Medio');
assert.equal(parsed[0].source, 'Médio Económico');
assert.equal(parsed[0].url, 'https://news.google.com/rss/articles/example');
assert.equal(parsed[0].mexicoScoped, true);
assert.match(parsed[0].publishedAt, /^2026-09-23T14:30:00/);

const bingSample = `<rss><channel><item>
  <title>Economía de México</title>
  <link>https://www.bing.com/news/apiclick.aspx?ref=example&amp;url=https%3A%2F%2Fexample.com%2Fmexico</link>
  <description>Resumen verificable</description>
  <News:Source>Medio nacional</News:Source>
</item></channel></rss>`;
const bingParsed = finanzasRouter._test._parseNewsRss(bingSample);
assert.equal(bingParsed[0].url, 'https://example.com/mexico');

const html = `<html><head><meta content="/foto-mexico.jpg" property="og:image"></head></html>`;
assert.equal(
    finanzasRouter._test._extractPageImage(html, 'https://example.com/noticia/1'),
    'https://example.com/foto-mexico.jpg',
);

assert.equal(finanzasRouter._test._isMexicoBusinessArticle({
    title: 'Banxico revisa su expectativa para la economía de México',
    summary: 'El banco central publicó su nueva previsión del PIB.',
}), true);
assert.equal(finanzasRouter._test._isMexicoBusinessArticle({
    title: 'Mexico soccer returns to U.S. this week, see ticket prices',
    summary: 'The national team begins a two-week trip.',
}), false);
assert.equal(finanzasRouter._test._isMexicoBusinessArticle({
    title: 'Global markets rally after central bank decision',
    summary: 'Stocks advanced around the world.',
}), false);

const pinned = finanzasRouter._test._pinnedLookup({ address: '203.0.113.10', family: 4 });
pinned('example.com', { all: true }, (error, records) => {
    assert.ifError(error);
    assert.deepEqual(records, [{ address: '203.0.113.10', family: 4 }]);
});
pinned('example.com', {}, (error, address, family) => {
    assert.ifError(error);
    assert.equal(address, '203.0.113.10');
    assert.equal(family, 4);
});

console.log('Daily News fallback tests: OK');
