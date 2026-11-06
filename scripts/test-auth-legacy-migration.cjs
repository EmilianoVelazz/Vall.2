'use strict';
// Solo credenciales ficticias y un .env en memoria: no toca el archivo local,
// Supabase, proveedores de IA ni correo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const profiles = require('../backend/services/user-profile-store');
process.env.JWT_SECRET = 'test-only-legacy-migration-secret';
process.env.USER_EMAIL = 'legacy@example.invalid';
process.env.USER_PASSWORD = bcrypt.hashSync('startup-fixture', 4);
delete process.env.VALL_AUTH_EMAIL;
delete process.env.VALL_AUTH_PASSWORD;
delete process.env.VERCEL;
profiles.upsertAdmin = async email => ({ id: 'fixture-admin', email, role: 'admin', active: true });
profiles.markLogin = async () => {};
const { router } = require('../backend/routes/auth');
const envPath = path.resolve(__dirname, '../backend/.env');
const originalRead = fs.readFileSync, originalWrite = fs.writeFileSync, originalHash = bcrypt.hash;
let envFile = 'USER_PASSWORD=fixture\n', writes = 0, finishedHashes = 0;
let beforeHash = async () => {};
const hashedValues = [];
fs.readFileSync = function (file, ...args) {
    return typeof file === 'string' && path.resolve(file) === envPath ? envFile : originalRead.call(this, file, ...args);
};
fs.writeFileSync = function (file, data, ...args) {
    if (typeof file === 'string' && path.resolve(file) === envPath) { envFile = String(data); writes++; return; }
    return originalWrite.call(this, file, data, ...args);
};
bcrypt.hash = async (value, rounds) => {
    hashedValues.push(value);
    await beforeHash(value);
    const result = await originalHash(value, rounds);
    finishedHashes++;
    return result;
};
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', router);
const server = app.listen(0, '127.0.0.1');
async function until(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() >= deadline) throw new Error('La migración no terminó dentro del plazo de prueba');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    await new Promise(resolve => setImmediate(resolve));
}
(async () => {
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    await new Promise(resolve => setImmediate(resolve)); // Termina la comprobación de arranque.
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function login(email, password) {
        const response = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        assert.equal(response.status, 200);
        return response.headers.get('set-cookie').split(';')[0];
    }

    process.env.USER_PASSWORD = 'legacy-fixture';
    await login(process.env.USER_EMAIL, 'legacy-fixture');
    await until(() => writes === 1);
    assert(await bcrypt.compare('legacy-fixture', process.env.USER_PASSWORD));
    assert(envFile.includes(process.env.USER_PASSWORD));
    const afterLegacy = writes;
    await login(process.env.USER_EMAIL, 'legacy-fixture');
    assert.equal(writes, afterLegacy, 'Un hash ya migrado no se vuelve a escribir');

    process.env.VALL_AUTH_EMAIL = 'managed@example.invalid';
    process.env.VALL_AUTH_PASSWORD = 'managed-fixture';
    const previousLegacy = process.env.USER_PASSWORD;
    await login(process.env.VALL_AUTH_EMAIL, 'managed-fixture');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes, afterLegacy, 'La configuración moderna no escribe la variable antigua');
    assert.equal(process.env.USER_PASSWORD, previousLegacy);
    assert(!hashedValues.includes('managed-fixture'));

    delete process.env.VALL_AUTH_EMAIL;
    delete process.env.VALL_AUTH_PASSWORD;
    process.env.USER_PASSWORD = 'race-fixture';
    let release;
    beforeHash = value => value === 'race-fixture' ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    const cookie = await login(process.env.USER_EMAIL, 'race-fixture');
    assert.equal(typeof release, 'function');
    const changed = await fetch(`${base}/change-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ currentPassword: 'race-fixture', newPassword: 'new-password-fixture' }) });
    assert.equal(changed.status, 200);
    const changedHash = process.env.USER_PASSWORD, afterChange = writes, completed = finishedHashes;
    release();
    await until(() => finishedHashes > completed);
    assert.equal(process.env.USER_PASSWORD, changedHash, 'Una migración pendiente no revierte el cambio de contraseña');
    assert.equal(writes, afterChange);
    assert(await bcrypt.compare('new-password-fixture', changedHash));

    process.env.USER_PASSWORD = 'switch-fixture';
    beforeHash = value => value === 'switch-fixture' ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    await login(process.env.USER_EMAIL, 'switch-fixture');
    process.env.VALL_AUTH_PASSWORD = 'new-managed-fixture';
    const beforeSwitch = writes, completedSwitch = finishedHashes;
    release();
    await until(() => finishedHashes > completedSwitch);
    assert.equal(writes, beforeSwitch, 'Activar la configuración moderna cancela una migración antigua pendiente');
    assert.equal(process.env.USER_PASSWORD, 'switch-fixture');
    console.log('Auth migration: OK · acceso antiguo/moderno, hash existente, cambio concurrente y configuración cambiada; .env real intacto');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    fs.readFileSync = originalRead;
    fs.writeFileSync = originalWrite;
    bcrypt.hash = originalHash;
    server.closeAllConnections(); server.close();
});