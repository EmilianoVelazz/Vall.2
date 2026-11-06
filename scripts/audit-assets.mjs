import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAssets, validateAssets } from './lib/asset-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = inspectAssets(root);
fs.mkdirSync(path.join(root, 'output'), { recursive: true });
fs.writeFileSync(path.join(root, 'output/auditoria-imagenes.json'), JSON.stringify(result, null, 2));
validateAssets(result);
console.log(`Imágenes: ${result.images.length} en uso, sin copias idénticas, referencias rotas ni archivos sin referencias detectados.`);
