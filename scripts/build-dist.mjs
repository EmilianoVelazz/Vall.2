// Genera dist/ copiando los archivos estáticos del sitio (no hay bundler: es HTML/CSS/JS
// plano). El proyecto en Vercel tiene "Output Directory" fijado a "dist" desde la época de
// Vite; en vez de depender de que se cambie ese ajuste en el dashboard, generamos ese
// directorio nosotros mismos en cada build. api/ y backend/ NO se copian aquí: Vercel las
// detecta como función serverless desde la raíz del repo, independiente de este directorio.
import { existsSync, rmSync, cpSync, copyFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const DIRS = ['css', 'js', 'img', 'Logotipos', 'configuracion', 'finanzas', 'geopolitica', 'mercados', 'mercado_proteinas', 'mexico'];
const FILES = ['index.html', 'inicio.html', 'periodico.png'];

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });

for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (existsSync(src)) cpSync(src, path.join(DIST, dir), { recursive: true });
}
for (const file of FILES) {
    const src = path.join(ROOT, file);
    if (existsSync(src)) copyFileSync(src, path.join(DIST, file));
}

console.log(`[build-dist] dist/ generado con ${DIRS.length} carpetas y ${FILES.length} archivos.`);
