// Genera dist/ para Vercel: la app React (frontend/) como sitio principal +
// los assets estáticos legacy (css, js, img, Logotipos) + las páginas legacy
// que LegacyPage aún monta en runtime (finanzas, mercados, geopolitica, mexico,
// mercado_proteinas). api/ y backend/ NO se copian: Vercel las detecta como
// función serverless desde la raíz. El "Output Directory" del proyecto sigue
// siendo "dist".
import { existsSync, rmSync, cpSync, copyFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const FRONTEND = path.join(ROOT, 'frontend');
const FRONTEND_DIST = path.join(FRONTEND, 'dist');

// ── 1. Construir la app React (Vite) ────────────────────────────────────────
console.log('[build-dist] Instalando dependencias del frontend…');
// --include=dev es CLAVE: en Vercel NODE_ENV=production haría que npm omitiera
// las devDependencies (vite, @vitejs/plugin-react) y el build fallaría.
execSync('npm install --include=dev', { cwd: FRONTEND, stdio: 'inherit' });
console.log('[build-dist] Compilando frontend (vite build)…');
execSync('npm run build', { cwd: FRONTEND, stdio: 'inherit' });

// ── 2. Reiniciar dist/ ──────────────────────────────────────────────────────
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// ── 3. App React como raíz del sitio (index.html + assets/) ─────────────────
cpSync(FRONTEND_DIST, DIST, { recursive: true });

// ── 4. Assets estáticos legacy que la app React referencia en runtime ───────
const ASSET_DIRS = ['css', 'js', 'img', 'Logotipos'];
for (const dir of ASSET_DIRS) {
  const src = path.join(ROOT, dir);
  if (existsSync(src)) cpSync(src, path.join(DIST, dir), { recursive: true });
}

// ── 5. Páginas legacy que LegacyPage trae por fetch ─────────────────────────
// Ya no quedan: TODAS las páginas se migraron a rutas React. Si en el futuro
// alguna vuelve a montarse con LegacyPage, añadir su carpeta aquí.
const LEGACY_PAGE_DIRS = [];
for (const dir of LEGACY_PAGE_DIRS) {
  const src = path.join(ROOT, dir);
  if (existsSync(src)) cpSync(src, path.join(DIST, dir), { recursive: true });
}

// ── 6. Archivos sueltos referenciados ───────────────────────────────────────
for (const file of ['periodico.png']) {
  const src = path.join(ROOT, file);
  if (existsSync(src)) copyFileSync(src, path.join(DIST, file));
}

console.log('[build-dist] dist/ generado: React (SPA) + assets legacy + páginas LegacyPage.');
