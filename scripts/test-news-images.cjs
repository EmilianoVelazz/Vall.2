'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { createNewsImages, extractPageImage, extractRssImage } = require('../backend/lib/news-images');

function fixture(plans, options = {}) {
    const calls = [], hosts = [];
    const service = createNewsImages({
        timeoutMs: 150, ...options,
        resolveAddress: async host => { hosts.push(host); return { address: host === 'private.test' ? '127.0.0.1' : '8.8.8.8', family: 4 }; },
        request(url, config, receive) {
            calls.push(url.href);
            assert.equal(config.rejectUnauthorized, true);
            assert.ok(config.ca.length);
            config.lookup(url.hostname, {}, (error, address) => { assert.ifError(error); assert.equal(address, '8.8.8.8'); });
            const plan = typeof plans === 'function' ? plans(url) : plans[url.href];
            const request = new EventEmitter();
            request.destroy = () => {};
            request.end = () => queueMicrotask(() => {
                if (plan?.hang) return;
                const response = Readable.from([Buffer.from(plan?.body || '')]);
                response.statusCode = plan?.status || 200;
                response.headers = { 'content-type': plan?.type || 'text/html', ...plan?.headers };
                receive(response);
            });
            return request;
        },
    });
    return { service, calls, hosts };
}

async function main() {
    assert.equal(extractPageImage('<meta content="../foto.jpg?a=1&amp;b=2" property="og:image">', 'https://medio.test/nota/uno'), 'https://medio.test/foto.jpg?a=1&b=2');
    assert.equal(extractPageImage('<meta name=twitter:image content=https://cdn.test/photo.webp>', 'https://medio.test/nota'), 'https://cdn.test/photo.webp');
    assert.equal(extractPageImage('<meta property="og:image" content="http://cdn.test/p.jpg"><meta property="og:image:secure_url" content="https://cdn.test/p.jpg">', 'https://medio.test/nota'), 'https://cdn.test/p.jpg');
    for (const url of ['javascript:alert(1)', 'https://user:pass@cdn.test/f.jpg', 'https://cdn.test:8443/f.jpg', 'http://2130706433/f.jpg']) {
        assert.equal(extractPageImage(`<meta property="og:image" content="${url}">`, 'https://medio.test/nota'), '');
    }
    assert.equal(extractRssImage('<media:content medium="image" url="/foto.webp"/>', 'https://medio.test/nota'), 'https://medio.test/foto.webp');
    assert.equal(extractRssImage('<media:thumbnail url="https://cdn.test/thumb.jpg"/>', 'https://medio.test/nota'), 'https://cdn.test/thumb.jpg');
    assert.equal(extractRssImage('<enclosure type="audio/mpeg" url="https://cdn.test/podcast.mp3"/><description><![CDATA[<img src="/photo.jpg">]]></description>', 'https://medio.test/nota'), 'https://medio.test/photo.jpg');
    assert.equal(extractRssImage('<content:encoded>&lt;img src=&quot;/photo.jpg&quot;&gt;</content:encoded>', 'https://medio.test/nota'), 'https://medio.test/photo.jpg');

    const recovered = fixture({
        'https://medio.test/old': { status: 301, headers: { location: '/actual/nota' } },
        'https://medio.test/actual/nota': { body: '<head><meta property="og:image" content="../foto.jpg"></head>' },
    });
    const articles = [{ url: 'https://medio.test/old', title: 'Titular', image: '' }, { url: 'https://medio.test/other', image: 'https://cdn.test/existente.jpg' }];
    const [first, simultaneous] = await Promise.all([recovered.service.enrich(articles), recovered.service.enrich(articles)]);
    assert.equal(first[0].image, 'https://medio.test/foto.jpg');
    assert.deepEqual(first, simultaneous);
    assert.equal(articles[0].image, '', 'No modifica la edición mientras se está construyendo');
    assert.equal(first[1].image, articles[1].image, 'Conserva la foto del proveedor');
    assert.equal(recovered.calls.length, 2, 'Deduplica trabajo concurrente');
    await recovered.service.enrich(articles);
    assert.equal(recovered.calls.length, 2, 'La metadata se conserva en caché');

    const blocked = fixture(url => ({ status: 302, headers: { location: url.pathname === '/dns' ? 'https://private.test/article' : 'http://169.254.169.254/latest' } }));
    assert.equal(await blocked.service.lookup('https://medio.test/ip'), '');
    assert.equal(await blocked.service.lookup('https://medio.test/dns'), '');
    assert.equal(blocked.calls.length, 2, 'No accede al destino privado de las redirecciones');
    for (const url of ['https://localhost/a', 'file:///etc/passwd', 'https://user:pass@medio.test/a', 'https://medio.test:8443/a', 'https://[::1]/a']) assert.equal(await blocked.service.lookup(url), '');
    assert.equal(blocked.calls.length, 2);

    const loop = fixture(() => ({ status: 302, headers: { location: '/loop' } }));
    assert.equal(await loop.service.lookup('https://medio.test/start'), '');
    assert.equal(loop.calls.length, 4, 'Las redirecciones tienen un límite');
    const excessive = fixture(() => ({ body: 'x'.repeat(129) }), { maxBytes: 128 });
    assert.equal(await excessive.service.lookup('https://medio.test/large'), '');
    const wrongType = fixture(() => ({ type: 'image/svg+xml', body: '<meta property="og:image" content="/p.jpg">' }));
    assert.equal(await wrongType.service.lookup('https://medio.test/svg'), '');
    const timeout = fixture(() => ({ hang: true }), { timeoutMs: 30, maxActive: 1 });
    assert.equal(await timeout.service.lookup('https://medio.test/slow'), '');
    assert.equal(await timeout.service.lookup('https://medio.test/slow'), '');
    assert.equal(timeout.calls.length, 1, 'Evita repetir de inmediato una fuente caída');

    const capped = fixture(() => ({ hang: true }), { timeoutMs: 30, maxActive: 2 });
    const result = await capped.service.enrich(Array.from({ length: 20 }, (_, i) => ({ url: `https://medio.test/${i}` })));
    assert.equal(result.length, 20, 'No elimina noticias sin foto');
    assert.ok(capped.calls.length <= 2, 'No crea una cola ilimitada de descargas');
    console.log('Imágenes de noticias: RSS, metadata, redirecciones, caché, TLS, DNS público, tamaño y tiempos verificados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
