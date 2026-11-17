'use strict';
/* global window, document, requestAnimationFrame */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const compression = require('compression');
const { chromium } = require('playwright');
const { createSiteSeo } = require('../backend/lib/site-seo');
const root = path.resolve(__dirname, '..');
const option = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const output = path.resolve(root, option('output', 'output/performance-20261113'));
const label = option('label', 'current').replace(/[^a-z0-9-]/gi, '');
const runs = Math.max(1, Math.min(5, Number(option('runs', '3')) || 3));
const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = value => Math.round(value * 10) / 10;

async function sample(browser, base, route, profile, run) {
    const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.mobile ? 2 : 1,
        isMobile: profile.mobile, hasTouch: profile.mobile, reducedMotion: 'no-preference' });
    const page = await context.newPage(), errors = [], responses = [];
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    // Bloquear dependencias externas sin desactivar la caché HTTP de Chromium.
    await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
    if (profile.mobile) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80,
            downloadThroughput: 200000, uploadThroughput: 93750, connectionType: 'cellular4g' });
    }
    await cdp.send('Performance.enable');
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base)) responses.push({ url: new URL(response.url()).pathname, status: response.status() }); });
    await page.addInitScript(() => {
        window.__webPerf = { lcp: 0, cls: 0, longTasks: [] };
        for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
            try { new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    if (type === 'largest-contentful-paint') window.__webPerf.lcp = entry.startTime;
                    if (type === 'layout-shift' && !entry.hadRecentInput) window.__webPerf.cls += entry.value;
                    if (type === 'longtask') window.__webPerf.longTasks.push(entry.duration);
                }
            }).observe({ type, buffered: true }); } catch { /* Métrica opcional según Chromium. */ }
        }
    });
    try {
        const started = performance.now();
        await page.goto(base + route, { waitUntil: 'load', timeout: 45000 });
        await page.locator('h1').first().waitFor();
        if (route === '/') await page.waitForFunction(() => ['ready', 'fallback'].includes(document.querySelector('.vp-space-viewport')?.dataset.status), undefined, { timeout: 20000 });
        await page.waitForTimeout(1000);
        const visibleMs = round(performance.now() - started);
        const metrics = await page.evaluate(async () => {
            const frames = [];
            await new Promise(resolve => {
                let previous, begin;
                function frame(now) {
                    begin ??= now;
                    if (previous !== undefined) frames.push(now - previous);
                    previous = now;
                    if (now - begin < 1000) requestAnimationFrame(frame); else resolve();
                }
                requestAnimationFrame(frame);
            });
            const resources = performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin === window.location.origin);
            const navigation = performance.getEntriesByType('navigation')[0];
            return { fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
                lcpMs: window.__webPerf.lcp, cls: window.__webPerf.cls,
                longTaskCount: window.__webPerf.longTasks.length,
                blockingMs: window.__webPerf.longTasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0),
                domContentLoadedMs: navigation.domContentLoadedEventEnd,
                ttfbMs: navigation.responseStart - navigation.requestStart,
                encodedBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, navigation.encodedBodySize),
                scriptBytes: resources.filter(entry => /\.(?:js|mjs)$/.test(new URL(entry.name).pathname)).reduce((sum, entry) => sum + entry.encodedBodySize, 0),
                requests: resources.length + 1,
                largestResources: resources.slice().sort((a, b) => b.encodedBodySize - a.encodedBodySize).slice(0, 7).map(entry => ({ path: new URL(entry.name).pathname, encodedBytes: entry.encodedBodySize, ms: entry.duration })),
                globeStatus: document.querySelector('.vp-space-viewport')?.dataset.status || null,
                frameIntervalMeanMs: frames.reduce((a, b) => a + b, 0) / frames.length,
                frameIntervalP95Ms: frames.slice().sort((a, b) => a - b)[Math.floor(frames.length * .95)],
                domNodes: document.querySelectorAll('*').length,
                widthOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
        });
        const cpu = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
        assert.deepEqual(errors, [], 'Errores de JavaScript durante la carga');
        assert.deepEqual(responses.filter(response => response.status >= 400 && !response.url.startsWith('/api/')), [], 'Recursos locales que no cargaron');
        assert(!metrics.widthOverflow, 'La página desborda el ancho de pantalla');
        const result = { route, profile: profile.name, run, visibleMs, ...metrics,
            mainThreadTaskMs: round(cpu.TaskDuration * 1000), heapMb: round(cpu.JSHeapUsedSize / 1048576), errors };
        result.cls = Math.round(result.cls * 1000) / 1000;
        for (const name of ['fcpMs', 'lcpMs', 'blockingMs', 'domContentLoadedMs', 'ttfbMs', 'frameIntervalMeanMs', 'frameIntervalP95Ms']) result[name] = round(result[name]);
        console.log(JSON.stringify({ route, profile: profile.name, run, fcpMs: result.fcpMs, lcpMs: result.lcpMs,
            kb: Math.round(result.encodedBytes / 1024), scriptKb: Math.round(result.scriptBytes / 1024), globe: result.globeStatus }));
        return result;
    } finally { await context.close(); }
}

async function main() {
    await fs.mkdir(output, { recursive: true });
    const directory = path.join(root, 'dist');
    await fs.access(path.join(directory, 'index.html'));
    const app = express();
    app.use(compression());
    app.use('/api', (_req, res) => res.status(401).json({ success: false }));
    app.use(createSiteSeo({ directory }));
    app.use(express.static(directory, { setHeaders(res, file) {
        if (file.includes(path.sep + 'vn-app' + path.sep)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    } }));
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
        const base = 'http://127.0.0.1:' + server.address().port;
        const samples = [];
        for (const profile of [{ name: 'desktop-local', viewport: { width: 1440, height: 900 }, mobile: false },
            { name: 'mobile-4g-cpu4x', viewport: { width: 390, height: 844 }, mobile: true }]) {
            for (const route of ['/', '/soluciones/informes', '/login']) {
                for (let run = 1; run <= runs; run++) {
                    samples.push(await sample(browser, base, route, profile, run));
                    await fs.writeFile(path.join(output, label + '-samples.json'), JSON.stringify(samples, null, 2));
                }
            }
        }
        const summaries = [...new Set(samples.map(item => item.profile + ' ' + item.route))].map(key => {
            const group = samples.filter(item => item.profile + ' ' + item.route === key);
            const result = { profile: group[0].profile, route: group[0].route, samples: group.length };
            for (const name of ['fcpMs', 'lcpMs', 'encodedBytes', 'scriptBytes', 'blockingMs', 'mainThreadTaskMs', 'heapMb', 'frameIntervalP95Ms']) result[name] = round(median(group.map(item => item[name])));
            return result;
        });
        await fs.writeFile(path.join(output, label + '.json'), JSON.stringify({ generatedAt: new Date().toISOString(), label,
            environment: 'Compilación local con compresión; caché fría; APIs 401 y recursos externos bloqueados; Chromium headless con GPU de software. No es una puntuación Lighthouse ni una medición de producción.',
            mobileConditions: '390×844, DPR 2, CPU 4× más lenta, 1.6 Mbps bajada, 750 Kbps subida, latencia 80 ms',
            summaries, samples }, null, 2));
        console.log(JSON.stringify({ passed: true, samples: samples.length, label, output }));
    } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
