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
const { orionModel } = require('../ai/orion-models');
const { conversationFocus } = require('../ai/conversation-context');
const { MODES } = require('../ai/response-schema');
const { VOICE_DOMAIN_INSTRUCTION, domainDecision, domainRedirectText } = require('../ai/domain-policy');
const { resolveCurrencyConversion } = require('../ai/currency-converter');
const { wantsStatisticalAnalysis, buildStatisticalModel, statisticalResponse } = require('../ai/statistical-analysis');
const profileStore = require('../services/user-profile-store');
const { accountKey, createWorkGate, boundedJson } = require('../lib/resource-limits');
const {chatCredits,exempt}=require('../services/chat-credits');
const {chatMeter}=require('../lib/chat-credit-context');

const router = express.Router();
// El historial, contexto y referencias de adjuntos pueden superar el parser
// global de 10 KB. Este límite solo se aplica a las rutas de IA.
const chatJson = boundedJson({ limit: '128kb' });
const aiWork = createWorkGate({ maxActive: 12, maxPerUser: 2 }).wrap;
const aiLimiter = rateLimit({
    keyGenerator: accountKey,
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes de IA. Intenta nuevamente en 15 minutos.' },
});
const statisticsLimiter = rateLimit({
    keyGenerator: accountKey,
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas solicitudes estadísticas. Intenta nuevamente en 15 minutos.' },
});
const liveTokenLimiter = rateLimit({
    keyGenerator: accountKey,
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas llamadas de voz. Intenta nuevamente en 15 minutos.' },
});
const liveTurnLimiter = rateLimit({
    keyGenerator: accountKey,
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados turnos de voz. Intenta nuevamente en unos minutos.' },
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
            'Eres ORION, el asistente profesional de inteligencia económica de VALLNews.',
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
            'No inventes cifras actuales ni fuentes. Cuando exista una cotización verificada en esta instrucción, úsala antes que tu memoria. Si no puedes verificar otro dato durante la llamada, dilo claramente y propone consultarlo en el chat escrito de ORION.',
        ].join(' '),
    };
}

function publicAiError(err) {
    if(err?.code?.startsWith('CHAT_'))return {status:err.status || 503,message:err.message,details:{code:err.code,resetsAt:err.resetsAt,usage:err.usage}};
    if (err?.code === 'AI_RATE_LIMIT' || /429|quota/i.test(err?.message || '')) return { status: 429, message: 'Cuota de IA agotada temporalmente. Intenta más tarde.' };
    if (err?.code === 'AI_SAFETY') return { status: 400, message: 'El proveedor no pudo procesar esta solicitud de forma segura.' };
    if (err?.code === 'AI_NOT_CONFIGURED' || err?.code === 'AI_AUTH') return { status: 503, message: 'IA no configurada correctamente en el servidor.' };
    if (err?.code === 'AI_INCOMPLETE_RESPONSE') return { status: 502, message: 'La IA no terminó la respuesta. Puedes volver a intentarlo.' };
    if (err?.code === 'AI_EMPTY_RESPONSE') return { status: 502, message: 'La IA no devolvió contenido. Puedes volver a intentarlo.' };
    if (err?.code === 'AI_TIMEOUT') return { status: 504, message: 'La IA tardó demasiado en responder.' };
    return { status: err?.status || 500, message: 'Error al procesar la solicitud de IA.' };
}

function structuredInput(body = {}, user = null) {
    const message = String(body.message || body.prompt || body.query || body.text || '').trim().slice(0, 12000);
    const attachments = getAttachments(body.attachmentIds, user);
    const requestedMode = MODES.has(body.mode) ? body.mode : 'auto';
    const history = Array.isArray(body.history) ? body.history.slice(-24) : [];
    const focus = conversationFocus(message, history);
    const classificationMessage = focus.followUp && focus.anchor
        ? `${focus.anchor}\n${message}`
        : message;
    const selectedModel = orionModel(body.modelProfile);
    return {
        message,
        context: String(body.context || '').trim().slice(0, 18000),
        // Doce intercambios permiten conservar el tema y varias correcciones
        // sin convertir toda la conversación en contexto ilimitado.
        history,
        conversationMemory: body.conversationMemory || null,
        businessProfile: user?.preferences?.businessProfile || null,
        mode: requestedMode,
        tier: selectedModel?.tier || selectModelTier({ message: classificationMessage, mode: requestedMode, attachments }),
        modelProfile: selectedModel ? body.modelProfile : null,
        attachments,
        userKeyHash: hashUser(user),
        conversationId: String(body.conversationId || '').trim().slice(0, 100),
    };
}

