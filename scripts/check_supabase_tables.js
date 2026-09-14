require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function createTables() {
    console.log('Creando tablas en Supabase via inserciones de prueba...');
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const sb = createClient(url, key);

    // Test if tables exist by trying to select from them
    const tables = [
        'mercolleida_sesiones', 'cotizaciones_porcino', 'cotizaciones_lechon',
        'cotizaciones_vacuno', 'cotizaciones_materias_primas', 'pesos_y_sacrificios',
        'mercolleida_series_mensuales', 'mercolleida_qa_tuning',
        'mercolleida_glosario', 'mercolleida_correlaciones'
    ];

    for (const table of tables) {
        const { error } = await sb.from(table).select('*').limit(1);
        if (error) {
            console.log(`  ❌ Tabla "${table}" NO EXISTE: ${error.message}`);
        } else {
            console.log(`  ✅ Tabla "${table}" existe`);
        }
    }

    console.log('\n📋 Si hay tablas faltantes, ejecuta el SQL de:');
    console.log('   backend/db/migrations/004_mercolleida_supabase.sql');
    console.log('   en el SQL Editor de tu panel Supabase.');
}

createTables();
