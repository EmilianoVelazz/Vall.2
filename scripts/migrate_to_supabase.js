const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const mysql = require('mysql2/promise');
const { createClient } = require('@supabase/supabase-js');

async function migrateKnowledge() {
    console.log('Iniciando migración de conocimientos de MySQL a Supabase...');
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        console.error('Error: Faltan credenciales de Supabase en .env.local');
        process.exit(1);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let db;
    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
            user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
            password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
            database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE || 'vall_',
            charset: 'utf8mb4'
        });
        console.log('Conectado a MySQL local con éxito.');
    } catch (err) {
        console.error('Error conectando a MySQL local:', err.message);
        console.log('Asegúrate de que el servidor MySQL esté corriendo.');
        process.exit(1);
    }

    try {
        const [rules] = await db.execute('SELECT * FROM ai_neural_rules');
        console.log(`Se encontraron ${rules.length} reglas neuronales en MySQL.`);
        
        if (rules.length === 0) {
            console.log('No hay conocimientos locales que migrar. Finalizando.');
            process.exit(0);
        }

        // Formatear las reglas para que coincidan con la tabla de Supabase
        const formattedRules = rules.map(r => ({
            id: r.id,
            condition_trigger: r.condition_trigger,
            learned_rule: r.learned_rule,
            confidence_score: r.confidence_score,
            source_query_id: r.source_query_id,
            created_at: r.created_at,
            updated_at: r.updated_at
        }));

        // Insertar en Supabase (puede manejar arrays para bulk insert)
        const { data, error } = await supabase
            .from('ai_neural_rules')
            .upsert(formattedRules, { onConflict: 'id' }); // Usamos upsert por si el ID ya existe

        if (error) {
            throw error;
        }

        console.log(`¡Migración exitosa! Se subieron ${rules.length} reglas a Supabase.`);

    } catch (err) {
        console.error('Error durante la migración:', err);
    } finally {
        await db.end();
    }
}

migrateKnowledge();
