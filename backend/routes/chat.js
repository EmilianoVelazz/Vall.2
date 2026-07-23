'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { genAI, modelForTier } = require('../lib/gemini');
const { verifyToken } = require('./auth');
const { orchestrator } = require('../ai/orchestrator');
const { ragRetriever } = require('../ai/rag-retriever');
const { getAttachments } = require('./attachments');
const { selectModelTier } = require('../ai/prompt-builder');

const router = express.Router();
// El historial, contexto y referencias de adjuntos pueden superar el parser
// global de 10 KB. Este límite solo se aplica a las rutas de IA.
const chatJson = express.json({ limit: '128kb' });
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes de IA. Intenta nuevamente en 15 minutos.' },
});

function publicAiError(err) {
    if (err?.code === 'AI_RATE_LIMIT' || /429|quota/i.test(err?.message || '')) return { status: 429, message: 'Cuota de IA agotada temporalmente. Intenta más tarde.' };
    if (err?.code === 'AI_SAFETY') return { status: 400, message: 'El proveedor no pudo procesar esta solicitud de forma segura.' };
    if (err?.code === 'AI_NOT_CONFIGURED' || err?.code === 'AI_AUTH') return { status: 503, message: 'IA no configurada correctamente en el servidor.' };
    if (err?.code === 'AI_TIMEOUT') return { status: 504, message: 'La IA tardó demasiado en responder.' };
    return { status: err?.status || 500, message: 'Error al procesar la solicitud de IA.' };
}

function structuredInput(body = {}, user = null) {
    const message = String(body.message || body.prompt || body.query || body.text || '').trim().slice(0, 12000);
    const attachments = getAttachments(body.attachmentIds, user);
    return {
        message,
        context: String(body.context || '').trim().slice(0, 18000),
        history: Array.isArray(body.history) ? body.history.slice(-16) : [],
        mode: 'auto',
        tier: selectModelTier({ message, mode: 'auto', attachments }),
        attachments,
        userKeyHash: hashUser(user),
    };
}

function hashUser(user) {
    const identity = user?.id || user?.sub || user?.email;
    return identity
        ? crypto.createHash('sha256').update(`vall-ai:${identity}`).digest('hex')
        : null;
}

router.post('/chat', chatJson, verifyToken, aiLimiter, async (req, res) => {
    const message = (req.body?.message || '').toString().trim().slice(0, 12000);
    if (!message) return res.status(400).json({ error: 'Mensaje vacío' });
    if (!orchestrator.isConfigured()) return res.status(503).json({ error: 'IA no configurada.' });

    try {
        const result = await orchestrator.generateStructured({ ...structuredInput(req.body, req.user), message });
        res.json({ success: true, reply: result.text, response: result.response, tier: result.tier,
            mode: result.mode, queryId: result.queryId, evidenceCount: result.evidenceCount,
            citations: result.citations, retrievalStrategy: result.retrievalStrategy });
    } catch (err) {
        console.error('/api/chat error:', err.message);
        const safe = publicAiError(err);
        res.status(safe.status).json({ success: false, error: safe.message });
    }
});

// Respuesta rica no transmitida: útil para integraciones, documentos y pruebas.
router.post('/ai-rich', chatJson, verifyToken, aiLimiter, async (req, res) => {
    const input = structuredInput(req.body, req.user);
    if (!input.message) return res.status(400).json({ success: false, error: 'Mensaje vacío.' });
    if (!orchestrator.isConfigured()) return res.status(503).json({ success: false, error: 'IA no configurada.' });
    try {
        const result = await orchestrator.generateStructured(input);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('/api/ai-rich error:', err.message);
        const safe = publicAiError(err);
        res.status(safe.status).json({ success: false, error: safe.message });
    }
});

