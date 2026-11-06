import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const IMAGE = /\.(?:png|jpe?g|webp|svg|gif|avif|ico)$/i;
const SOURCE = /\.(?:js|jsx|mjs|cjs|json|css|html)$/i;
const EXCLUDED = new Set(['node_modules', 'dist', 'cache', 'generated-reports', 'vendor', '.git']);
function filesIn(directory) {
  if (!fs.existsSync(directory)) return [];
  if (fs.lstatSync(directory).isSymbolicLink()) return [];
  if (fs.statSync(directory).isFile()) return [directory];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink() || EXCLUDED.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : entry.isFile() ? [target] : [];
  });
}

export function inspectAssets(root) {
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  const images = ['assets/img', 'assets/templates'].flatMap(dir => filesIn(path.join(root, dir))).filter(file => IMAGE.test(file));
  const sources = ['frontend/src', 'frontend/index.html', 'assets/js', 'assets/css', 'backend', 'api', 'shared']
    .flatMap(dir => filesIn(path.join(root, dir))).filter(file => SOURCE.test(file))
    .map(file => ({ path: relative(file), text: fs.readFileSync(file, 'utf8') }));
  const publicPaths = new Set(images.map(file => '/' + relative(file)));
  const names = new Map();
  for (const file of images) names.set(path.basename(file), (names.get(path.basename(file)) || 0) + 1);
  const missing = [];
  for (const source of sources) {
    for (const match of source.text.matchAll(/\/assets\/(?:img|templates)\/[\w./-]+\.(?:png|jpe?g|webp|svg|gif|avif|ico)\b/gi)) {
      if (!publicPaths.has(match[0])) missing.push({ source: source.path, image: match[0] });
    }
  }
  const byHash = new Map();
  const inventory = images.map(file => {
    const bytes = fs.readFileSync(file), name = path.basename(file), image = relative(file);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const group = byHash.get(hash) || []; group.push(image); byHash.set(hash, group);
    // Incluye nombres usados en path.join y catálogos dinámicos, no solo URLs.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fileName = new RegExp(`(^|[^\\w.-])${escaped}(?=$|[^\\w.-])`);
    const references = sources.filter(source => source.text.includes(image)
      || (names.get(name) === 1 && fileName.test(source.text))).map(source => source.path);
    return { path: image, bytes: bytes.length, sha256: hash, references };
  });
  return { images: inventory, sourceCount: sources.length, totalBytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
    unused: inventory.filter(item => !item.references.length).map(item => item.path), missing,
    duplicates: [...byHash.values()].filter(group => group.length > 1) };
}

export function validateAssets(result) {
  const problems = [];
  if (result.unused.length) problems.push('Imágenes sin referencias: ' + result.unused.join(', '));
  if (result.missing.length) problems.push('Referencias a imágenes ausentes: ' + result.missing.map(item => item.image).join(', '));
  if (result.duplicates.length) problems.push('Copias de imagen idénticas: ' + result.duplicates.map(group => group.join(' = ')).join('; '));
  if (problems.length) throw Error(problems.join('\n'));
}
