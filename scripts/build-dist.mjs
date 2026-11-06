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
import { existsSync, cpSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertRetiredFilesAbsent } from './lib/retired-files.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const FRONT = path.join(ROOT, 'frontend');
assertRetiredFilesAbsent(ROOT);

// Revisar también el grafo activo antes de publicar: el registro de archivos
// retirados por sí solo no detecta módulos abandonados en una edición nueva.
const audit = spawnSync(process.execPath, [path.join(ROOT, 'scripts/audit-legacy.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
});
if (audit.status !== 0) {
    console.error('[build-dist] La revisión de referencias falló; no se genera dist/.');
    process.exit(audit.status || 1);
}
const assetAudit=spawnSync(process.execPath,[path.join(ROOT,'scripts/audit-assets.mjs')],{cwd:ROOT,stdio:'inherit'});
if(assetAudit.status!==0)process.exit(assetAudit.status || 1);

// Estáticos heredados. `pages` desapareció al migrar Finanzas: ya no queda
// ninguna ruta que cargue un .html en tiempo de ejecución, así que copiarlo
// solo habría servido para publicar marcado muerto.
//
// `assets` sigue siendo imprescindible: los .jsx no incluyen ni el CSS de las
// secciones ni los motores de datos (finanzas-page.js, finanzas-favro.js,
// live-engine.js, data-service.js); los cargan desde /assets en runtime.
const DIRS = ['assets'];

// ── 1. Compilar React ─────────────────────────────────────────────────────────
// Se invoca el binario de Vite directamente: en Windows, spawn de npm.cmd falla
// con EINVAL en las versiones recientes de Node.
// frontend/node_modules está en .gitignore, así que en un clon limpio —y en el
// contenedor de Vercel— no existe. Sin esta instalación el build se detenía ahí:
// en local pasaba desapercibido porque la carpeta ya estaba.
const viteBin = path.join(FRONT, 'node_modules', 'vite', 'bin', 'vite.js');
// Vercel restaura node_modules del despliegue anterior. Que Vite exista no
// asegura que coincida con el lockfile: también se deben instalar las nuevas
// dependencias (Anime.js y Three.js) y las actualizaciones de seguridad.
if (process.env.VERCEL || !existsSync(viteBin)) {
    console.log('[build-dist] Instalando dependencias de frontend/…');
    // En Windows, spawn de npm.cmd sin shell falla con EINVAL en Node reciente,
    // así que se lanza a través del shell. El comando va como una sola cadena:
    // combinar shell con un array de argumentos está deprecado en Node.
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const install = spawnSync(`${npmCmd} ci --include=dev --no-audit --no-fund`, {
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

// ── 2. Completar la misma salida generada por Vite ────────────────────────────
for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (existsSync(src)) cpSync(src, path.join(DIST, dir), { recursive: true });
}
// La hoja móvil se integra en el bundle de React desde frontend/src/main.jsx.
// Dejar además la copia estática publicaría dos versiones del mismo CSS.
const mobileCssCopy = path.join(DIST, 'assets', 'css', 'mobile-experience.css');
if (existsSync(mobileCssCopy)) unlinkSync(mobileCssCopy);

// El index de React es la entrada publicada; el index legacy queda fuera.
if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('[build-dist] vite build no produjo dist/index.html.');
    process.exit(1);
}

const bundle = path.join(DIST, 'vn-app');
console.log(`\n[build-dist] dist/ listo: React${existsSync(bundle) ? ' (vn-app/)' : ''} + estáticos heredados.`);
