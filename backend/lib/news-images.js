'use strict';

const https = require('node:https');
const net = require('node:net');
const { trustedCertificates } = require('./tls-trust');
const { BoundedCache, createSingleFlight } = require('./bounded-cache');
const { _isPrivateHost, _isPrivateAddress, _resolvePublicAddress, _pinnedLookup } = require('./image-proxy');

function decode(value) {
    return String(value || '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_all, number) => {
        const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim();
}

function attribute(tag, name) {
    const match = String(tag).match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return decode(match?.[1] ?? match?.[2] ?? match?.[3]);
}

function publicUrl(value, base, image = false) {
    try {
        const url = new URL(value, base);
        if (!(image ? ['https:', 'http:'] : ['https:']).includes(url.protocol)
            || url.username || url.password || url.href.length > 4096
            || (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))
            || _isPrivateHost(url.hostname) || (net.isIP(url.hostname) && _isPrivateAddress(url.hostname))) return null;
        return url;
    } catch { return null; }
}

function extractPageImage(html, pageUrl) {
    const tags = [...String(html).matchAll(/<meta\b[^>]*>/gi)].map(match => ({
        key: (attribute(match[0], 'property') || attribute(match[0], 'name')).toLowerCase(),
        value: attribute(match[0], 'content'),
    }));
    for (const key of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
        for (const tag of tags.filter(item => item.key === key && item.value)) {
            const url = publicUrl(tag.value, pageUrl, true);
            if (url) return url.href;
        }
    }
    return '';
}

function extractRssImage(item, pageUrl) {
    for (const match of String(item).matchAll(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi)) {
        const tag = match[0], type = attribute(tag, 'type'), medium = attribute(tag, 'medium');
        if ((type && !type.startsWith('image/')) || (medium && medium !== 'image')) continue;
        if (/^<enclosure/i.test(tag) && !type.startsWith('image/')) continue;
        const raw = attribute(tag, 'url');
        const url = raw && publicUrl(raw, pageUrl, true);
        if (url) return url.href;
    }
    for (const match of decode(item).matchAll(/<img\b[^>]*>/gi)) {
        const raw = attribute(match[0], 'src');
        const url = raw && publicUrl(raw, pageUrl, true);
        if (url) return url.href;
    }
    return '';
}

function createNewsImages({ resolveAddress = _resolvePublicAddress,
    request = (_url, options, receive) => https.request(options, receive),
    timeoutMs = 2400, maxBytes = 512 * 1024, maxActive = 8, now = Date.now } = {}) {
    const cache = new BoundedCache({ maxEntries: 250, maxBytes: 1024 * 1024 });
    const singleFlight = createSingleFlight(24);
    let active = 0;

    function readPage(start) {
        return new Promise((resolve, reject) => {
            let settled = false, upstream, response;
            const timer = setTimeout(() => finish(new Error('Metadata timeout')), timeoutMs);
            function finish(error, result) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                response?.destroy();
                upstream?.destroy();
                if (error) reject(error); else resolve(result);
            }
            async function visit(target, redirects = 0) {
                try {
                    const url = publicUrl(target);
                    if (!url) throw new Error('URL de metadata no permitida');
                    const address = await resolveAddress(url.hostname);
                    if (settled) return;
                    if (!address || _isPrivateAddress(address.address)) throw new Error('DNS de metadata no permitido');
                    upstream = request(url, { hostname: url.hostname, port: 443, path: url.pathname + url.search,
                        method: 'GET', lookup: _pinnedLookup(address), rejectUnauthorized: true, ca: trustedCertificates(),
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VALLNews/1.0)',
                            Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es-MX,es;q=0.9' } }, up => {
                        if (settled) return up.destroy();
                        response = up;
                        if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location) {
                            up.destroy();
                            const next = publicUrl(up.headers.location, url.href);
                            if (!next || redirects >= 3) return finish(new Error('Redirección de metadata no permitida'));
                            void visit(next.href, redirects + 1);
                            return;
                        }
                        const type = String(up.headers['content-type'] || '').split(';')[0].toLowerCase().trim();
                        if (up.statusCode !== 200 || !['text/html', 'application/xhtml+xml'].includes(type)) return finish(new Error('Metadata no disponible'));
                        let bytes = 0;
                        const chunks = [];
                        up.on('data', chunk => {
                            if (settled) return;
                            bytes += chunk.length;
                            if (bytes > maxBytes) return finish(new Error('Metadata demasiado grande'));
                            chunks.push(Buffer.from(chunk));
                            // La fotografía está en la cabecera; no descargamos todo el artículo.
                            const html = Buffer.concat(chunks).toString('utf8');
                            if (/<\/head\s*>/i.test(html)) finish(null, { html, url: url.href });
                        });
                        up.on('end', () => finish(null, { html: Buffer.concat(chunks).toString('utf8'), url: url.href }));
                        up.on('error', error => finish(error));
                        up.on('aborted', () => finish(new Error('Metadata interrumpida')));
                    });
                    upstream.on('error', error => finish(error));
                    upstream.end();
                } catch (error) { finish(error); }
            }
            void visit(start);
        });
    }

    async function lookup(url) {
        const target = publicUrl(url);
        if (!target) return '';
        const key = target.href;
        const saved = cache.get(key);
        if (saved && saved.until > now()) return saved.image;
        try {
            return await singleFlight(key, async () => {
                if (active >= maxActive) return '';
                active += 1;
                try {
                    const page = await readPage(key);
                    const image = extractPageImage(page.html, page.url);
                    cache.set(key, { image, until: now() + (image ? 6 * 60 * 60_000 : 10 * 60_000) });
                    return image;
                } catch {
                    cache.set(key, { image: '', until: now() + 10 * 60_000 });
                    return '';
                } finally { active -= 1; }
            });
        } catch { return ''; }
    }

    async function enrich(articles, limit = 12) {
        const result = articles.map(article => ({ ...article }));
        const candidates = result.filter(article => !article.image && !article.imageRaw).slice(0, Math.min(12, Math.max(0, limit)));
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
            while (next < candidates.length) {
                const article = candidates[next++];
                const image = await lookup(article.url);
                if (image) article.image = image;
            }
        }));
        return result;
    }
    return { enrich, lookup };
}

const newsImages = createNewsImages();
module.exports = { createNewsImages, extractPageImage, extractRssImage, enrichNewsImages: newsImages.enrich };
