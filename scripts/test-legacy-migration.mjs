import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { HOJAS_FINANZAS } from '../frontend/src/lib/finanzasStyles.js';
import { precargarRuta } from '../frontend/src/lib/routePrefetch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadLocalDocuments, markdownToText } = require('./lib/local-knowledge.cjs');
const aliases = require('../shared/legacy-routes.json');
const documents = await loadLocalDocuments(ROOT);
assert.equal(documents.length, 3);
for (const document of documents) {
  assert.equal(document.canonicalUrl, '/orion');
  assert.ok(document.body.length >= 100);
  assert.ok(!document.externalId.includes('.html'));
}
assert.equal(markdownToText('# Título\n\n[Fuente](https://example.invalid/)\n\n```js\nalert(1)\n```'), 'Título\n\nFuente');
assert.ok(Object.values(aliases).every(route => !route.endsWith('.html')));
assert.equal(aliases['/inicio.html'], '/inicio');
assert.equal(aliases['/pages/vall-ai.html'], '/orion');

// Captura las peticiones reales del precargador y compara con las mismas
// hojas que utiliza la pantalla. Cubre orden, versiones y capas retiradas.
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const links = [];
try {
  globalThis.window = { location: { origin: 'http://app.example.test' }, setTimeout };
  globalThis.document = {
    baseURI: 'http://app.example.test/',
    querySelectorAll: () => links,
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild(link) { links.push(link); queueMicrotask(() => link.onload()); } },
  };
  // React/JSX no se ejecuta en Node: el import rechazará después de preparar
  // las hojas, que es el comportamiento sometido a prueba.
  await precargarRuta('/finanzas').catch(() => {});
  assert.deepEqual(links.map(link => link.href), HOJAS_FINANZAS);
  assert.equal(new Set(HOJAS_FINANZAS.map(href => href.split('?')[0])).size, HOJAS_FINANZAS.length);
  const page = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/Finanzas.jsx'), 'utf8');
  assert.match(page, /HOJAS_FINANZAS as HOJAS/);
  assert.match(page, /usePageStyles\(HOJAS\)/);
} finally {
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
}
console.log('Migración: documentación legible, enlaces vigentes y precarga de Finanzas sincronizada OK.');
