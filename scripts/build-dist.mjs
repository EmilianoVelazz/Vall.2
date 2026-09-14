// Genera dist/ para el despliegue.
//
// La versión anterior de este script daba por hecho que el sitio era "HTML/CSS/JS
// plano" y NO compilaba el frontend de React: dist/ salía sin bundle y con el
// index.html legacy en la raíz, así que el despliegue servía el sitio HTML
// antiguo por mucho que el trabajo estuviera hecho en React.
//
// Ahora dist/ es la app de React más /assets, de donde los componentes cargan en
// runtime el CSS de cada sección y los motores de datos heredados.
//
// api/ y backend/ NO se copian: Vercel las detecta como función serverless desde
// la raíz del repo, independientemente de este directorio.
import { existsSync, rmSync, cpSync, copyFileSync, readdirSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const FRONT = path.join(ROOT, 'frontend');
const FRONT_DIST = path.join(FRONT, 'dist');

// Estáticos heredados. `pages` desapareció al migrar Finanzas: ya no queda
// ninguna ruta que cargue un .html en tiempo de ejecución, así que copiarlo
// solo habría servido para publicar marcado muerto.
//
// `assets` sigue siendo imprescindible: los .jsx no incluyen ni el CSS de las
// secciones ni los motores de datos (finanzas-page.js, finanzas-favro.js,
// live-engine.js, data-service.js); los cargan desde /assets en runtime.
const DIRS = ['assets'];
const FILES = ['inicio.html'];

// Ya no hace falta excluir imágenes: los seis .jpg/.png pesados que duplicaban
// a sus .webp se borraron del repositorio (26,5 MB), así que no hay nada que
// podar. Se deja el mecanismo por si vuelve a colarse un original sin optimizar.
const IMG_EXCLUDE = new Set([]);

// ── 1. Compilar React ─────────────────────────────────────────────────────────
// Se invoca el binario de Vite directamente: en Windows, spawn de npm.cmd falla
// con EINVAL en las versiones recientes de Node.
// frontend/node_modules está en .gitignore, así que en un clon limpio —y en el
// contenedor de Vercel— no existe. Sin esta instalación el build se detenía ahí:
// en local pasaba desapercibido porque la carpeta ya estaba.
const viteBin = path.join(FRONT, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBin)) {
    console.log('[build-dist] Instalando dependencias de frontend/…');
    // En Windows, spawn de npm.cmd sin shell falla con EINVAL en Node reciente,
    // así que se lanza a través del shell. El comando va como una sola cadena:
    // combinar shell con un array de argumentos está deprecado en Node.
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const install = spawnSync(`${npmCmd} install --include=dev --no-audit --no-fund`, {
        cwd: FRONT,
        stdio: 'inherit',
        shell: true,
    });
    if (install.status !== 0 || !existsSync(viteBin)) {
        console.error('[build-dist] No se pudieron instalar las dependencias de frontend/.');
        process.exit(install.status || 1);
    }
}

console.log('[build-dist] Compilando el frontend de React…');
const build = spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: FRONT,
    stdio: 'inherit',
});
if (build.status !== 0) {
    console.error('[build-dist] La compilación de React falló; no se genera dist/.');
    process.exit(build.status || 1);
}

// ── 2. Ensamblar dist/ ────────────────────────────────────────────────────────
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });

for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (existsSync(src)) cpSync(src, path.join(DIST, dir), { recursive: true });
}
for (const file of FILES) {
    const src = path.join(ROOT, file);
    if (existsSync(src)) copyFileSync(src, path.join(DIST, file));
}

// La app de React va al final para que su index.html sea el que responde en "/".
// El index.html legacy (el login en HTML) se queda fuera a propósito: ese login
// ahora es un componente React y servirlo duplicaría la pantalla de acceso.
if (!existsSync(FRONT_DIST)) {
    console.error('[build-dist] vite build no produjo frontend/dist.');
    process.exit(1);
}
cpSync(FRONT_DIST, DIST, { recursive: true });

// ── 3. Podar imágenes pesadas ─────────────────────────────────────────────────
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

const bundle = path.join(DIST, 'vn-app');
console.log(`\n[build-dist] dist/ listo: React${existsSync(bundle) ? ' (vn-app/)' : ''} + estáticos heredados.`);
if (removed) console.log(`[build-dist] ${removed} imágenes pesadas excluidas (~27 MB ahorrados).`);