async function hydratedInput(body, user) {
    const input = structuredInput(body,user);
    if (user?.sub) {
        let timer;
        try {
            const profile = await Promise.race([profileStore.findById(user.sub), new Promise(resolve=>{ timer=setTimeout(()=>resolve(null),1500); })]);
            input.businessProfile = profile?.preferences?.businessProfile || null;
        } catch { /* El perfil opcional no debe impedir responder. */ }
        finally { clearTimeout(timer); }
    }
    return input;
}

function hashUser(user) {
    const identity = user?.id || user?.sub || user?.email;
    return identity
        ? crypto.createHash('sha256').update(`vall-ai:${identity}`).digest('hex')
        : null;
}

async function persistTrainingTurn(user, input, result) {
    if (!user?.sub || user.trainingOptIn === false || !input?.message || !result?.text) return;
    try{const current=await profileStore.findById(user.sub);if(!current?.active || current.trainingOptIn!==true)return;}
    catch{return;}
    await profileStore.recordTrainingQuery(user.sub, {
        conversationId: input.conversationId,
        query: input.message,
        response: result.text,
        model: result.model || result.tier || '',
        queryId: result.queryId,
        metadata: { mode: result.mode || input.mode, tier: result.tier || input.tier, evidenceCount: result.evidenceCount || 0, citations: result.citations || [] },
    }).catch(error => console.warn('[chat-history] No se guardó la consulta para entrenamiento:', error.message));
}

// Registro operativo separado del entrenamiento: conserva quién consultó,
// el hilo y el modelo elegido sin depender de que la persona acepte entrenar
// con sus mensajes. El fallo de Supabase nunca bloquea una respuesta útil.
async function persistOrionTurn(user, input, result, scope = null) {
    if (!user?.sub || !input?.message) return;
    const decision = scope || domainDecision({ message: input.message, history: input.history, attachments: input.attachments });
    const meta = result?.response?.meta || {};
    await profileStore.recordOrionQuery(user.sub, {
        userEmail: user.email,
        userDisplayName: user.displayName || user.name || '',
        conversationId: input.conversationId,
        query: input.message,
        response: result?.text || '',
        mode: result?.mode || input.mode,
        tier: result?.tier || input.tier,
        model: result?.model || '',
        domainAllowed: decision.allowed,
        domainReason: decision.reason,
        queryId: result?.queryId,
        latencyMs: meta.latencyMs,
        metadata: {
            modelProfile: input.modelProfile || null,
            modelFallback: !!result?.modelFallback,
            evidenceCount: result?.evidenceCount || 0,
            retrievalStrategy: result?.retrievalStrategy || '',
            attachmentCount: Array.isArray(input.attachments) ? input.attachments.length : 0,
        },
    }).catch(error => console.warn('[orion-audit] No se guardó la consulta:', error.message));
}

router.get('/chat-conversations', verifyToken, async (req, res) => {
    try {
        if (!req.user.sub) return res.json({ success: true, data: [] });
        const rows = await profileStore.listConversations(req.user.sub);
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, data: rows.map(row => ({ id: row.id, title: row.title, messages: row.messages, createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at) })) });
    } catch (error) {
        console.error('/api/chat-conversations:', error.message);
        res.status(500).json({ success: false, error: 'No se pudo cargar el historial.' });
    }
});

router.post('/chat-conversations', verifyToken, chatJson, async (req, res) => {
    try {
        if (!req.user.sub) return res.status(409).json({ success: false, error: 'Vuelve a iniciar sesión para activar tu historial personal.' });
        const conversation = req.body?.conversation;
        if (!conversation?.id || !Array.isArray(conversation.messages)) return res.status(400).json({ success: false, error: 'Conversación no válida.' });
        await profileStore.saveConversation(req.user.sub, conversation);
        res.json({ success: true });
    } catch (error) {
        console.error('/api/chat-conversations POST:', error.message);
        res.status(500).json({ success: false, error: 'No se pudo guardar la conversación.' });
    }
});

router.post('/chat-conversations/delete', verifyToken, chatJson, async (req, res) => {
    try {
        if (req.user.sub) await profileStore.deleteConversation(req.user.sub, String(req.body?.conversationId || '').slice(0, 100));
        res.json({ success: true });
    } catch (error) {
        console.error('/api/chat-conversations/delete:', error.message);
        res.status(500).json({ success: false, error: 'No se pudo eliminar la conversación.' });
    }
});

// Token efímero para Gemini Live. La credencial permanente permanece en el
// servidor; el token solo abre una llamada, con modelo y configuración fijados.
router.get('/chat-usage',verifyToken,async(req,res)=>{
    try{res.json({success:true,usage:await chatCredits.status(req.user)});}
    catch(error){const safe=publicAiError(error);res.status(safe.status).json({success:false,error:safe.message,...safe.details});}
});
router.post('/ai-live-token', verifyToken, liveTokenLimiter, chatJson, aiWork(async (_req, res) => {
    if(!exempt(_req.user))return res.status(403).json({success:false,code:'CHAT_REALTIME_UNAVAILABLE',error:'La voz en tiempo real aún no permite validar el consumo. Puedes usar el chat escrito o el dictado.'});
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
        res.status(safe.status).json({ success: false, error: safe.message,...safe.details });
    }
}));

