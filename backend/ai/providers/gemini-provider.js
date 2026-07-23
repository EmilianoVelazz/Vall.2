'use strict';

const { GoogleGenAI } = require('@google/genai');

const MODELS = Object.freeze({
    flash: process.env.GEMINI_MODEL_FLASH || 'gemini-2.5-flash',
    pro: process.env.GEMINI_MODEL_PRO || 'gemini-2.5-pro',
});

function normalizeProviderError(error) {
    const message = String(error?.message || error || 'Error desconocido del proveedor');
    const lower = message.toLowerCase();
    const wrapped = new Error(message);
    wrapped.code = lower.includes('429') || lower.includes('quota') ? 'AI_RATE_LIMIT'
        : lower.includes('safety') || lower.includes('blocked') ? 'AI_SAFETY'
        : lower.includes('timeout') || lower.includes('deadline') ? 'AI_TIMEOUT'
        : lower.includes('401') || lower.includes('api key') ? 'AI_AUTH'
        : 'AI_PROVIDER_ERROR';
    wrapped.status = wrapped.code === 'AI_RATE_LIMIT' ? 429 : wrapped.code === 'AI_AUTH' ? 503 : 502;
    return wrapped;
}

class GeminiProvider {
    constructor(apiKey = process.env.GEMINI_API_KEY) {
        this.name = 'gemini';
        this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
    }
    isConfigured() { return Boolean(this.client); }
    modelForTier(tier) { return tier === 'pro' ? MODELS.pro : MODELS.flash; }

    contents(prompt, attachments = []) {
        const parts = [{ text: prompt }];
        for (const file of attachments.slice(0, 5)) {
            if (!file?.base64 || !file?.type) continue;
            parts.push({ text: `\n[ARCHIVO ADJUNTO: ${file.name || 'archivo'} · ${file.type}]` });
            parts.push({ inlineData: { mimeType: file.type, data: file.base64 } });
        }
        return [{ role: 'user', parts }];
    }

    async generate({ prompt, systemInstruction, tier = 'flash', json = false, attachments = [] }) {
        if (!this.client) { const error = new Error('IA no configurada.'); error.code = 'AI_NOT_CONFIGURED'; error.status = 503; throw error; }
        const model = this.modelForTier(tier);
        try {
            const response = await this.client.models.generateContent({
                model,
                contents: this.contents(prompt, attachments),
                config: {
                    systemInstruction,
                    temperature: json ? 0.18 : 0.3,
                    topP: 0.86,
                    maxOutputTokens: tier === 'pro' ? 12288 : 8192,
                    ...(json ? { responseMimeType: 'application/json' } : {}),
                    httpOptions: { timeout: 50_000 },
                },
            });
            return { text: String(response.text || '').trim(), model };
        } catch (error) { throw normalizeProviderError(error); }
    }

    async stream({ prompt, systemInstruction, tier = 'flash', onText, attachments = [] }) {
        if (!this.client) { const error = new Error('IA no configurada.'); error.code = 'AI_NOT_CONFIGURED'; error.status = 503; throw error; }
        const model = this.modelForTier(tier);
        try {
            const response = await this.client.models.generateContentStream({
                model,
                contents: this.contents(prompt, attachments),
                config: {
                    systemInstruction,
                    temperature: 0.3,
                    topP: 0.86,
                    maxOutputTokens: tier === 'pro' ? 12288 : 8192,
                    httpOptions: { timeout: 50_000 },
                },
            });
            let text = '';
            for await (const chunk of response) {
                const part = String(chunk.text || '');
                if (part) { text += part; onText?.(part, text); }
            }
            return { text: text.trim(), model };
        } catch (error) { throw normalizeProviderError(error); }
    }
}

module.exports = { GeminiProvider, MODELS, normalizeProviderError };
