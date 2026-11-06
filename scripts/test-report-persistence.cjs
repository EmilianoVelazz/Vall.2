'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const vm = require('node:vm');
const { ensure, validUrl } = require('../assets/js/report-artifacts');
const { securityHeaders } = require('../backend/lib/request-security');

(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vall-report-tests-'));
    let server;
    try {
        process.env.VALL_REPORT_STORAGE_DIR = directory;
        require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env'), quiet: true });
        const { createReportFileStore } = require('../backend/services/report-file-store');
        const store = createReportFileStore({ directory });
        const bytes = Buffer.from('%PDF-1.7\nSynthetic persistence fixture');
        const saved = await store.save({ owner: 'owner@example.test', name: 'fixture.pdf', mime: 'application/pdf', buffer: bytes });
        assert.equal(saved.storage, 'persistent_disk');
        const restarted = createReportFileStore({ directory });
        assert.deepEqual((await restarted.get(saved.token, 'OWNER@example.test')).buffer, bytes, 'Se conserva el archivo al crear otra instancia del servidor');
        assert.deepEqual((await restarted.get(saved.token, 'owner@example.test')).buffer, bytes, 'La descarga repetida no consume el archivo');
        assert.equal(await restarted.get(saved.token, 'other@example.test'), null);
        assert.equal(await restarted.get('../../private', 'owner@example.test'), null);
        const ownerFolder = crypto.createHash('sha256').update('owner@example.test').digest('hex');
        const metadataPath = path.join(directory, ownerFolder, `${saved.token}.json`);
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        metadata.createdAt = '2020-01-01T00:00:00.000Z';
        await fs.writeFile(metadataPath, JSON.stringify(metadata));
        assert.deepEqual((await restarted.get(saved.token, 'owner@example.test')).buffer, bytes, 'Los documentos no vencen por antigüedad');
        await fs.writeFile(path.join(directory, ownerFolder, `${saved.token}.bin`), Buffer.alloc(bytes.length));
        assert.equal(await restarted.get(saved.token, 'owner@example.test'), null, 'Se detecta un archivo alterado o incompleto');

        const quotaDirectory = path.join(directory, 'quota-fixture');
        const ownerQuota = createReportFileStore({ directory: quotaDirectory, maxOwnerBytes: 60, maxTotalBytes: 200 });
        const quotaInput = { owner: 'quota@example.test', name: 'quota.pdf', mime: 'application/pdf', buffer: Buffer.alloc(40, 1) };
        const competing = await Promise.allSettled([
            ownerQuota.save(quotaInput),
            createReportFileStore({ directory: quotaDirectory, maxOwnerBytes: 60, maxTotalBytes: 200 }).save(quotaInput),
        ]);
        assert.equal(competing.filter(item => item.status === 'fulfilled').length, 1, 'Las escrituras concurrentes no eluden el cupo');
        assert.equal(competing.find(item => item.status === 'rejected').reason.status, 507);
        const retained = competing.find(item => item.status === 'fulfilled').value;
        assert((await ownerQuota.get(retained.token, quotaInput.owner)).buffer.equals(quotaInput.buffer), 'Al agotar el cupo se conservan los documentos anteriores');
        const totalQuota = createReportFileStore({ directory: quotaDirectory, maxOwnerBytes: 200, maxTotalBytes: 60 });
        await assert.rejects(totalQuota.save({ ...quotaInput, owner: 'another@example.test' }), { code: 'REPORT_STORAGE_FULL' });
        const countQuota = createReportFileStore({ directory: quotaDirectory, maxOwnerFiles: 1 });
        await assert.rejects(countQuota.save({ ...quotaInput, buffer: Buffer.alloc(1) }), { code: 'REPORT_STORAGE_FULL' });
        await assert.rejects(ownerQuota.save({ ...quotaInput, name: '../unsafe.pdf' }), /Metadatos/);
        await assert.rejects(ownerQuota.save({ ...quotaInput, mime: 'application/pdf\r\nInjected: yes' }), /Metadatos/);

        let regenerations = 0, probes = 0;
        const artifact = { downloadUrl: `/api/report-download/${'a'.repeat(48)}`, filename: 'old.pdf' };
        const rebuilt = { downloadUrl: `/api/report-download/${'b'.repeat(48)}`, filename: 'new.pdf' };
        const rebuild = async () => { regenerations += 1; return rebuilt; };
        assert.equal(await ensure({ artifact, rebuild, fetchFile: async (_, options) => { probes += 1; assert.equal(options.method, 'HEAD'); return { ok: true }; } }), artifact);
        assert.equal(regenerations, 0);
        assert.equal(await ensure({ artifact, rebuild, fetchFile: async () => ({ ok: false, status: 404 }) }), rebuilt);
        assert.equal(regenerations, 1, 'Un enlace antiguo se restaura del contenido guardado');
        for (const status of [401, 403, 503]) {
            await assert.rejects(ensure({ artifact, rebuild, fetchFile: async () => ({ ok: false, status }) }));
        }
        await assert.rejects(ensure({ artifact, rebuild, fetchFile: async () => { throw new Error('offline'); } }));
        assert.equal(regenerations, 1, 'Los fallos de red y autenticación no duplican documentos');
        assert(!validUrl('https://evil.example/api/report-download/' + 'a'.repeat(48)));
        assert(!validUrl('/api/report-download/../../private'));
        await ensure({ artifact: { downloadUrl: 'https://evil.example' }, rebuild, fetchFile: async () => { throw new Error('No consultar un sitio externo'); } });
        assert.equal(probes, 1);

        // La recuperación puede terminar después de cambiar de conversación.
        // Se ejecutan las funciones reales de la página, sin abrir un navegador.
        const pageSource = await fs.readFile(path.join(__dirname, '..', 'assets', 'js', 'vall-ai-page-v4.js'), 'utf8');
        const artifactFunctions = pageSource.slice(pageSource.indexOf('    function savePdfPreview('), pageSource.indexOf('    function presentPdfDocument('));
        const oldMessage = { id: 'old-answer', text: 'Respuesta que debe conservarse', pdfPreview: artifact };
        const differentChat = { id: 'active-chat', messages: [{ id: 'other-answer', text: 'Otra respuesta' }] };
        const previousChat = { id: 'previous-chat', messages: [oldMessage] };
        let releaseExport, exportCalls = 0, remotelySaved,activeLanguage='es';
        const sandbox = { conversations: [previousChat, differentChat], activeId: differentChat.id,
            pendingPdfFiles: new WeakMap(), Date, console: { warn() {} },
            window: { VNReportArtifacts: { selectedLanguage:()=>activeLanguage,ensure: args => ensure({ ...args, fetchFile: async () => ({ ok: false, status: 404 }) }) } },
            reportContextFor: message => ({ title: 'Reporte original', content: message.text }),
            createServerExport: async (_, content) => { exportCalls += 1; assert.equal(content, oldMessage.text); return new Promise(resolve => { releaseExport = () => resolve(rebuilt); }); },
            saveConversations: () => { throw new Error('Cuota local'); },
            saveConversationToProfile: conversation => { remotelySaved = conversation; }, renderHistory() {},
        };
        vm.runInNewContext(artifactFunctions, sandbox);
        const restoring = sandbox.resolveMessagePdf(oldMessage, {});
        assert.equal(sandbox.resolveMessagePdf(oldMessage, {}), restoring, 'La vista previa y la descarga comparten la recuperación');
        await new Promise(resolve => setImmediate(resolve));
        releaseExport();
        await restoring;
        assert.equal(exportCalls, 1);
        assert.equal(remotelySaved, previousChat, 'El PDF se guarda con la respuesta original aunque cambie el chat activo');
        assert.equal(sandbox.activeId, differentChat.id);
        assert.equal(oldMessage.pdfPreview.downloadUrl, rebuilt.downloadUrl);
        assert.equal(differentChat.messages[0].pdfPreview, undefined);
        const changingLanguage=sandbox.resolveMessagePdf(oldMessage,{});
        await new Promise(resolve=>setImmediate(resolve));activeLanguage='en';releaseExport();
        await assert.rejects(changingLanguage,/idioma cambió/,'Un cambio de idioma no entrega el PDF de la solicitud anterior');activeLanguage='es';

        const app = express();
        require('../backend/services/user-profile-store').findById=async id=>['fixture-owner','fixture-other'].includes(id) ? {id,email:id==='fixture-owner' ? 'owner@example.test' : 'other@example.test',active:true,credentialVersion:0,role:'user'} : null;
        app.use(securityHeaders);
        app.use('/api', require('../backend/routes/export'));
        server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
        const base = `http://127.0.0.1:${server.address().port}`;
        const authorization = 'Bearer ' + jwt.sign({ sub: 'fixture-owner', email: 'owner@example.test' }, process.env.JWT_SECRET, { expiresIn: '5m' });
        const otherAuthorization = 'Bearer ' + jwt.sign({ sub: 'fixture-other', email: 'other@example.test' }, process.env.JWT_SECRET, { expiresIn: '5m' });
        const exported = await fetch(base + '/api/report-export', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Persistencia ORION', content: '# Datos de prueba\n\nContenido guardado para probar descargas repetidas.', format: 'pdf' }) });
        assert.equal(exported.status, 200);
        const file = await exported.json();
        assert.equal(file.storage, 'persistent_disk');
        const options = { headers: { Authorization: authorization } };
        const head = await fetch(base + file.downloadUrl, { ...options, method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal((await head.arrayBuffer()).byteLength, 0);
        const preview = await fetch(base + file.downloadUrl + '?preview=1', options);
        assert.match(preview.headers.get('content-disposition'), /^inline/);
        assert.equal(preview.headers.get('x-frame-options'), 'SAMEORIGIN', 'El PDF permite el visor del mismo origen');
        assert.match(preview.headers.get('content-security-policy'), /frame-ancestors 'self'/);
        assert.match(preview.headers.get('cache-control'), /private.*no-store/);
        const normalDownload = await fetch(base + file.downloadUrl, options);
        assert.equal(normalDownload.headers.get('x-frame-options'), 'DENY');
        const first = Buffer.from(await (await fetch(base + file.downloadUrl, options)).arrayBuffer());
        const second = Buffer.from(await (await fetch(base + file.downloadUrl, options)).arrayBuffer());
        assert.equal(first.subarray(0, 4).toString(), '%PDF');
        assert.deepEqual(first, second);
        const restartedDownload = await restarted.get(file.downloadUrl.split('/').at(-1), 'owner@example.test');
        assert.deepEqual(restartedDownload.buffer, first);
        const otherPreview = await fetch(base + file.downloadUrl + '?preview=1', { headers: { Authorization: otherAuthorization } });
        assert.equal(otherPreview.status, 404);
        assert.equal(otherPreview.headers.get('x-frame-options'), 'DENY', 'No se permite enmarcar errores ni archivos ajenos');
        const privatePreview = await fetch(base + file.downloadUrl + '?preview=1');
        assert.equal(privatePreview.status, 401);
        assert.equal(privatePreview.headers.get('x-frame-options'), 'DENY');
        const exportedHtml = await fetch(base + '/api/report-export', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'HTML de prueba', content: 'Contenido sintético.', format: 'html' }) });
        const htmlFile = await exportedHtml.json();
        const htmlPreview = await fetch(base + htmlFile.downloadUrl + '?preview=1', options);
        assert.match(htmlPreview.headers.get('content-disposition'), /^attachment/);
        assert.equal(htmlPreview.headers.get('x-frame-options'), 'DENY', 'preview=1 no habilita HTML dentro del sitio');
        const filesBeforeBinary = await fs.readdir(path.join(directory, ownerFolder));
        const binary = await fetch(base + '/api/report-export', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Entrega directa', content: 'PDF sintético entregado sin archivos temporales.', format: 'pdf', response: 'file' }) });
        assert.equal(binary.status, 200);
        assert.equal(binary.headers.get('content-type'), 'application/pdf');
        assert.match(binary.headers.get('content-disposition'), /^attachment; filename="Entrega-directa.pdf"$/);
        assert.match(binary.headers.get('cache-control'), /private.*no-store/);
        assert.equal(Buffer.from(await binary.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
        assert.deepEqual(await fs.readdir(path.join(directory, ownerFolder)), filesBeforeBinary, 'La entrega directa no depende del disco ni crea tokens temporales');
        const unauthenticatedBinary = await fetch(base + '/api/report-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Prueba', format: 'pdf', response: 'file' }) });
        assert.equal(unauthenticatedBinary.status, 401);
        assert.equal(unauthenticatedBinary.headers.get('x-frame-options'), 'DENY');
        const edgeConfig = require('../vercel.json');
        const frameRules = edgeConfig.headers.filter(rule => rule.headers.some(header => header.key === 'X-Frame-Options'));
        const edgeDeniesFrames = route => frameRules.some(rule => new RegExp('^' + rule.source + '$').test(route));
        assert.equal(edgeDeniesFrames(file.downloadUrl), false, 'Vercel deja la política de PDFs a la ruta autenticada');
        for (const route of ['/login', '/informes', '/api/report-export', '/api/profile', '/api/report-download-unsafe/test']) {
            assert.equal(edgeDeniesFrames(route), true, `Vercel mantiene el bloqueo: ${route}`);
        }
        console.log('Persistent report storage, repeated downloads, ownership and expired-link recovery: OK');
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        const absolute = path.resolve(directory);
        if (absolute.startsWith(path.join(os.tmpdir(), 'vall-report-tests-'))) await fs.rm(absolute, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