// Gemini Live procesa el audio directamente, por lo que la transcripción no
// pasa por /ai-insight-stream. Este endpoint conserva cada turno de voz en la
// misma auditoría privada que el chat escrito.
router.post('/orion-live-turn', verifyToken, liveTurnLimiter, chatJson, async (req, res) => {
    const message = String(req.body?.message || '').trim().slice(0, 12000);
    if (!message) return res.status(400).json({ success: false, error: 'Mensaje de voz vacío.' });
    const input = structuredInput({ ...req.body, message }, req.user);
    const scope = domainDecision({ message, history: input.history });
    await persistOrionTurn(req.user, input, {
        text: String(req.body?.response || '').trim().slice(0, 50000),
        tier: 'flash', mode: 'normal', model: LIVE_MODEL, response: { meta: {} },
    }, scope);
    res.json({ success: true });
});

router.post('/chat', verifyToken, aiLimiter,chatCredits.admission, chatJson, aiWork(async (req, res) => {
    const message = (req.body?.message || '').toString().trim().slice(0, 12000);
    if (!message) return res.status(400).json({ error: 'Mensaje vacío' });
    if (!orchestrator.isConfigured()) return res.status(503).json({ error: 'IA no configurada.' });

    try {
        const input = { ...await hydratedInput(req.body, req.user), message };
        const result = await orchestrator.generateStructured(input);
        await persistOrionTurn(req.user, input, result);
        await persistTrainingTurn(req.user, input, result);
        res.json({ success: true, reply: result.text, response: result.response, tier: result.tier,
            modelProfile: input.modelProfile, modelFallback: !!result.modelFallback,
            mode: result.mode, queryId: result.queryId, evidenceCount: result.evidenceCount,
            citations: result.citations, retrievalStrategy: result.retrievalStrategy });
    } catch (err) {
        console.error('/api/chat error:', err.message);
        const safe = publicAiError(err);
        res.status(safe.status).json({ success: false, error: safe.message,...safe.details });
    }
}));

