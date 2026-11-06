'use strict';
// Opt-in explícito: sólo series públicas de maíz/trigo. No envía mensajes de
// usuarios, perfiles, contraseñas ni propuestas de entrenamiento privadas.
if (!process.argv.includes('--run')) { console.error('Uso: node scripts/verify-gemini-quality-live.cjs --run'); process.exitCode = 1; }
else {
    const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
    require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
    require('../backend/lib/tls-trust').configureSystemTrust();
    const { GeminiProvider } = require('../backend/ai/providers/gemini-provider');
    const { buildPrompt } = require('../backend/ai/prompt-builder');
    (async () => {
        const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../backend/cache/commodity-cache.json')));
        const inputs = ['CORN', 'WHEAT'].map(symbol => ({ symbol, name: data[symbol].data.name, unit: data[symbol].data.unit,
            frequency: data[symbol].data.interval, observations: data[symbol].data.data.slice(0, 3) }));
        const message = 'Con estos históricos mensuales de maíz y trigo, explica en español cómo afectan al costo de alimento de una empresa de proteínas. Máximo 220 palabras. Incluye una tabla de los últimos valores con fecha y unidad. Distingue hechos del corte, implicaciones condicionales y datos que faltan. No son precios actuales ni de carne local.';
        const built = buildPrompt({ message, context: 'HISTÓRICOS LOCALES PÚBLICOS, SIN COTIZACIONES ACTUALES:\n' + JSON.stringify(inputs), mode: 'normal', plan: { providedInputsOnly: true } });
        const started = Date.now();
        const result = await new GeminiProvider().generate({ ...built, tier: 'flash', maxOutputTokens: 4096, timeoutMs: 90000 });
        assert(result.text && result.finishReason !== 'MAX_TOKENS');
        assert(/2026-07|julio|jul\.?(?:\s+de)?\s+2026/i.test(result.text), 'La respuesta debe conservar el corte histórico');
        assert(/tonelada|metric ton|USD\/t|USD\/MT/i.test(result.text), 'Debe mantener la unidad');
        assert(result.text.includes('|'), 'Debe entregar una tabla');
        const folder = path.resolve(__dirname, '../output/auditoria-codigo/entrenamiento-ml');
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'gemini-respuesta-real.md'), result.text);
        fs.writeFileSync(path.join(folder, 'gemini-prueba-real.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), model: result.model,
            modelFallback: result.modelFallback, finishReason: result.finishReason, latencyMs: Date.now() - started,
            context: 'Sólo seis observaciones públicas históricas locales; no entrenó pesos de Gemini.' }, null, 2));
        console.log(JSON.stringify({ model: result.model, finishReason: result.finishReason, latencyMs: Date.now() - started, report: path.join(folder, 'gemini-respuesta-real.md') }));
    })().catch(error => { console.error(error.code || error.name, error.message); process.exitCode = 1; });
}