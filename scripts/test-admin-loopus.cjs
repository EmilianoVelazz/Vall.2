'use strict';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const cookieParser = require('cookie-parser');

process.env.JWT_SECRET = 'test-admin-loopus-only-fixture-at-least-32-bytes';
process.env.VERCEL = '1';
process.env.VALL_AUTH_EMAIL = 'admin-loopus@example.invalid';
process.env.VALL_AUTH_PASSWORD = bcrypt.hashSync('Admin-loopus-92', 4);

const store = require('../backend/services/user-profile-store');
const mlPersistence = require('../backend/ai/ml-persistence');

const regularUser = {
    id: crypto.randomUUID(),
    email: 'user-loopus@example.invalid',
    role: 'user',
    active: true,
    passwordHash: bcrypt.hashSync('User-loopus-92', 4),
    credentialVersion: 0,
    displayName: 'Usuario Regular',
    preferences: {},
};
const adminUser = {
    id: crypto.randomUUID(),
    email: process.env.VALL_AUTH_EMAIL,
    role: 'admin',
    active: true,
    displayName: 'Administrador Loopus',
    preferences: {},
};

store.findByEmail = async email => [adminUser, regularUser].find(u => u.email === email) || null;
store.findById = async id => [adminUser, regularUser].find(u => u.id === id) || null;
store.upsertAdmin = async () => adminUser;
store.markLogin = async () => {};

const proposals = [
    {
        id: 1,
        fingerprint: 'fp-1',
        condition_trigger: 'precio canal cerdo mexico',
        learned_rule: 'Citar fecha SNIIM y etapa comercial.',
        confidence_score: 0.92,
        topic: 'porcino',
        source_provider: 'sniim',
        status: 'pending_human_review',
        review_notes: null,
        reviewed_at: null,
        created_at: '2026-11-17T10:00:00.000Z',
    },
    {
        id: 2,
        fingerprint: 'fp-2',
        condition_trigger: 'bonos tesoro ee uu',
        learned_rule: 'Mantener unidades en pb y plazo exacto.',
        confidence_score: 0.88,
        topic: 'bonos',
        source_provider: 'treasury',
        status: 'approved',
        review_notes: 'Previamente validada',
        reviewed_at: '2026-11-17T11:00:00.000Z',
        created_at: '2026-11-17T09:00:00.000Z',
    },
];

mlPersistence.listRuleProposals = async ({ status = null, limit = 50 } = {}) => {
    const filtered = status ? proposals.filter(p => p.status === status) : proposals;
    return filtered.slice(0, Number(limit) || 50);
};
mlPersistence.reviewRuleProposal = async (id, { status, reviewNotes = '' } = {}) => {
    if (!['approved', 'rejected', 'pending_human_review'].includes(status)) {
        throw Object.assign(new Error('Estado inválido'), { status: 400 });
    }
    const row = proposals.find(p => p.id === Number(id));
    if (!row) throw Object.assign(new Error('Propuesta no encontrada'), { status: 404 });
    row.status = status;
    row.review_notes = reviewNotes || null;
    row.reviewed_at = new Date().toISOString();
    return { ...row };
};

const { router: authRouter } = require('../backend/routes/auth');

async function main() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', authRouter);

    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const call = (path, body, cookie) => fetch(base + path, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const login = async (email, password) => {
            const res = await call('/login', { email, password });
            assert.equal(res.status, 200);
            return res.headers.get('set-cookie').split(';')[0];
        };

        const userCookie = await login(regularUser.email, 'User-loopus-92');
        const adminCookie = await login(adminUser.email, 'Admin-loopus-92');

        // 1. Sin autenticar -> 401
        assert.equal((await call('/admin/loopus-proposals')).status, 401);
        assert.equal((await call('/admin/loopus-proposals/1/review', { status: 'approved' })).status, 401);

        // 2. Usuario no administrador -> 403
        assert.equal((await call('/admin/loopus-proposals', null, userCookie)).status, 403);
        assert.equal((await call('/admin/loopus-proposals/1/review', { status: 'approved' }, userCookie)).status, 403);

        // 3. Validación de parámetros -> 400 / 404
        assert.equal((await call('/admin/loopus-proposals/abc/review', { status: 'approved' }, adminCookie)).status, 400);
        assert.equal((await call('/admin/loopus-proposals/1/review', { status: 'invalid_state' }, adminCookie)).status, 400);
        assert.equal((await call('/admin/loopus-proposals/999/review', { status: 'approved' }, adminCookie)).status, 404);

        // 4. Administrador lista pendientes y aprueba propuesta 1
        const listPending = await call('/admin/loopus-proposals?status=pending_human_review', null, adminCookie);
        assert.equal(listPending.status, 200);
        const pendingBody = await listPending.json();
        assert.equal(pendingBody.proposals.length, 1);
        assert.equal(pendingBody.proposals[0].id, 1);

        const approveRes = await call('/admin/loopus-proposals/1/review', {
            status: 'approved',
            reviewNotes: 'Validado en prueba RBAC',
        }, adminCookie);
        assert.equal(approveRes.status, 200);
        const approveBody = await approveRes.json();
        assert.equal(approveBody.proposal.status, 'approved');
        assert.equal(approveBody.proposal.review_notes, 'Validado en prueba RBAC');

        const afterPending = await (await call('/admin/loopus-proposals?status=pending_human_review', null, adminCookie)).json();
        assert.equal(afterPending.proposals.length, 0);

        console.log('AdminLoopus RBAC: OK · 401 anónimo, 403 no-admin, validación 400/404 y revisión 200 verificados.');
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
