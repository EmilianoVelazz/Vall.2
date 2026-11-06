'use strict';
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-mail-configuration-secret';
process.env.GMAIL_USER = 'sender@example.invalid';
process.env.GMAIL_PASS = 'fixture-only';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY'])process.env[key]='';
require('../backend/services/user-profile-store').findById=async id=>({id,email:'owner@example.invalid',active:true,credentialVersion:0});
delete process.env.USER_PASSWORD;
const nodemailer = require('nodemailer');
let transports = 0, mode = 'ok', sent = 0;
nodemailer.createTransport = options => {
    transports++;
    assert.equal(options.service, 'gmail');
    assert(options.connectionTimeout <= 10000 && options.socketTimeout <= 45000);
    return { sendMail: async message => { if(mode==='rejected') return {accepted:[],rejected:[message.to]};if (mode !== 'ok') throw Object.assign(Error('Private upstream response must stay private'), { code: mode }); sent++; return {accepted:[message.to],messageId:'fixture'}; } };
};
const { reportMailStatus, mailTransport, mailFailure, mailAutomationEnabled } = require('../backend/services/report-mailer');
assert.equal(mailAutomationEnabled({}), true);
assert.equal(mailAutomationEnabled({ VALL_REPORT_EMAIL_AUTOMATION_ENABLED: 'false' }), false);
assert.deepEqual(reportMailStatus({}), { configured: false, missing: ['GMAIL_USER', 'GMAIL_PASS'] });
assert.deepEqual(reportMailStatus({ GMAIL_USER: '   ', GMAIL_PASS: ' \n ' }).missing, ['GMAIL_USER', 'GMAIL_PASS']);
assert.deepEqual(reportMailStatus({ GMAIL_USER: 'sender@example.invalid', GMAIL_PASS: '' }).missing, ['GMAIL_PASS']);
assert.equal(mailTransport({}), null); assert.equal(transports, 0);
const configured = { GMAIL_USER: ' sender@example.invalid ', GMAIL_PASS: 'abcd efgh ijkl mnop' };
const originalTransport = nodemailer.createTransport;
nodemailer.createTransport = options => { assert.deepEqual(options.auth, { user: 'sender@example.invalid', pass: 'abcdefghijklmnop' }); return {}; };
assert(mailTransport(configured)); nodemailer.createTransport = originalTransport;
assert(!JSON.stringify(reportMailStatus(configured)).includes('sender@example.invalid'));
assert(!JSON.stringify(reportMailStatus(configured)).includes('mnop'));
for (const [upstream, code] of [['EAUTH', 'REPORT_EMAIL_AUTH_FAILED'], ['ETIMEDOUT', 'REPORT_EMAIL_UNAVAILABLE'], ['EENVELOPE', 'REPORT_EMAIL_DELIVERY_FAILED']]) {
    const error = mailFailure({ code: upstream, message: 'Private upstream response' }, configured);
    assert.equal(error.code, code); assert(!error.message.includes('Private upstream response'));
}

const express = require('express'), jwt = require('jsonwebtoken'), router = require('../backend/routes/export');
async function main() {
    const paused = require('../backend/services/report-scheduled-delivery').createScheduledReportDelivery({ enabled: () => false, store: { due: () => { throw Error('Una sesión pausada no debe consultar la cola ni enviar'); } } });
    assert.deepEqual(await paused(), { due: 0, sent: 0, errors: 0, deferred: 0, paused: true });
    const app = express(); app.use('/api', router);
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const report = { collection: 'finance', key: 'fx', title: 'Correo de prueba', generatedAt: '2026-10-14T14:00:00Z', summary: 'Datos sintéticos para revisar la entrega.', sections: [], metrics: [], visuals: [], tables: [], takeaways: [], watchlist: [], sources: [], sourceLinks: [] };
    report.sourceSnapshot={fxHistories:[{label:'USD/MXN',baseCurrency:'USD',quoteCurrency:'MXN',unit:'MXN por 1 USD',series:[{date:'2026-10-13',value:20},{date:'2026-10-14',value:20.1}]}]};
    const body = { title: report.title, content: report.summary, executiveReport: report, recipientEmail: 'recipient@example.invalid' };
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ sub: 'mail-config-fixture', email: 'owner@example.invalid' }, process.env.JWT_SECRET) };
    const post = () => fetch(`http://127.0.0.1:${server.address().port}/api/report-email`, { method: 'POST', headers, body: JSON.stringify(body) });
    try {
        assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/report-email/status`)).status,401);
        delete process.env.GMAIL_USER; delete process.env.GMAIL_PASS;
        const emptyStatus=await (await fetch(`http://127.0.0.1:${server.address().port}/api/report-email/status`,{headers})).json();
        assert.equal(emptyStatus.mail.configured,false);assert.deepEqual(emptyStatus.mail.missing,['GMAIL_USER','GMAIL_PASS']);assert.equal(transports,0);
        let response = await post(), payload = await response.json(); assert.equal(response.status, 503); assert.equal(payload.code, 'REPORT_EMAIL_NOT_CONFIGURED'); assert(payload.error.includes('GMAIL_USER') && payload.error.includes('GMAIL_PASS')); assert.equal(transports, 0);
        process.env.GMAIL_USER = 'sender@example.invalid';
        response = await post(); payload = await response.json(); assert.equal(payload.code, 'REPORT_EMAIL_NOT_CONFIGURED'); assert(payload.error.includes('GMAIL_PASS')); assert.equal(transports, 0);
        process.env.GMAIL_PASS = 'fixture-only';
        const readyResponse=await fetch(`http://127.0.0.1:${server.address().port}/api/report-email/status`,{headers}),readyStatus=await readyResponse.json();
        assert.equal(readyResponse.headers.get('X-VALL-Mail-API'),'2');assert.equal(readyStatus.mail.configured,true);assert.equal(readyStatus.mail.environment,'local');assert.equal(readyStatus.accountEmail,'owner@example.invalid');assert(!JSON.stringify(readyStatus).includes('fixture-only'));assert.equal(transports,0);
        for (const [failure, code] of [['EAUTH', 'REPORT_EMAIL_AUTH_FAILED'], ['ETIMEDOUT', 'REPORT_EMAIL_UNAVAILABLE'],['rejected','REPORT_EMAIL_DELIVERY_FAILED']]) {
            mode = failure; response = await post(); payload = await response.json(); assert.equal(response.status, code==='REPORT_EMAIL_DELIVERY_FAILED'?502:503); assert.equal(payload.code, code); assert(!payload.error.includes('Private upstream')); assert.equal(sent, 0);
        }
        mode = 'ok'; response = await post(); assert.equal(response.status, 200); assert.equal(sent, 1);
        const cancelled=await router._test.deliverExecutiveEmail({recipient:'recipient@example.invalid',title:report.title,executive:report,beforeSend:async()=>false});
        assert.equal(cancelled.skipped,true);assert.equal(sent,1,'La comprobación final tras preparar el PDF evita enviar una programación cancelada');
        console.log('Report mail configuration: OK · variables faltantes, espacios, autenticación, conexión y entrega simulada; cero correos reales');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
