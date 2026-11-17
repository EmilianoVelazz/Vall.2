'use strict';
// Fictional credentials and a virtual .env; no real account or file is changed.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'fixture-only-admin-password-deployment-32-bytes';
process.env.VALL_AUTH_EMAIL = 'admin-password@example.invalid';
process.env.VALL_AUTH_PASSWORD = '';
process.env.USER_PASSWORD = 'startup-fixture';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED = 'false';
delete process.env.VERCEL;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookies = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const profiles = require('../backend/services/user-profile-store');
const admin = { id: 'admin-deployment-fixture', email: process.env.VALL_AUTH_EMAIL, role: 'admin', active: true, credentialVersion: 0 };
profiles.findById = async () => ({ ...admin });
profiles.upsertAdmin = async () => ({ ...admin });
profiles.markLogin = async () => true;
const envPath = path.resolve(__dirname, '../backend/.env');
const read = fs.readFileSync, write = fs.writeFileSync;
let virtualEnv = '', writes = 0, server;
fs.readFileSync = function (file, ...args) {
    return typeof file === 'string' && path.resolve(file) === envPath ? virtualEnv : read.call(this, file, ...args);
};
fs.writeFileSync = function (file, data, ...args) {
    if (typeof file === 'string' && path.resolve(file) === envPath) { virtualEnv = String(data); writes++; return; }
    return write.call(this, file, data, ...args);
};
async function main() {
    // Load in test mode so the revocation store is isolated in memory.
    process.env.USER_PASSWORD = await bcrypt.hash('fixture-original-password', 4);
    const injected = process.env.USER_PASSWORD;
    const { router } = require('../backend/routes/auth');
    const app = express(); app.use(express.json()); app.use(cookies()); app.use('/api', router);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    const token = jwt.sign({ sub: admin.id, email: admin.email, role: 'admin', credentialVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const change = async () => {
        const response = await fetch(base + '/change-password', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'fixture-original-password', newPassword: 'fixture-new-password' }), signal: AbortSignal.timeout(5000) });
        return { status: response.status, data: await response.json() };
    };
    for (const hosting of ['docker', 'vercel', 'managed-variable']) {
        process.env.NODE_ENV = hosting === 'docker' ? 'production' : 'test';
        if (hosting === 'vercel') process.env.VERCEL = '1'; else delete process.env.VERCEL;
        process.env.VALL_AUTH_PASSWORD = hosting === 'managed-variable' ? injected : '';
        const result = await change();
        assert.equal(result.status, 409, hosting);
        assert.equal(result.data.code, 'PASSWORD_MANAGED_BY_DEPLOYMENT');
        assert.equal(writes, 0, 'Managed credentials must never be written into an ephemeral .env');
        assert.equal(process.env.USER_PASSWORD, injected);
    }
    // A plaintext production login must also leave hosting configuration intact.
    process.env.NODE_ENV = 'production'; process.env.VALL_AUTH_PASSWORD = '';
    process.env.USER_PASSWORD = 'fixture-original-password';
    const login = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'fixture-original-password' }), signal: AbortSignal.timeout(5000) });
    assert.equal(login.status, 200); await login.text(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes, 0, 'Production login cannot migrate hosting configuration into a disposable file');
    assert.equal(process.env.USER_PASSWORD, 'fixture-original-password');
    // Local development retains its explicit file-based change behavior.
    process.env.NODE_ENV = 'test'; process.env.USER_PASSWORD = injected;
    assert.equal((await change()).status, 200);
    assert.equal(writes, 1);
    assert(await bcrypt.compare('fixture-new-password', process.env.USER_PASSWORD));
    assert(virtualEnv.includes(process.env.USER_PASSWORD));
    console.log('Admin passwords: Docker, Vercel and managed variables reject ephemeral changes; production login does not write credentials; local development changes persist.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    fs.readFileSync = read; fs.writeFileSync = write;
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
