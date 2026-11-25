'use strict';
/* global window, document */
process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
process.env.RUN_BACKGROUND_JOBS = 'false';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED = 'false';
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DATABASE_URL', 'DATABASE_URL', 'GEMINI_API_KEY']) {
    process.env[key] = '';
}
require('../backend/lib/tls-trust').configureSystemTrust();

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const JSZip = require('jszip');
const { chromium } = require('playwright');
const { buildPredictiveShowcase } = require('../backend/ml/predictive-showcase');

async function buildSampleXlsxBuffer() {
    const zip = new JSZip();
    zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '</Types>');
    zip.file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>');
    zip.file('xl/workbook.xml',
        '<?xml version="1.0" encoding="UTF-8"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="PreciosMX" sheetId="1" r:id="rId1"/></sheets>'
        + '</workbook>');
    zip.file('xl/_rels/workbook.xml.rels',
        '<?xml version="1.0" encoding="UTF-8"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '</Relationships>');
    zip.file('xl/worksheets/sheet1.xml',
        '<?xml version="1.0" encoding="UTF-8"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<sheetData>'
        + '<row r="1"><c r="A1" t="inlineStr"><is><t>Periodo</t></is></c><c r="B1" t="inlineStr"><is><t>Precio_MXN</t></is></c><c r="C1" t="inlineStr"><is><t>Volumen_t</t></is></c></row>'
        + '<row r="2"><c r="A2" t="inlineStr"><is><t>Oct</t></is></c><c r="B2"><v>94.5</v></c><c r="C2"><v>120</v></c></row>'
        + '<row r="3"><c r="A3" t="inlineStr"><is><t>Nov</t></is></c><c r="B3"><v>98.2</v></c><c r="C3"><v>135</v></c></row>'
        + '</sheetData>'
        + '</worksheet>');
    return zip.generateAsync({ type: 'nodebuffer' });
}

