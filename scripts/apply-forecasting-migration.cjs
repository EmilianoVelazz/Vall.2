'use strict';
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
const { connectDatabase } = require('../backend/lib/database-connection');

(async () => {
    const connection = await connectDatabase();
    if (!connection) throw Object.assign(Error('Conexión PostgreSQL no configurada.'), { code: 'DB_NOT_CONFIGURED' });
    try {
        await connection.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/007_forecasting_supabase.sql'), 'utf8'));
        console.log('Tablas privadas de pronósticos: migración aplicada.');
    } catch (error) {
        await connection.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { await connection.end(); }
})().catch(error => { console.error('No se pudo aplicar la migración:', error.code || 'DB_UNAVAILABLE'); process.exitCode = 1; });
