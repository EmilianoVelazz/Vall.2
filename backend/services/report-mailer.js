'use strict';
const nodemailer = require('nodemailer');

function credentials(env) {
    return { user: String(env.GMAIL_USER || '').replace(/\0/g, '').trim().slice(0, 240), pass: String(env.GMAIL_PASS || '').replace(/\s+/g, '') };
}
function reportMailStatus(env = process.env) {
    const { user, pass } = credentials(env);
    const missing = [...(!user ? ['GMAIL_USER'] : []), ...(!pass ? ['GMAIL_PASS'] : [])];
    return { configured: missing.length === 0, missing };
}
function mailAutomationEnabled(env = process.env) {
    return !['false', '0', 'off'].includes(String(env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED || '').trim().toLowerCase());
}
function mailTransport(env = process.env) {
    if (!reportMailStatus(env).configured) return null;
    return nodemailer.createTransport({ service: 'gmail', auth: credentials(env), connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 45000 });
}
function mailFailure(error, env = process.env) {
    const { missing } = reportMailStatus(env);
    let code = 'REPORT_EMAIL_DELIVERY_FAILED', status = 502;
    let message = 'No se pudo entregar el correo. Inténtalo de nuevo más tarde.';
    if (missing.length) {
        code = 'REPORT_EMAIL_NOT_CONFIGURED'; status = 503;
        message = `El servidor no tiene configurado el correo: falta ${missing.join(' y ')}. En local, revisa backend/.env y reinicia el backend. En Vercel, revisa las variables del despliegue.`;
    } else if (error?.code === 'EAUTH') {
        code = 'REPORT_EMAIL_AUTH_FAILED'; status = 503;
        message = 'Gmail rechazó las credenciales del remitente. Revisa GMAIL_USER y la contraseña de aplicación GMAIL_PASS; después reinicia el backend o vuelve a desplegar.';
    } else if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(error?.code)) {
        code = 'REPORT_EMAIL_UNAVAILABLE'; status = 503;
        message = 'No se pudo conectar con el servidor de correo. Revisa la conexión del backend y vuelve a intentarlo.';
    }
    return Object.assign(new Error(message), { code, status });
}

module.exports = { reportMailStatus, mailTransport, mailFailure, mailAutomationEnabled };
