'use strict';

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
const { connectDatabase } = require('../backend/lib/database-connection');

async function main() {
    const connection = await connectDatabase();
    if (!connection) throw Object.assign(new Error('Configura la conexión PostgreSQL del proyecto.'), { code: 'DB_NOT_CONFIGURED' });
    try {
        await connection.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/014_forecast_learning.sql'), 'utf8'));
        console.log('Registro privado de aprendizaje de pronósticos: migración aplicada.');
    } finally { await connection.end(); }
}
main().catch(error => { console.error('No se pudo aplicar la migración:', error.code || 'DB_UNAVAILABLE'); process.exitCode = 1; });
