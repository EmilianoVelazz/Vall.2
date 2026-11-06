import assert from 'node:assert/strict';
import { requestReportPdf } from '../frontend/src/lib/reportPdf.js';

const report = { key: 'proteins', title: 'Proteínas' };
let requests = 0;
const pdf = new Blob(['%PDF-1.7\nDocumento sintético'], { type: 'application/pdf' });
const result = await requestReportPdf(report, report.title, 'Contenido sintético', async (url, options) => {
  requests += 1;
  assert.equal(url, '/api/report-export');
  assert.equal(options.credentials, 'include');
  assert.equal(options.cache, 'no-store');
  const body = JSON.parse(options.body);
  assert.equal(body.response, 'file');
  assert.equal(body.format, 'pdf');
  assert.deepEqual(body.executiveReport, report);
  return new Response(pdf);
});
assert.equal(requests, 1, 'El visor recibe el PDF en una sola petición');
assert.equal(await result.text(), await pdf.text());
for (const [response, message] of [
  [Response.json({ error: 'Privado' }, { status: 401 }), /sesión venció/],
  [Response.json({ error: 'Generación no disponible' }, { status: 503 }), /Generación no disponible/],
  [new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }), /PDF válido/],
  [new Response('No es un PDF', { headers: { 'Content-Type': 'application/pdf' } }), /incompleto/],
]) {
  await assert.rejects(requestReportPdf(report, report.title, 'Contenido', async () => response), message);
}
await assert.rejects(requestReportPdf(report, report.title, 'Contenido', async () => { throw new Error('Sin conexión'); }), /Sin conexión/);
console.log('Report PDF: entrega directa, sesión, errores y archivo válido: OK');
