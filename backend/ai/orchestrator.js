'use strict';

const { GeminiProvider } = require('./providers/gemini-provider');
const { buildPrompt, REPORT_MIN_WORDS } = require('./prompt-builder');
const { createContext } = require('./context-manager');
const { markdownToRichResponse, validateRichResponse, toLegacyMarkdown, ensureRequestedChart, ensureRequestedTable } = require('./response-schema');
const { ToolRegistry } = require('./tool-registry');
const { domainDecision, domainRedirectText } = require('./domain-policy');
const { ragRetriever } = require('./rag-retriever');
const { resolveCurrencyConversion, conversionContext, isSimpleCurrencyConversion, conversionAnswer } = require('./currency-converter');
const { planQuery, planContext, mergeEvidence } = require('./query-planner');
const { groundLiveData } = require('./live-data-grounder');
const { auditResponse, appendDisclosure } = require('./response-quality');

function retrievalQuestion(message, history, scopeReason) {
    if (scopeReason !== 'follow_up' || !Array.isArray(history)) return message;
    const previous = [...history].reverse().find(item => item?.role === 'user');
    const previousText = previous?.content || previous?.text || '';
    return previousText ? `${message}\nContexto anterior: ${previousText}` : message;
}

function countVisibleWords(value) {
    const normalized = String(value || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    return normalized ? normalized.split(/\s+/).length : 0;
}

function canFallbackFromPro(error) {
    return ['AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_PROVIDER_ERROR'].includes(error?.code);
}

function effectiveTier(provider, requestedTier, result) {
    const expected = typeof provider?.modelForTier === 'function' ? provider.modelForTier(requestedTier) : null;
    return requestedTier === 'pro' && expected && result?.model && result.model !== expected ? 'flash' : requestedTier;
}

function attachEvidence(response, evidence) {
    if (evidence.chartRequested && evidence.chartStatus !== 'user_supplied') {
        const verifiedCharts = evidence.charts || (evidence.chart ? [evidence.chart] : []);
        const hasLlmChart = response.blocks.some(block => block.type === 'chart');
        
        if (verifiedCharts.length) {
            // RAG provided a verified chart, overwrite the LLM's charts to prevent hallucinated data
            response.blocks = response.blocks.filter(block => block.type !== 'chart');
            if (response.markdown) {
                response.markdown = response.markdown.replace(/```chart\s*\n[\s\S]*?```/gi, '').trim();
            }
            for (const spec of verifiedCharts) response.blocks.push({ type: 'chart', spec });
            if (response.markdown) {
                response.markdown += verifiedCharts.map(spec =>
                    `\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``
                ).join('');
            }
        } else if (evidence.chartStatus === 'insufficient_data' || evidence.chartStatus === 'unsupported_subject') {
            // Sin evidencia no se conserva una gráfica sugerida por el modelo:
            // sería una visualización sin datos verificables.
            response.blocks = response.blocks.filter(block => block.type !== 'chart');
            if (response.markdown) response.markdown = response.markdown.replace(/```chart\s*\n[\s\S]*?```/gi, '').trim();
            const content = evidence.chartStatus === 'unsupported_subject'
                ? 'No identifiqué una serie disponible relacionada con la gráfica solicitada. Indica el activo o indicador y el periodo.'
                : 'No hay suficientes observaciones verificadas para construir esa gráfica sin inventar datos.';
            response.blocks.push({ type: 'alert', severity: 'warning', title: 'Gráfica no generada', content });
            if (response.markdown) response.markdown += `\n\n> **Gráfica no generada:** ${content}`;
        } else if (!hasLlmChart) {
            // Neither RAG nor LLM provided a chart, show the failure message
            const content = evidence.chartStatus === 'unsupported_subject'
                ? 'No identifiqué una serie disponible relacionada con la gráfica solicitada. Indica el activo o indicador y el periodo.'
                : 'No hay suficientes observaciones verificadas para construir esa gráfica sin inventar datos.';
            response.blocks.push({
                type: 'alert', severity: 'warning',
                title: 'Gráfica no generada', content,
            });
            if (response.markdown) response.markdown += `\n\n> **Gráfica no generada:** ${content}`;
        }
    }
    response.meta = response.meta || {};
    response.meta.citations = (evidence.citations || []).slice(0, 24);
    response.meta.retrievalStrategy = evidence.retrievalStrategy;
    response.meta.evidenceCount = evidence.evidenceCount;
    response.meta.chartStatus = evidence.chartStatus;
    return response;
}

class AIOrchestrator {
    constructor({ provider = new GeminiProvider(), tools = new ToolRegistry(), retriever = ragRetriever } = {}) {
        this.provider = provider;
        this.tools = tools;
        this.retriever = retriever;
    }
    isConfigured() { return this.provider.isConfigured(); }

    async generateWithFallback(request, tier) {
        try {
            const result = await this.provider.generate({ ...request, tier });
            return { result, tier: effectiveTier(this.provider, tier, result) };
        } catch (error) {
            if (tier !== 'pro' || !canFallbackFromPro(error)) throw error;
            console.warn('[Orchestrator] Gemini Pro no disponible; se usa Flash como respaldo:', error.code);
            return { result: await this.provider.generate({ ...request, tier: 'flash' }), tier: 'flash' };
        }
    }

    async streamWithFallback(request, tier, onText) {
        let emitted = false;
        const trackedOnText = (part, full) => {
            emitted = true;
            onText?.(part, full);
        };
        try {
            const result = await this.provider.stream({ ...request, tier, onText: trackedOnText });
            return { result, tier: effectiveTier(this.provider, tier, result) };
        } catch (error) {
            // No cambiamos de modelo tras haber comenzado a transmitir: evitaría
            // repetir texto. Antes del primer fragmento, Flash conserva el chat
            // disponible cuando Pro alcanza cuota o presenta una falla temporal.
            if (tier !== 'pro' || emitted || !canFallbackFromPro(error)) throw error;
            console.warn('[Orchestrator] Gemini Pro no inició; se usa Flash como respaldo:', error.code);
            return { result: await this.provider.stream({ ...request, tier: 'flash', onText: trackedOnText }), tier: 'flash' };
        }
    }

    async enforceReportMinimum(built, result, tier) {
        if (built.taskType !== 'document') return { result, tier, warnings: [] };
        const words = countVisibleWords(result.text);
        if (words >= REPORT_MIN_WORDS) return { result, tier, warnings: [] };

        const instruction = `\n\n[CONTROL FINAL DE EXTENSIÓN]\nEl borrador siguiente tiene aproximadamente ${words} palabras y no cumple el mínimo obligatorio de ${REPORT_MIN_WORDS}. Reescribe el informe completo, no agregues un apéndice aislado. Conserva sólo afirmaciones respaldadas, responde al encargo concreto y entrega entre 1,100 y 1,600 palabras. Amplía con metodología, mecanismos, escenarios, riesgos, recomendaciones y limitaciones sin repetir frases.\n\n[BORRADOR A MEJORAR]\n${result.text}`;
        try {
            const repaired = await this.generateWithFallback({
                prompt: built.prompt + instruction,
                systemInstruction: built.systemInstruction,
                json: false,
                attachments: [],
                maxOutputTokens: 16384,
            }, tier);
            const repairedWords = countVisibleWords(repaired.result.text);
            if (repairedWords >= REPORT_MIN_WORDS) return { ...repaired, warnings: [] };
            return { result, tier, warnings: [`El informe quedó en ${repairedWords} palabras tras la revisión; se conserva el borrador original para no rellenar contenido.`] };
        } catch (error) {
            console.warn('[Orchestrator] No se pudo ampliar el informe:', error.code || error.message);
            return { result, tier, warnings: [`No se pudo ejecutar la revisión de extensión (${error.code || 'AI_ERROR'}).`] };
        }
    }

    async stream({ message, history, context, mode = 'auto', tier = 'auto', onText, attachments = [], userKeyHash = null }) {
        const started = Date.now();
        const scope = domainDecision({ message, history, attachments });
        if (!scope.allowed) {
            const text = domainRedirectText(scope.reason);
            onText?.(text, text);
            const response = markdownToRichResponse(text, {
                mode: 'quick', taskType: 'domain_redirect', provider: 'local',
                model: 'vall-domain-guard', latencyMs: Date.now() - started,
            });
            return { response, text, tier: 'flash', mode: 'quick', model: 'vall-domain-guard' };
        }
        const plan = planQuery({ message, history, mode });
        const directConversion = await resolveCurrencyConversion(message);
        if (isSimpleCurrencyConversion(message, directConversion)) {
            const text = conversionAnswer(directConversion);
            onText?.(text, text);
            const response = markdownToRichResponse(text, {
                mode: 'quick', taskType: 'currency_conversion', provider: 'local',
                model: 'vall-fx-reference', latencyMs: Date.now() - started,
            });
            return { response, text, tier: 'flash', mode: 'quick', model: 'vall-fx-reference', evidenceCount: 1, citations: [], retrievalStrategy: 'live_fx_reference' };
        }
        const retrievalQuery = retrievalQuestion(message, history, scope.reason);
        const [baseEvidence, conversion, liveData] = await Promise.all([
            this.retriever.retrieve(retrievalQuery, userKeyHash),
            Promise.resolve(directConversion),
            groundLiveData(plan, retrievalQuery),
        ]);
        const evidence = mergeEvidence(baseEvidence, liveData);
        const enrichedContext = [planContext(plan), conversionContext(conversion), evidence.context, context].filter(Boolean).join('\n\n');
        const built = buildPrompt({ message, history, context: enrichedContext, mode, responseFormat: 'markdown', attachments });
        const resolvedTier = tier === 'pro' || tier === 'flash'
            ? tier
            : (plan.recommendedTier === 'pro' || built.recommendedTier === 'pro' ? 'pro' : 'flash');
        
        // En chat transmitido priorizamos tiempo al primer fragmento. El antiguo
        // borrador oculto hacía una generación completa extra antes de mostrar
        // una sola palabra y prácticamente duplicaba la latencia en modo Pro.
        let { result, tier: usedTier } = await this.streamWithFallback({ ...built, attachments }, resolvedTier, onText);
        if (!result.text) throw Object.assign(new Error('El proveedor devolvió una respuesta vacía.'), { code: 'AI_EMPTY_RESPONSE', status: 502 });
        const quality = auditResponse({ text: result.text, plan, liveData, evidence });
        if (quality.disclosure) {
            const previousText = result.text;
            result = { ...result, text: appendDisclosure(result.text, quality) };
            // El chat ya recibió el cuerpo por streaming. Se entrega el control
            // de calidad como último fragmento, sin reescribir lo mostrado.
            onText?.(result.text.slice(previousText.length), result.text);
        }
        const reportQuality = await this.enforceReportMinimum(built, result, usedTier);
        result = reportQuality.result;
        usedTier = reportQuality.tier;
        let response = markdownToRichResponse(result.text, {
            mode: built.mode, taskType: built.taskType, provider: this.provider.name,
            model: result.model, latencyMs: Date.now() - started, warnings: [...reportQuality.warnings, ...quality.warnings],
        });
        response = ensureRequestedChart(response, message);
        response = ensureRequestedTable(response, message);
        attachEvidence(response, evidence);
        const text = toLegacyMarkdown(response);
        // El texto ya se transmitió al cliente. Registrar telemetría y evidencia
        // no debe convertir una respuesta terminada en un error visible.
        let queryId = null;
        try {
            queryId = await this.retriever.recordQuery({
                userKeyHash, message, intent: built.taskType, domainAllowed: true,
                retrievalQuery, retrievalStrategy: evidence.retrievalStrategy,
                retrievedChunks: evidence.retrievedChunks, evidenceCount: evidence.evidenceCount,
                retrievalLatencyMs: evidence.retrievalLatencyMs,
                sourceCodes: evidence.sourceCodes, model: result.model, responseText: text,
                latencyMs: Date.now() - started,
            });
            await this.retriever.recordEvidence(queryId, evidence.evidenceRecords, text);
        } catch (error) {
            console.warn('[Orchestrator] No se pudo guardar la auditoría del chat:', error.message);
        }
        return { response, text, tier: usedTier, mode: built.mode, model: result.model, queryId,
            evidenceCount: evidence.evidenceCount, citations: evidence.citations, retrievalStrategy: evidence.retrievalStrategy };
    }

    async generateStructured({ message, history, context, mode = 'auto', tier = 'auto', attachments = [], userKeyHash = null }) {
        const started = Date.now();
        const scope = domainDecision({ message, history, attachments });
        if (!scope.allowed) {
            const text = domainRedirectText(scope.reason);
            const response = markdownToRichResponse(text, {
                mode: 'quick', taskType: 'domain_redirect', provider: 'local',
                model: 'vall-domain-guard', latencyMs: Date.now() - started,
            });
            return { response, text, tier: 'flash', mode: 'quick', model: 'vall-domain-guard' };
        }
        const plan = planQuery({ message, history, mode });
        const directConversion = await resolveCurrencyConversion(message);
        if (isSimpleCurrencyConversion(message, directConversion)) {
            const text = conversionAnswer(directConversion);
            const response = markdownToRichResponse(text, {
                mode: 'quick', taskType: 'currency_conversion', provider: 'local',
                model: 'vall-fx-reference', latencyMs: Date.now() - started,
            });
            return { response, text, tier: 'flash', mode: 'quick', model: 'vall-fx-reference', evidenceCount: 1, citations: [], retrievalStrategy: 'live_fx_reference' };
        }
        const retrievalQuery = retrievalQuestion(message, history, scope.reason);
        const [baseEvidence, conversion, liveData] = await Promise.all([
            this.retriever.retrieve(retrievalQuery, userKeyHash),
            Promise.resolve(directConversion),
            groundLiveData(plan, retrievalQuery),
        ]);
        const evidence = mergeEvidence(baseEvidence, liveData);
        const enrichedContext = [planContext(plan), conversionContext(conversion), evidence.context, context].filter(Boolean).join('\n\n');
        const built = buildPrompt({ message, history, context: enrichedContext, mode, responseFormat: 'json', attachments });
        const resolvedTier = tier === 'pro' || tier === 'flash'
            ? tier
            : (plan.recommendedTier === 'pro' || built.recommendedTier === 'pro' ? 'pro' : 'flash');
        
        let finalBuilt = built;
        if (resolvedTier === 'pro') {
            try {
                // Paso de Reflexión (Borrador Rápido)
                const draftResult = await this.provider.generate({ ...built, tier: 'flash', json: false, attachments });
                if (draftResult.text) {
                    finalBuilt.prompt += `\n\n[BORRADOR INTERNO PREVIO]\n${draftResult.text}\n\n[INSTRUCCIÓN DE REFLEXIÓN]\nRevisa el borrador anterior críticamente. Verifica que cumpla con las [REGLAS NEURONALES APRENDIDAS AUTÓNOMAMENTE]. Genera el JSON final mejorado.`;
                }
            } catch (e) {
                console.warn('[Orchestrator] Falló el paso de borrador estructurado, omitiendo reflexión:', e.message);
            }
        }
        let { result, tier: usedTier } = await this.generateWithFallback({ ...finalBuilt, json: true, attachments, maxOutputTokens: 16384 }, resolvedTier);
        let parsed;
        let cleanText = result.text.trim();
        if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```[\w-]*\r?\n/, '').replace(/\r?\n```$/, '').trim();
        }
        try { parsed = JSON.parse(cleanText); }
        catch {
            const quality = auditResponse({ text: result.text, plan, liveData, evidence });
            result = { ...result, text: appendDisclosure(result.text, quality) };
            let response = markdownToRichResponse(result.text, {
                mode: built.mode, taskType: built.taskType, provider: this.provider.name,
                model: result.model, latencyMs: Date.now() - started, warnings: ['El JSON del modelo no fue válido; se aplicó el modo compatible.', ...quality.warnings],
            });
            response = ensureRequestedChart(response, message);
            response = ensureRequestedTable(response, message);
            attachEvidence(response, evidence);
            const text = toLegacyMarkdown(response);
            const queryId = await this.retriever.recordQuery({
                userKeyHash, message, intent: built.taskType, domainAllowed: true,
                retrievalQuery, retrievalStrategy: evidence.retrievalStrategy,
                retrievedChunks: evidence.retrievedChunks, evidenceCount: evidence.evidenceCount,
                retrievalLatencyMs: evidence.retrievalLatencyMs,
                sourceCodes: evidence.sourceCodes, model: result.model, responseText: text,
                latencyMs: Date.now() - started,
            });
            await this.retriever.recordEvidence(queryId, evidence.evidenceRecords, text);
            return { response, text, tier: usedTier, mode: built.mode, model: result.model, queryId,
                evidenceCount: evidence.evidenceCount, citations: evidence.citations, retrievalStrategy: evidence.retrievalStrategy };
        }
        const checked = validateRichResponse(parsed, {
            mode: built.mode, taskType: built.taskType, provider: this.provider.name,
            model: result.model, latencyMs: Date.now() - started, markdown: parsed.markdown,
        });
        let response = checked.valid ? checked.value : markdownToRichResponse(result.text, {
            mode: built.mode, taskType: built.taskType, provider: this.provider.name,
            model: result.model, latencyMs: Date.now() - started, warnings: checked.errors,
        });
        const quality = auditResponse({ text: toLegacyMarkdown(response), plan, liveData, evidence });
        if (quality.disclosure) {
            const revised = appendDisclosure(toLegacyMarkdown(response), quality);
            response = markdownToRichResponse(revised, {
                mode: built.mode, taskType: built.taskType, provider: this.provider.name,
                model: result.model, latencyMs: Date.now() - started, warnings: quality.warnings,
            });
        } else if (quality.warnings.length) {
            response.meta.warnings.push(...quality.warnings);
        }
        const reportQuality = await this.enforceReportMinimum(built, {
            text: toLegacyMarkdown(response), model: result.model,
        }, usedTier);
        if (reportQuality.result.text !== toLegacyMarkdown(response)) {
            result = reportQuality.result;
            usedTier = reportQuality.tier;
            response = markdownToRichResponse(result.text, {
                mode: built.mode, taskType: built.taskType, provider: this.provider.name,
                model: result.model, latencyMs: Date.now() - started, warnings: reportQuality.warnings,
            });
        } else if (reportQuality.warnings.length) {
            response.meta.warnings.push(...reportQuality.warnings);
        }
        response = ensureRequestedChart(response, message);
        response = ensureRequestedTable(response, message);
        attachEvidence(response, evidence);
        const text = toLegacyMarkdown(response);
        const queryId = await this.retriever.recordQuery({
            userKeyHash, message, intent: built.taskType, domainAllowed: true,
            retrievalQuery, retrievalStrategy: evidence.retrievalStrategy,
            retrievedChunks: evidence.retrievedChunks, evidenceCount: evidence.evidenceCount,
            retrievalLatencyMs: evidence.retrievalLatencyMs,
            sourceCodes: evidence.sourceCodes, model: result.model, responseText: text,
            latencyMs: Date.now() - started,
        });
        await this.retriever.recordEvidence(queryId, evidence.evidenceRecords, text);
        return { response, text, tier: usedTier, mode: built.mode, model: result.model, queryId,
            evidenceCount: evidence.evidenceCount, citations: evidence.citations, retrievalStrategy: evidence.retrievalStrategy };
    }

    buildContext(input) { return createContext(input); }
}

const orchestrator = new AIOrchestrator();
module.exports = { AIOrchestrator, orchestrator, retrievalQuestion, attachEvidence, countVisibleWords, canFallbackFromPro, effectiveTier };
