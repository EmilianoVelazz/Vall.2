'use strict';

// No carga credenciales reales ni consulta la base: los cuerpos vacíos se
// rechazan antes de buscar perfiles. Solo confía en las URLs del despliegue.
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
process.env.JWT_SECRET = 'fixture-branch-origin-only';
process.env.ALLOWED_ORIGINS = 'https://app.example.test';
process.env.PRODUCTION_URL = 'https://app.example.test';
process.env.SPA_ORIGIN = '';
process.env.VERCEL_URL = 'app-deployment-team.vercel.app';
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'app.vercel.app';
process.env.VERCEL_BRANCH_URL = 'app-git-main-team.vercel.app';

const app = require('../backend/auth-server');
async function main() {
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const url = `http://127.0.0.1:${server.address().port}/api/login`;
    try {
        for (const origin of ['https://app.example.test', 'https://app.vercel.app',
            'https://app-deployment-team.vercel.app', 'https://app-git-main-team.vercel.app']) {
            const preflight = await fetch(url, { method: 'OPTIONS', headers: {
                Origin: origin, 'Access-Control-Request-Method': 'POST',
            } });
            assert.equal(preflight.status, 204);
            assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
            const response = await fetch(url, { method: 'POST', headers: {
                Origin: origin, 'Content-Type': 'application/json',
            }, body: '{}' });
            assert.equal(response.status, 400);
            assert.equal((await response.json()).error, 'Credenciales requeridas.');
        }
        for (const origin of ['https://attacker.vercel.app', 'https://app-git-other-team.vercel.app',
            'http://app-git-main-team.vercel.app', 'https://app-git-main-team.vercel.app.attacker.test',
            'http://127.0.0.1:5273']) {
            const response = await fetch(url, { method: 'POST', headers: {
                Origin: origin, 'Content-Type': 'application/json',
            }, body: '{}' });
            assert.equal(response.status, 403);
            assert.equal(response.headers.get('access-control-allow-origin'), null);
        }
        console.log('OK: producción, despliegue y rama admitidos; cinco orígenes ajenos rechazados.');
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
