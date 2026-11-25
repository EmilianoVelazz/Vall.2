'use strict';
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
const { connectDatabase } = require('../backend/lib/database-connection');

async function main() {
    const migrations = ['023_vector_knowledge_and_ml_store.sql', '024_public_knowledge_policy.sql'];
    const sources = migrations.map(file => ({
        file,
        sql: fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations', file), 'utf8'),
    }));
    if (process.argv.includes('--dry-run')) {
        console.log(JSON.stringify({ applied: false, migrations, notice: 'Archivos leídos; SQL no ejecutado ni validado por PostgreSQL.' }));
        return;
    }
    const connection = await connectDatabase();
    if (!connection) throw Object.assign(Error('Conexión PostgreSQL no configurada.'), { code: 'DB_NOT_CONFIGURED' });
    try {
        for (const { file, sql } of sources) {
            await connection.query(sql);
            console.log('Migración de conocimiento aplicada: ' + file);
        }
    } finally {
        await connection.end();
    }
}
if (require.main === module) main().catch(error => {
    console.error('No se pudieron aplicar las migraciones de conocimiento:', error.code || error.message || 'DB_UNAVAILABLE');
    process.exitCode = 1;
});
