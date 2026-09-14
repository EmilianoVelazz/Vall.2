const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const regions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
    'sa-east-1', 'ca-central-1'
];

const ref = 'zgzziypiigfsxvrlttth';
const pwd = process.env.SUPABASE_DB_PASSWORD;

if (!pwd) {
    throw new Error('Falta SUPABASE_DB_PASSWORD para conectar con el pooler de Supabase.');
}

async function tryConnect(region) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const client = new Client({
        host: host,
        port: 6543,
        database: 'postgres',
        user: `postgres.${ref}`,
        password: pwd,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000 // 5 seconds timeout
    });

    try {
        await client.connect();
        console.log(`\n✅ CONECTADO AL POOLER EN LA REGIÓN: ${region}`);
        return client;
    } catch (e) {
        process.stdout.write('.');
        return null;
    }
}

async function run() {
    console.log('Buscando el servidor proxy (Transaction Pooler IPv4) de Supabase...');
    
    let client = null;
    for (const r of regions) {
        client = await tryConnect(r);
        if (client) break;
    }

    if (!client) {
        console.error('\n❌ No se pudo encontrar el pooler en ninguna región conocida.');
        process.exit(1);
    }

    try {
        const sqlPath = path.resolve(__dirname, '../backend/db/migrations/004_mercolleida_supabase.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Ejecutando DDL de migración (10 tablas)...');
        await client.query(sql);
        console.log('✅ Todas las tablas de Mercolleida fueron creadas exitosamente.');

    } catch (err) {
        console.error('Error ejecutando SQL:', err.message);
    } finally {
        await client.end();
    }
}

run();