async function main() {
    const root = path.resolve(__dirname, '..');
    const distDir = path.join(root, 'dist');
    assert(fs.existsSync(path.join(distDir, 'index.html')), 'Se requiere dist/ compilado antes de ejecutar las pruebas E2E');

    const primaryAccount = 'alpha@vallnews.test';
    const secondaryAccount = 'beta@vallnews.test';
    let currentAccount = primaryAccount;
    let currentRole = 'admin';

    // Stub de verifyToken antes de cargar backend/routes/attachments.js para probar xlsxToCsv real sin JWT real.
    const authPath = require.resolve('../backend/routes/auth');
    require.cache[authPath] = {
        id: authPath,
        filename: authPath,
        loaded: true,
        exports: {
            verifyToken: (req, _res, next) => {
                req.user = { email: currentAccount, role: currentRole };
                next();
            },
        },
    };
    const { router: attachmentsRouter } = require('../backend/routes/attachments');

    const financeCache = JSON.parse(fs.readFileSync(path.join(root, 'backend/cache/finance_executive_reports.json'), 'utf8'));
    const marketCache = JSON.parse(fs.readFileSync(path.join(root, 'backend/cache/market_executive_reports.json'), 'utf8'));
    const mexicoCache = JSON.parse(fs.readFileSync(path.join(root, 'backend/cache/mexico-executive-reports.json'), 'utf8'));
    const offlineShowcase = await buildPredictiveShowcase({ offlineOnly: true });

    const streamRequests = [];
    const attachmentResponses = [];
    let retrainCalls = 0;

    const app = express();
    app.use('/api', (req, res, next) => {
        if (req.path === '/chat-attachments') {
            const origJson = res.json.bind(res);
            res.json = (body) => {
                attachmentResponses.push(body);
                return origJson(body);
            };
            return attachmentsRouter(req, res, next);
        }
        next();
    });

    app.use('/api', express.json({ limit: '2mb' }));
    app.use('/api', (req, res) => {
        if (req.path === '/verify-token') {
            return res.json({ success: true, email: currentAccount, role: currentRole, userId: 'e2e-user' });
        }
        if (req.path === '/profile') {
            return res.json({
                success: true,
                profile: { email: currentAccount, displayName: 'Auditor E2E', role: currentRole, preferences: {} },
            });
        }
        if (req.path === '/finance-executive-reports') {
            return res.json({ success: true, data: financeCache.reports, generatedAt: financeCache.generatedAt });
        }
        if (req.path === '/market-executive-reports') {
            return res.json({ success: true, data: marketCache.reports, generatedAt: marketCache.generatedAt });
        }
        if (req.path === '/mexico-executive-reports') {
            return res.json({ success: true, data: mexicoCache.reports, generatedAt: mexicoCache.generatedAt });
        }
        if (req.path === '/report-reader/read') {
            return res.json({
                success: true,
                reading: {
                    agent: 'ReportReaderAgent',
                    model: 'gemini-fixture',
                    headline: 'Lectura verificada del corte financiero',
                    answer: 'El S&P 500 y las tasas soberanas reflejan el corte verificado con fecha y fuente oficial.',
                    keyPoints: ['Cobertura verificada de índices y bonos.', 'Listo para cruzar en ORION.'],
                    missingData: [],
                },
                digest: { generatedAt: financeCache.generatedAt || new Date().toISOString() },
                accountEmail: currentAccount,
            });
        }
        if (req.path === '/ai-insight-stream') {
            streamRequests.push(req.body);
            const answer = 'Excel convertido correctamente a CSV e inspeccionado en el hilo.';
            res.type('text/event-stream');
            return res.end(
                `data: ${JSON.stringify({ text: answer })}\n\n`
                + `data: ${JSON.stringify({
                    done: true,
                    finalText: answer,
                    response: { version: '1.0', mode: 'quick', markdown: answer, blocks: [{ type: 'markdown', content: answer }], meta: { modelUsed: 'fixture-e2e' } },
                    model: 'fixture-e2e',
                    modelProfile: req.body?.modelProfile || 'cirius',
                })}\n\n`
            );
        }
        if (req.path === '/chat-conversations' || req.path === '/chat/conversations') {
            return res.json({ success: true, data: [], conversations: [] });
        }
        if (req.path === '/admin/loopus-stats') {
            return res.json({ success: true, stats: { total: 42, runsCount: 6, eventsCount: 18, withReasoningChain: 38, highConfidence: 34, reviewsCount: 5 } });
        }
        if (req.path === '/admin/loopus-proposals') {
            return res.json({ success: true, proposals: [] });
        }
        if (req.path === '/admin/loopus-reviews') {
            return res.json({ success: true, reviews: [] });
        }
        if (req.path === '/admin/loopus-predictions') {
            return res.json({ success: true, showcase: offlineShowcase });
        }
        if (req.path === '/admin/loopus-predictions/train') {
            retrainCalls += 1;
            return res.json({ success: true, showcase: offlineShowcase, rulesDistilled: 4, playbookAdded: 2, persistedRules: 0 });
        }
        if (req.path === '/news') {
            return res.json({ success: true, total: 0, totalArticles: 0, articles: [], sections: [] });
        }
        return res.json({ success: true, data: [], reports: [], articles: [], market: {}, global: {} });
    });

    app.use('/assets', express.static(path.join(root, 'assets')));
    app.use(express.static(distDir));
    app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));

    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    let browser;
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const page = await context.newPage();
        const pageErrors = [];
        const serverErrors = [];
        const dialogs = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
        page.on('response', res => { if (res.url().startsWith(origin) && res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`); });
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname === '127.0.0.1' || url.protocol === 'blob:' || url.protocol === 'data:') {
                return route.continue();
            }
            return route.abort();
        });

        // 1. Barrido de rutas principales + paleta Ctrl+K
        const routes = ['/inicio', '/finanzas', '/mercados', '/mercado-proteinas', '/mexico', '/noticias', '/informes', '/orion', '/configuracion'];
        for (const r of routes) {
            await page.goto(origin + r, { waitUntil: 'domcontentloaded' });
            await page.locator('header, main').first().waitFor({ timeout: 8000 }).catch(() => {});
        }
        await page.goto(origin + '/inicio', { waitUntil: 'domcontentloaded' });
        await page.locator('button.vn-cmd').waitFor({ timeout: 8000 });
        await page.keyboard.press('Control+k');
        const paletteInput = page.getByRole('combobox', { name: 'Buscar sección o acción' });
        await paletteInput.waitFor({ timeout: 5000 });
        await paletteInput.fill('Proteínas');
        await page.keyboard.press('Enter');
        await page.waitForURL('**/mercado-proteinas', { timeout: 5000 });

        // 2. Flujo Informes -> ReportReaderAssistant -> Traspaso SPA a ORION
        await page.goto(origin + '/informes', { waitUntil: 'domcontentloaded' });
        const askBtn = page.locator('button.erh-reader-ask-toggle:not([disabled])');
        await askBtn.waitFor({ timeout: 10000 });
        await askBtn.click();
        await page.locator('.erh-reader-assistant input[type="search"], .erh-reader-assistant input[type="text"]').first().waitFor({ timeout: 5000 }).catch(() => {});
        const sumBtn = page.locator('.erh-reader-assistant button[type="submit"]');
        await sumBtn.waitFor({ timeout: 5000 });
        await sumBtn.click();
        await page.getByText('Lectura verificada del corte financiero').waitFor({ timeout: 8000 });
        const handoffCta = page.locator('button.erh-reader-orion-cta');
        await handoffCta.waitFor({ timeout: 5000 });
        await handoffCta.click();
        await page.waitForURL('**/orion?from=report', { timeout: 8000 });
        await page.locator('#vaiInput:not([disabled])').waitFor({ timeout: 10000 });
        await page.locator('#vaiAttachments .vai-attachment-card').first().waitFor({ timeout: 8000 });
        const prefilledPrompt = await page.locator('#vaiInput').inputValue();
        assert(prefilledPrompt.length > 15, 'El traspaso desde Informes debe prellenar el prompt en ORION');
        const handoffCardText = await page.locator('#vaiAttachments').innerText();
        assert(/\.md/i.test(handoffCardText), `Se esperaba adjunto .md del dossier, recibido: ${handoffCardText}`);

        // Verificar aislamiento por cuenta: otra cuenta NO puede consumir el handoff de alpha
        await page.evaluate((owner) => {
            sessionStorage.setItem('vn_orion_report_handoff_v1', JSON.stringify({
                version: 1,
                createdAt: Date.now(),
                accountEmail: owner,
                title: 'Privado Alpha',
                area: 'finance',
                reportKey: 'overview',
                prompt: 'Contexto privado de Alpha',
                fileName: 'privado-alpha.md',
                markdown: '# Confidencial Alpha',
            }));
        }, primaryAccount);
        currentAccount = secondaryAccount;
        await page.goto(origin + '/orion?from=report', { waitUntil: 'domcontentloaded' });
        await page.locator('#vaiInput:not([disabled])').waitFor({ timeout: 10000 });
        assert.equal(await page.locator('#vaiAttachments .vai-attachment-card').count(), 0, 'Cuenta secundaria no debe cargar handoff de otra cuenta');
        assert.equal(await page.locator('#vaiInput').inputValue(), '', 'Cuenta secundaria no debe prellenar prompt ajeno');
        currentAccount = primaryAccount;

        // 3. ORION: CSV estadísticas locales + Graficar Chart.js + menú / + Excel (.xlsx) real + Exportar chat
        await page.goto(origin + '/orion', { waitUntil: 'domcontentloaded' });
        await page.locator('#vaiInput:not([disabled])').waitFor({ timeout: 10000 });

        const csvPayload = 'Mes,Precio_MXN,Margen_Pct\nEnero,82.5,14.2\nFebrero,86.0,16.8\nMarzo,84.0,15.1\n';
        await page.locator('#vaiFileInput').setInputFiles({
            name: 'costos_porcino.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvPayload, 'utf8'),
        });
        await page.locator('#vaiAttachments .vai-stat-chip').first().waitFor({ timeout: 5000 });
        const chipCount = await page.locator('#vaiAttachments .vai-stat-chip').count();
        assert(chipCount >= 2, `Se esperaban píldoras de estadísticas locales CSV, encontradas: ${chipCount}`);
        assert(await page.locator('#vaiAttachments .vai-att-col-select').isVisible(), 'Debe mostrarse el selector de columna numérica');
        await page.locator('#vaiAttachments .vai-att-btn.is-chart').click();
        await page.locator('.vai-message.assistant canvas').first().waitFor({ timeout: 8000 });

        // Verificar menú de comandos /
        await page.locator('#vaiInput').focus();
        await page.locator('#vaiInput').fill('/');
        await page.locator('#vaiSlashMenu:not([hidden]) .vai-slash-item').first().waitFor({ timeout: 5000 });
        await page.keyboard.press('Escape');
        await page.locator('#vaiInput').fill('');

        // Quitar CSV previo antes de subir Excel (.xlsx) y validar conversión real en /api/chat-attachments
        await page.locator('#vaiAttachments .vai-att-remove').first().click();
        const xlsxBuffer = await buildSampleXlsxBuffer();
        await page.locator('#vaiFileInput').setInputFiles({
            name: 'tabla_precios.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: xlsxBuffer,
        });
        await page.getByText('Excel (.xlsx) → CSV automático al enviar').waitFor({ timeout: 5000 });
        await page.locator('#vaiInput').fill('Analiza el archivo Excel adjunto');
        await page.locator('#vaiSend').click();
        await page.getByText('Excel convertido correctamente a CSV e inspeccionado en el hilo.').first().waitFor({ timeout: 10000 });
        assert.deepEqual(dialogs, [], `Alertas inesperadas: ${dialogs.join(' | ')}`);
        assert(attachmentResponses.some(r => r?.attachment?.convertedFrom === 'xlsx' && r.attachment.type === 'text/csv' && r.attachment.rowCount >= 2),
            `Backend debe convertir .xlsx a text/csv conservando filas (recibido: ${JSON.stringify(attachmentResponses)})`);
        assert(streamRequests.some(reqBody => Array.isArray(reqBody?.attachmentIds) && reqBody.attachmentIds.length === 1),
            'El envío SSE debe incluir el attachmentId convertido');

        // Exportar chat a Markdown (.md)
        const exportBtn = page.locator('#vaiExportChat:not([disabled])');
        await exportBtn.waitFor({ timeout: 5000 });
        await exportBtn.click();
        await page.locator('#vaiExportMenu [data-chat-export="md"]').waitFor({ timeout: 5000 });
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#vaiExportMenu [data-chat-export="md"]').click();
        const download = await downloadPromise;
        assert.match(download.suggestedFilename(), /\.md$/i, 'Descarga de chat debe usar extensión .md');

        // 4. Admin Loopus -> Predicciones y Demostraciones ML + Re-entrenar + móvil sin desborde
        await page.goto(origin + '/configuracion?seccion=loopus', { waitUntil: 'domcontentloaded' });
        const mlTab = page.getByRole('tab', { name: /Predicciones y Demostraciones ML/ });
        await mlTab.waitFor({ timeout: 10000 });
        await mlTab.click();
        const retrainBtn = page.getByRole('button', { name: 'Re-entrenar Modelos ML' });
        await retrainBtn.waitFor({ timeout: 8000 });
        await retrainBtn.click();
        await page.waitForTimeout(300);
        assert.equal(retrainCalls, 1, 'Botón Re-entrenar debe invocar /api/admin/loopus-predictions/train');

        // Barrido responsive móvil 390x844 sin desborde horizontal
        await page.setViewportSize({ width: 390, height: 844 });
        for (const r of routes) {
            await page.goto(origin + r, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(300);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            assert(overflow <= 1, `Desborde horizontal en móvil para ${r}: ${overflow}px`);
        }

        assert.deepEqual(pageErrors, [], `Errores de runtime en navegador: ${pageErrors.join(' | ')}`);
        assert.deepEqual(serverErrors, [], `Errores 5xx en servidor: ${serverErrors.join(' | ')}`);
        console.log('Cross-module E2E features UI: OK (9 rutas desktop/mobile, Ctrl+K, Informes->ORION handoff + aislamiento, CSV Chart.js, slash menu, .xlsx real, export .md y Admin Loopus ML).');
    } finally {
        await browser?.close();
        if (server) {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
