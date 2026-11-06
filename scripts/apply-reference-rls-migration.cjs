'use strict';
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
const { connectDatabase } = require('../backend/lib/database-connection');
(async () => {
    const db = await connectDatabase();
    if (!db) throw Object.assign(Error('Conexión no configurada.'), { code: 'DB_NOT_CONFIGURED' });
    try {
        await db.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/016_public_reference_rls.sql'), 'utf8'));
        console.log('RLS activado: referencias con lectura pública y escritura de servidor.');
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { await db.end(); }
})().catch(error => { console.error('No se aplicó la corrección RLS:', error.code || 'DB_UNAVAILABLE'); process.exitCode = 1; });
