'use strict';

const { trustedCertificates } = require('./tls-trust');
const { Pool } = require('pg');
let pool;
let disabledUntil = 0;

function databaseConfig(env = process.env) {
    if (env.SUPABASE_DATABASE_URL) {
        const url = new URL(env.SUPABASE_DATABASE_URL);
        // pg deja que sslmode reemplace las opciones TLS. Forzar verificación
        // también cuando una URL antigua contenía sslmode=no-verify/disable.
        for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
        return { connectionString: url.toString() };
    }
    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    if (!base || !env.SUPABASE_PASSWORD || !env.SUPABASE_POOLER_HOST) return null;
    const reference = new URL(base).hostname.split('.')[0];
    const host = env.SUPABASE_POOLER_HOST;
    const port = Number(env.SUPABASE_POOLER_PORT || 6543);
    if (![5432, 6543].includes(port)) throw Object.assign(new Error('Puerto PostgreSQL no válido.'), { code: 'DB_INVALID_PORT' });
    return { host, port, database: 'postgres',
        user: `postgres.${reference}`, password: env.SUPABASE_PASSWORD };
}

function databaseTls(env = process.env) {
    return { rejectUnauthorized: true, ca: trustedCertificates(env.SUPABASE_DB_CA) };
}

function isMariaDbConfigured(env = process.env) {
    if (String(env.MARIADB_ENABLED || env.MYSQL_ENABLED || '').toLowerCase() === 'false') return false;
    return Boolean(
        String(env.DB_HOST || env.MYSQL_HOST || env.MARIADB_HOST || '').trim()
        || String(env.MARIADB_ENABLED || env.MYSQL_ENABLED || '').toLowerCase() === 'true'
    );
}

function mysqlTlsOptions(env = process.env) {
    const host = env.DB_HOST || env.MYSQL_HOST || env.MARIADB_HOST || '127.0.0.1';
    if (['127.0.0.1', 'localhost', '::1'].includes(host.toLowerCase())) return {};
    // Solo para una MariaDB en la red privada de Docker (Dokploy), que no expone
    // TLS. Debe pedirse explícitamente; cualquier otro valor conserva TLS verificado.
    if (String(env.MYSQL_TLS || '').toLowerCase() === 'disable') return {};
    return { ssl: databaseTls({ ...env, SUPABASE_DB_CA: env.MYSQL_DB_CA || '' }) };
}

async function connectDatabase() {
    const config = databaseConfig();
    if (!config) return null;
    if (Date.now() < disabledUntil) throw Object.assign(new Error('Base de datos temporalmente no disponible.'), { code: 'DB_UNAVAILABLE' });
    if (!pool) {
        pool = new Pool({ ...config, ssl: databaseTls(), max: Math.min(Math.max(Number(process.env.DB_POOL_MAX) || 20, 1), 50),
            connectionTimeoutMillis: 4000, idleTimeoutMillis: 30000,
            query_timeout: 10000, statement_timeout: 10000, allowExitOnIdle: true });
        // Un error de un cliente inactivo no debe apagar la base para todos;
        // el pool descarta ese cliente y abre otro en la siguiente petición.
        pool.on('error', error => { console.warn('[db] Error en cliente inactivo del pool:', error.message); });
    }
    if (pool.waitingCount >= 50) throw Object.assign(new Error('Base de datos ocupada.'), { code: 'DB_BUSY' });
    let client;
    try { client = await pool.connect(); }
    catch (error) {
        // Disyuntor breve (3 s, antes 30 s) para no saturar un servidor caído.
        disabledUntil = Date.now() + 3000;
        throw error;
    }
    let released = false;
    return {
        query: (...args) => client.query(...args),
        // Compatibilidad con los almacenes: end devuelve la conexión al pool,
        // evitando abrir/cerrar conexiones nuevas en cada consulta.
        async end() { if (!released) { released = true; client.release(); } },
    };
}

module.exports = { connectDatabase, databaseConfig, databaseTls, mysqlTlsOptions, isMariaDbConfigured };
