'use strict';
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Configuración ficticia en este proceso. Evita migraciones y conexiones de
// escritura: todas las solicitudes deben rechazarse antes de consultar perfiles.
process.env.JWT_SECRET = 'test-only-auth-validation-secret';
process.env.VERCEL = '1';
require('../backend/services/user-profile-store').findById=async()=>({id:'test-user',email:'demo@example.invalid',role:'user',active:true,credentialVersion:0});
const { router } = require('../backend/routes/auth');
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', router);
const token = jwt.sign({ sub: 'test-user', role: 'user', email: 'demo@example.invalid' }, process.env.JWT_SECRET);
const server = app.listen(0, '127.0.0.1');
(async () => {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const url = `http://127.0.0.1:${server.address().port}/api`;
    for (const body of [{ email: {}, password: 'demo' }, { email: 'demo@example.invalid', password: [] }, { email: ' ', password: 'demo' }]) {
        const res = await fetch(`${url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        assert.equal(res.status, 400, 'Una credencial mal formada debe ser 400, no un error interno');
        assert.equal((await res.json()).success, false);
    }
    for (const body of [{ currentPassword: [], newPassword: 'new-demo' }, { currentPassword: 'demo', newPassword: {} }]) {
        const res = await fetch(`${url}/change-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).success, false);
    }
    console.log('Auth input validation tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });
