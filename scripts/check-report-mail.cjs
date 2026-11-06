'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
require('../backend/lib/tls-trust').configureSystemTrust();
const { reportMailStatus, mailTransport, mailFailure } = require('../backend/services/report-mailer');

async function main() {
    const status = reportMailStatus();
    if (!status.configured) throw mailFailure();
    if (process.argv.includes('--config-only')) { console.log('Correo: configuración presente. Autenticación pendiente de comprobar.'); return; }
    const transport = mailTransport();
    try {
        await transport.verify();
        console.log('Correo: conexión y autenticación con Gmail correctas. No se envió ningún mensaje.');
        console.log('Si una instancia local muestra falta de configuración, reinicia npm run dev para cargar backend/.env.');
    } catch (error) { throw mailFailure(error); }
    finally { transport.close(); }
}
main().catch(error => { console.error(`${error.code || 'REPORT_EMAIL_CHECK_FAILED'}: ${error.message}`); process.exitCode = 1; });
