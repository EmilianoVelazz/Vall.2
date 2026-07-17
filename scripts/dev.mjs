// Lanzador de desarrollo VALLNews.
// Arranca el backend Express (:3001) y el frontend React/Vite (:5173) juntos,
// con un solo comando `npm run dev`. Abre http://localhost:5173 en el navegador.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Vite se ejecuta con `node` directamente (no vía npm.cmd) para evitar el error
// spawn EINVAL que Node moderno lanza al ejecutar archivos .cmd en Windows.
const viteBin = path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');

const procs = [];

function run(name, color, command, args, cwd) {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    const tag = `\x1b[${color}m[${name}]\x1b[0m`;
    const pipe = (stream, isErr) => {
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
            for (const line of chunk.split(/\r?\n/)) {
                if (line.trim() !== '') process[isErr ? 'stderr' : 'stdout'].write(`${tag} ${line}\n`);
            }
        });
    };
    pipe(child.stdout, false);
    pipe(child.stderr, true);
    child.on('exit', (code) => {
        console.log(`${tag} terminó (código ${code}). Cerrando todo…`);
        shutdown();
    });
    procs.push(child);
    return child;
}

function shutdown() {
    for (const p of procs) {
        try { p.kill(); } catch { /* ya cerrado */ }
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('\n  VALLNews · arrancando backend (:3001) + React (:5173)…');
console.log('  Abre  \x1b[36mhttp://localhost:5173\x1b[0m  en tu navegador.');
console.log('  Ctrl+C para detener ambos.\n');

// 33 = amarillo (backend), 35 = magenta (frontend)
run('backend', '33', 'node', ['backend/server.js'], root);
run('react', '35', 'node', [viteBin], path.join(root, 'frontend'));
