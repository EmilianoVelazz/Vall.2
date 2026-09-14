const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log('Conectando directamente a PostgreSQL de Supabase...');
    const password = process.env.SUPABASE_DB_PASSWORD;

    if (!password) {
        throw new Error('Falta SUPABASE_DB_PASSWORD para conectar con PostgreSQL de Supabase.');
    }
    
    const client = new Client({
        host: 'db.zgzziypiigfsxvrlttth.supabase.co',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Conectado a Supabase PostgreSQL');

        const sqlPath = path.resolve(__dirname, '../backend/db/migrations/004_mercolleida_supabase.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Ejecutando migración de tablas...');
        await client.query(sql);
        console.log('✅ Todas las tablas creadas exitosamente');

        // Verificar
        const { rows } = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name LIKE 'mercolleida%' 
            OR table_name LIKE 'cotizaciones%' OR table_name LIKE 'pesos%'
            ORDER BY table_name
        `);
        console.log('\nTablas creadas:');
        rows.forEach(r => console.log(`  ✅ ${r.table_name}`));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }
}

run();
