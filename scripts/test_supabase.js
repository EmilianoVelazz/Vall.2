require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testSupabase() {
    console.log('Probando conexión a Supabase...');
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Test 1: Insertar una regla de prueba
        const testRule = {
            condition_trigger: 'test_trigger_system_check',
            learned_rule: 'Regla de prueba para verificar conexión',
            confidence_score: 99
        };
        
        console.log('Intentando insertar regla de prueba...');
        const { data: insertData, error: insertError } = await supabase
            .from('ai_neural_rules')
            .insert([testRule])
            .select();
            
        if (insertError) {
            console.error('Error insertando en la tabla:', insertError.message);
            process.exit(1);
        }
        
        console.log('Inserción exitosa, ID:', insertData[0].id);

        // Test 2: Eliminar la regla de prueba
        console.log('Limpiando regla de prueba...');
        const { error: deleteError } = await supabase
            .from('ai_neural_rules')
            .delete()
            .eq('id', insertData[0].id);
            
        if (deleteError) {
            console.error('Error limpiando datos de prueba:', deleteError.message);
            process.exit(1);
        }

        console.log('✅ Supabase está configurado correctamente y la tabla existe.');
    } catch (e) {
        console.error('Excepción durante la prueba:', e.message);
        process.exit(1);
    }
}

testSupabase();
