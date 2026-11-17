'use strict';
const nodemailer = require('nodemailer');

function credentials(env) {
    return { user: String(env.GMAIL_USER || '').replace(/\0/g, '').trim().slice(0, 240), pass: String(env.GMAIL_PASS || '').replace(/\s+/g, '') };
}
// Proveedor transaccional opcional. Con RESEND_API_KEY y RESEND_FROM (un
// remitente de un dominio verificado en Resend) se evita el límite diario de
// Gmail; sin ellas se conserva el comportamiento anterior con Gmail.
function resendConfig(env) {
    const apiKey = String(env.RESEND_API_KEY || '').trim();
    const from = String(env.RESEND_FROM || '').replace(/\0/g, '').trim().slice(0, 240);
    return apiKey ? { apiKey, from } : null;
}
function reportMailStatus(env = process.env) {
    const resend = resendConfig(env);
    if (resend) {
        const missing = resend.from ? [] : ['RESEND_FROM'];
        return { configured: missing.length === 0, missing };
    }
    const { user, pass } = credentials(env);
    const missing = [...(!user ? ['GMAIL_USER'] : []), ...(!pass ? ['GMAIL_PASS'] : [])];
    return { configured: missing.length === 0, missing };
}
/** Dirección remitente del proveedor activo (vacía si no está configurado). */
function mailSender(env = process.env) {
    const resend = resendConfig(env);
    return resend ? resend.from : credentials(env).user;
}
function mailAutomationEnabled(env = process.env) {
    return !['false', '0', 'off'].includes(String(env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED || '').trim().toLowerCase());
}
// Adaptador con la misma interfaz que usa el resto del backend
// (sendMail → {accepted, rejected, messageId}).
function resendTransport({ apiKey }, fetchImpl = fetch) {
    return {
        async sendMail({ from, to, subject, html, text, headers, attachments = [] }) {
            const recipients = [].concat(to).filter(Boolean);
            const response = await fetchImpl('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(45000),
                body: JSON.stringify({
                    from, to: recipients, subject, html, text, headers,
                    attachments: attachments.map(item => ({
                        filename: item.filename,
                        content: Buffer.isBuffer(item.content) ? item.content.toString('base64') : String(item.content || ''),
                        ...(item.cid ? {content_id:item.cid} : {}),
                        ...(item.contentType ? {content_type:item.contentType} : {}),
                    })),
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const failure = new Error(body?.message || `Resend respondió ${response.status}.`);
                failure.code = response.status === 401 || response.status === 403 ? 'EAUTH' : 'ECONNECTION';
                throw failure;
            }
            return { accepted: recipients, rejected: [], messageId: String(body.id || '') };
        },
        close() {},
    };
}
function mailTransport(env = process.env) {
    if (!reportMailStatus(env).configured) return null;
    const resend = resendConfig(env);
    if (resend) return resendTransport(resend);
    return nodemailer.createTransport({ service: 'gmail', auth: credentials(env), connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 45000 });
}
function mailFailure(error, env = process.env) {
    const { missing } = reportMailStatus(env), provider = resendConfig(env) ? 'resend' : 'gmail';
    let code = 'REPORT_EMAIL_DELIVERY_FAILED', status = 502;
    let message = 'No se pudo entregar el correo. Inténtalo de nuevo más tarde.';
    if (missing.length) {
        code = 'REPORT_EMAIL_NOT_CONFIGURED'; status = 503;
        message = `El servidor no tiene configurado el correo: falta ${missing.join(' y ')}. En local, revisa backend/.env y reinicia el backend. En Vercel, revisa las variables del despliegue.`;
    } else if (error?.code === 'EAUTH') {
        code = 'REPORT_EMAIL_AUTH_FAILED'; status = 503;
        message = provider === 'resend'
            ? 'Resend rechazó las credenciales. Revisa RESEND_API_KEY y que RESEND_FROM use un dominio verificado; después reinicia el backend o vuelve a desplegar.'
            : 'Gmail rechazó las credenciales del remitente. Revisa GMAIL_USER y la contraseña de aplicación GMAIL_PASS; después reinicia el backend o vuelve a desplegar.';
    } else if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(error?.code)) {
        code = 'REPORT_EMAIL_UNAVAILABLE'; status = 503;
        message = 'No se pudo conectar con el servidor de correo. Revisa la conexión del backend y vuelve a intentarlo.';
    }
    return Object.assign(new Error(message), { code, status });
}

module.exports = { reportMailStatus, mailTransport, mailFailure, mailAutomationEnabled, mailSender, resendTransport };
