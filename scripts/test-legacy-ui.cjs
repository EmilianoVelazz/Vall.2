'use strict';
/* global window */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const aliases = require('../shared/legacy-routes.json');

async function main() {
    const root = path.resolve(__dirname, '..');
    const dist = path.join(root, 'dist');
    assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Ejecutar npm run build primero');
    const { assertRetiredFilesAbsent } = await import('./lib/retired-files.mjs');
    assertRetiredFilesAbsent(dist);
    const app = express();
    app.use(express.static(dist));
    app.use((req, res) => {
        if (req.path.startsWith('/assets/') || req.path.startsWith('/vn-app/')) return res.sendStatus(404);
        res.sendFile(path.join(dist, 'index.html'));
    });
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    const checks = [];
    try {
        browser = await chromium.launch({ headless: true });
        for (const authenticated of [false, true]) {
            const context = await browser.newContext();
            const page = await context.newPage();
            const errors = [];
            const missingAssets = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('response', response => {
                if (response.status() === 404 && new URL(response.url()).pathname.startsWith('/assets/')) missingAssets.push(response.url());
            });
            // Aísla autenticación y proveedores: se verifica el bundle y el
            // guard de React, sin iniciar sesión ni consumir servicios reales.
            await page.route('**/api/**', async route => {
                const url = new URL(route.request().url());
                if (!url.pathname.startsWith('/api/')) return route.continue();
                if (url.pathname === '/api/verify-token') {
                    return route.fulfill({ status: authenticated ? 200 : 401,
                        json: { success: authenticated, email: 'fixture@example.invalid' } });
                }
                return route.fulfill({ json: { success: true, conversations: [], data: [], articles: [],
                    items: [], reports: [], preferences: {}, market: {}, global: {} } });
            });
            const routes = authenticated
                ? ['/inicio.html', '/pages/vall-ai.html', '/pages/finanzas.html', '/geopolitica']
                : Object.keys(aliases);
            for (const route of routes) {
                errors.length = 0;
                missingAssets.length = 0;
                await page.goto(origin + route + '?vista=prueba#seccion', { waitUntil: 'domcontentloaded' });
                const destination = authenticated ? aliases[route] + '?vista=prueba#seccion'
                    : '/login' + (aliases[route] === '/login' ? '?vista=prueba#seccion' : '');
                await page.waitForURL(origin + destination, { timeout: 20000 });
                if (!authenticated) {
                    await page.locator('input[type="password"]').waitFor({ state: 'visible' });
                    assert.equal(await page.locator('#vaiInput').count(), 0);
                } else if (aliases[route] === '/orion') {
                    await page.locator('#vaiInput').waitFor({ state: 'visible' });
                    await page.waitForFunction(() => typeof window.VNVallAi?.desmontar === 'function');
                } else {
                    await page.locator('main').first().waitFor({ state: 'visible' });
                }
                if (aliases[route] === '/finanzas' && authenticated) {
                    const { HOJAS_FINANZAS } = await import('../frontend/src/lib/finanzasStyles.js');
                    const active = await page.locator('link[data-vn-page-css]').evaluateAll(links => links.map(link => link.dataset.vnPageCss));
                    for (const href of HOJAS_FINANZAS.filter(value => !/\/(?:base|header|footer|responsive)\.css/.test(value))) {
                        assert.ok(active.includes(href), `Falta la hoja vigente ${href}`);
                    }
                    assert.equal(await page.locator('link[href*="sectors-board.css?v=2"]').count(), 0);
                }
                assert.deepEqual(errors, [], `Error JS en ${route}`);
                assert.deepEqual(missingAssets, [], `Asset faltante en ${route}`);
                checks.push({ route, authenticated, destination, passed: true });
            }
            await context.close();
        }
    } finally {
        await browser?.close();
        await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    }
    const directory = path.join(root, 'output/auditoria-codigo/codigo-antiguo');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'navegador.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
        checks, scope: 'Bundle de producción real y assets reales; autenticación y APIs simuladas.' }, null, 2));
    console.log(`Navegador: ${checks.length} enlaces antiguos y acceso con/sin sesión OK; sin JS roto ni assets 404.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
