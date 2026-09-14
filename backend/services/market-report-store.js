'use strict';

// Almacén privado de los informes ejecutivos de Mercados. Se mantiene separado
// de Finanzas para que cada familia conserve sus propios cortes y trazabilidad.
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { nextReportRefreshAt } = require('../lib/report-schedule');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const REPORT_ORDER = ['overview', 'grains', 'energy_metals', 'proteins', 'market_news'];
let supabase = null;
let memory = null;

function ordered(reports) {
    return [...reports].sort((left, right) => REPORT_ORDER.indexOf(left.key) - REPORT_ORDER.indexOf(right.key));
}

function databaseConfig() {
    if (process.env.SUPABASE_DATABASE_URL) return { connectionString: process.env.SUPABASE_DATABASE_URL };
    const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const password = process.env.SUPABASE_PASSWORD;
    if (!base || !password) return null;
    const reference = new URL(base).hostname.split('.')[0];
    return { host: `db.${reference}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', password, reference };
}

function serviceClient() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    if (!supabase) supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return supabase;
}

async function connectDatabase() {
    const config = databaseConfig();
    if (!config) return null;
    const direct = new Client({ ...config, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12_000 });
    try { await direct.connect(); return direct; } catch (error) {
        await direct.end().catch(() => {});
        if (!config.reference) throw error;
        const regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'eu-central-1', 'sa-east-1'];
        const attempts = await Promise.all(regions.map(async region => {
            const candidate = new Client({ host: `aws-0-${region}.pooler.supabase.com`, port: 6543, database: 'postgres', user: `postgres.${config.reference}`, password: config.password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
            try { await candidate.connect(); return candidate; } catch { await candidate.end().catch(() => {}); return null; }
        }));
        const connected = attempts.find(Boolean);
        await Promise.all(attempts.filter(Boolean).filter(item => item !== connected).map(item => item.end()));
        if (connected) return connected;
        throw error;
    }
}

async function save(reports, generatedAt) {
    memory = { reports, generatedAt, persistence: 'memory' };
    const rows = reports.map(report => ({
        report_key: report.key, title: report.title, report,
        source_snapshot: report.sourceSnapshot || {}, generated_at: generatedAt,
        next_refresh_at: nextReportRefreshAt(generatedAt).toISOString(),
    }));
    const client = serviceClient();
    if (client) {
        const { error } = await client.from('market_executive_reports').upsert(rows, { onConflict: 'report_key' });
        if (error) throw error;
        memory.persistence = 'supabase-service-role';
        return memory;
    }
    const db = await connectDatabase();
    if (!db) return memory;
    try {
        for (const row of rows) await db.query(`INSERT INTO market_executive_reports
            (report_key, title, report, source_snapshot, generated_at, next_refresh_at)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
            ON CONFLICT (report_key) DO UPDATE SET title = EXCLUDED.title, report = EXCLUDED.report,
              source_snapshot = EXCLUDED.source_snapshot, generated_at = EXCLUDED.generated_at,
              next_refresh_at = EXCLUDED.next_refresh_at, updated_at = NOW()`,
        [row.report_key, row.title, JSON.stringify(row.report), JSON.stringify(row.source_snapshot), row.generated_at, row.next_refresh_at]);
    } finally { await db.end().catch(() => {}); }
    memory.persistence = 'supabase-postgres';
    return memory;
}

async function load() {
    const client = serviceClient();
    if (client) {
        const { data, error } = await client.from('market_executive_reports').select('report, generated_at').order('generated_at', { ascending: false });
        if (error) throw error;
        if (data?.length) return { reports: ordered(data.map(row => row.report)), generatedAt: data[0].generated_at, persistence: 'supabase-service-role' };
    } else {
        const db = await connectDatabase();
        if (db) try {
            const result = await db.query('SELECT report, generated_at FROM market_executive_reports ORDER BY generated_at DESC');
            if (result.rows.length) return { reports: ordered(result.rows.map(row => row.report)), generatedAt: result.rows[0].generated_at, persistence: 'supabase-postgres' };
        } finally { await db.end().catch(() => {}); }
    }
    return memory;
}

module.exports = { load, save };
