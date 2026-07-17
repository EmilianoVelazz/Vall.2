'use strict';
const https = require('https');

// rejectUnauthorized:
//   - Siempre true: un certificado inválido debe fallar de forma segura.
const REJECT_UNAUTHORIZED = true;

/**
 * Fetch HTTPS genérico con control de timeout y manejo de TLS.
 * Devuelve un objeto fetch-compatible: { ok, status, json(), text() }
 */
function externalGet(url, extraHeaders = {}, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request(
            {
                hostname: u.hostname,
                port:     u.port || 443,
                path:     u.pathname + u.search,
                method:   'GET',
                rejectUnauthorized: REJECT_UNAUTHORIZED,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; VALLNews/1.0)',
                    ...extraHeaders,
                },
            },
            res => {
                let raw = '';
                res.on('data', c => (raw += c));
                res.on('end', () => {
                    resolve({
                        ok:     res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        json:   () => {
                            try { return Promise.resolve(JSON.parse(raw)); }
                            catch (e) { return Promise.reject(e); }
                        },
                        text: () => Promise.resolve(raw),
                    });
                });
            }
        );
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        req.end();
    });
}

/** Alias para GDELT con gestión de rate-limit 429 */
function gdeltFetch(url) {
    return externalGet(url, {}, 12000).then(r => {
        if (r.status === 429) throw new Error('GDELT rate limit (429)');
        return r.json().catch(() => { throw new Error('GDELT respuesta no-JSON'); });
    });
}

// ── Yahoo Finance — throttled fetch (cola serializada) ────────────────────────
// La página de finanzas puede disparar ~40 tickers en el mismo ciclo de refresco.
// Sin throttling, las ráfagas grandes terminan en 429 de Yahoo.
const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const YAHOO_MAX_CONCURRENT = 4;
const YAHOO_STAGGER_MS     = 120;
let _yahooActive  = 0;
let _yahooPumping = false;
const _yahooQueue = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function _pumpYahooQueue() {
    if (_yahooPumping) return;
    _yahooPumping = true;
    while (_yahooQueue.length) {
        if (_yahooActive >= YAHOO_MAX_CONCURRENT) { await sleep(50); continue; }
        const item = _yahooQueue.shift();
        _yahooActive++;
        fetch(item.url, item.options)
            .then(item.resolve, item.reject)
            .finally(() => { _yahooActive--; });
        await sleep(YAHOO_STAGGER_MS);
    }
    _yahooPumping = false;
}

function yahooFetch(url, options) {
    return new Promise((resolve, reject) => {
        _yahooQueue.push({ url, options, resolve, reject });
        _pumpYahooQueue();
    });
}

module.exports = { externalGet, gdeltFetch, yahooFetch, YF_UA, REJECT_UNAUTHORIZED };
