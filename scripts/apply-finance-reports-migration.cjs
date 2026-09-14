'use strict';

// Aplica únicamente la migración de informes ejecutivos usando secretos locales
// de servidor. No registra cadenas de conexión ni contraseñas.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });

function connectionConfig() {
    if (process.env.SUPABASE_DATABASE_URL) return { connectionString: process.env.SUPABASE_DATABASE_URL };
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const password = process.env.SUPABASE_PASSWORD;
    if (!url || !password) throw new Error('Falta SUPABASE_DATABASE_URL o SUPABASE_URL/VITE_SUPABASE_URL junto con SUPABASE_PASSWORD.');
    const ref = new URL(url).hostname.split('.')[0];
    return { host: `db.${ref}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', password, ref };
}

async function connect() {
    const config = connectionConfig();
    const direct = new Client({ ...config, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
    try { await direct.connect(); return direct; } catch (error) {
        await direct.end().catch(() => {});
        if (!config.ref) throw error;
        const regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'eu-central-1', 'sa-east-1'];
        const attempts = await Promise.all(regions.map(async region => {
            const candidate = new Client({ host: `aws-0-${region}.pooler.supabase.com`, port: 6543, database: 'postgres', user: `postgres.${config.ref}`, password: config.password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
            try { await candidate.connect(); return candidate; } catch { await candidate.end().catch(() => {}); return null; }
        }));
        const connected = attempts.find(Boolean);
        await Promise.all(attempts.filter(Boolean).filter(item => item !== connected).map(item => item.end()));
        if (connected) return connected;
        throw error;
    }
}

async function main() {
    const client = await connect();
    try {
        const sql = fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/008_finance_executive_reports.sql'), 'utf8');
        await client.query(sql);
        const result = await client.query("SELECT to_regclass('public.finance_executive_reports') AS table_name");
        console.log(JSON.stringify({ migrated: result.rows[0].table_name === 'finance_executive_reports' }));
    } finally {
        await client.end();
    }
}

main().catch(error => { console.error('[finance-reports] Migración falló:', error.message); process.exitCode = 1; });
