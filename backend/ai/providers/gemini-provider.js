'use strict';

const { GoogleGenAI } = require('@google/genai');
const { orionModel } = require('../orion-models');
const { generationTimeout, generationAttempt, timeoutError } = require('./generation-budget');
const {chatMeter}=require('../../lib/chat-credit-context');
const {countRequestTokens}=require('./gemini-token-counter');

const MODELS = Object.freeze({
    // Modelos comprobados para esta cuenta el 2026-09-09. Se pueden fijar por
    // entorno si un despliegue requiere una versión distinta.
    flash: process.env.GEMINI_MODEL_FLASH || 'gemini-3.8-flash',
    pro: process.env.GEMINI_MODEL_PRO || 'gemini-3.1-pro-preview',
});

// La vista previa Pro puede no estar habilitada en todas las cuentas. Antes
// de reducir un informe complejo a Flash, probamos una variante Pro estable.
// La variable permite sustituirla sin cambios de código en cada despliegue.
const PRO_FALLBACKS = Object.freeze([
    process.env.GEMINI_MODEL_PRO_FALLBACK || 'gemini-2.5-pro',
]);

const FLASH_FALLBACKS = Object.freeze([
    process.env.GEMINI_MODEL_FLASH_FALLBACK || 'gemini-3.7-flash',
    'gemini-3.6-flash',
    // Respaldo estable para cuentas donde las vistas previas nuevas no tienen
    // cuota o atraviesan saturación temporal. Proyecto Loopus lo usa también
    // para no desperdiciar un ciclo largo repitiendo modelos no disponibles.
    'gemini-2.5-flash',
]);

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
    if(Number.isInteger(status) && status>=400 && status<=599)wrapped.providerStatus=status;
    wrapped.code = status === 429 || lower.includes('429') || lower.includes('quota') ? 'AI_RATE_LIMIT'
        : lower.includes('safety') || lower.includes('blocked') ? 'AI_SAFETY'
        : [408, 504].includes(status) || error?.name === 'AbortError' || lower.includes('timeout') || lower.includes('deadline') ? 'AI_TIMEOUT'
        : [401, 403].includes(status) || lower.includes('401') || lower.includes('api key') ? 'AI_AUTH'
        : 'AI_PROVIDER_ERROR';
    wrapped.status = wrapped.code === 'AI_RATE_LIMIT' ? 429 : wrapped.code === 'AI_AUTH' ? 503 : wrapped.code === 'AI_TIMEOUT' ? 504 : wrapped.code === 'AI_SAFETY' ? 400 : 502;
    return wrapped;
}

function thinkingFor(model, tier, modelProfile = null) {
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
        return { thinkingBudget: tier === 'pro' ? 1024 : 0 };
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
    modelForTier(tier) { return tier === 'pro' ? MODELS.pro : MODELS.flash; }
    tierForModel(model) { return [MODELS.pro, ...PRO_FALLBACKS].includes(model) ? 'pro' : 'flash'; }
    modelsForTier(tier) {
        const candidates = tier === 'pro'
            ? [MODELS.pro, ...PRO_FALLBACKS, MODELS.flash, ...FLASH_FALLBACKS]
            : [MODELS.flash, ...FLASH_FALLBACKS];
        return [...new Set(candidates.filter(Boolean))];
    }

    contents(prompt, attachments = []) {
        const parts = [{ text: prompt }];
        for (const file of attachments.slice(0, 5)) {
            if (!file?.base64 || !file?.type) continue;
            parts.push({ text: `\n[ARCHIVO ADJUNTO: ${file.name || 'archivo'} · ${file.type}]` });
            parts.push({ inlineData: { mimeType: file.type, data: file.base64 } });
        }
        return [{ role: 'user', parts }];
    }

    requestConfig({ systemInstruction, tier, model, modelProfile, json = false, tools, maxOutputTokens, signal, timeoutMs }) {
        const thinkingConfig = thinkingFor(model, tier, modelProfile);
        return {
            systemInstruction, temperature: json ? 0.18 : 0.3, topP: 0.86,
            maxOutputTokens: maxOutputTokens || (tier === 'pro' ? 12288 : 4096),
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
        const models=this.modelsForTier(tier);
        for (const [index,model] of models.entries()) {
            if (signal?.aborted) throw timeoutError(true);
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw timeoutError();
            const attemptMs = Math.min(remaining, 50_000,index===0&&models.length>1 ? Math.max(1,Math.floor(totalBudget*.7)) : remaining);
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
                if (['AI_AUTH', 'AI_SAFETY'].includes(lastError.code)) throw lastError;
                console.warn(`[Gemini] ${model} no disponible; se evalúa el respaldo dentro del plazo restante.`);
            } finally { attempt.dispose(); }
        }
        throw lastError;
    }

    async stream({ prompt, systemInstruction, tier = 'flash', modelProfile = null, onText, attachments = [], tools = null, maxOutputTokens = null, signal = null, timeoutMs = 50_000 }) {
        if (!this.client) throw Object.assign(new Error('IA no configurada.'), { code: 'AI_NOT_CONFIGURED', status: 503 });
        const totalBudget=generationTimeout(timeoutMs, 50_000);
        const deadline = Date.now() + totalBudget;
        let lastError;
        const models=this.modelsForTier(tier);
        for (const [index,model] of models.entries()) {
            if (signal?.aborted) throw timeoutError(true);
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw timeoutError();
            const attemptMs = Math.min(remaining, 50_000,index===0&&models.length>1 ? Math.max(1,Math.floor(totalBudget*.7)) : remaining);
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
                await reservation?.fail(lastError);
                if (signal?.aborted) throw lastError;
                // Nunca concatenar otra respuesta después de entregar texto.
                if (text || ['AI_AUTH', 'AI_SAFETY'].includes(lastError.code)) throw lastError;
                console.warn(`[Gemini] ${model} no inició; se evalúa el respaldo dentro del plazo restante.`);
            } finally {
                attempt.dispose();
                // Un iterador defectuoso tampoco puede bloquear la limpieza.
                if (iterator?.return) Promise.resolve().then(() => iterator.return()).catch(() => {});
            }
        }
        throw lastError;
    }
}

module.exports = {
    GeminiProvider, MODELS, PRO_FALLBACKS, FLASH_FALLBACKS, GOOGLE_SEARCH_TOOL, googleSearchTools,
    groundingCitations, normalizeProviderError, thinkingFor,
};
