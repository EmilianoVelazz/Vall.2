'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_FLASH = 'gemini-2.5-flash';
const MODEL_PRO   = 'gemini-2.5-pro';
const MODEL = MODEL_FLASH; // alias retrocompatible — usado donde no aplica selección de nivel

// Mapa blindado tier -> modelo real: el cliente solo puede pedir 'flash' o 'pro',
// nunca un string de modelo arbitrario (evita que el front controle qué modelo/costo se factura).
const TIER_MODELS = { flash: MODEL_FLASH, pro: MODEL_PRO };
function modelForTier(tier) {
    return TIER_MODELS[tier] || MODEL_FLASH;
}

let genAI = null;

if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    console.error('  [gemini] No se encontró GEMINI_API_KEY — las rutas de IA no estarán disponibles.');
}

module.exports = { genAI, MODEL, MODEL_FLASH, MODEL_PRO, modelForTier };
