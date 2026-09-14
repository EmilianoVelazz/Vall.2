/*
 * Arranca backend (:3101) y React/Vite (:5273) juntos.
 *
 * Existe porque `npm run dev` levantaba solo Express, y Express sirve los .html
 * desde la raiz: al abrir el puerto del backend se ve el sitio antiguo y parece
 * que React no funciona. React vive en su propio puerto y consume el backend
 * por el proxy de Vite.
 *
 * Los puertos son PROPIOS de VALLNews y no los 3001/5173 de siempre: el 5173 lo
 * toma cualquier otro proyecto con Vite de esta maquina, y con los dos abiertos
 * a la vez el segundo saltaba de puerto solo, dejando el proxy apuntando a un
 * backend que no era el suyo. Este archivo es la unica fuente de los puertos:
 * se los pasa a Vite (VN_WEB_PORT/VN_API_PORT, que lee vite.config.js) y al
 * backend (PORT y SPA_ORIGIN, para que sus redirecciones a la SPA acierten).
 * Para moverlos sin tocar codigo: VN_API_PORT=... VN_WEB_PORT=... npm run dev
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

const PUERTO_API = Number(process.env.VN_API_PORT) || 3101;
const PUERTO_WEB = Number(process.env.VN_WEB_PORT) || 5273;

/* Avisa ANTES de lanzar nada. Si no, Express muere con un EADDRINUSE enterrado
   entre el ruido de arranque y Vite se queda solo, sirviendo una app cuyo proxy
   no responde: parece un fallo del codigo y es un puerto ocupado. */
async function ocupado(puerto) {
    const net = await import('net');
    return new Promise(resolve => {
        const s = net.createServer();
        s.once('error', err => resolve(err.code === 'EADDRINUSE'));
        s.once('listening', () => s.close(() => resolve(false)));
        s.listen(puerto, '127.0.0.1');
    });
}

if (!fs.existsSync(VITE)) {
    console.error('\n  No encuentro Vite. Instala las dependencias del frontend:\n');
    console.error('      cd frontend && npm install\n');
    process.exit(1);
}

const COLOR = { backend: '\x1b[36m', react: '\x1b[35m', reset: '\x1b[0m' };
const hijos = [];

function lanzar(nombre, args, cwd, env) {
    const p = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
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

for (const [puerto, quien] of [[PUERTO_API, 'backend'], [PUERTO_WEB, 'React']]) {
    if (await ocupado(puerto)) {
        console.error(`\n  El puerto ${puerto} (${quien}) ya esta ocupado por otro proceso.\n`);
        console.error('  Cierra lo que lo use, o elige otros puertos:\n');
        console.error('      $env:VN_API_PORT=3102; $env:VN_WEB_PORT=5274; npm run dev\n');
        process.exit(1);
    }
}

/* SPA_ORIGIN es a donde el backend redirige /finanzas y demas rutas de la SPA.
   Su valor por defecto vive en server.js y no conoce estos puertos, asi que hay
   que pasarselo: sin esto, esas redirecciones mandan al puerto de otro proyecto. */
lanzar('backend', [path.join(ROOT, 'backend', 'server.js')], ROOT, {
    PORT: String(PUERTO_API),
    SPA_ORIGIN: `http://localhost:${PUERTO_WEB}`,
});
lanzar('react', [VITE, '--port', String(PUERTO_WEB)], path.join(ROOT, 'frontend'), {
    VN_WEB_PORT: String(PUERTO_WEB),
    VN_API_PORT: String(PUERTO_API),
});

setTimeout(() => {
    console.log('');
    console.log('  ────────────────────────────────────────────────');
    console.log(`   Abre  \x1b[1mhttp://localhost:${PUERTO_WEB}\x1b[0m   ← React`);
    console.log(`   El :${PUERTO_API} es el backend; sirve los .html antiguos.`);
    console.log('  ────────────────────────────────────────────────');
    console.log('');
}, 2500);
