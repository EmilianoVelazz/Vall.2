'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI } = require('@google/genai');
const { genAI, modelForTier } = require('../lib/gemini');
const { verifyToken } = require('./auth');
const { orchestrator } = require('../ai/orchestrator');
const { ragRetriever } = require('../ai/rag-retriever');
const { getAttachments } = require('./attachments');
const { selectModelTier } = require('../ai/prompt-builder');
const { MODES } = require('../ai/response-schema');
const { VOICE_DOMAIN_INSTRUCTION } = require('../ai/domain-policy');
const { resolveCurrencyConversion } = require('../ai/currency-converter');

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
const liveTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas llamadas de voz. Intenta nuevamente en 15 minutos.' },
});

// `latest` es la variante de audio nativa habilitada para esta cuenta; la
// configuración sigue pudiendo fijarse por entorno para despliegues futuros.
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest';
const liveAi = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        // La versión instalada del SDK crea y consume tokens efímeros en v1alpha.
        httpOptions: { apiVersion: 'v1alpha' },
    })
    : null;

function liveFxInstruction(conversion) {
    if (!conversion) {
        return 'No hay una cotización USD/MXN verificada disponible al inicio de esta llamada. Si preguntan por un tipo actual, dilo con claridad y no inventes ni repitas una cifra de memoria.';
    }
    const rate = conversion.rate.toLocaleString('en-US', { maximumFractionDigits: 4 });
    const timestamp = conversion.updatedAt ? ` Actualización del proveedor: ${conversion.updatedAt}.` : '';
    return `COTIZACIÓN USD/MXN VERIFICADA PARA ESTA LLAMADA: 1 USD = ${rate} MXN. Fuente: ${conversion.source}.${timestamp} Si preguntan cuánto equivale un dólar, responde esta cifra exacta primero. Para otro importe, multiplícalo por ${rate}; nunca sustituyas este dato por una cotización de memoria. Aclara brevemente que bancos, tarjetas y casas de cambio aplican spread o comisiones.`;
}

function liveSessionConfig(fxConversion = null) {
    return {
        responseModalities: ['AUDIO'],
        // 2.5 permite apagar el razonamiento previo para empezar a hablar antes;
        // 3.x usa el nivel equivalente "minimal".
        thinkingConfig: LIVE_MODEL.startsWith('gemini-2.5')
            ? { thinkingBudget: 0 }
            : { thinkingLevel: 'minimal' },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
            automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                prefixPaddingMs: 80,
                silenceDurationMs: 350,
            },
            activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
            turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
        },
        contextWindowCompression: {
            triggerTokens: '12000',
            slidingWindow: { targetTokens: '6000' },
        },
        sessionResumption: {},
        speechConfig: {
            voiceConfig: {
                prebuiltVoiceConfig: { voiceName: process.env.GEMINI_LIVE_VOICE || 'Sulafat' },
            },
        },
        systemInstruction: [
            'Eres VALL AI, un asistente profesional de inteligencia económica.',
            VOICE_DOMAIN_INSTRUCTION,
            'RESPONDE EN ESPAÑOL DE MÉXICO. DEBES RESPONDER INEQUÍVOCAMENTE EN ESPAÑOL.',
            'Habla como un colega inteligente, cálido y espontáneo, no como locutor, robot, formulario ni texto leído.',
            'Usa entonación expresiva, ritmo relajado, pausas naturales y pequeñas variaciones de cadencia. No recites encabezados, listas Markdown ni etiquetas.',
            'Puedes reconocer brevemente lo que dijo la persona y luego contestar. Usa palabras cotidianas y frases fluidas; evita repetir siempre la misma entrada o cierre.',
            'Antes de contestar, identifica en silencio la pregunta concreta, el periodo, el mercado o país y la decisión implícita. Da primero la respuesta útil y luego la razón; evita definiciones de manual y generalidades.',
            'Responde directamente y conserva el contexto de toda la llamada. Si la pregunta es sencilla, contesta en 2 a 4 frases. Si es compleja, desarrolla una explicación clara con: conclusión, dos o tres factores específicos, riesgo principal y qué dato vigilar.',
            'Si algo no quedó claro, haz una pregunta breve y natural en vez de asumir. Permite que el usuario te interrumpa y retoma sin reclamarle.',
            'Si te piden un informe, ofrece un resumen ejecutivo concreto y desarrolla los puntos prioritarios que el usuario pida. Indica que el chat escrito genera el informe completo de al menos 900 palabras, con datos, fuentes, tablas y exportación.',
            liveFxInstruction(fxConversion),
            'No inventes cifras actuales ni fuentes. Cuando exista una cotización verificada en esta instrucción, úsala antes que tu memoria. Si no puedes verificar otro dato durante la llamada, dilo claramente y propone consultarlo en el chat escrito de VALL AI.',
        ].join(' '),
    };
}

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
    const requestedMode = MODES.has(body.mode) ? body.mode : 'auto';
    return {
        message,
        context: String(body.context || '').trim().slice(0, 18000),
        history: Array.isArray(body.history) ? body.history.slice(-16) : [],
        mode: requestedMode,
        tier: selectModelTier({ message, mode: requestedMode, attachments }),
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

// Token efímero para Gemini Live. La credencial permanente permanece en el
// servidor; el token solo abre una llamada, con modelo y configuración fijados.
router.post('/ai-live-token', chatJson, verifyToken, liveTokenLimiter, async (_req, res) => {
    if (!liveAi) return res.status(503).json({ success: false, error: 'Voz con IA no configurada en el servidor.' });

    const now = Date.now();
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();
    const newSessionExpiresAt = new Date(now + 2 * 60 * 1000).toISOString();
    try {
        // Gemini Live no tiene herramientas de mercado conectadas dentro del
        // socket de audio. Inyectamos la referencia actual al abrir la llamada
        // para impedir cotizaciones inventadas o desactualizadas.
        const fxConversion = await resolveCurrencyConversion('Convierte 1 dólar estadounidense a pesos mexicanos');
        const config = liveSessionConfig(fxConversion);
        const token = await liveAi.authTokens.create({
            config: {
                uses: 1,
                expireTime: expiresAt,
                newSessionExpireTime: newSessionExpiresAt,
                liveConnectConstraints: { model: LIVE_MODEL, config },
            },
        });
        if (!token?.name) throw new Error('El proveedor no devolvió un token efímero.');
        res.json({ success: true, token: token.name, model: LIVE_MODEL, config, expiresAt });
    } catch (err) {
        console.error('/api/ai-live-token error:', err.message);
        const safe = publicAiError(err);
        res.status(safe.status).json({ success: false, error: safe.message });
    }
});

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
    const requestedMode = MODES.has(req.body?.mode) ? req.body.mode : 'auto';
    const tier          = selectModelTier({ message: prompt, mode: requestedMode });
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
            // Si ya hubo texto en pantalla, conservarlo es preferible a
            // reemplazar una respuesta útil por un fallo de cierre/persistencia.
            if (sentText) send({ done: true, tier: richInput.tier, mode: richInput.mode, warning: publicAiError(err).message });
            else send({ error: publicAiError(err).message, code: err.code || 'AI_ERROR' });
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
module.exports.liveSessionConfig = liveSessionConfig;
module.exports.LIVE_MODEL = LIVE_MODEL;
module.exports.liveFxInstruction = liveFxInstruction;
