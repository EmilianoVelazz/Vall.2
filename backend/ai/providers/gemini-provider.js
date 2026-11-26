'use strict';

const { GoogleGenAI } = require('@google/genai');
const { orionModel } = require('../orion-models');
const { generationTimeout, generationAttempt, timeoutError } = require('./generation-budget');
const {chatMeter}=require('../../lib/chat-credit-context');
const {countRequestTokens}=require('./gemini-token-counter');

const MODELS = Object.freeze({
    // Cada ruta puede fijar su modelo por entorno sin cambiar las demás.
    flash: process.env.GEMINI_MODEL_FLASH || 'gemini-3.8-flash',
    pro: process.env.GEMINI_MODEL_PRO || 'gemini-3.1-pro-preview',
    // Separate report routing from the interactive ORION profiles.
    report: process.env.GEMINI_MODEL_REPORTS || 'gemini-4-argon',
});

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_FALLBACKS = Object.freeze(['text-embedding-004']);

function normalizeVector(values) {
    if (!Array.isArray(values) || !values.length) return null;
    const nums = values.map(Number);
    if (!nums.every(Number.isFinite)) return null;
    const norm = Math.sqrt(nums.reduce((sum, v) => sum + v * v, 0));
    if (!norm) return nums;
    return nums.map(v => Number((v / norm).toFixed(7)));
}

function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) return 0;
    let dot = 0;
    let magL = 0;
    let magR = 0;
    for (let i = 0; i < left.length; i++) {
        const a = Number(left[i]);
        const b = Number(right[i]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
        dot += a * b;
        magL += a * a;
        magR += b * b;
    }
    const denom = Math.sqrt(magL) * Math.sqrt(magR);
    return denom > 0 ? Math.max(-1, Math.min(1, dot / denom)) : 0;
}

// La vista previa Pro puede no estar habilitada en todas las cuentas. Antes
// de reducir un informe complejo a Flash, probamos una variante Pro estable.
// La variable permite sustituirla sin cambios de código en cada despliegue.
const PRO_FALLBACKS = Object.freeze([
    process.env.GEMINI_MODEL_PRO_FALLBACK || 'gemini-pro-latest',
]);

const FLASH_FALLBACKS = Object.freeze([
    process.env.GEMINI_MODEL_FLASH_FALLBACK || 'gemini-3.7-flash',
    'gemini-3.6-flash',
    // Respaldo estable para cuentas donde las vistas previas nuevas no tienen
    // cuota o atraviesan saturación temporal. Proyecto Loopus lo usa también
    // para no desperdiciar un ciclo largo repitiendo modelos no disponibles.
    'gemini-2.5-flash',
]);

// Enfriamiento temporal por modelo cuando el cliente real de GoogleGenAI
// devuelve 429 por cuota agotada, para evitar perder ~25s por turno
// reintentando modelos sin cuota. No aplica a mocks de prueba unitaria.
const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
const MODEL_RATE_LIMIT_COOLDOWN = new Map();

function isQuotaRateLimit(error) {
    return error?.code === 'AI_RATE_LIMIT'
        && /exceeded your current quota|plan and billing|resource_exhausted|limit:\s*0/i.test(String(error?.message || ''));
}

function cooldownKey(model, hasTools = false) {
    return `${model}:${hasTools ? 'tools' : 'plain'}`;
}

function markModelRateLimited(client, model, error, hasTools = false) {
    if (process.env.NODE_ENV === 'test' || !(client instanceof GoogleGenAI) || !model || !isQuotaRateLimit(error)) return;
    MODEL_RATE_LIMIT_COOLDOWN.set(cooldownKey(model, hasTools), Date.now() + RATE_LIMIT_COOLDOWN_MS);
}

function orderModelsWithCooldown(client, models, hasTools = false) {
    if (process.env.NODE_ENV === 'test' || !(client instanceof GoogleGenAI) || !MODEL_RATE_LIMIT_COOLDOWN.size) return models;
    const now = Date.now();
    const fresh = [];
    const cooled = [];
    for (const model of models) {
        const key = cooldownKey(model, hasTools);
        const until = MODEL_RATE_LIMIT_COOLDOWN.get(key);
        if (until && until > now) cooled.push(model);
        else {
            if (until) MODEL_RATE_LIMIT_COOLDOWN.delete(key);
            fresh.push(model);
        }
    }
    return fresh.length ? [...fresh, ...cooled] : models;
}

function clearModelCooldowns() {
    MODEL_RATE_LIMIT_COOLDOWN.clear();
}

