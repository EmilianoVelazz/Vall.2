'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function mockClient(mode) {
    const moduleMock = { exports: {} };
    const https = { Agent: class {}, request(options, receive) {
        assert.equal(options.rejectUnauthorized, true);
        const request = new EventEmitter();
        request.setTimeout = () => request;
        request.destroy = error => request.emit('error', error);
        request.end = () => queueMicrotask(() => {
            const response = new EventEmitter();
            response.complete = mode === 'success';
            response.statusCode = 200;
            receive(response);
            if (mode === 'oversized') { response.emit('data', 'x'.repeat(8 * 1024 * 1024 + 1)); return; }
            response.emit('data', '{"value":');
            if (mode === 'error') response.emit('error', new Error('upstream reset'));
            else if (mode === 'closed') response.emit('close');
            else { response.emit('data', '42}'); response.emit('end'); response.emit('close'); }
        });
        return request;
    } };
    const file = path.resolve(__dirname, '../backend/lib/http.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        require: name => name === 'https' ? https : name === './tls-trust' ? require('../backend/lib/tls-trust') : require(name), module: moduleMock,
        process: { env: { _TLS_STRICT: '0' } }, URL, Buffer, AbortSignal, setTimeout, clearTimeout,
    }, { filename: file });
    return moduleMock.exports;
}
(async () => {
    await assert.rejects(mockClient('error').externalGet('https://example.invalid', {}, 1000), /upstream reset/);
    await assert.rejects(mockClient('closed').externalGet('https://example.invalid', {}, 1000), /interrumpió/);
    const complete = await mockClient('success').externalGet('https://example.invalid', {}, 1000);
    assert.equal(complete.ok, true);
    assert.equal((await complete.json()).value, 42);
    await assert.rejects(mockClient('oversized').externalGet('https://example.invalid', {}, 1000), /demasiado grande/);
    await assert.rejects(mockClient('success').externalGet('http://example.invalid'), /HTTPS/);
    let active = 0, peak = 0;
    const mockModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../backend/lib/http.js'), 'utf8'), {
        require: name => name === './tls-trust' ? require('../backend/lib/tls-trust') : require(name),
        module: mockModule, URL, Buffer, AbortSignal, process: { env: {} }, Date, clearTimeout,
        setTimeout: (callback, ms) => setTimeout(callback, Math.min(ms, 1)),
        fetch: async (_url, options) => {
            assert.ok(options.signal);
            active++; peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, 5)); active--;
            return { ok: true, status: 200, json: async () => ({ fixture: true }) };
        },
    });
    const burst = await Promise.allSettled(Array.from({ length: 90 }, () => mockModule.exports.yahooFetch('https://fixture.example.invalid')));
    assert.ok(peak <= 4);
    assert.ok(burst.some(result => result.status === 'rejected' && result.reason.code === 'UPSTREAM_BUSY'));
    assert.ok(burst.some(result => result.status === 'fulfilled'));
    assert.equal((await mockModule.exports.yahooFetch('https://fixture.example.invalid')).status, 200);
    console.log('HTTP stream resilience tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
