'use strict';

const { GeminiProvider } = require('./providers/gemini-provider');
const { buildPrompt } = require('./prompt-builder');
const { createContext } = require('./context-manager');
const { markdownToRichResponse, validateRichResponse, toLegacyMarkdown, ensureRequestedChart, ensureRequestedTable } = require('./response-schema');
const { ToolRegistry } = require('./tool-registry');
const { domainDecision, domainRedirectText } = require('./domain-policy');
const { ragRetriever } = require('./rag-retriever');

function retrievalQuestion(message, history, scopeReason) {
    if (scopeReason !== 'follow_up' || !Array.isArray(history)) return message;
    const previous = [...history].reverse().find(item => item?.role === 'user');
    const previousText = previous?.content || previous?.text || '';
    return previousText ? `${message}\nContexto anterior: ${previousText}` : message;
}

function attachEvidence(response, evidence) {
    if (evidence.chartRequested && evidence.chartStatus !== 'user_supplied') {
        response.blocks = response.blocks.filter(block => block.type !== 'chart');
        if (response.markdown) {
            response.markdown = response.markdown.replace(/```chart\s*\n[\s\S]*?```/gi, '').trim();
        }
        const verifiedCharts = evidence.charts || (evidence.chart ? [evidence.chart] : []);
        for (const spec of verifiedCharts) response.blocks.push({ type: 'chart', spec });
        if (response.markdown && verifiedCharts.length) {
            response.markdown += verifiedCharts.map(spec =>
                `\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``
            ).join('');
        }
        if (!verifiedCharts.length) {
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
        const retrievalQuery = retrievalQuestion(message, history, scope.reason);
        const evidence = await this.retriever.retrieve(retrievalQuery, userKeyHash);
        const enrichedContext = [evidence.context, context].filter(Boolean).join('\n\n');
        const built = buildPrompt({ message, history, context: enrichedContext, mode, responseFormat: 'markdown', attachments });
        const resolvedTier = tier === 'pro' || tier === 'flash' ? tier : built.recommendedTier;
        
        let finalBuilt = built;
        if (resolvedTier === 'pro') {
            try {
                // Paso de Reflexión (Borrador Rápido)
                const draftResult = await this.provider.generate({ ...built, tier: 'flash', json: false, attachments });
                if (draftResult.text) {
                    finalBuilt.prompt += `\n\n[BORRADOR INTERNO PREVIO]\n${draftResult.text}\n\n[INSTRUCCIÓN DE REFLEXIÓN]\nRevisa el borrador anterior críticamente. Verifica que cumpla absolutamente con las [REGLAS NEURONALES APRENDIDAS AUTÓNOMAMENTE] (si existen en tu contexto). Escribe la versión final, mejorada y libre de errores. No menciones el proceso de revisión, solo entrega la respuesta perfecta.`;
                }
            } catch (e) {
                console.warn('[Orchestrator] Falló el paso de borrador, omitiendo reflexión:', e.message);
            }
        }

        const result = await this.provider.stream({ ...finalBuilt, tier: resolvedTier, onText, attachments });
        if (!result.text) throw Object.assign(new Error('El proveedor devolvió una respuesta vacía.'), { code: 'AI_EMPTY_RESPONSE', status: 502 });
        let response = markdownToRichResponse(result.text, {
            mode: built.mode, taskType: built.taskType, provider: this.provider.name,
            model: result.model, latencyMs: Date.now() - started,
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
        return { response, text, tier: resolvedTier, mode: built.mode, model: result.model, queryId,
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
        const retrievalQuery = retrievalQuestion(message, history, scope.reason);
        const evidence = await this.retriever.retrieve(retrievalQuery, userKeyHash);
        const enrichedContext = [evidence.context, context].filter(Boolean).join('\n\n');
        const built = buildPrompt({ message, history, context: enrichedContext, mode, responseFormat: 'json', attachments });
        const resolvedTier = tier === 'pro' || tier === 'flash' ? tier : built.recommendedTier;
        
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

        const result = await this.provider.generate({ ...finalBuilt, tier: resolvedTier, json: true, attachments });
        let parsed;
        try { parsed = JSON.parse(result.text); }
        catch {
            let response = markdownToRichResponse(result.text, {
                mode: built.mode, taskType: built.taskType, provider: this.provider.name,
                model: result.model, latencyMs: Date.now() - started, warnings: ['El JSON del modelo no fue válido; se aplicó el modo compatible.'],
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
            return { response, text, tier: resolvedTier, mode: built.mode, model: result.model, queryId,
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
        return { response, text, tier: resolvedTier, mode: built.mode, model: result.model, queryId,
            evidenceCount: evidence.evidenceCount, citations: evidence.citations, retrievalStrategy: evidence.retrievalStrategy };
    }

    buildContext(input) { return createContext(input); }
}

const orchestrator = new AIOrchestrator();
module.exports = { AIOrchestrator, orchestrator, retrievalQuestion, attachEvidence };
