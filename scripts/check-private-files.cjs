'use strict';
// Solicitudes de lectura locales. No imprime cuerpos, claves ni archivos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..').replace(/\\/g, '/');
const forbidden = [/^(?:JWT_SECRET|SUPABASE_SERVICE_ROLE_KEY|GMAIL_PASS|VALL_AUTH_PASSWORD|USER_PASSWORD)\s*=/m,
    /\[remote\s+"origin"\]/, /const JWT_SECRET = process\.env\.JWT_SECRET/];
async function main() {
    const checks = [];
    for (const base of ['http://127.0.0.1:5273', 'http://127.0.0.1:3101']) {
        const routes = ['/.env', '/.env.local', '/backend/.env', '/.git/config', '/backend/routes/auth.js'];
        if (base.endsWith(':5273')) routes.push(`/@fs/${root}/.env.local`, `/@fs/${root}/backend/routes/auth.js`);
        for (const route of routes) {
            const response = await fetch(base + route, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
            const body = await response.text();
            assert(!forbidden.some(pattern => pattern.test(body)), 'Se detectó posible exposición de un archivo privado.');
            checks.push({ base, route, status: response.status, privateContentDetected: false });
        }
    }
    fs.writeFileSync(path.resolve(__dirname, '../output/archivos-privados-2026-10-22.json'), JSON.stringify({ checks }, null, 2));
    console.log(`${checks.length} lecturas locales: sin contenido privado detectado. Los cuerpos no se guardan.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
