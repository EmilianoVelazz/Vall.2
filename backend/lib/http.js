'use strict';
const https = require('https');
const { trustedCertificates } = require('./tls-trust');
// Incluye las CA del sistema operativo sin desactivar TLS. Una instalación
// corporativa de Windows puede añadir una CA que no está en ssl-root-cas.
const publicAgent = new https.Agent({ keepAlive: true, maxSockets: 16, maxTotalSockets: 32,
    maxFreeSockets: 8, ca: trustedCertificates() });
let externalActive = 0;

// Nunca desactivar la comprobación del certificado, tampoco en desarrollo.
const REJECT_UNAUTHORIZED = true;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/**
 * Fetch HTTPS genérico con control de timeout y manejo de TLS.
 * Devuelve un objeto fetch-compatible: { ok, status, json(), text() }
 */
function externalGet(url, extraHeaders = {}, timeoutMs = 9000, { signal } = {}) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason || new Error('Consulta cancelada.'));
        const u = new URL(url);
        if (u.protocol !== 'https:') return reject(new Error('Se requiere HTTPS.'));
        if (externalActive >= 64) return reject(Object.assign(new Error('Proveedor ocupado.'), { code: 'UPSTREAM_BUSY' }));
        externalActive++;
        let settled = false;
        let deadline;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            externalActive--;
            clearTimeout(deadline);
            callback(value);
        };
        let req;
        try { req = https.request(
            {
                hostname: u.hostname,
                port:     u.port || 443,
                path:     u.pathname + u.search,
                method:   'GET',
                signal,
                rejectUnauthorized: REJECT_UNAUTHORIZED,
                agent: publicAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; VALLNews/1.0)',
                    ...extraHeaders,
                },
            },
            res => {
                let raw = '';
                let bytes = 0;
                res.on('error', error => finish(reject, error));
                res.on('close', () => {
                    if (!res.complete) finish(reject, new Error('El proveedor interrumpió la respuesta.'));
                });
                res.on('data', c => {
                    bytes += Buffer.byteLength(c);
                    if (bytes > MAX_RESPONSE_BYTES) {
                        finish(reject, new Error('Respuesta del proveedor demasiado grande.'));
                        req.destroy();
                        return;
                    }
                    raw += c;
                });
                res.on('end', () => {
                    finish(resolve, {
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
        ); } catch (error) { finish(reject, error); return; }
        // `req.setTimeout` mide inactividad del socket y un proveedor puede
        // mantenerlo vivo con bytes lentos indefinidamente. Este plazo total
        // acota la latencia de la pantalla incluso ante respuestas a goteo.
        deadline = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.on('error', error => finish(reject, error));
        req.end();
    });
}

/* Alias para GDELT con gestión de rate-limit 429.
 *
 * El plazo era de 12 000 ms y GDELT tarda ~12 s EXACTOS en devolver su 429, así
 * que el plazo ganaba la carrera: el error que salía era siempre «timeout», el
 * guardián de /api/gdelt comprueba /429/ sobre el mensaje, y por eso su freno de
 * dos minutos nunca llegó a activarse ni una vez. Cada petición volvía a pagar
 * 5 s de cola + 12 s de espera, y de ahí venían los ~68 s de
 * /api/daily-news-markets en frío. Con 20 s el 429 llega a leerse. */
function gdeltFetch(url, timeoutMs = 20000) {
    return externalGet(url, {}, timeoutMs).then(r => {
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
const YAHOO_MAX_QUEUED     = 80;
const YAHOO_TIMEOUT_MS     = 12000;
const YAHOO_QUEUE_TIMEOUT_MS = 30000;
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
        clearTimeout(item.queueTimer);
        if (Date.now() - item.enqueuedAt > YAHOO_QUEUE_TIMEOUT_MS) {
            item.reject(Object.assign(new Error('Cola del proveedor agotada.'), { code: 'UPSTREAM_BUSY' }));
            continue;
        }
        _yahooActive++;
        const deadline = AbortSignal.timeout(YAHOO_TIMEOUT_MS);
        const signal = item.options?.signal ? AbortSignal.any([item.options.signal, deadline]) : deadline;
        // Consumir el cuerpo dentro del cupo: liberar al recibir solo cabeceras
        // permitiría mantener cientos de descargas lentas fuera del límite.
        fetch(item.url, { ...item.options, signal })
            .then(async response => {
                const reader = response.body?.getReader();
                if (!reader) return response;
                const chunks = [];
                let bytes = 0;
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytes += value.byteLength;
                        if (bytes > MAX_RESPONSE_BYTES) throw new Error('Respuesta del proveedor demasiado grande.');
                        chunks.push(Buffer.from(value));
                    }
                } catch (error) { await reader.cancel().catch(() => {}); throw error; }
                const body = Buffer.concat(chunks).toString('utf8');
                return { ok: response.ok, status: response.status, headers: response.headers,
                    text: async () => body, json: async () => JSON.parse(body) };
            })
            .then(item.resolve, item.reject)
            .finally(() => { _yahooActive--; });
        await sleep(YAHOO_STAGGER_MS);
    }
    _yahooPumping = false;
}

function yahooFetch(url, options) {
    return new Promise((resolve, reject) => {
        if (_yahooQueue.length >= YAHOO_MAX_QUEUED) {
            return reject(Object.assign(new Error('Proveedor ocupado. Intenta en unos segundos.'), { code: 'UPSTREAM_BUSY' }));
        }
        const item = { url, options, resolve, reject, enqueuedAt: Date.now() };
        item.queueTimer = setTimeout(() => {
            const index = _yahooQueue.indexOf(item);
            if (index < 0) return;
            _yahooQueue.splice(index, 1);
            reject(Object.assign(new Error('Cola del proveedor agotada.'), { code: 'UPSTREAM_BUSY' }));
        }, YAHOO_QUEUE_TIMEOUT_MS);
        _yahooQueue.push(item);
        _pumpYahooQueue();
    });
}

module.exports = { externalGet, gdeltFetch, yahooFetch, YF_UA, REJECT_UNAUTHORIZED };
