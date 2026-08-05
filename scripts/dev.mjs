/*
 * Arranca backend (:3001) y React/Vite (:5173) juntos.
 *
 * Existe porque `npm run dev` levantaba solo Express, y Express sirve los .html
 * desde la raiz: al abrir :3001 se ve el sitio antiguo y parece que React no
 * funciona. React vive en :5173 y consume el backend por el proxy de Vite.
 *
 * Vite se lanza con `node frontend/node_modules/vite/bin/vite.js` y NO con
 * npm.cmd: spawn de npm.cmd falla con EINVAL en Node moderno sobre Windows.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VITE = path.join(ROOT, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');

if (!fs.existsSync(VITE)) {
    console.error('\n  No encuentro Vite. Instala las dependencias del frontend:\n');
    console.error('      cd frontend && npm install\n');
    process.exit(1);
}

const COLOR = { backend: '\x1b[36m', react: '\x1b[35m', reset: '\x1b[0m' };
const hijos = [];

function lanzar(nombre, args, cwd) {
    const p = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const marca = `${COLOR[nombre]}[${nombre}]${COLOR.reset} `;
    const pinta = (buf) => String(buf).split('\n').filter(Boolean).forEach(l => console.log(marca + l));
    p.stdout.on('data', pinta);
    p.stderr.on('data', pinta);
    p.on('exit', (code) => {
        console.log(`${marca}terminado (codigo ${code})`);
        cerrar();
    });
    hijos.push(p);
    return p;
}

let cerrando = false;
function cerrar() {
    if (cerrando) return;
    cerrando = true;
    for (const p of hijos) { try { p.kill(); } catch { /* ya murio */ } }
    process.exit(0);
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

lanzar('backend', [path.join(ROOT, 'backend', 'server.js')], ROOT);
lanzar('react', [VITE, '--port', '5173'], path.join(ROOT, 'frontend'));

setTimeout(() => {
    console.log('');
    console.log('  ────────────────────────────────────────────────');
    console.log('   Abre  \x1b[1mhttp://localhost:5173\x1b[0m   ← React');
    console.log('   El :3001 es el backend; sirve los .html antiguos.');
    console.log('  ────────────────────────────────────────────────');
    console.log('');
}, 2500);
