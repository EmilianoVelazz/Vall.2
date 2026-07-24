'use strict';
require('dotenv').config({ path: __dirname + '/backend/.env' });
const { orchestrator } = require('./backend/ai/orchestrator');

async function runTests() {
    console.log("=== PRUEBA DEL CICLO DE REFLEXIÓN (ORQUESTADOR) ===");
    try {
        const result = await orchestrator.generateStructured({
            message: "Dame un análisis profundo de la inflación en México",
            history: [],
            context: "Dato simulado: La inflación es de 4.5%.",
            mode: 'detailed',
            tier: 'pro',
            userKeyHash: 'test_user_hash'
        });
        
        if (result && result.text) {
            console.log("✅ Orchestrator completó el ciclo de reflexión con éxito.");
            console.log("   Respuesta generada (resumen):", result.text.substring(0, 200) + "...");
            console.log("   Query ID guardado:", result.queryId);
            console.log("   Evidencias consultadas:", result.evidenceCount);
        } else {
            console.error("❌ Orquestador no devolvió texto.");
        }
    } catch (e) {
        console.error("❌ Fallo en Orchestrator:", e.message);
        console.error(e.stack);
    }
    
    console.log("\\n=== PRUEBAS FINALIZADAS ===");
    process.exit(0);
}

runTests();
