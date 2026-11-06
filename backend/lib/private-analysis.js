'use strict';

const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const { accountKey, createWorkGate } = require('./resource-limits');

// Compartidos entre los análisis bajo demanda: cambiar de ruta no duplica
// el cupo de una cuenta ni permite saturar el proveedor con generaciones.
const analysisLimiter = rateLimit({ keyGenerator: accountKey, windowMs: 15 * 60_000, max: 30,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Llegaste al límite temporal de análisis. Intenta de nuevo en unos minutos.' } });
const analysisWork = createWorkGate({ maxActive: 4, maxPerUser: 1 }).wrap;

function analysisCacheKey(req, input) {
    return crypto.createHash('sha256').update(JSON.stringify([accountKey(req), input])).digest('hex');
}

function numericInput(value, { name, fallback = null, min = 0, max = 1_000_000 } = {}) {
    if (value == null || value === '') return fallback;
    const valid = typeof value === 'number' || (typeof value === 'string' && value.length <= 32
        && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()));
    const number = valid ? Number(value) : NaN;
    if (!Number.isFinite(number) || number < min || number > max) {
        throw Object.assign(new Error(`${name || 'Valor'} debe ser un número válido dentro del rango permitido.`), { status: 400 });
    }
    return number;
}

function proteinAnalysisInput(body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Datos de mercado inválidos.'), { status: 400 });
    if (body.woah?.alerts != null && (!Array.isArray(body.woah.alerts) || body.woah.alerts.length > 1000)) {
        throw Object.assign(new Error('Lista de alertas inválida.'), { status: 400 });
    }
    const input = {
        porkMxn: numericInput(body.inegi?.precios?.cerdo?.valor, { name: 'Precio de cerdo' }),
        hogsUsd: numericInput(body.hogs?.price, { name: 'Futuro de cerdo' }),
        beefUsd: numericInput(body.bls?.prices?.beef?.ultimo, { name: 'Precio de res' }),
        alerts: body.woah?.alerts?.length || 0,
        cornUsd: numericInput(body.corn?.price, { name: 'Precio de maíz' }),
    };
    if (!Object.values(input).some(value => value != null && value > 0)) {
        throw Object.assign(new Error('Proporciona al menos un dato de mercado válido.'), { status: 400 });
    }
    return input;
}

module.exports = { analysisLimiter, analysisWork, analysisCacheKey, numericInput, proteinAnalysisInput };
