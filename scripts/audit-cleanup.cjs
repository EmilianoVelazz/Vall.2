'use strict';

// Inventario de limpieza: solo lee archivos y escribe informes; nunca elimina.
// No sigue enlaces/junctions, no inspecciona .git y conserva código y datos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const reportDir = path.join(root, 'output', 'auditoria-codigo', 'limpieza');
const slash = value => value.split(path.sep).join('/');
const human = bytes => `${(bytes / 1048576).toFixed(2)} MiB`;
const files = [];
const skipped = [];
function walk(directory) {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch { skipped.push(slash(path.relative(root, directory))); return; }
    for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        const relative = slash(path.relative(root, absolute));
        if (relative === '.git' || relative.startsWith('output/auditoria-codigo/')) continue;
        let stat;
        try { stat = fs.lstatSync(absolute); } catch { skipped.push(relative); continue; }
        if (stat.isSymbolicLink()) { skipped.push(relative); continue; }
        if (stat.isDirectory()) walk(absolute);
        else if (stat.isFile()) files.push({ path: relative, bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
    }
}
walk(root);

const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean));
const definitions = [
    ['.npm-security-cache', 'cache-regenerable', 'Caché npm: regenerable; no limpiar mientras npm esté ejecutándose.'],
    ['dist', 'compilacion', 'Distribución generada: regenerar con npm run build; conservar si se sirve localmente.'],
    ['frontend/dist', 'compilacion', 'Bundle generado por Vite; regenerable con el build.'],
    ['node_modules', 'dependencias', 'Dependencias necesarias para ejecutar y probar; reinstalar con npm ci, con red.'],
    ['frontend/node_modules', 'dependencias', 'Dependencias de React/Vite; reinstalar desde frontend con npm ci.'],
    ['.venv', 'dependencias', 'Entorno Python: verificar intérprete y uso antes de recrear desde requirements.txt.'],
    ['tmp', 'revision-manual', 'Temporales: revisar contenido y procesos activos; no asumir que todo sobra.'],
    ['_scratch', 'revision-manual', 'Trabajo de sesiones anteriores; .gitignore lo describe como desechable, revisar primero.'],
    ['scripts/_verify', 'revision-manual', 'Capturas de verificadores: conservar las que sirvan como evidencia.'],
    ['frontend/artifacts', 'revision-manual', 'Artefactos y capturas de verificaciones: revisar antes de eliminar.'],
    ['output', 'revision-manual', 'Resultados y documentos: conservar entregables y evidencia de auditorías.'],
    ['backend/cache', 'datos', 'Caché con datos/estado; verificar que se pueda reconstruir antes de limpiar.'],
    ['backend/generated-reports', 'datos', 'Informes de usuarios: aplicar una política de retención, no borrado indiscriminado.'],
];
const isWithin = (file, prefix) => file === prefix || file.startsWith(`${prefix}/`);
const candidates = definitions.map(([prefix, category, note]) => {
    const selected = files.filter(file => isWithin(file.path, prefix));
    return { path: prefix, category, note, files: selected.length, bytes: selected.reduce((sum, file) => sum + file.bytes, 0), trackedFiles: selected.filter(file => tracked.has(file.path)).length };
}).filter(item => item.files);
for (const file of files.filter(file => /^_dev\.(log|err)$/.test(file.path))) {
    candidates.push({ ...file, category: 'log', files: 1, trackedFiles: Number(tracked.has(file.path)), note: 'Log del lanzador: conservar si hay un diagnóstico activo; no limpiar con el servidor en marcha.' });
}

const topLevels = new Map();
for (const file of files) {
    const key = file.path.includes('/') ? file.path.split('/')[0] : '(raiz)';
    const current = topLevels.get(key) || { path: key, files: 0, bytes: 0 };
    current.files++; current.bytes += file.bytes; topLevels.set(key, current);
}

// Los duplicados de compilación/dependencias son normales. Buscar solo archivos
// del proyecto; un hash igual no demuestra que se pueda borrar una referencia.
const sourceFiles = files.filter(file => !/^(?:node_modules|frontend\/node_modules|\.venv|dist|frontend\/dist|\.npm-security-cache|output|tmp|_scratch|\.idea)\//.test(file.path) && file.bytes >= 4096);
const bySize = new Map();
for (const file of sourceFiles) {
    const group = bySize.get(file.bytes) || []; group.push(file); bySize.set(file.bytes, group);
}
const duplicates = [];
for (const group of bySize.values()) {
    if (group.length < 2) continue;
    const hashes = new Map();
    for (const file of group) {
        let hash;
        try { hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file.path))).digest('hex'); }
        catch { skipped.push(file.path); continue; }
        const match = hashes.get(hash) || []; match.push(file.path); hashes.set(hash, match);
    }
    for (const paths of hashes.values()) if (paths.length > 1) duplicates.push({ bytesEach: group[0].bytes, paths, action: 'revision-manual; comprobar referencias y licencia antes de borrar' });
}

const result = {
    generatedAt: new Date().toISOString(), root, mode: 'dry-run', deletedFiles: 0,
    scope: 'Se excluyen .git e informes de esta auditoría. No se siguen enlaces. Tamaño lógico, no bloques de disco.',
    totalFiles: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    inventory: [...topLevels.values()].sort((a, b) => b.bytes - a.bytes), candidates,
    duplicates, skipped,
    preserve: ['assets/', 'backend/data/', 'boveda_obsidian/', 'docs/', '.env*', '.git/', 'package-lock.json', 'frontend/package-lock.json', 'código y cambios sin confirmar'],
};
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'inventario.json'), JSON.stringify(result, null, 2));
const rows = candidates.map(item => `| ${item.path} | ${human(item.bytes)} | ${item.files} | ${item.trackedFiles} | ${item.category} | ${item.note} |`);
const markdown = [
    '# Prueba de limpieza de public_html', '',
    `Generado: ${result.generatedAt}. Modo: **simulación**, archivos eliminados: **0**.`, '',
    `Inventario: **${files.length} archivos**, **${human(result.totalBytes)}** de tamaño lógico.`, '',
    result.scope, '',
    '| Ruta | Tamaño | Archivos | Versionados | Tipo | Recomendación |',
    '|---|---:|---:|---:|---|---|', ...rows, '',
    'Estos tamaños representan categorías distintas de limpieza. No se deben sumar como espacio automáticamente liberable.', '',
    '## Conservar', '', ...result.preserve.map(item => `- ${item}`), '',
    'assets/ se carga dinámicamente en React y el build: la ausencia de un import no demuestra que un recurso sobre.', '',
    '## Duplicados exactos que requieren revisión', '',
    ...duplicates.map(item => `- ${human(item.bytesEach)} cada uno: ${item.paths.map(value => `\`${value}\``).join(', ')}. ${item.action}.`), '',
    `Entradas no leídas o enlaces omitidos: ${skipped.length}.`, '',
    'Repetir: `node scripts/audit-cleanup.cjs`. Este script no ofrece ninguna opción de borrado.', '',
].join('\n');
fs.writeFileSync(path.join(reportDir, 'LIMPIEZA.md'), markdown);
console.log(JSON.stringify({ mode: result.mode, deletedFiles: 0, totalFiles: files.length, totalMiB: +(result.totalBytes / 1048576).toFixed(2), candidates: candidates.map(item => ({ path: item.path, MiB: +(item.bytes / 1048576).toFixed(2), category: item.category })), duplicates: duplicates.length, skipped: skipped.length }, null, 2));
