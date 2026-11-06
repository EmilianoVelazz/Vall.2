'use strict';

const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const { createWorkGate } = require('./resource-limits');
const { trustedCertificates } = require('./tls-trust');

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon']);
const MAX_BYTES = 8 * 1024 * 1024;

function _isPrivateHost(host) {
    const h = String(host || '').toLowerCase();
    if (h.startsWith('[') || h.includes(':')) return true;
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
    const m = h.match(/^172\.(\d+)\./);
    return !!(m && +m[1] >= 16 && +m[1] <= 31);
}

function _isPrivateAddress(address) {
    const value = String(address || '').toLowerCase();
    if (net.isIP(value) === 6) {
        return value === '::' || value === '::1' || /^(?:fc|fd|fe[89abcdef]|ff)/.test(value)
            || value.startsWith('::ffff:') || value.startsWith('64:ff9b:') || value.startsWith('2002:');
    }
    if (net.isIP(value) !== 4) return true;
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function _resolvePublicAddress(hostname) {
    if (_isPrivateHost(hostname) || (net.isIP(hostname) && _isPrivateAddress(hostname))) return null;
    let timer;
    try {
        const records = await Promise.race([
            dns.promises.lookup(hostname, { all: true, verbatim: true }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 2000); }),
        ]);
        if (!records.length || records.some(record => _isPrivateAddress(record.address))) return null;
        return records[0];
    } catch { return null; } finally { clearTimeout(timer); }
}

function _pinnedLookup(resolved) {
    return (_hostname, options, callback) => {
        if (options?.all) return callback(null, [resolved]);
        return callback(null, resolved.address, resolved.family);
    };
}

function createImageProxy({ resolveAddress = _resolvePublicAddress,
    request = (url, options, receive) => (url.protocol === 'http:' ? http : https).request(options, receive),
    maxBytes = MAX_BYTES, timeoutMs = 8000 } = {}) {
    const gate = createWorkGate({ maxActive: 16, maxPerUser: 4 });
    return gate.wrap(async (req, res) => {
        const raw = req.query.u;
        if (typeof raw !== 'string' || !raw || raw.length > 4096) return res.status(400).end();
        let url;
        try { url = new URL(raw); } catch { return res.status(400).end(); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))) return res.status(400).end();
        if (_isPrivateHost(url.hostname) || (net.isIP(url.hostname) && _isPrivateAddress(url.hostname))) return res.status(403).end();
        const resolved = await resolveAddress(url.hostname);
        if (!resolved || _isPrivateAddress(resolved.address)) return res.status(403).end();
        if (res.destroyed) return;

        await new Promise(done => {
            let upstream, response, deadline;
            let finished = false;
            function stop(status) {
                if (finished) return;
                finished = true;
                clearTimeout(deadline);
                res.off('close', closed);
                res.off('finish', complete);
                if (status) {
                    if (res.headersSent) res.destroy(); else res.status(status).end();
                }
                response?.destroy();
                upstream?.destroy();
                done();
            }
            const closed = () => stop();
            const complete = () => stop();
            res.once('close', closed);
            res.once('finish', complete);
            deadline = setTimeout(() => stop(504), timeoutMs);
            try {
                upstream = request(url, { hostname: url.hostname, port: url.port || (url.protocol === 'http:' ? 80 : 443),
                    path: url.pathname + url.search, method: 'GET', lookup: _pinnedLookup(resolved), rejectUnauthorized: true,
                    ca: trustedCertificates(),
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VALLNews/1.0)',
                        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif', Referer: `${url.protocol}//${url.hostname}/` },
                }, up => {
                    response = up;
                    if (finished) return up.destroy();
                    const type = String(up.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
                    if (up.statusCode < 200 || up.statusCode >= 300 || !IMAGE_TYPES.has(type)
                        || Number(up.headers['content-length']) > maxBytes) return stop(502);
                    let bytes = 0;
                    up.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) stop(502); });
                    up.on('error', () => stop(502));
                    up.on('aborted', () => stop(502));
                    res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
                        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=259200',
                        'Cross-Origin-Resource-Policy': 'cross-origin' });
                    up.pipe(res);
                });
                upstream.setTimeout(timeoutMs, () => stop(504));
                upstream.on('error', () => stop(502));
                upstream.end();
            } catch { stop(502); }
        });
    });
}

module.exports = { createImageProxy, _isPrivateAddress, _isPrivateHost, _resolvePublicAddress, _pinnedLookup };
