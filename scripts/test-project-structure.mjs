import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAssets, validateAssets } from './lib/asset-audit.mjs';
import { RETIRED_FILES } from './lib/retired-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output'); fs.mkdirSync(output, { recursive: true });
const fixture = fs.mkdtempSync(path.join(output, 'estructura-fixture-'));
if (!path.resolve(fixture).startsWith(output + path.sep)) throw Error('Directorio de prueba fuera del área temporal.');
try {
  fs.mkdirSync(path.join(fixture, 'assets/img'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'frontend/src'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'assets/img/active.png'), 'fixture-not-an-actual-image');
  fs.writeFileSync(path.join(fixture, 'frontend/src/view.js'), 'const image = "/assets/img/active.png";');
  validateAssets(inspectAssets(fixture));
  fs.copyFileSync(path.join(fixture, 'assets/img/active.png'), path.join(fixture, 'assets/img/unused.png'));
  const redundant = inspectAssets(fixture);
  assert.equal(redundant.unused.length, 1); assert.equal(redundant.duplicates.length, 1);
  assert.throws(() => validateAssets(redundant), /sin referencias/);
  fs.writeFileSync(path.join(fixture, 'frontend/src/view.js'), 'const image = "/assets/img/missing.png";');
  assert.equal(inspectAssets(fixture).missing.length, 1);
  assert.throws(() => validateAssets(inspectAssets(fixture)), /ausentes/);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
const vite = fs.readFileSync(path.join(root, 'frontend/vite.config.js'), 'utf8');
assert.match(vite, /outDir:\s*'\.\.\/dist'/);
const build = fs.readFileSync(path.join(root, 'scripts/build-dist.mjs'), 'utf8');
assert(!build.includes('FRONT_DIST'), 'El build no debe generar otra copia intermedia.');
const result = inspectAssets(root); validateAssets(result);
if (process.argv.includes('--built')) {
  assert(fs.existsSync(path.join(root, 'dist/index.html')));
  assert(!fs.existsSync(path.join(root, 'frontend/dist')), 'Retirar la salida antigua antes de cerrar la reorganización.');
  for (const image of result.images) assert(fs.existsSync(path.join(root, 'dist', image.path)), image.path);
  for (const image of RETIRED_FILES.filter(file => file.startsWith('assets/img/')))
    assert(!fs.existsSync(path.join(root, 'dist', image)), 'El build no debe publicar imágenes retiradas.');
}
console.log(`Estructura: salida única y ${result.images.length} imágenes verificadas; el auditor rechaza sobrantes, duplicados y enlaces rotos.`);