// Respuesta rica no transmitida: útil para integraciones, documentos y pruebas.
router.post('/ai-rich', verifyToken, aiLimiter,chatCredits.admission, chatJson, aiWork(async (req, res) => {
    const input = await hydratedInput(req.body, req.user);
    if (!input.message) return res.status(400).json({ success: false, error: 'Mensaje vacío.' });
    if (!orchestrator.isConfigured()) return res.status(503).json({ success: false, error: 'IA no configurada.' });
    try {
        const result = await orchestrator.generateStructured(input);
        await persistOrionTurn(req.user, input, result);
        await persistTrainingTurn(req.user, input, result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('/api/ai-rich error:', err.message);
        const safe = publicAiError(err);
        res.status(safe.status).json({ success: false, error: safe.message,...safe.details });
    }
}));

// Cálculo reproducible e independiente del proveedor generativo. El cliente
// lo consulta solo si el streaming no entrega los bloques estructurados.
router.post('/statistical-analysis', verifyToken, statisticsLimiter, chatJson, aiWork(async (req, res) => {
    const message = (req.body?.message || req.body?.prompt || '').toString().trim().slice(0, 12000);
    if (!message) return res.status(400).json({ success: false, error: 'Mensaje vacío.' });
    const input = structuredInput({ ...req.body, message }, req.user);
    const scope = domainDecision({ message, history: input.history });
    if (!scope.allowed) {
        const text = domainRedirectText(scope.reason);
        await persistOrionTurn(req.user, input, { text, tier: 'flash', mode: 'quick', model: 'orion-domain-guard', response: { meta: {} } }, scope);
        return res.status(400).json({ success: false, error: text });
    }
    if (!wantsStatisticalAnalysis(message)) {
        return res.status(400).json({ success: false, error: 'La consulta no solicita un análisis estadístico o una regresión lineal.' });
    }
    try {
        const model = await buildStatisticalModel(message);
        const response = statisticalResponse(model);
        await persistOrionTurn(req.user, input, {
            text: response.markdown, response, tier: input.tier, mode: 'technical',
            model: 'orion-statistical-engine', evidenceCount: response.meta?.statisticalModel?.available ? 1 : 0,
        }, scope);
        res.json({
            success: true,
            available: response.meta?.statisticalModel?.available === true,
            text: response.markdown,
            response,
        });
    } catch (err) {
        console.error('/api/statistical-analysis error:', err.message);
        res.status(502).json({ success: false, error: 'No fue posible calcular el análisis estadístico verificable.' });
    }
}));

router.post('/ai-feedback', verifyToken, aiLimiter, chatJson, async (req, res) => {
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
router.post('/ai-insight', verifyToken, aiLimiter,chatCredits.admission, chatJson, aiWork(async (req, res) => {
    const input = await hydratedInput(req.body, req.user);
    // Soporte retrocompatible: el campo legacy era 'prompt', el orquestador usa 'message'
    if (!input.message && req.body?.prompt) input.message = String(req.body.prompt).trim().slice(0, 12000);
    if (!input.message) return res.status(400).json({ error: 'Prompt vacío' });
    if (!orchestrator.isConfigured()) return res.status(503).json({ error: 'IA no configurada.' });

    try {
        const result = await orchestrator.generateStructured(input);
        await persistOrionTurn(req.user, input, result);
        await persistTrainingTurn(req.user, input, result);
        res.json({ reply: result.text, response: result.response, tier: result.tier });
    } catch (err) {
        console.error('/api/ai-insight error:', err.message);
        const safe = publicAiError(err);
        res.status(safe.status).json({ error: safe.message,...safe.details });
    }
}));

// ── Igual que /ai-insight, pero transmite la respuesta por fragmentos (SSE) para
//    que el chat pueda mostrar el texto llegando en vivo en lugar de esperar el total. ──
router.post('/ai-insight-stream', verifyToken, aiLimiter,chatCredits.admission, chatJson, aiWork(async (req, res) => {
    const prompt       = (req.body?.prompt || req.body?.message || req.body?.query || '').toString().trim().slice(0, 12000);
    const systemPrompt = (req.body?.systemPrompt || '').toString().trim().slice(0, 6000);
    const requestedMode = MODES.has(req.body?.mode) ? req.body.mode : 'auto';
    const tier          = selectModelTier({ message: prompt, mode: requestedMode });
    const wantsStructured = Boolean(chatMeter()) || req.body?.structured === true || Boolean(req.body?.message && !req.body?.systemPrompt);
    const richInput = await hydratedInput(req.body, req.user);
    if (!(wantsStructured ? richInput.message : prompt)) return res.status(400).json({ error: 'Prompt vacío' });
    if (wantsStructured ? !orchestrator.isConfigured() : !genAI) return res.status(503).json({ error: 'IA no configurada.' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (obj) => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

    if (wantsStructured) {
        const generationController = new AbortController();
        const cancelGeneration = () => { if (!res.writableEnded) generationController.abort(); };
        res.once('close', cancelGeneration);
        let sentText = false;
        try {
            send({ status: 'analyzing', mode: richInput.mode });
            let result;
            try {
                result = await orchestrator.stream({
                    ...richInput, signal: generationController.signal,
                    onText(part, full) { sentText = true; send({ text: part, partialLength: full.length }); },
                    onStatus(status) { send({ status }); },
                });
            } catch (err) {
                if (richInput.tier === 'pro' && orchestrator.provider?.name !== 'gemini' && err.code === 'AI_RATE_LIMIT' && !sentText) {
                    send({ status: 'fallback', tier: 'flash' });
                    result = await orchestrator.stream({
                        ...richInput, tier: 'flash', signal: generationController.signal,
                        onText(part, full) { sentText = true; send({ text: part, partialLength: full.length }); },
                        onStatus(status) { send({ status }); },
                    });
                    result.modelFallback = true;
                } else throw err;
            }
            if (generationController.signal.aborted) return;
            await persistOrionTurn(req.user, richInput, result);
            await persistTrainingTurn(req.user, richInput, result);
            send({ response: result.response, done: true, tier: result.tier, mode: result.mode,
                model: result.model, modelProfile: richInput.modelProfile, modelFallback: !!result.modelFallback,
                queryId: result.queryId, evidenceCount: result.evidenceCount,
                citations: result.citations, retrievalStrategy: result.retrievalStrategy,
                finalText: result.text });
        } catch (err) {
            if (generationController.signal.aborted) return;
            console.error('/api/ai-insight-stream structured error:', err.message);
            // Si ya hubo texto en pantalla, conservarlo es preferible a
            // reemplazar una respuesta útil por un fallo de cierre/persistencia.
            if (sentText) send({ done: true, tier: richInput.tier, mode: richInput.mode, warning: publicAiError(err).message });
            else send({ error: publicAiError(err).message, code: err.code || 'AI_ERROR' });
        } finally {
            res.removeListener('close', cancelGeneration);
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
}));

module.exports = router;
// Exportación auxiliar para probar el contrato sin levantar el servidor.
module.exports.structuredInput = structuredInput;
module.exports.hashUser = hashUser;
module.exports.liveSessionConfig = liveSessionConfig;
module.exports.LIVE_MODEL = LIVE_MODEL;
module.exports.liveFxInstruction = liveFxInstruction;