router.post('/ai-feedback', chatJson, verifyToken, aiLimiter, async (req, res) => {
    const queryId = Number(req.body?.queryId);
    const score = value => value == null || value === '' ? null : Number(value);
    const rating = score(req.body?.rating);
    const accuracyScore = score(req.body?.accuracyScore);
    const relevanceScore = score(req.body?.relevanceScore);
    if (!Number.isSafeInteger(queryId) || queryId <= 0) {
        return res.status(400).json({ success: false, error: 'queryId inválido.' });
    }
    if (rating != null && (!Number.isInteger(rating) || rating < -1 || rating > 5)) {
        return res.status(400).json({ success: false, error: 'rating debe estar entre -1 y 5.' });
    }
    if ([accuracyScore, relevanceScore].some(value => value != null
        && (!Number.isInteger(value) || value < 0 || value > 100))) {
        return res.status(400).json({ success: false, error: 'Las puntuaciones deben estar entre 0 y 100.' });
    }
    const saved = await ragRetriever.recordFeedback({
        queryId,
        userKeyHash: hashUser(req.user),
        rating,
        isHelpful: typeof req.body?.isHelpful === 'boolean' ? req.body.isHelpful : null,
        accuracyScore,
        relevanceScore,
        feedbackText: req.body?.feedbackText,
        correctionText: req.body?.correctionText,
    });
    if (!saved) return res.status(404).json({ success: false, error: 'Consulta no encontrada para este usuario.' });
    res.json({ success: true });
});

// ── Análisis genérico bajo demanda (migrado al orquestador con RAG) ──────────
router.post('/ai-insight', chatJson, verifyToken, aiLimiter, async (req, res) => {
    const input = structuredInput(req.body, req.user);
    // Soporte retrocompatible: el campo legacy era 'prompt', el orquestador usa 'message'
    if (!input.message && req.body?.prompt) input.message = String(req.body.prompt).trim().slice(0, 12000);
    if (!input.message) return res.status(400).json({ error: 'Prompt vacío' });
    if (!orchestrator.isConfigured()) return res.status(503).json({ error: 'IA no configurada.' });

    try {
        const result = await orchestrator.generateStructured(input);
        res.json({ reply: result.text, response: result.response, tier: result.tier });
    } catch (err) {
        console.error('/api/ai-insight error:', err.message);
        const safe = publicAiError(err);
        res.status(safe.status).json({ error: safe.message });
    }
});

// ── Igual que /ai-insight, pero transmite la respuesta por fragmentos (SSE) para
//    que el chat pueda mostrar el texto llegando en vivo en lugar de esperar el total. ──
router.post('/ai-insight-stream', chatJson, verifyToken, aiLimiter, async (req, res) => {
    const prompt       = (req.body?.prompt || req.body?.message || req.body?.query || '').toString().trim().slice(0, 12000);
    const systemPrompt = (req.body?.systemPrompt || '').toString().trim().slice(0, 6000);
    const tier          = selectModelTier({ message: prompt, mode: 'auto' });
    const wantsStructured = req.body?.structured === true || Boolean(req.body?.message && !req.body?.systemPrompt);
    const richInput = structuredInput(req.body, req.user);
    if (!(wantsStructured ? richInput.message : prompt)) return res.status(400).json({ error: 'Prompt vacío' });
    if (wantsStructured ? !orchestrator.isConfigured() : !genAI) return res.status(503).json({ error: 'IA no configurada.' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    if (wantsStructured) {
        let sentText = false;
        try {
            send({ status: 'analyzing', mode: richInput.mode });
            let result;
            try {
                result = await orchestrator.stream({
                    ...richInput,
                    onText(part, full) { sentText = true; send({ text: part, partialLength: full.length }); },
                });
            } catch (err) {
                if (richInput.tier === 'pro' && err.code === 'AI_RATE_LIMIT' && !sentText) {
                    send({ status: 'fallback', tier: 'flash' });
                    result = await orchestrator.stream({
                        ...richInput, tier: 'flash',
                        onText(part, full) { sentText = true; send({ text: part, partialLength: full.length }); },
                    });
                } else throw err;
            }
            send({ response: result.response, done: true, tier: result.tier, mode: result.mode,
                model: result.model, queryId: result.queryId, evidenceCount: result.evidenceCount,
                citations: result.citations, retrievalStrategy: result.retrievalStrategy,
                finalText: result.text });
        } catch (err) {
            console.error('/api/ai-insight-stream structured error:', err.message);
            send({ error: publicAiError(err).message, code: err.code || 'AI_ERROR' });
        } finally {
            res.end();
        }
        return;
    }

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
// Exportación auxiliar para probar el contrato sin levantar el servidor.
module.exports.structuredInput = structuredInput;
module.exports.hashUser = hashUser;
