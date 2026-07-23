// Genera dist/ copiando los archivos estáticos del sitio (no hay bundler: es HTML/CSS/JS
// plano). El proyecto en Vercel tiene "Output Directory" fijado a "dist" desde la época de
// Vite; en vez de depender de que se cambie ese ajuste en el dashboard, generamos ese
// directorio nosotros mismos en cada build. api/ y backend/ NO se copian aquí: Vercel las
// detecta como función serverless desde la raíz del repo, independiente de este directorio.
import { existsSync, rmSync, cpSync, copyFileSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const DIRS = ['assets', 'pages'];
const FILES = ['index.html', 'inicio.html'];

// Imágenes pesadas que ya tienen versión .webp optimizada — no necesitan ir al build.
// Esto reduce ~27 MB del directorio dist/.
const IMG_EXCLUDE = new Set([
    'finanzas.jpg',  // 6.3 MB → finanzas.webp (67 KB)
    'geo.jpg',       // 2.4 MB → geo.webp (176 KB)
    'mercadoP.jpg',  // 85 KB  → mercadoP.webp (96 KB)
    'mercados.jpg',  // 242 KB → mercados.webp (115 KB)
    'mexico.jpg',    // 15.6 MB → mexico.webp (238 KB)
    'mexico2.png',   // 2.5 MB → mexico2.webp (220 KB)
]);

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });

for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (existsSync(src)) cpSync(src, path.join(DIST, dir), { recursive: true });
}
for (const file of FILES) {
    const src = path.join(ROOT, file);
    if (existsSync(src)) copyFileSync(src, path.join(DIST, file));
}

// Limpiar imágenes pesadas que no se usan (ya fueron copiadas por cpSync)
const imgDist = path.join(DIST, 'assets', 'img');
let removed = 0;
if (existsSync(imgDist)) {
    for (const file of readdirSync(imgDist)) {
        if (IMG_EXCLUDE.has(file)) {
            unlinkSync(path.join(imgDist, file));
            removed++;
        }
    }
}

console.log(`[build-dist] dist/ generado con ${DIRS.length} carpetas y ${FILES.length} archivos.`);
if (removed) console.log(`[build-dist] ${removed} imágenes pesadas excluidas (~27 MB ahorrados).`);
