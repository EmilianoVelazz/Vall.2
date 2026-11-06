'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const express = require('express');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { start } = require('./lib/security-fixture.cjs');
const { originPolicy, safeErrorHandler } = require('../backend/lib/request-security');
const { AttachmentCache } = require('../backend/lib/attachment-cache');
const { BoundedCache, createSingleFlight } = require('../backend/lib/bounded-cache');
const { createWorkGate } = require('../backend/lib/resource-limits');
const { createImageProxy, _isPrivateAddress, _pinnedLookup } = require('../backend/lib/image-proxy');
const { databaseConfig, databaseTls, mysqlTlsOptions } = require('../backend/lib/database-connection');
const { clientIp } = require('../backend/lib/resource-limits');

const checks = [];
async function check(name, run) { await run(); checks.push({ name, passed: true }); }
async function listen(app) { return new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function main() {
    const fixture = await start();
    const { url, authorization } = fixture;
    const request = async (route, options = {}) => {
        const response = await fetch(url + route, { signal: AbortSignal.timeout(5000), ...options });
        const body = await response.text();
        return { status: response.status, headers: response.headers, body };
    };
    const auth = { Authorization: authorization(), 'Content-Type': 'application/json' };
    try {
        await check('Cabeceras: nosniff, anti-iframe, CSP y sin X-Powered-By', async () => {
            const r = await request('/api/health');
            assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
            assert.equal(r.headers.get('x-frame-options'), 'DENY');
            assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
            assert.equal(r.headers.get('x-powered-by'), null);
        });
        for (const route of ['/api/profile', '/api/chat-conversations', '/api/report-download/invalid']) {
            await check(`Acceso sin sesión rechazado: ${route}`, async () => assert.equal((await request(route)).status, 401));
        }
        for (const token of [
            jwt.sign({ sub: 'u' }, 'another-secret'),
            jwt.sign({ sub: 'u' }, process.env.JWT_SECRET, { algorithm: 'HS384' }),
            jwt.sign({ sub: 'u' }, process.env.JWT_SECRET, { expiresIn: -1 }),
            jwt.sign({ email: 'missing-sub@example.invalid' }, process.env.JWT_SECRET),
            jwt.sign({ sub: 'u' }, '', { algorithm: 'none' }),
            'A'.repeat(5000),
        ]) await check('JWT manipulado, expirado o de algoritmo/identidad inválida', async () => {
            assert.equal((await request('/api/profile', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
        });
        await check('Sesión válida y respuesta privada sin caché', async () => {
            const r = await request('/api/profile', { headers: auth });
            assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /private.*no-store/);
        });
        await check('CORS y CSRF: origen ajeno rechazado antes del chat', async () => {
            const r = await request('/api/chat', { method: 'POST', headers: { ...auth, Origin: 'https://attacker.example.invalid' }, body: '{}' });
            assert.equal(r.status, 403); assert.ok(!r.body.includes('attacker.example'));
        });
        await check('Producción no admite localhost salvo configuración explícita', async () => {
            const allowed = originPolicy({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.example.test' });
            assert.equal(allowed('http://localhost:5273'), false);
            assert.equal(allowed('https://app.example.test'), true);
            assert.equal(allowed('https://app.example.test.attacker.invalid'), false);
        });
        await check('DELETE autorizado funciona con preflight CORS', async () => {
            const r = await request('/api/chat-conversations', { method: 'OPTIONS', headers: { Origin: 'https://app.example.test', 'Access-Control-Request-Method': 'DELETE' } });
            assert.equal(r.status, 204); assert.match(r.headers.get('access-control-allow-methods'), /DELETE/);
        });
        for (const route of ['/api/chat-attachments', '/api/report-export', '/api/report-email', '/api/report-email-schedules/batch', '/api/ai-rich']) {
            await check(`Autenticar antes de leer JSON en ${route}`, async () => {
                const r = await request(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malformed' });
                assert.equal(r.status, 401);
            });
        }
        await check('JSON malformado devuelve 400 sin detalles internos', async () => {
            const r = await request('/api/chat-attachments', { method: 'POST', headers: auth, body: '{malformed' });
            assert.equal(r.status, 400); assert.ok(!r.body.includes('SyntaxError'));
        });
        await check('Cuerpo de chat sobredimensionado devuelve 413', async () => {
            const r = await request('/api/ai-rich', { method: 'POST', headers: auth, body: JSON.stringify({ message: 'x'.repeat(140000) }) });
            assert.equal(r.status, 413);
        });
        await check('Adjuntos no admiten SVG activo ni base64 corrupto', async () => {
            for (const input of [{ type: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, { type: 'text/plain', dataUrl: 'data:text/plain;base64,A===' }]) {
                assert.equal((await request('/api/chat-attachments', { method: 'POST', headers: auth, body: JSON.stringify(input) })).status, 400);
            }
        });
        await check('Adjuntos: separación por usuario verificada por ID', async () => {
            const r = await request('/api/chat-attachments', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'fixture.txt', type: 'text/plain', dataUrl: 'data:text/plain;base64,dGVzdA==' }) });
            assert.equal(r.status, 201);
            const id = JSON.parse(r.body).attachment.id;
            const { getAttachments } = require('../backend/routes/attachments');
            assert.equal(getAttachments([id], { sub: 'fixture-user' }).length, 1);
            assert.equal(getAttachments([id], { sub: 'another-user' }).length, 0);
            assert.equal(getAttachments([id], {}).length, 0);
        });
        await check('Adjuntos: cupos por propietario, totales y liberación por TTL', async () => {
            let now = 0;
            const cache = new AttachmentCache({ maxBytes: 12, perOwnerBytes: 8, maxItems: 4, ttlMs: 100, now: () => now });
            const item = { owner: 'a', base64: 'dGVzdA==' };
            assert.equal(cache.put({ ...item, id: 'a' }), null);
            assert.equal(cache.put({ ...item, id: 'b' }), 'owner');
            assert.equal(cache.put({ ...item, id: 'b', owner: 'b' }), 'capacity');
            now = 101; assert.deepEqual(cache.snapshot(), { items: 0, bytes: 0, owners: 0 });
        });
        await check('Caché de mercado limitada en bytes y entradas', async () => {
            const cache = new BoundedCache({ maxEntries: 2, maxBytes: 50 });
            for (const key of ['a', 'b', 'c']) cache.set(key, { value: 'hello' });
            assert.equal(cache.get('a'), undefined); assert.ok(cache.snapshot().bytes <= 50);
            cache.set('big', { value: 'x'.repeat(60) }); assert.equal(cache.get('big'), undefined);
        });
        await check('Una consulta externa por clave, incluso con 20 solicitudes simultáneas', async () => {
            const before = fixture.upstreamCalls();
            const results = await Promise.all(Array.from({ length: 20 }, () => request('/api/stock-history?ticker=PPC&range=1y')));
            assert.ok(results.every(r => r.status === 200));
            assert.equal(fixture.upstreamCalls() - before, 1);
        });
        await check('Parámetros repetidos/inyección de ticker devuelven 400', async () => {
            for (const query of ['ticker=TSN&ticker=PPC', 'ticker=%27%20OR%201%3D1--', 'ticker=TSN&range[]=max']) {
                assert.equal((await request('/api/stock-history?' + query)).status, 400);
            }
        });
        await check('Cola por claves llena rechaza y se recupera', async () => {
            const flight = createSingleFlight(1);
            let finish;
            const first = flight('a', () => new Promise(resolve => { finish = resolve; }));
            await new Promise(resolve => setImmediate(resolve));
            await assert.rejects(flight('b', async () => true), { code: 'UPSTREAM_BUSY' });
            finish(true); await first; assert.equal(await flight('b', async () => true), true);
        });
        await check('El límite de trabajo mantiene el cupo hasta finalizar', async () => {
            const gate = createWorkGate({ maxActive: 1, maxPerUser: 1 });
            let finish;
            const res = { set() {}, status(code) { this.code = code; return this; }, json() {} };
            const first = gate.wrap(() => new Promise(resolve => { finish = resolve; }))({ user: { sub: 'a' } }, res, error => { throw error; });
            assert.equal(gate.acquire({ user: { sub: 'b' } }, res), null); assert.equal(res.code, 503);
            finish(); await first; assert.equal(gate.snapshot().active, 0);
        });
        await check('IA: exceso concurrente recibe 429/503 y luego se recupera', async () => {
            const results = await Promise.all(Array.from({ length: 30 }, (_, i) => request('/api/ai-rich', { method: 'POST', headers: { ...auth, Authorization: authorization('burst-' + i) }, body: '{"message":"Analiza acciones de proteínas"}' })));
            assert.ok(results.some(r => r.status === 200));
            assert.ok(results.some(r => [429, 503].includes(r.status)));
            assert.ok(results.every(r => [200, 429, 503].includes(r.status)));
            assert.equal((await request('/api/ai-rich', { method: 'POST', headers: auth, body: '{"message":"Analiza TSN"}' })).status, 200);
        });
        await check('Fuerza bruta: límite de login no se elude con X-Forwarded-For', async () => {
            const results = [];
            for (let i = 0; i < 10; i++) results.push(await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${i + 1}` }, body: '{}' }));
            assert.equal(results.at(-1).status, 429);
            assert.ok(results.at(-1).headers.has('retry-after'));
        });
        await check('No se publican archivos del backend ni configuración', async () => {
            for (const route of ['/backend/.env', '/.env', '/package.json', '/backend/server.js', '/assets/../backend/.env']) assert.equal((await request(route)).status, 404);
        });
        await check('Marcadores antiguos redirigen a la SPA sin perder parámetros', async () => {
            for (const [route, target] of Object.entries(require('../shared/legacy-routes.json'))) {
                const r = await request(route + '?vista=prueba', { redirect: 'manual' });
                assert.equal(r.status, 302, route);
                assert.equal(r.headers.get('location'), (process.env.SPA_ORIGIN || '') + target + '?vista=prueba');
                assert.match(r.headers.get('cache-control'), /no-store/);
            }
        });
        await check('Los motores retirados no se sirven como archivos públicos', async () => {
            for (const name of ['chat-widget', 'login', 'page-loader', 'flags-widget']) {
                assert.equal((await request(`/assets/js/${name}.js`)).status, 404);
            }
        });
        await check('Errores internos no revelan mensajes del sistema', async () => {
            const res = { headersSent: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
            safeErrorHandler(new Error('SQL password=private-fixture'), {}, res, () => {});
            assert.equal(res.code, 500); assert.ok(!JSON.stringify(res.body).includes('password'));
        });
    } finally { await fixture.close(); }

    await check('SSRF: IPs privadas, IPv6 mapeado y NAT64 bloqueados', async () => {
        for (const address of ['169.254.169.254', '127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', 'fe90::1', '2002:7f00:1::1']) assert.equal(_isPrivateAddress(address), true);
        _pinnedLookup({ address: '8.8.8.8', family: 4 })('ignored', { all: true }, (error, records) => assert.equal(records[0].address, '8.8.8.8'));
    });
    await check('PostgreSQL: TLS verificado y sslmode inseguro no puede anularlo', async () => {
        const config = databaseConfig({ SUPABASE_DATABASE_URL: 'postgresql://fixture:fixture@example.invalid/db?sslmode=no-verify' });
        assert.ok(!config.connectionString.includes('sslmode'));
        assert.equal(databaseTls({}).rejectUnauthorized, true);
        assert.ok(databaseTls({}).ca.length > 0);
        assert.equal(mysqlTlsOptions({ DB_HOST: 'db.example.invalid' }).ssl.rejectUnauthorized, true);
        assert.deepEqual(mysqlTlsOptions({ DB_HOST: '127.0.0.1' }), {});
        assert.deepEqual(mysqlTlsOptions({ DB_HOST: 'vall-mariadb', MYSQL_TLS: 'disable' }), {});
        assert.equal(mysqlTlsOptions({ DB_HOST: 'vall-mariadb', MYSQL_TLS: 'false' }).ssl.rejectUnauthorized, true);
    });
    await check('IP de Vercel solo se acepta en su runtime de producción', async () => {
        const req = { ip: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.7', 'x-vercel-forwarded-for': '203.0.113.8' } };
        assert.equal(clientIp(req, { NODE_ENV: 'test' }), '127.0.0.1');
        assert.equal(clientIp(req, { VERCEL: '1', NODE_ENV: 'production' }), '203.0.113.8');
    });
    await check('Proxy: SVG, redirecciones, exceso de bytes, credenciales y puertos rechazados', async () => {
        const app = express();
        let type = 'image/svg+xml', length = '12', status = 200;
        app.get('/img', createImageProxy({ maxBytes: 100, resolveAddress: async () => ({ address: '8.8.8.8', family: 4 }),
            request(_url, options, receive) {
                assert.equal(options.rejectUnauthorized, true);
                const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => {};
                req.end = () => queueMicrotask(() => {
                    const stream = Readable.from([Buffer.from('fixture-image')]);
                    stream.headers = { 'content-type': type, 'content-length': length }; stream.statusCode = status;
                    receive(stream);
                }); return req;
            } }));
        const server = await listen(app); const url = `http://127.0.0.1:${server.address().port}/img?u=`;
        try {
            const call = async target => { const r = await fetch(url + encodeURIComponent(target)); await r.arrayBuffer(); return r; };
            assert.equal((await call('https://images.example.test/pic')).status, 502);
            type = 'image/png'; length = '101'; assert.equal((await call('https://images.example.test/pic')).status, 502);
            length = '12'; status = 302; assert.equal((await call('https://images.example.test/pic')).status, 502);
            status = 200; assert.equal((await call('https://images.example.test/pic')).status, 200);
            for (const target of ['https://user:pass@images.example.test/pic', 'https://images.example.test:8443/pic', 'file:///etc/passwd']) assert.equal((await call(target)).status, 400);
            for (const target of ['http://2130706433/pic', 'http://0x7f000001/pic', 'http://[::1]/pic']) assert.equal((await call(target)).status, 403);
        } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    });
    fs.mkdirSync(path.resolve('output/seguridad-carga'), { recursive: true });
    fs.writeFileSync(path.resolve('output/seguridad-carga/pruebas-seguridad.json'), JSON.stringify({ generatedAt: new Date().toISOString(), environment: 'localhost; proveedores y DB simulados', checks }, null, 2));
    console.log(`Security HTTP/resource tests: ${checks.length} checks OK`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