// Gemini recibe esta herramienta sólo en consultas que requieren contrastar
// evidencia externa. No se habilita para conversiones ni cotizaciones ya
// cubiertas por nuestros proveedores deterministas, para no añadir coste ni
// latencia donde no aporta valor.
const GOOGLE_SEARCH_TOOL = Object.freeze({ googleSearch: {} });

function googleSearchTools(enabled = false) {
    return enabled ? [{ googleSearch: {} }] : null;
}

function groundingCitations(grounding) {
    const seen = new Set();
    const chunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
    return chunks.map(chunk => chunk?.web || null).filter(Boolean).map(web => {
        const url = String(web.uri || '').trim();
        const title = String(web.title || 'Fuente web').trim();
        if (!/^https?:\/\//i.test(url) || seen.has(url)) return null;
        seen.add(url);
        return {
            title: `Investigación web: ${title}`,
            source: title,
            url,
            type: 'google_search_grounding',
        };
    }).filter(Boolean).map((citation, index) => ({ ...citation, id: `G${index + 1}` }));
}

const BLOCKED_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII']);
function validateCompletion(text, reason, feedback = null) {
    if (feedback?.blockReason || BLOCKED_REASONS.has(reason)) throw Object.assign(new Error('El proveedor bloqueó esta respuesta.'), { code: 'AI_SAFETY', status: 400 });
    if (reason === 'MAX_TOKENS' || reason === 'MALFORMED_FUNCTION_CALL') throw Object.assign(new Error('El proveedor no terminó la respuesta.'), { code: 'AI_INCOMPLETE_RESPONSE', status: 502 });
    if (!String(text || '').trim()) throw Object.assign(new Error('El proveedor devolvió una respuesta vacía.'), { code: 'AI_EMPTY_RESPONSE', status: 502 });
}
function normalizeProviderError(error) {
    if(/^AI_/.test(error?.code || ''))return error;
    if (['AI_RATE_LIMIT', 'AI_SAFETY', 'AI_TIMEOUT', 'AI_AUTH', 'AI_EMPTY_RESPONSE', 'AI_INCOMPLETE_RESPONSE'].includes(error?.code)) return error;
    const message = String(error?.message || error || 'Error desconocido del proveedor');
    const lower = message.toLowerCase();
    const status = Number(error?.status || error?.statusCode || error?.error?.code);
    const wrapped = new Error(message);
    if (error?.cause) wrapped.cause = error.cause;
    if(Number.isInteger(status) && status>=400 && status<=599)wrapped.providerStatus=status;
    wrapped.code = status === 402 || lower.includes('prepayment credits are depleted') || (lower.includes('402') && lower.includes('billing')) ? 'AI_BILLING'
        : status === 429 || lower.includes('429') || lower.includes('quota') ? 'AI_RATE_LIMIT'
        : lower.includes('safety') || lower.includes('blocked') ? 'AI_SAFETY'
        : [408, 504].includes(status) || error?.name === 'AbortError' || lower.includes('timeout') || lower.includes('deadline') ? 'AI_TIMEOUT'
        : [401, 403].includes(status) || lower.includes('401') || lower.includes('api key') ? 'AI_AUTH'
        : 'AI_PROVIDER_ERROR';
    wrapped.status = wrapped.code === 'AI_BILLING' ? 402 : wrapped.code === 'AI_RATE_LIMIT' ? 429 : wrapped.code === 'AI_AUTH' ? 503 : wrapped.code === 'AI_TIMEOUT' ? 504 : wrapped.code === 'AI_SAFETY' ? 400 : 502;
    return wrapped;
}

function thinkingFor(model, tier, modelProfile = null) {
    if (tier === 'report' && /^gemini-4-/i.test(model)) return { thinkingLevel: 'medium' };
    const profile = orionModel(modelProfile);
    if (profile) {
        if (/^gemini-2\.5/i.test(model)) {
            const budgets = { low: /pro/i.test(model) ? 128 : 0, medium: 2048, high: 8192 };
            return { thinkingBudget: budgets[profile.reasoning] };
        }
        if (/^gemini-3-pro/i.test(model)) return { thinkingLevel: profile.reasoning === 'high' ? 'high' : 'low' };
        if (/^gemini-(?:3|[4-9])/i.test(model)) return { thinkingLevel: profile.reasoning };
    }
    if (/^gemini-3\.(?:7|8)-/i.test(model) || /^gemini-3\.1-pro/i.test(model)) {
        // Los modelos Gemini 3 recientes no aceptan `minimal` en Generate
        // Content. El informe usa reflexión alta; la conversación usa baja
        // latencia sin desactivar el razonamiento.
        return { thinkingLevel: tier === 'pro' ? 'high' : 'low' };
    }
    if (/^gemini-3\.6-/i.test(model)) return { thinkingLevel: tier === 'pro' ? 'low' : 'minimal' };
    if (/^gemini-(?:3|[4-9])/i.test(model)) return { thinkingLevel: tier === 'pro' ? 'high' : 'low' };
    if (/^gemini-2\.5/i.test(model)) {
        return { thinkingBudget: tier === 'pro' || tier === 'report' || /pro/i.test(model) ? 1024 : 0 };
    }
    return null;
}

class GeminiProvider {
    constructor(apiKey = process.env.GEMINI_API_KEY) {
        this.name = 'gemini';
        this.apiKey=apiKey;
        this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
    }
    isConfigured() { return Boolean(this.client); }
    countRequestTokens(request){return countRequestTokens({...request,apiKey:this.apiKey});}
    async reserveChat(model,contents,options,attempt,config){
        const meter=chatMeter();if(!meter)return null;
        const reservation=await attempt.wait(()=>meter.reserve(model,{countTokens:()=>this.countRequestTokens({model,contents,systemInstruction:options.systemInstruction,tools:options.tools,signal:attempt.signal}),maxOutputTokens:config.maxOutputTokens,hasTools:Boolean(options.tools?.length),audio:options.attachments?.some(file=>file.type?.startsWith('audio/'))}));
        config.maxOutputTokens=reservation.maxOutputTokens;config.httpOptions.retryOptions={attempts:1};return reservation;
    }
    modelForTier(tier) { return tier === 'report' ? MODELS.report : tier === 'pro' ? MODELS.pro : MODELS.flash; }
    tierForModel(model) { return model === MODELS.report ? 'report' : [MODELS.pro, ...PRO_FALLBACKS].includes(model) ? 'pro' : 'flash'; }
    modelsForTier(tier) {
        const candidates = tier === 'report'
            ? [MODELS.report, MODELS.pro, ...PRO_FALLBACKS, MODELS.flash, ...FLASH_FALLBACKS]
            : tier === 'pro'
            ? [MODELS.pro, ...PRO_FALLBACKS, MODELS.flash, ...FLASH_FALLBACKS]
            : [MODELS.flash, ...FLASH_FALLBACKS];
        return [...new Set(candidates.filter(Boolean))];
    }

    contents(prompt, attachments = []) {
        const textMimes = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);
        const parts = [{ text: prompt }];
        for (const file of attachments.slice(0, 5)) {
            if (!file?.base64 || !file?.type) continue;
            const mime = String(file.type).toLowerCase().split(';')[0].trim();
            if (textMimes.has(mime)) {
                const decoded = Buffer.from(file.base64, 'base64').toString('utf8').slice(0, 120_000);
                parts.push({ text: `\n[ARCHIVO ADJUNTO: ${file.name || 'archivo'} · ${mime}]\n\`\`\`\n${decoded}\n\`\`\`` });
                continue;
            }
            parts.push({ text: `\n[ARCHIVO ADJUNTO: ${file.name || 'archivo'} · ${file.type}]` });
            parts.push({ inlineData: { mimeType: file.type, data: file.base64 } });
        }
        return [{ role: 'user', parts }];
    }

    requestConfig({ systemInstruction, tier, model, modelProfile, json = false, tools, maxOutputTokens, signal, timeoutMs }) {
        let thinkingConfig = thinkingFor(model, tier, modelProfile);
        if (Array.isArray(tools) && tools.length && (modelProfile === 'cirius' || modelProfile === 'pulsar') && ['medium', 'high'].includes(thinkingConfig?.thinkingLevel)) {
            thinkingConfig = { thinkingLevel: 'low' };
        }
        const resolvedMaxTokens = maxOutputTokens || (tier === 'report' ? 32768 : tier === 'pro' ? 12288 : 4096);
        // En la familia 2.5, thinkingBudget consume del mismo tope maxOutputTokens;
        // si iguala o supera el límite, el modelo agota MAX_TOKENS con 0 texto.
        const adjustedMaxTokens = thinkingConfig?.thinkingBudget > 0
            ? Math.max(resolvedMaxTokens, thinkingConfig.thinkingBudget + 1024)
            : resolvedMaxTokens;
        return {
            systemInstruction,
            ...(/^gemini-4-/i.test(model) ? {} : {temperature: json ? 0.18 : 0.3, topP: 0.86}),
            maxOutputTokens: adjustedMaxTokens,
            ...(thinkingConfig ? { thinkingConfig } : {}),
            ...(json ? { responseMimeType: 'application/json' } : {}),
            ...(Array.isArray(tools) && tools.length ? { tools } : {}),
            abortSignal: signal, httpOptions: { timeout: timeoutMs },
        };
    }

    async generate({ prompt, systemInstruction, tier = 'flash', modelProfile = null, json = false, attachments = [], tools = null, maxOutputTokens = null, signal = null, timeoutMs = 120_000 }) {
        if (!this.client) throw Object.assign(new Error('IA no configurada.'), { code: 'AI_NOT_CONFIGURED', status: 503 });
        const totalBudget=generationTimeout(timeoutMs, 120_000);
        const deadline = Date.now() + totalBudget;
        let lastError;
        const hasTools = Boolean(Array.isArray(tools) && tools.length);
        const models=orderModelsWithCooldown(this.client, this.modelsForTier(tier), hasTools);
        for (const [index,model] of models.entries()) {
            if (signal?.aborted) throw timeoutError(true);
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw timeoutError();
            const hasMoreFallbacks = index < models.length - 1;
            const shareMs = index === 0 && models.length > 1
                ? Math.max(1, Math.floor(totalBudget * 0.7))
                : hasMoreFallbacks && totalBudget >= 10_000
                ? Math.max(1, Math.floor(remaining * 0.65))
                : remaining;
            const attemptMs = Math.min(remaining, 45_000, shareMs);
            const attempt = generationAttempt(signal, attemptMs);
            let reservation,responseReceived=false;
            try {
                const contents=this.contents(prompt,attachments),config=this.requestConfig({systemInstruction,tier,model,modelProfile,json,tools,maxOutputTokens,signal:attempt.signal,timeoutMs:attemptMs});
                reservation=await this.reserveChat(model,contents,{systemInstruction,tools,attachments},attempt,config);
                const response = await attempt.wait(() => this.client.models.generateContent({
                    model, contents,config,
                }));
                responseReceived=true;await reservation?.finish(response.usageMetadata);
                const finishReason = response.candidates?.[0]?.finishReason || null;
                validateCompletion(response.text, finishReason, response.promptFeedback);
                return {
                    text: String(response.text).trim(), model, modelProfile,
                    modelFallback: model !== this.modelForTier(tier),
                    grounding: response.candidates?.[0]?.groundingMetadata || null, finishReason,
                };
            } catch (error) {
                if(error.code?.startsWith('CHAT_'))throw error;
                lastError = signal?.aborted ? timeoutError(true) : normalizeProviderError(error);
                if(!responseReceived)await reservation?.fail(lastError);
                if (signal?.aborted) throw lastError;
                if (['AI_AUTH', 'AI_SAFETY', 'AI_BILLING'].includes(lastError.code)) throw lastError;
                markModelRateLimited(this.client, model, lastError, hasTools);
                console.warn(`[Gemini] ${model} no disponible (${lastError.code}${lastError.providerStatus ? ` ${lastError.providerStatus}` : ''}: ${String(lastError.message).slice(0, 160)}${lastError.cause ? ` · ${lastError.cause.code || lastError.cause.message}` : ''}); se evalúa el respaldo dentro del plazo restante.`);
            } finally { attempt.dispose(); }
        }
        throw lastError;
    }

    async stream({ prompt, systemInstruction, tier = 'flash', modelProfile = null, onText, allowFallbackBeforeDelivery = !onText, attachments = [], tools = null, maxOutputTokens = null, signal = null, timeoutMs = 120_000 }) {
        if (!this.client) throw Object.assign(new Error('IA no configurada.'), { code: 'AI_NOT_CONFIGURED', status: 503 });
        const totalBudget=generationTimeout(timeoutMs, 120_000);
        const deadline = Date.now() + totalBudget;
        let lastError;
        const hasTools = Boolean(Array.isArray(tools) && tools.length);
        const models=orderModelsWithCooldown(this.client, this.modelsForTier(tier), hasTools);
        for (const [index,model] of models.entries()) {
            if (signal?.aborted) throw timeoutError(true);
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw timeoutError();
            const hasMoreFallbacks = index < models.length - 1;
            const shareMs = index === 0 && models.length > 1
                ? Math.max(1, Math.floor(totalBudget * 0.7))
                : hasMoreFallbacks && totalBudget >= 10_000
                ? Math.max(1, Math.floor(remaining * 0.65))
                : remaining;
            const attemptMs = Math.min(remaining, 45_000, shareMs);
            const attempt = generationAttempt(signal, attemptMs);
            let text = '', grounding = null, finishReason = null;
            let iterator,reservation,usage;
            try {
                const contents=this.contents(prompt,attachments),config=this.requestConfig({systemInstruction,tier,model,modelProfile,tools,maxOutputTokens,signal:attempt.signal,timeoutMs:attemptMs});
                reservation=await this.reserveChat(model,contents,{systemInstruction,tools,attachments},attempt,config);
                const response = await attempt.wait(() => this.client.models.generateContentStream({
                    model,contents,config,
                }));
                iterator = response[Symbol.asyncIterator]();
                while (true) {
                    const next = await attempt.wait(() => iterator.next());
                    if (next.done) break;
                    const chunk = next.value;
                    if(chunk.usageMetadata)usage=chunk.usageMetadata;
                    finishReason = chunk.candidates?.[0]?.finishReason || finishReason;
                    if (chunk.promptFeedback?.blockReason || BLOCKED_REASONS.has(finishReason)) validateCompletion('', finishReason, chunk.promptFeedback);
                    const part = String(chunk.text || '');
                    if (part) { text += part; onText?.(part, text); }
                    grounding = chunk.candidates?.[0]?.groundingMetadata || grounding;
                }
                await reservation?.finish(usage);validateCompletion(text, finishReason);
                return { text: text.trim(), model, grounding, finishReason, modelProfile, modelFallback: model !== this.modelForTier(tier) };
            } catch (error) {
                if(error.code?.startsWith('CHAT_'))throw error;
                lastError = signal?.aborted ? timeoutError(true) : normalizeProviderError(error);
                if (lastError.code === 'AI_TIMEOUT' && !signal?.aborted && totalBudget >= 10_000 && text.trim().length >= 280) {
                    await reservation?.finish(usage);
                    console.warn(`[Gemini] ${model} agotó plazo al cierre tras generar ${text.trim().length} caracteres; se conserva la respuesta parcial verificable.`);
                    return { text: text.trim(), model, grounding, finishReason: finishReason || 'STOP', modelProfile, modelFallback: model !== this.modelForTier(tier) };
                }
                await reservation?.fail(lastError);
                if (signal?.aborted) throw lastError;
                // Nunca concatenar otra respuesta después de entregar texto visible al cliente.
                if ((text && !allowFallbackBeforeDelivery) || ['AI_AUTH', 'AI_SAFETY', 'AI_BILLING'].includes(lastError.code)) throw lastError;
                markModelRateLimited(this.client, model, lastError, hasTools);
                console.warn(`[Gemini] ${model} no inició; se evalúa el respaldo dentro del plazo restante.`);
            } finally {
                attempt.dispose();
                // Un iterador defectuoso tampoco puede bloquear la limpieza.
                if (iterator?.return) Promise.resolve().then(() => iterator.return()).catch(() => {});
            }
        }
        throw lastError;
    }

    async embed({ text, taskType = 'RETRIEVAL_DOCUMENT', outputDimensionality = 768, signal = null, timeoutMs = 10_000 } = {}) {
        const cleanText = String(text || '').trim().slice(0, 12_000);
        if (!this.client || !cleanText || process.env.NODE_ENV === 'test' || signal?.aborted) return null;
        const models = [...new Set([EMBEDDING_MODEL, ...EMBEDDING_FALLBACKS].filter(Boolean))];
        for (const model of models) {
            const attempt = generationAttempt(signal, Math.min(15_000, Math.max(1500, Number(timeoutMs) || 10_000)));
            try {
                const config = {
                    taskType,
                    ...(Number.isInteger(outputDimensionality) && outputDimensionality > 0 ? { outputDimensionality } : {}),
                    abortSignal: attempt.signal,
                    httpOptions: { timeout: Math.min(12_000, Number(timeoutMs) || 10_000) },
                };
                const response = await attempt.wait(() => this.client.models.embedContent({
                    model,
                    contents: cleanText,
                    config,
                }));
                const values = response?.embeddings?.[0]?.values || response?.embedding?.values || null;
                const normalized = normalizeVector(values);
                if (normalized && normalized.length) return normalized;
            } catch {
                if (signal?.aborted) return null;
            } finally {
                attempt.dispose();
            }
        }
        return null;
    }
}

module.exports = {
    GeminiProvider, MODELS, PRO_FALLBACKS, FLASH_FALLBACKS, GOOGLE_SEARCH_TOOL, googleSearchTools,
    groundingCitations, normalizeProviderError, thinkingFor, EMBEDDING_MODEL, cosineSimilarity, normalizeVector, clearModelCooldowns,
};
