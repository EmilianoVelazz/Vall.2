'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { genAI, MODEL, modelForTier } = require('../lib/gemini');
const { verifyToken } = require('./auth');

const router = express.Router();
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes de IA. Intenta nuevamente en 15 minutos.' },
});

router.post('/chat', verifyToken, aiLimiter, async (req, res) => {
    const message = (req.body?.message || '').toString().trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: 'Mensaje vacío' });
    if (!genAI)  return res.status(503).json({ error: 'IA no configurada.' });

    try {
        const model  = genAI.getGenerativeModel({ model: MODEL });
        const result = await model.generateContent(
            `Eres VALL-AI, el asistente inteligente de VALLNews, una plataforma de inteligencia económica y financiera de México. Responde SIEMPRE en español, de forma clara, concisa y profesional. Puedes ayudar con economía, finanzas, mercados bursátiles, divisas, indicadores económicos, política monetaria, noticias financieras y el contenido de VALLNews. Si la pregunta no es de tu dominio, redirige amablemente. Máximo 3 párrafos cortos.\n\nUsuario: ${message}\nVALL-AI:`
        );
        res.json({ reply: result.response.text().trim() });
    } catch (err) {
        console.error('/api/chat error:', err.message);
        if (err.message?.includes('429') || err.message?.includes('quota')) {
            return res.status(429).json({ reply: '⚠️ VALL-AI está temporalmente en pausa por límite de uso. Vuelve a intentarlo más tarde.' });
        }
        res.status(500).json({ error: 'Error al procesar tu mensaje' });
    }
});

// ── Análisis genérico bajo demanda (reemplaza llamadas directas a Gemini desde el cliente) ──
router.post('/ai-insight', verifyToken, aiLimiter, async (req, res) => {
    const prompt       = (req.body?.prompt || '').toString().trim().slice(0, 12000);
    const systemPrompt = (req.body?.systemPrompt || '').toString().trim().slice(0, 6000);
    const modelId       = modelForTier(req.body?.tier);
    if (!prompt) return res.status(400).json({ error: 'Prompt vacío' });
    if (!genAI)  return res.status(503).json({ error: 'IA no configurada.' });

    try {
        const model  = genAI.getGenerativeModel(
            systemPrompt ? { model: modelId, systemInstruction: systemPrompt } : { model: modelId }
        );
        const result = await model.generateContent(prompt);
        res.json({ reply: result.response.text().trim() });
    } catch (err) {
        console.error('/api/ai-insight error:', err.message);
        if (err.message?.includes('429') || err.message?.includes('quota')) {
            return res.status(429).json({ error: 'Cuota de API agotada. Intenta más tarde.' });
        }
        res.status(500).json({ error: 'Error al generar el análisis' });
    }
});

// ── Igual que /ai-insight, pero transmite la respuesta por fragmentos (SSE) para
//    que el chat pueda mostrar el texto llegando en vivo en lugar de esperar el total. ──
router.post('/ai-insight-stream', verifyToken, aiLimiter, async (req, res) => {
    const prompt       = (req.body?.prompt || '').toString().trim().slice(0, 12000);
    const systemPrompt = (req.body?.systemPrompt || '').toString().trim().slice(0, 6000);
    const tier          = req.body?.tier === 'pro' ? 'pro' : 'flash';
    if (!prompt) return res.status(400).json({ error: 'Prompt vacío' });
    if (!genAI)  return res.status(503).json({ error: 'IA no configurada.' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    async function streamWith(modelId, tracker) {
        const model  = genAI.getGenerativeModel(
            systemPrompt ? { model: modelId, systemInstruction: systemPrompt } : { model: modelId }
        );
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
            const t = chunk.text();
            if (t) { send({ text: t }); tracker.sent = true; }
        }
    }

    try {
        let usedTier = tier;
        const tracker = { sent: false };
        try {
            await streamWith(modelForTier(tier), tracker);
        } catch (err) {
            const isQuota = err.message?.includes('429') || err.message?.includes('quota');
            // El nivel Pro gratuito de Gemini tiene cuota muy baja (~2 RPM). Si se agota antes
            // de emitir texto, caemos a Flash en vez de dejar el chat inutilizable.
            if (tier === 'pro' && isQuota && !tracker.sent) {
                usedTier = 'flash';
                await streamWith(modelForTier('flash'), tracker);
            } else {
                throw err;
            }
        }
        send({ done: true, tier: usedTier });
    } catch (err) {
        console.error('/api/ai-insight-stream error:', err.message);
        const msg = (err.message?.includes('429') || err.message?.includes('quota'))
            ? 'Cuota de API agotada. Intenta más tarde.'
            : 'Error al generar el análisis.';
        send({ error: msg });
    } finally {
        res.end();
    }
});

module.exports = router;
