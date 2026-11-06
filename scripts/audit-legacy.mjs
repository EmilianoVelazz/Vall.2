import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';
import { RETIRED_FILES, assertRetiredFilesAbsent } from './lib/retired-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = file => path.relative(ROOT, file).split(path.sep).join('/');
const ignored = new Set(['node_modules', 'vendor', '.cache', 'dist', '__pycache__']);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : walk(target);
    return entry.isFile() ? [target] : [];
  });
}

assertRetiredFilesAbsent(ROOT);
const sources = ['frontend/src', 'assets/js', 'assets/css', 'backend', 'api']
  .flatMap(dir => walk(path.join(ROOT, dir)))
  .filter(file => /\.(?:jsx?|cjs|mjs|css|html)$/.test(file));
const retiredReferences = [];
const missingAssets = [];
for (const file of sources) {
  const source = fs.readFileSync(file, 'utf8');
  for (const retired of RETIRED_FILES) {
    if (source.includes(path.basename(retired))) retiredReferences.push({ file: relative(file), retired });
  }
  // Solo URLs locales completas y literales; no intenta interpretar plantillas
  // dinámicas ni confunde un endpoint externo con un archivo de este proyecto.
  for (const match of source.matchAll(/['"](\/assets\/[^'"\s${}]+\.(?:js|css|png|webp|svg|jpg|woff2?)(?:\?[^'"\s]*)?)['"]/g)) {
    const asset = match[1].split('?')[0];
    if (!fs.existsSync(path.join(ROOT, asset.slice(1)))) missingAssets.push({ file: relative(file), asset });
  }
}

// Grafo real desde main.jsx, incluidos imports dinámicos de React.lazy.
// Un nombre de versión no es criterio de retiro: solo la ausencia de consumo.
const reachable = new Set();
const missingImports = [];
function follow(file) {
  if (reachable.has(file)) return;
  reachable.add(file);
  if (!fs.existsSync(file)) { missingImports.push(relative(file)); return; }
  if (!/\.(?:js|jsx)$/.test(file)) return;
  const tree = espree.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true },
  });
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ImportExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)
      && typeof node.source?.value === 'string' && node.source.value.startsWith('.')) {
      follow(path.resolve(path.dirname(file), node.source.value));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
}
follow(path.join(ROOT, 'frontend/src/main.jsx'));
const orphanModules = walk(path.join(ROOT, 'frontend/src'))
  .filter(file => /\.(?:js|jsx)$/.test(file) && !reachable.has(file)).map(relative);

// El backend también tiene entradas de operación (ingesta y entrenamiento)
// fuera del servidor HTTP. Incluirlas evita retirar un módulo que usa un CLI.
const backendReachable = new Set();
function followCommonJS(file) {
  if (backendReachable.has(file) || !fs.existsSync(file)) return;
  backendReachable.add(file);
  if (!/\.(?:js|cjs|mjs)$/.test(file)) return;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    let target = path.resolve(path.dirname(file), match[1]);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.js');
    if (!fs.existsSync(target)) target += '.js';
    followCommonJS(target);
  }
}
const packageScripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
const cliRoots = Object.entries(packageScripts).filter(([name]) => !name.startsWith('test:'))
  .flatMap(([, command]) =>
  [...command.matchAll(/node\s+(\S+\.(?:js|cjs|mjs))/g)].map(match => path.join(ROOT, match[1])));
const operationalScripts = walk(path.join(ROOT, 'scripts')).filter(file =>
  /\.(?:js|cjs|mjs)$/.test(file) && !path.basename(file).startsWith('test-') && !file.endsWith('security-fixture.cjs'));
[path.join(ROOT, 'backend/server.js'), path.join(ROOT, 'backend/auth-server.js'),
  ...walk(path.join(ROOT, 'api')), ...cliRoots, ...operationalScripts].forEach(followCommonJS);
const backendModules = walk(path.join(ROOT, 'backend')).filter(file => /\.(?:js|cjs)$/.test(file));
const orphanBackendModules = backendModules.filter(file => !backendReachable.has(file)).map(relative);
const result = { generatedAt: new Date().toISOString(), retiredFiles: RETIRED_FILES.length,
  checkedSources: sources.length, reachableModules: reachable.size,
  backendModules: backendModules.length, orphanBackendModules,
  retiredReferences, missingAssets, missingImports, orphanModules,
  scope: 'Imports literales de la SPA, requires literales desde API/servidor/CLI y URLs de assets literales; no resuelve rutas calculadas.' };
const directory = path.join(ROOT, 'output/auditoria-codigo/codigo-antiguo');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'referencias.json'), JSON.stringify(result, null, 2));
assert.deepEqual(retiredReferences, [], 'Hay consumidores de código retirado');
assert.deepEqual(missingAssets, [], 'Hay referencias a archivos públicos inexistentes');
assert.deepEqual(missingImports, [], 'Hay imports locales rotos');
assert.deepEqual(orphanModules, [], 'Hay módulos de la SPA sin consumidores');
assert.deepEqual(orphanBackendModules, [], 'Hay módulos del backend sin consumidores en API o CLI');
console.log(`Código antiguo: ${RETIRED_FILES.length} archivos retirados, ${sources.length} fuentes revisadas, sin referencias rotas ni módulos huérfanos.`);
