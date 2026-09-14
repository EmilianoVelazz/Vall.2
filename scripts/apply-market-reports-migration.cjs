'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });

function config() {
    if (process.env.SUPABASE_DATABASE_URL) return { connectionString: process.env.SUPABASE_DATABASE_URL };
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const password = process.env.SUPABASE_PASSWORD;
    if (!url || !password) throw new Error('Falta configuración de Supabase para aplicar la migración.');
    const ref = new URL(url).hostname.split('.')[0];
    return { host: `db.${ref}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', password, ref };
}
async function connect() {
    const base = config();
    const direct = new Client({ ...base, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
    try { await direct.connect(); return direct; } catch (error) {
        await direct.end().catch(() => {});
        if (!base.ref) throw error;
        const regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'eu-central-1', 'sa-east-1'];
        const attempts = await Promise.all(regions.map(async region => {
            const candidate = new Client({ host: `aws-0-${region}.pooler.supabase.com`, port: 6543, database: 'postgres', user: `postgres.${base.ref}`, password: base.password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
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
        await client.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/009_market_executive_reports.sql'), 'utf8'));
        const result = await client.query("SELECT to_regclass('public.market_executive_reports') AS table_name");
        console.log(JSON.stringify({ migrated: result.rows[0].table_name === 'market_executive_reports' }));
    } finally { await client.end(); }
}
main().catch(error => { console.error('[market-reports] Migración falló:', error.message); process.exitCode = 1; });
