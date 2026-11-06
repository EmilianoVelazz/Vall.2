'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { connectDatabase } = require('../backend/lib/database-connection');

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });

(async () => {
    const database = await connectDatabase();
    if (!database) throw Object.assign(new Error('Conexión no configurada.'), { code: 'DB_NOT_CONFIGURED' });
    try {
        await database.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/011_app_profiles_and_chat.sql'), 'utf8'));
        await database.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/017_app_profile_access.sql'), 'utf8'));
        const result = await database.query("SELECT to_regclass('public.app_profiles') AS profiles, to_regclass('public.app_chat_conversations') AS conversations, to_regclass('public.app_training_queries') AS training");
        console.log(JSON.stringify({ migrated: Object.values(result.rows[0]).every(Boolean) }));
    } catch(error) {await database.query('ROLLBACK').catch(()=>{});throw error;}
    finally { await database.end(); }
})().catch(error => { console.error('[app-profiles] Migración falló:', error.code || 'PROFILE_MIGRATION_FAILED'); process.exitCode = 1; });
