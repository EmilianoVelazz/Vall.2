'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });

function config() {
    if (process.env.SUPABASE_DATABASE_URL) return { connectionString: process.env.SUPABASE_DATABASE_URL };
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    if (!url || !process.env.SUPABASE_PASSWORD) throw new Error('Falta la conexión de Supabase.');
    const reference = new URL(url).hostname.split('.')[0];
    return { host: `db.${reference}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', password: process.env.SUPABASE_PASSWORD, reference };
}

async function connect() {
    const options = config();
    const direct = new Client({ ...options, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
    try { await direct.connect(); return direct; } catch (error) {
        await direct.end().catch(() => {});
        if (!options.reference) throw error;
        for (const region of ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'sa-east-1']) {
            const candidate = new Client({ host: `aws-0-${region}.pooler.supabase.com`, port: 6543, database: 'postgres', user: `postgres.${options.reference}`, password: options.password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
            try { await candidate.connect(); return candidate; } catch { await candidate.end().catch(() => {}); }
        }
        throw error;
    }
}

(async () => {
    const database = await connect();
    try {
        await database.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/012_orion_query_audit.sql'), 'utf8'));
        const result = await database.query("SELECT to_regclass('public.orion_query_audit') AS table_name");
        console.log(JSON.stringify({ migrated: result.rows[0].table_name === 'orion_query_audit' }));
    } finally { await database.end(); }
})().catch(error => { console.error('[orion-query-audit] Migración falló:', error.message); process.exitCode = 1; });
