'use strict';

// Genera un corte inicial o bajo demanda sin pasar por una sesión de navegador.
// El cron de producción usa el endpoint protegido; este script es para verificar
// el mismo flujo local y poblar Supabase después de aplicar la migración.
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
const router = require('../backend/routes/finanzas');

async function main() {
    console.log('[finance-reports] Consultando fuentes…');
    const snapshot = await router.refreshExecutiveReports();
    console.log(JSON.stringify({ reports: snapshot.reports.length, generatedAt: snapshot.generatedAt, persistence: snapshot.persistence }));
}

main().catch(error => { console.error('[finance-reports] Generación falló:', error.message); process.exitCode = 1; });
