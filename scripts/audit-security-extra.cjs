'use strict';

// Pruebas locales de revocación y consentimiento. Todos los perfiles,
// contraseñas, proveedores y escrituras de estas pruebas son ficticios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { start } = require('./lib/security-fixture.cjs');
const profiles = require('../backend/services/user-profile-store');

async function main() {
    const fixture = await start();
    const checks = [];
    const current = { id: 'fixture-user', email: 'fixture-user@example.invalid', role: 'user', active: true,
        preferences: {}, trainingOptIn: true, passwordHash: await bcrypt.hash('fixture-password-old', 4) };
    let trainingWrites = 0;
    profiles.findById = async id => id === current.id ? { ...current } : null;
    profiles.updatePassword = async (_id, hash) => { current.passwordHash = hash; return true; };
    profiles.updateProfile = async (_id, patch) => { Object.assign(current, patch); return { ...current }; };
    profiles.recordTrainingQuery = async () => { trainingWrites++; return true; };
    const token = jwt.sign({ sub: current.id, email: current.email, role: 'user', trainingOptIn: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    async function request(route, body) {
        const response = await fetch(fixture.url + route, { headers, method: body === undefined ? 'GET' : 'POST',
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
        await response.text(); return response.status;
    }
    try {
        assert.equal(await request('/api/profile'), 200, 'La sesión ficticia debe funcionar antes de probar revocación');
        current.active = false;
        assert.equal(await request('/api/profile'), 404, 'El perfil reconoce que la cuenta está desactivada');
        const inactiveVerify = await request('/api/verify-token');
        const inactiveAi = await request('/api/ai-rich', { message: 'Analiza acciones de proteínas' });
        checks.push({ id: 'session-disabled-account', expected: '401/403 en verificación y operaciones protegidas',
            observed: { verifyTokenStatus: inactiveVerify, aiStatus: inactiveAi }, passed: [401, 403].includes(inactiveVerify) && [401, 403].includes(inactiveAi) });
        current.active = true;
        assert.equal(await request('/api/change-password', { currentPassword: 'fixture-password-old', newPassword: 'fixture-password-new' }), 200);
        assert.equal(await bcrypt.compare('fixture-password-new', current.passwordHash), true);
        const oldTokenStatus = await request('/api/verify-token');
        checks.push({ id: 'session-after-password-change', expected: '401/403 para el token emitido antes del cambio',
            observed: { oldTokenStatus }, passed: [401, 403].includes(oldTokenStatus) });
        assert.equal(await request('/api/profile', { trainingOptIn: false }), 200);
        assert.equal(current.trainingOptIn, false, 'El consentimiento actual debe estar desactivado');
        trainingWrites = 0;
        assert.equal(await request('/api/ai-rich', { message: 'Analiza acciones de proteínas' }), 200);
        checks.push({ id: 'training-opt-out-current-session', expected: '0 llamadas a guardar entrenamiento tras desactivar consentimiento',
            observed: { trainingWrites }, passed: trainingWrites === 0 });
        assert.equal(await request('/api/logout', {}), 200);
        const loggedOutTokenStatus = await request('/api/verify-token');
        checks.push({ id: 'session-after-logout', expected: '401/403 para una copia del token cerrado',
            observed: { loggedOutTokenStatus }, passed: [401, 403].includes(loggedOutTokenStatus) });
        const directory = path.resolve(__dirname, '../output/auditoria-codigo/seguridad-extra');
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'resultados.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
            environment: 'localhost; perfiles, contraseñas, IA y persistencia simulados; sin llamadas a producción',
            note: 'Un resultado false es un hallazgo pendiente, no una prueba aprobada. Las cuatro pruebas no representan cuatro vulnerabilidades independientes.', checks }, null, 2));
        console.log(JSON.stringify({ checks, failed: checks.filter(check => !check.passed).length }, null, 2));
        if (checks.some(check => !check.passed)) process.exitCode = 1;
    } finally { await fixture.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
