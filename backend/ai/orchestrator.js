'use strict';

const { GeminiProvider, googleSearchTools, groundingCitations } = require('./providers/gemini-provider');
const { buildPrompt, REPORT_MIN_WORDS } = require('./prompt-builder');
const { createContext } = require('./context-manager');
const { markdownToRichResponse, validateRichResponse, toLegacyMarkdown, ensureRequestedChart, ensureRequestedTable } = require('./response-schema');
const { ToolRegistry } = require('./tool-registry');
const { createOrionMcpSession } = require('./mcp-tools');
const { evidenceCoverage, coverageContext, sourceDate } = require('./evidence-coverage');
const { researchInstructions, auditResearchAnswer, verifiedResearchFallback } = require('./research-evidence');
const { decisionBrief, decisionContext } = require('./decision-brief');
const { physicalPriceStore: physicalPriceArchive } = require('../ml/physical-price-store');
const { domainDecision, domainRedirectText } = require('./domain-policy');
const { ragRetriever } = require('./rag-retriever');
const { resolveCurrencyConversion, conversionContext, isSimpleCurrencyConversion, conversionAnswer } = require('./currency-converter');
const { planQuery, planContext, mergeEvidence } = require('./query-planner');
const { buildDataInventoryContext } = require('./data-inventory');
const { groundLiveData } = require('./live-data-grounder');
const { auditResponse, appendDisclosure, guardTradeResearch, scopeTradeEvidence, guardNewsCoverage, isEvidenceCitation } = require('./response-quality');
const { buildStatisticalModel, mergeStatisticalEvidence, attachStatisticalModel, wantsStatisticalAnalysis } = require('./statistical-analysis');
const { conversationFocus, balancedExcerpt } = require('./conversation-context');
const { attachAnswerStrategy } = require('./answer-strategy');
const { buildForecastAnalysis, attachForecastAnalysis, guardForecastAnswer } = require('./forecast-analysis');
const { buildShowcaseChart, buildProteinComparisonChart, buildMarranasChart, buildGlobalMarketsChart, buildForecastRecordChart } = require('./analytical-charts');
const { proteinPriceTable } = require('./protein-price-table');
const { prepareBusinessConversation } = require('./business-memory');
const { calculateMargin, wantsCommercialCalculation, commercialReply } = require('./commercial-calculator');
const {responseLength}=require('./answer-format');
const {scenarioRequest,calculateScenarios,scenarioReply,selectScenario}=require('./commercial-scenarios');
const {fxScenarioRequest,fxScenarioReply,sanitizeFxScenarios}=require('./fx-scenarios');
const { ReportReaderAgent } = require('./report-reader-agent');
const { getChatReasoningContext } = require('./loopus-knowledge');
const { getDynamicFewShotContext } = require('./vector-knowledge');
const { recordFeedbackEvent } = require('./closed-loop-feedback');

function finalizeAnalysis(response, { message, history, plan, forecastAnalysis }) {
    const check = guardForecastAnswer(plan, toLegacyMarkdown(response));
    if (check.changed) {
        const metadata = response.meta || {};
        response = markdownToRichResponse(check.text, metadata);
        response.meta = { ...metadata, ...response.meta,
            warnings: [...(metadata.warnings || []), plan.asksForecast ? 'Se retiró una garantía, probabilidad o precio objetivo propio sin validación.' : 'Se omitió un apartado de pronóstico que no corresponde a esta consulta.'] };
    }
    if(plan.asksForecast) attachForecastAnalysis(response, forecastAnalysis);
    return attachAnswerStrategy(response, { message, history, plan });
}

function retrievalQuestion(message, history, scopeReason) {
    const focus = conversationFocus(message, history);
    if ((scopeReason !== 'follow_up' && !focus.followUp) || !focus.recent.length) return message;
    const turns = focus.recent.slice(-8);
    // Conservamos varios turnos, no solo el inmediatamente anterior. En una
    // secuencia «maíz → compáralo → ahora grafícalo», el último usuario ya
    // no contiene la palabra maíz y antes se perdía el sujeto original.
    const context = turns.map(turn =>
        `${turn.role === 'assistant' ? 'Respuesta' : 'Usuario'}: ${balancedExcerpt(turn.text, turn.role === 'assistant' ? 950 : 1200)}`
    ).join('\n');
    const anchor = focus.anchor ? `\nTema base: ${focus.anchor}` : '';
    return context ? `${message}${anchor}\n[CONTEXTO DEL SEGUIMIENTO]\n${context}` : message;
}

function countVisibleWords(value) {
    const normalized = String(value || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    return normalized ? normalized.split(/\s+/).length : 0;
}

function socialFollowUps(hasPreviousAnalysis = false) {
    const item = (label, prompt, icon) => ({ label, prompt, icon });
    if (hasPreviousAnalysis) {
        return [
            item('Retomar análisis', 'Retoma el análisis anterior y dame los puntos clave para decidir.', 'fa-rotate-left'),
            item('Panorama de mercados hoy', 'Dame un panorama rápido de los mercados, dólar y materias primas hoy con fechas y fuentes.', 'fa-globe'),
            item('Precios de proteínas', '¿Cómo están hoy los precios verificables de cerdo, pollo, huevo y res en México?', 'fa-chart-bar'),
        ];
    }
    return [
        item('¿Cómo está el dólar hoy?', '¿Cómo está hoy el tipo de cambio USD/MXN y qué factores lo están moviendo?', 'fa-dollar-sign'),
        item('Precios de proteínas MX', 'Muéstrame los últimos precios verificables de cerdo, pollo, huevo y res en México por plaza y fecha.', 'fa-scale-balanced'),
        item('Pronósticos ML activos', 'Resume los pronósticos cuantitativos walk-forward activos en Loopus y qué activos tienen ventaja validada.', 'fa-chart-line'),
        item('Panorama económico hoy', 'Dame un panorama ejecutivo de mercados financieros, granos y México hoy.', 'fa-newspaper'),
    ];
}

function socialReply(message, history = []) {
    const raw = String(message || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
    const text = raw.replace(/[¿¡,!.?;:]+/g, ' ').replace(/\bq\b/gi, 'que').replace(/\s+/g, ' ').trim();
    const hasPreviousAnalysis = conversationFocus('continua', history).anchor
        && history.some(turn => /\b(?:finanzas?|mercados?|bolsa|divisas?|moneda|dolar|peso|usd|mxn|tasas?|inflacion|noticias?|cerdo|pollo|huevo|res|maiz|trigo|margen)\b/i.test(String(turn?.content || turn?.text || '')));
    const continuation = hasPreviousAnalysis ? ' Cuando quieras podemos retomar el análisis que estábamos viendo.' : '';
    const greetingPrefix = /^buenos dias\b/.test(text) ? '¡Buenos días!'
        : /^buenas tardes\b/.test(text) ? '¡Buenas tardes!'
            : /^buenas noches\b/.test(text) ? '¡Buenas noches!'
                : '¡Hola!';

    if (/(?:por que (?:me )?respondes tan (?:robotico|formal|largo|tecnico|frio|estatico)|habla(?:me)? mas (?:natural|sencillo|claro|corto|humano|directo|simple)|mas natural|sin tanto rollo|no entendi(?: nada)?|explica(?:me|lo)? (?:mas sencillo|como si tuviera|en palabras simples|mejor)|esta muy largo|resumelo en \d+ puntos?)/.test(text)) {
        return `¡Tienes toda la razón! A veces me pongo demasiado técnico. Vamos a platicarlo directo, claro y sin tanto rollo.${continuation || ' Dime qué precio, mercado o duda quieres revisar y te respondo al grano.'}`;
    }
    if (/^(?:gracias|muchas gracias|mil gracias|te agradezco)\b/.test(text)) {
        return `¡Con mucho gusto!${continuation || ' Si necesitas revisar algún otro precio, escenario o archivo, aquí estoy.'}`;
    }
    if (/(?:(?:que|en que) (?:me )?(?:puedes|podrias|sabes) (?:hacer|ayudar|apoyar|servir|ofrecer|dar)|que haces|que sabes hacer|para que sirves|cuales son tus (?:funciones|capacidades|herramientas|modelos)|que (?:funciones|capacidades|herramientas|servicios|datos|modelos) (?:tienes|usas|manejas)|tienes datos(?: de hoy)?|ayudar a entender como va todo|como va todo|que hay de nuevo|como funcionas|como te uso|como puedo (?:empezar|usarte)|que te puedo preguntar|dame ejemplos?|presentate|^(?:hola\s+)?(?:necesito\s+)?ayuda(?:me)?(?:\s+por favor)?$)/.test(text)) {
        return `${greetingPrefix} Qué gusto saludarte. Soy **ORION**, tu analista de inteligencia económica y agroindustrial en VALLNews.\n\nPuedes platicarme directamente lo que necesitas revisar; por ejemplo, puedo ayudarte a:\n\n- **Seguir mercados y divisas al día:** tipo de cambio USD/MXN, tasas (CETES/TIIE/Banxico), bolsas y noticias económicas con fecha y fuente.\n- **Consultar proteínas y granos:** precios verificados de cerdo, pollo, huevo y res en México (SNIIM/PROFECO) e internacionales (USDA, Mercolleida, CEPEA), además de maíz, soya, trigo y energía.\n- **Correr pronósticos ML y cálculos de negocio:** proyecciones walk-forward con bandas de incertidumbre, sensibilidad de ración balanceada, márgenes con merma y regresiones.\n- **Trabajar con tus archivos y reportes:** puedes subirme un PDF, Excel/CSV o imagen para analizarlo, armar tablas o gráficas, o pedir un informe descargable en **PDF o Word**.\n\nPor ejemplo, pregúntame *«¿Cómo está el dólar hoy?»* o *«Compara el precio del cerdo en México y EE. UU.»*.${continuation || ' ¿Con qué tema te gustaría arrancar?'}`;
    }
    if (/(?:como te llamas|quien eres|cual es tu nombre)/.test(text)) {
        return `Me llamo ORION y soy tu asistente de inteligencia económica en VALLNews.${continuation || ' Te puedo ayudar con mercados, divisas, proteínas, granos, noticias económicas o reportes. ¿Qué quieres revisar hoy?'}`;
    }
    if (/(?:quien (?:te )?(?:creo|creadore?s?|desarrollo|hizo|construyo)|quien fue tu creadore?s?)/.test(text)) {
        return `Fui desarrollado por el equipo de VALLNews para ayudarte a analizar mercados, finanzas y agroindustria con datos claros y verificables.${continuation || ' ¿En qué tema te apoyo hoy?'}`;
    }
    if (/^(?:adios|hasta luego|nos vemos|chao|bye)\b/.test(text)) {
        return '¡Hasta luego! Aquí sigo cuando quieras revisar mercados, divisas, proteínas o armar algún informe.';
    }
    if (/(?:como estas|como andas|como te va|como vas|que tal|que onda|todo bien)/.test(text)) {
        return `${greetingPrefix} Todo muy bien por acá, gracias por preguntar. ¿Tú cómo vas?${continuation || ' Cuando quieras, dime qué mercado, precio o reporte revisamos hoy.'}`;
    }
    if (/^(?:ok|okay|vale|va|sale|entendido|perfecto|excelente|genial|super|claro|de acuerdo|listo)\b/.test(text)) {
        return hasPreviousAnalysis
            ? 'Perfecto. Cuando quieras podemos retomar el análisis anterior o ajustar algún supuesto o formato.'
            : '¡Perfecto! Dime con qué mercado, divisa, precio o cálculo quieres continuar.';
    }
    return `${greetingPrefix} Qué gusto leerte. Soy ORION, tu asistente de inteligencia económica.${continuation || ' ¿Qué traes en mente hoy: tipo de cambio, precios de proteínas y granos, noticias o algún análisis en particular?'}`;
}

function emptyEvidence() {
    return {
        context: '', chart: null, charts: [], chartRequested: false, chartStatus: 'not_requested',
        citations: [], sourceCodes: [], retrievedChunks: 0, evidenceCount: 0,
        retrievalStrategy: 'fast_start', retrievalLatencyMs: null, evidenceRecords: [],
    };
}

function emptyLiveData() {
    return { context: '', citations: [], sourceCodes: [], available: false, warnings: [], strategy: 'live_data_skipped_v1' };
}

function settleWithin(promise, fallback, milliseconds, label) {
    let timer = null;
    return Promise.race([
        Promise.resolve(promise).catch((error) => {
            console.warn(`[Orchestrator] ${label} no estuvo disponible:`, error.message);
            return fallback;
        }),
        new Promise(resolve => {
            timer = setTimeout(() => {
                console.warn(`[Orchestrator] ${label} excedió ${milliseconds} ms; se continúa con evidencia disponible.`);
                resolve(fallback);
            }, milliseconds);
        }),
    ]).finally(() => clearTimeout(timer));
}

function evidenceBudget(plan = {}) {
    if (plan.asksForecast) return 12_000;
    if (plan.needsIssuerResearch || plan.needsLiveQuote) return 12_000;
    if (plan.needsProteinPrices || plan.needsProteinResearch && plan.needsLiveNews) return 12_000;
    if (plan.needsTradeResearch || plan.needsRabobank) return 11_000;
    if (plan.needsMercolleida) return 6000;
    if (plan.needsLiveQuote || plan.needsLiveNews) return 2600;
    if (plan.asksAnalysis || plan.asksExecutiveBrief || plan.asksDecision) return 2200;
    return 1500;
}

function tradeResponseInstructions(built, plan) {
    if (!plan.needsTradeResearch) return built;
    if (plan.tradeScope === 'general') built.systemInstruction += '\n[ALCANCE DE ESTA PREGUNTA]\nLa pregunta pide los anuncios comerciales generales de los países y periodo indicados. Responde esos anuncios, aunque el historial o una sección de VALLNews se enfoque en proteínas. No abras con la ausencia de un tratado exclusivo de carnes. Incluye las disposiciones de energía, inversión o servicios que figuren en las fuentes. Una recomendación para reducir aranceles no es una reducción vigente. No inventes porcentajes ni listas de productos que no se leyeron.';
    built.systemInstruction += '\n\n[RESPUESTA SOBRE ACUERDOS]\nResponde directamente con los anuncios documentados y su periodo. Abre con "Identifiqué los siguientes anuncios y compromisos" cuando haya documentos verificados. Evita abrir con una negación sobre tratados formales: la cobertura parcial no permite probar esa ausencia. Presenta fecha, producto, medida, estado y fuente. Toda implicación financiera debe ser condicional: "Si se ejecuta, podría…". No equipares el objetivo agrícola a una cuota exclusiva de carne o soya. Las estadísticas de comercio no prueban contratos de futuros. No pidas enlaces al usuario si ya hay documentos oficiales en el contexto.';
    return built;
}

function localReplyResult(text, started, taskType = 'social', history = []) {
    const hasPreviousAnalysis = Boolean(conversationFocus('continua', history).anchor);
    const response = markdownToRichResponse(text, {
        mode: 'quick', taskType, provider: 'local', model: 'orion-conversation', latencyMs: Date.now() - started,
    });
    response.meta = { ...(response.meta || {}), followUps: socialFollowUps(hasPreviousAnalysis) };
    return { response, text, tier: 'flash', mode: 'quick', model: 'orion-conversation', evidenceCount: 0, citations: [], retrievalStrategy: 'local_conversation' };
}

function canFallbackFromPro(error) {
    return ['AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_PROVIDER_ERROR'].includes(error?.code);
}

function effectiveTier(provider, requestedTier, result) {
    if (typeof provider?.tierForModel === 'function') return provider.tierForModel(result?.model);
    const expected = typeof provider?.modelForTier === 'function' ? provider.modelForTier(requestedTier) : null;
    return requestedTier === 'pro' && expected && result?.model && result.model !== expected ? 'flash' : requestedTier;
}

function shouldUseGoogleSearch(plan = {}) {
    if (plan.providedInputsOnly) return false;
    if (plan.needsMercolleida && !plan.needsTradeResearch && !plan.needsRabobank && !plan.needsLiveNews && !plan.needsProteinPrices) return false;
    // Se puede apagar por entorno si el despliegue no tiene habilitada la
    // facturación de Grounding. En condiciones normales se reserva para
    // investigación, noticias y análisis que requieren fuentes.
    if (String(process.env.GEMINI_WEB_GROUNDING || '').toLowerCase() === 'false') return false;
    return Boolean(plan.requiresWebResearch || plan.asksAnalysis || plan.asksNews || (plan.needsSources && !plan.needsLiveQuote));
}

function mergeGroundingEvidence(evidence = {}, grounding = null) {
    const grounded = groundingCitations(grounding);
    if (!grounded.length) return evidence;
    const knownUrls = new Set((evidence.citations || []).map(item => item?.url).filter(Boolean));
    const citations = grounded.filter(item => !knownUrls.has(item.url));
    if (!citations.length) return evidence;
    return {
        ...evidence,
        citations: [...citations, ...(evidence.citations || [])],
        sourceCodes: [...new Set(['gemini_google_search', ...(evidence.sourceCodes || [])])],
        evidenceCount: (evidence.evidenceCount || 0) + citations.length,
        retrievalStrategy: `${evidence.retrievalStrategy || 'rag'}+gemini_google_search`,
    };
}

function groundingSourcesMarkdown(citations = [], period = null) {
    const seen = new Set();
    const lines = citations.filter(item => item?.type === 'google_search_grounding' || item?.type === 'verified_issuer_document' || item?.type === 'live_market_quote' || item?.type === 'live_fx_quote' || item?.type === 'verified_trade_document' || item?.type === 'verified_protein_price' || item?.type === 'live_news' || item?.type === 'rabobank_public_research' || item?.type === 'executive_report_source' || item?.type?.startsWith('mercolleida_public_')).map(item => {
        const url = String(item.url || '').trim();
        const date = sourceDate(item.date);
        const periodLabel = period && date ? date < period.start ? ' · Antecedente' : date > period.end ? ' · Fuera del periodo' : '' : '';
        const label = String((item?.type === 'verified_trade_document' ? `${item.source} · ${item.date}` : ['verified_issuer_document', 'live_market_quote', 'live_fx_quote', 'verified_protein_price', 'live_news', 'rabobank_public_research', 'executive_report_source'].includes(item?.type) || item?.type?.startsWith('mercolleida_public_') ? `${item.source} · ${item.title}${item.date ? ` · ${item.date}` : ''}` : item.source || item.title || 'Fuente web') + periodLabel)
            .replaceAll('[', ' ').replaceAll(']', ' ').replace(/[\r\n]+/g, ' ').trim();
        if (!/^https?:\/\//i.test(url) || !label || seen.has(url)) return null;
        seen.add(url);
        return `- [${label}](${url.replace(/[<>"()\s]/g, character => encodeURIComponent(character))})`;
    }).filter(Boolean);
    return lines.length ? `### Fuentes de investigación web\n\n${lines.join('\n')}` : '';
}

function buildExecutiveMarketsMatrixTable() {
    try {
        const fs = require('node:fs');
        const path = require('node:path');
        const finPath = path.resolve(__dirname, '../cache/finance_executive_reports.json');
        const mktPath = path.resolve(__dirname, '../cache/market_executive_reports.json');
        const rows = [];
        const pushMetric = (category, m, cutDate) => {
            if (!m?.label || !m?.value) return;
            rows.push(`| ${category} | ${m.label} | ${m.value} | ${m.change || m.delta || '—'} | ${cutDate || '—'} |`);
        };
        if (fs.existsSync(finPath)) {
            const fin = JSON.parse(fs.readFileSync(finPath, 'utf8'));
            const cut = String(fin.generatedAt || '').slice(0, 10);
            const reps = Array.isArray(fin.reports) ? fin.reports : [];
            const eq = reps.find(r => r.key === 'equities');
            for (const re of [/ipc|bmv/i, /s&p\s*500/i, /nasdaq/i, /euro\s*stoxx|dax/i, /nikkei/i]) {
                const m = (eq?.metrics || []).find(x => re.test(String(x?.label || '')));
                if (m) pushMetric('Bolsa', m, cut);
            }
            const bonds = reps.find(r => r.key === 'bonds');
            for (const re of [/cetes\s*28/i, /tiie\s*28/i, /treasury.*10/i, /embig/i]) {
                const m = (bonds?.metrics || []).find(x => re.test(String(x?.label || '')));
                if (m) pushMetric('Bonos y Tasas', m, cut);
            }
            const fx = reps.find(r => r.key === 'fx');
            for (const re of [/usd\/mxn/i, /usd\/eur/i, /usd\/brl/i, /usd\/cny/i]) {
                const m = (fx?.metrics || []).find(x => re.test(String(x?.label || '')));
                if (m) pushMetric('Divisas', m, cut);
            }
        }
        if (fs.existsSync(mktPath)) {
            const mkt = JSON.parse(fs.readFileSync(mktPath, 'utf8'));
            const cut = String(mkt.generatedAt || '').slice(0, 10);
            const reps = Array.isArray(mkt.reports) ? mkt.reports : [];
            const em = reps.find(r => r.key === 'energy_metals');
            for (const re of [/\bwti\b/i, /gas\s+natural|henry\s+hub/i, /\boro\b/i, /\bcobre\b/i]) {
                const m = (em?.metrics || []).find(x => re.test(String(x?.label || '')));
                if (m) pushMetric('Energía y Metales', m, cut);
            }
        }
        if (!rows.length) return '';
        return `| Categoría | Referencia | Nivel verificado | Variación | Corte |\n| --- | --- | ---: | ---: | --- |\n${rows.join('\n')}`;
    } catch {
        return '';
    }
}

function buildExecutiveSnapshotContext(plan = {}) {
    if (!plan.needsExecutiveReport) return '';
    const matrix = buildExecutiveMarketsMatrixTable();
    if (!matrix) return '';
    return `[CORTES VERIFICADOS DE INFORMES EJECUTIVOS · FINANZAS Y MERCADOS]\nUsa estas cifras fechadas exactas cuando el usuario pida CETES, TIIE, Treasury 10A, EMBIG, bolsas globales, divisas, WTI, gas natural, oro o cobre. No entregues definiciones genéricas ni "Pendiente corte" si el dato aparece aquí.\n${matrix}`;
}

function buildDeterministicEvidenceFallback({ plan = {}, evidence = {}, liveData = null, reportEvidence = null, marranasML = null, forecastAnalysis = null, dataInventory = null, error = null }) {
    const sections = [];
    const quotes = Array.isArray(liveData?.quotes) ? liveData.quotes : [];
    const proteins = Array.isArray(evidence?.proteinPriceRecords) ? evidence.proteinPriceRecords : [];
    const citations = Array.isArray(evidence?.citations) ? evidence.citations : [];
    const newsCitations = citations.filter(c => c?.type === 'live_news' || c?.type === 'rabobank_public_research' || c?.type?.startsWith('mercolleida_public_'));
    const hasReports = Boolean(reportEvidence?.available && reportEvidence?.context);
    const hasMl = Boolean(marranasML?.available && marranasML?.context);
    const hasForecast = Boolean(forecastAnalysis?.available && forecastAnalysis?.context);
    const hasInventory = Boolean(dataInventory && (plan.asksDataInventory || plan.asksCoverageExplanation));
    const wantsGlobalMatrix = !plan.asksDataInventory && !plan.asksCoverageExplanation
        && (plan.asksExecutiveBrief || (plan.topics?.length >= 2) || /\b(?:matriz|mercados?\s+globales?|cetes|tiie|treasury|embig|bonos?)\b/i.test(plan.marketQuery || ''));
    const execMatrix = wantsGlobalMatrix ? buildExecutiveMarketsMatrixTable() : '';
    if (!quotes.length && !proteins.length && !hasReports && !hasMl && !hasForecast && !hasInventory && !newsCitations.length && !execMatrix) return null;

    sections.push('> [!NOTE] **Modo de respaldo verificado:** el modelo generativo alcanzó temporalmente su límite de cuota, créditos o tiempo de espera (`' + (error?.code || 'AI_RATE_LIMIT') + '`). A continuación se presentan directamente las cifras, tablas y alertas verificadas recuperadas por ORION sin texto inventado.');

    if (hasInventory) {
        const invLines = String(dataInventory).split('\n').filter(l => l.trim() && !/^\[/.test(l.trim())).slice(0, 24);
        if (invLines.length) sections.push(`### Inventario y cobertura activa de ORION\n\n${invLines.join('\n')}`);
    }

    if (quotes.length) {
        const rows = quotes.slice(0, 12).map(q => {
            const val = Number.isFinite(Number(q.value)) ? Number(q.value).toLocaleString('en-US', { maximumFractionDigits: 4 }) : String(q.value ?? '—');
            const chg = Number.isFinite(Number(q.change)) ? `${q.change >= 0 ? '+' : ''}${Number(q.change).toFixed(2)}%` : '—';
            const dt = q.updatedAt ? String(q.updatedAt).slice(0, 10) : '—';
            return `| ${q.label || q.symbol} | ${val} ${q.unit || ''} | ${chg} | ${dt} | ${q.source || 'Mercado'} |`;
        });
        sections.push(`### Cotizaciones en vivo verificadas\n\n| Instrumento | Último valor | Variación | Corte | Fuente |\n| --- | ---: | ---: | --- | --- |\n${rows.join('\n')}`);
    }

    if (execMatrix) {
        sections.push(`### Matriz global de mercados (Informes Ejecutivos verificados)\n\n${execMatrix}`);
    }

    if (proteins.length) {
        const compactEvidence = { ...evidence, proteinPriceRecords: proteins.slice(0, 12) };
        const tableMd = proteinPriceTable(plan, compactEvidence);
        if (tableMd) sections.push(`### Referencias físicas de proteínas (top ${Math.min(proteins.length, 12)})\n\n${tableMd}`);
    }

    const INTERNAL_PROMPT_RE = /^(?:usa estas probabilidades|regla\b|instrucci|nota para el modelo|para responder|no inventes|cita siempre)/i;
    if (hasMl) {
        const mlLines = String(marranasML.context)
            .split('\n')
            .map(l => l.trim().replace(/^[-•*]\s*/, ''))
            .filter(l => l && !/^\[/.test(l) && !INTERNAL_PROMPT_RE.test(l))
            .slice(0, 18);
        if (mlLines.length) sections.push(`### Motor ORION ML (Paridad, Pronóstico y Radar Sanitario NLP)\n\n${mlLines.map(l => `- ${l}`).join('\n')}`);
    }

    if (hasReports) {
        const repLines = String(reportEvidence.context).split('\n').filter(l => l.trim() && !/^\[/.test(l.trim()) && !INTERNAL_PROMPT_RE.test(l.trim())).slice(0, 22);
        if (repLines.length) sections.push(`### Datos de Informes Ejecutivos (cortes verificados)\n\n${repLines.join('\n')}`);
    }

    if (newsCitations.length) {
        const newsLines = newsCitations.slice(0, 8).map(c => {
            const label = [c.source, c.title, c.date].filter(Boolean).join(' · ');
            return c.url ? `- [${label}](${c.url})` : `- ${label}`;
        });
        if (newsLines.length) sections.push(`### Titulares y cobertura reciente verificada\n\n${newsLines.join('\n')}`);
    }

    if (hasForecast) {
        const fcLines = String(forecastAnalysis.context).split('\n').filter(l => l.trim() && !/^\[/.test(l.trim()) && !INTERNAL_PROMPT_RE.test(l.trim())).slice(0, 14);
        if (fcLines.length) sections.push(`### Pronóstico cuantitativo verificado\n\n${fcLines.map(l => `- ${l.replace(/^[-•*]\s*/, '')}`).join('\n')}`);
    }

    return sections.join('\n\n').replace(/\b(\d{1,3}\.\d{4})\d{2,}\b/g, '$1');
}

function attachEvidence(response, evidence, plan = {}) {
    let resolvedChartStatus = evidence.chartStatus || 'not_requested';
    if (evidence.chartRequested && evidence.chartStatus !== 'user_supplied') {
        const verifiedCharts = evidence.charts || (evidence.chart ? [evidence.chart] : []);
        const hasLlmChart = response.blocks.some(block => block.type === 'chart');
        // Una gráfica del motor OLS o de pronóstico/proteínas verificado no es
        // una sugerencia narrativa: se calculó con series fechadas.
        const hasStatisticalChart = (response.meta?.statisticalModel?.available === true || response.meta?.verifiedServerChart === true) && hasLlmChart;
        
        if (verifiedCharts.length) {
            // RAG sustituye una gráfica narrativa no verificable. Si ya hay
            // una regresión OLS calculada, se conserva como visual principal y
            // las series verificadas se agregan como complemento.
            if (!hasStatisticalChart) {
                response.blocks = response.blocks.filter(block => block.type !== 'chart');
                if (response.markdown) {
                    response.markdown = response.markdown.replace(/```chart\s*\n[\s\S]*?```/gi, '').trim();
                }
            }
            for (const spec of verifiedCharts) response.blocks.push({ type: 'chart', spec });
            if (response.markdown) {
                response.markdown += verifiedCharts.map(spec =>
                    `\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``
                ).join('');
            }
            resolvedChartStatus = 'served';
        } else if (evidence.chartStatus === 'insufficient_data' || evidence.chartStatus === 'unsupported_subject') {
            // Sin una serie adicional no se conserva una gráfica inventada por
            // el LLM. La excepción es el gráfico OLS o de pronóstico verificado.
            if (!hasStatisticalChart) {
                response.blocks = response.blocks.filter(block => block.type !== 'chart');
                if (response.markdown) response.markdown = response.markdown.replace(/```chart\s*\n[\s\S]*?```/gi, '').trim();
            }
            const content = evidence.chartStatus === 'unsupported_subject'
                ? 'No identifiqué una serie disponible relacionada con la gráfica solicitada. Indica el activo o indicador y el periodo.'
                : 'No hay suficientes observaciones verificadas para construir esa gráfica sin inventar datos.';
            if (!hasStatisticalChart) {
                response.blocks.push({ type: 'alert', severity: 'warning', title: 'Gráfica no generada', content });
                if (response.markdown) response.markdown += `\n\n> **Gráfica no generada:** ${content}`;
            }
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
    if (!response.blocks.some(block => block?.type === 'chart')) {
        let autoChart = null;
        if (plan.needsProteinPrices && evidence.proteinPriceRecords?.length >= 2) {
            autoChart = buildProteinComparisonChart({
                records: evidence.proteinPriceRecords,
                fxRates: evidence.fxRates || null,
                plan,
                message: plan.marketQuery || plan.proteinQuery || '',
            });
        }
        const queryText = String(plan.marketQuery || plan.proteinQuery || '');
        const explicitlyRequestsMlVisual = (plan.asksDataInventory || !response.meta.forecastAnalysis)
            && /\b(?:loopus|walk-?forward|showcase|modelos?\s+ml|pron[oó]sticos?\s+ml|pron[oó]sticos?\s+activos)\b/i.test(queryText);
        if (!autoChart && response.meta.forecastAnalysis?.available) {
            autoChart = buildForecastRecordChart(response.meta.forecastAnalysis);
        }
        if (!autoChart && plan.needsMarranasML && (!plan.needsProteinPrices || evidence.proteinPriceRecords?.length > 0)) {
            autoChart = buildMarranasChart({ message: queryText, plan });
        }
        if (!autoChart && (plan.needsExecutiveReport || (plan.topics?.length >= 2 && (plan.asksComparison || plan.asksExecutiveBrief)))) {
            autoChart = buildGlobalMarketsChart({ liveQuotes: evidence.quotes || [] });
        }
        if (!autoChart && explicitlyRequestsMlVisual) {
            autoChart = buildShowcaseChart({ message: queryText, plan });
        }
        if (autoChart) {
            // Si RAG no tenía serie en MariaDB pero sí logramos construir una gráfica
            // verificada desde proteínas/ML/informes, retiramos la alerta de "Gráfica no generada".
            response.blocks = response.blocks.filter(block => !(block?.type === 'alert' && block?.title === 'Gráfica no generada'));
            if (response.markdown) {
                response.markdown = response.markdown.replace(/\n*> \*\*Gráfica no generada:\*\*[^\n]*/g, '').trim();
            }
            response.blocks.push({ type: 'chart', spec: autoChart });
            if (response.markdown) response.markdown += `\n\n\`\`\`chart\n${JSON.stringify(autoChart)}\n\`\`\``;
            response.meta.verifiedServerChart = true;
            resolvedChartStatus = 'served';
        }
    }
    const forecastSources = (response.meta.forecastAnalysis?.records || []).filter(record => record.cutoff && record.observations && record.sourceUrl).map(record => ({
        type: 'forecast_historical_series', source: record.source, title: `${record.name} (${record.ticker}) · ${record.cutoff}`,
        date: record.cutoff, url: record.sourceUrl,
    }));
    const citations = [...forecastSources, ...(evidence.citations || [])].filter(isEvidenceCitation)
        .filter((item, index, all) => all.findIndex(other => other.url === item.url) === index).slice(0, 24);
    response.meta.citations = citations;
    response.meta.retrievalStrategy = evidence.retrievalStrategy;
    response.meta.evidenceCount = evidence.evidenceCount;
    response.meta.chartStatus = resolvedChartStatus;
    if (evidence.toolExecution) response.meta.toolExecution = evidence.toolExecution;
    response.meta.evidenceCoverage = evidenceCoverage(plan, evidence);
    if (evidence.researchAudit) response.meta.researchAudit = evidence.researchAudit;
    if (plan.asksDecision || plan.asksAnalysis || plan.asksNews) response.meta.decisionBrief = decisionBrief({message:plan.marketQuery || '',plan,evidence,forecastAnalysis:response.meta.forecastAnalysis});
    if (evidence.rabobank) response.meta.rabobank = evidence.rabobank;
    if (evidence.proteinPrices) response.meta.proteinPrices = evidence.proteinPrices;
    const existingText = String(response.markdown || '');
    const verificationBlock = existingText.includes('**Fuentes de verificación:**') ? existingText.slice(existingText.indexOf('**Fuentes de verificación:**')) : '';
    const unseenCitations = citations.filter(item => !verificationBlock || !item?.url || !verificationBlock.includes(String(item.url).trim()));
    const groundingSources = groundingSourcesMarkdown(unseenCitations, response.meta.evidenceCoverage.period);
    const priceSourcesInline = plan.needsProteinPrices && !plan.asksAnalysis && !plan.asksNews
        && citations.length && citations.every(item=>item.type==='verified_protein_price');
    if (groundingSources && !priceSourcesInline && !existingText.includes('### Fuentes de investigación web')) {
        const original = toLegacyMarkdown(response);
        response.blocks.push({ type: 'markdown', content: groundingSources });
        response.markdown = [original, groundingSources].filter(Boolean).join('\n\n');
    }
    return response;
}

function toolLabelsForSlot(slot, plan) {
    if (slot === 'marranas_proteins_ml') return ['ORION · Motor ML Proteínas'];
    if (slot === 'forecast_analysis') return ['ORION · Pronóstico ML'];
    if (slot === 'statistical_analysis') return ['Estadística OLS'];
    if (slot === 'report_reader') return ['Informes ejecutivos'];
    if (slot === 'knowledge_search') return ['Base de conocimiento'];
    if (slot === 'market_research') {
        const labels = [];
        const hasMx = Boolean(plan?.mexicoStates?.length || plan?.proteinProfile?.countries?.includes('MX'));
        if (plan?.needsProteinPrices && hasMx) labels.push('SNIIM México');
        if (plan?.needsProteinPrices && (!hasMx || plan?.proteinProfile?.global || (plan?.proteinProfile?.countries?.length || 0) > 1)) {
            labels.push('USDA / Proteínas');
        }
        if (plan?.needsLiveQuote) labels.push('Mercados en vivo');
        if (plan?.needsLiveNews) labels.push('Noticias del sector');
        if (plan?.needsRabobank || plan?.needsMercolleida || plan?.needsTradeResearch) labels.push('Comercio e investigación');
        if (plan?.needsIssuerResearch && !labels.length) labels.push('Fuentes oficiales');
        return labels.length ? labels : ['Mercado en vivo'];
    }
    return [];
}

function describeToolPlan(plan, retrievalQuery = '') {
    const tools = [];
    const seen = new Set();
    const pushAll = (list) => list.forEach((item) => {
        if (item && !seen.has(item)) { seen.add(item); tools.push(item); }
    });
    const hasMarket = Boolean(plan?.needsIssuerResearch || plan?.needsProteinPrices || plan?.needsRabobank || plan?.needsTradeResearch || plan?.needsMercolleida || plan?.needsLiveQuote || plan?.needsLiveNews);
    if (hasMarket) pushAll(toolLabelsForSlot('market_research', plan));
    if (plan?.asksForecast) pushAll(toolLabelsForSlot('forecast_analysis', plan));
    if (plan?.needsMarranasML) pushAll(toolLabelsForSlot('marranas_proteins_ml', plan));
    if (wantsStatisticalAnalysis(retrievalQuery)) pushAll(toolLabelsForSlot('statistical_analysis', plan));
    if (plan?.needsExecutiveReport) pushAll(toolLabelsForSlot('report_reader', plan));
    if (!plan?.providedInputsOnly && !plan?.needsTradeResearch && !plan?.explicitRabobank && !tools.length) {
        pushAll(toolLabelsForSlot('knowledge_search', plan));
    }
    const detail = tools.length
        ? `Consultando ${tools.slice(0, 4).join(', ')}…`
        : 'Verificando contexto y datos disponibles…';
    return { tools: tools.slice(0, 5), completedTools: [], detail };
}

function describeCompletedEvidence(execution, plan, retrievalQuery = '') {
    const planned = describeToolPlan(plan, retrievalQuery);
    const traceTools = Array.isArray(execution?.tools) ? execution.tools : [];
    const completed = [];
    const seen = new Set();
    traceTools.forEach((entry) => {
        if (entry?.status !== 'completed') return;
        toolLabelsForSlot(entry.name, plan).forEach((label) => {
            if (!seen.has(label)) { seen.add(label); completed.push(label); }
        });
    });
    const activeList = planned.tools.length ? planned.tools : completed;
    const summaryList = (completed.length ? completed : activeList).slice(0, 4);
    return {
        tools: activeList.slice(0, 5),
        completedTools: completed.length ? completed.slice(0, 5) : activeList.slice(0, 5),
        detail: summaryList.length
            ? `Evidencia lista (${summaryList.join(', ')}) · redactando respuesta…`
            : 'Ordenando hallazgos, riesgos y próximos pasos antes de responder.',
    };
}

class AIOrchestrator {
    constructor({ provider = new GeminiProvider(), tools = new ToolRegistry(), retriever = ragRetriever, statisticsBuilder = buildStatisticalModel, liveDataGrounder = groundLiveData, forecastBuilder = buildForecastAnalysis, priceArchive = liveDataGrounder === groundLiveData ? physicalPriceArchive : null, reportReader = new ReportReaderAgent({ provider }) } = {}) {
        this.provider = provider;
        this.tools = tools;
        this.reportReader = reportReader;
        this.tools.register({ name:'commercial_margin', description:'Calcula el margen de un lote con condiciones explícitas en una sola moneda.',
            inputSchema:{ type:'object', properties:{ purchasedKg:{type:'number'}, buyPricePerKg:{type:'number'}, sellPricePerKg:{type:'number'}, shrinkFraction:{type:'number'}, currency:{type:'string'} },
                required:['purchasedKg','buyPricePerKg','sellPricePerKg','shrinkFraction','currency'] }, execute:calculateMargin });
        this.tools.register({ name: 'report_reader', description: 'Lee un informe ejecutivo publicado (finanzas, mercados o méxico) y extrae su corte verificado.',
            inputSchema: { type: 'object', properties: { collection: { type: 'string' }, key: { type: 'string' }, question: { type: 'string' } } },
            execute: input => this.reportReader.read(input) });
        this.retriever = retriever;
        this.statisticsBuilder = statisticsBuilder;
        this.liveDataGrounder = liveDataGrounder;
        this.forecastBuilder = forecastBuilder;
        this.priceArchive = priceArchive;
    }
    isConfigured() { return this.provider.isConfigured(); }

    async collectEvidence({ plan, retrievalQuery, userKeyHash, directConversion, signal, onToolComplete = null }) {
        const budget = evidenceBudget(plan);
        const handlers = {};
        let marketWork;
        if (!plan.providedInputsOnly && !plan.needsTradeResearch && !plan.explicitRabobank) {
            handlers.knowledge_search = () => this.retriever.retrieve(retrievalQuery, userKeyHash);
        }
        if (plan.needsIssuerResearch || plan.needsProteinPrices || plan.needsRabobank || plan.needsTradeResearch || plan.needsMercolleida || plan.needsLiveQuote || plan.needsLiveNews) {
            handlers.market_research = ({ signal: toolSignal }) => marketWork ||= Promise.resolve(this.liveDataGrounder(plan, retrievalQuery, { signal: signal || toolSignal })).then(async data=>{
                if (data?.proteinPriceRecords?.length && this.priceArchive) {
                    try { data.proteinHistory={status:'saved',series:await this.priceArchive.observe(data.proteinPriceRecords)}; }
                    catch { data.proteinHistory={status:'unavailable'}; }
                }
                return data;
            });
        }
        if (wantsStatisticalAnalysis(retrievalQuery)) handlers.statistical_analysis = ({ signal }) => this.statisticsBuilder(retrievalQuery, { signal });
        if (plan.asksForecast) handlers.forecast_analysis = async ({ signal }) => {
            if (plan.proteinProfile?.products?.length && !plan.proteinProfile.futures) await handlers.market_research?.({signal}).catch(()=>null);
            return this.forecastBuilder(plan, { signal });
        };
        if (plan.needsExecutiveReport && this.reportReader) {
            handlers.report_reader = ({ signal }) => this.reportReader.forQuery({ message: retrievalQuery, signal });
        }
        if (plan.needsMarranasML) {
            handlers.marranas_proteins_ml = () => {
                const { loadCachedProteinML, getProteinMLContextForQuery } = require('../ml/protein-ml-engine');
                const art = loadCachedProteinML();
                if (!art) return { available: false, context: '' };
                const context = getProteinMLContextForQuery(retrievalQuery, { stripNumbers: false, limit: 6 }) || '';
                return {
                    available: true,
                    model: 'ORION ML',
                    version: art.version,
                    generatedAt: art.generatedAt,
                    activeModels: art.stats?.activeModels || 0,
                    avgWalkForwardDirectionalAccuracyPct: art.stats?.avgWalkForwardDirectionalAccuracyPct ?? null,
                    usdMxn: art.importParity?.fxRates?.usdMxn ?? null,
                    nlpEventsDetected: art.nlpEvents?.stats?.relevantEventsDetected || 0,
                    context: context.slice(0, 2600),
                };
            };
        }
        const fallbackForecast = plan.asksForecast ? { requested: true, available: false, records: [], reason: 'No se completó la validación numérica durante esta consulta.' } : null;
        const fallbackReportDigest = { available: false, context: '', citations: [], sourceCodes: [], strategy: 'report_reader_skipped_v1', reports: [] };
        const fallbacks = [emptyEvidence(), directConversion, emptyLiveData(), null, fallbackForecast, fallbackReportDigest, null];
        const names = ['knowledge_search', null, 'market_research', 'statistical_analysis', 'forecast_analysis', 'report_reader', 'marranas_proteins_ml'];
        if (!Object.keys(handlers).length) return { values: fallbacks, execution: { protocol: 'mcp', status: 'not_needed', tools: [] } };
        let session;
        try {
            signal?.throwIfAborted();
            session = await createOrionMcpSession(handlers, { signal, timeoutMs: budget });
            const values = await Promise.all(names.map(async (name, index) => {
                if (!name || !handlers[name]) return fallbacks[index];
                const settled = await settleWithin(session.call(name), fallbacks[index], name === 'knowledge_search' && plan.needsRabobank ? Math.min(budget, 2600) : budget + 250, name);
                onToolComplete?.(name);
                return settled;
            }));
            signal?.throwIfAborted();
            return { values, execution: { protocol: 'mcp', protocolVersion: session.protocolVersion, status: session.trace.every(tool => tool.status === 'completed') ? 'completed' : 'partial', tools: session.trace } };
        } catch (error) {
            signal?.throwIfAborted();
            console.warn('[Orchestrator] Conexión MCP no disponible:', error.code || error.name);
            return { values: fallbacks, execution: { protocol: 'mcp', status: 'unavailable', tools: session?.trace || [] } };
        } finally { await session?.close().catch(() => {}); }
    }

    async businessTurn(input, method) {
        const started = Date.now();
        const prepared = prepareBusinessConversation(input);
        const request = { ...input, message:prepared.message, history:prepared.history, context:prepared.context };
        const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
        const plan = planQuery(request);
        const allowed = domainDecision(request).allowed;
        const previous=prepared.previousCommercialInputs;
        const changed=previous && Object.keys(prepared.commercialInputs).some(key=>!['currencySource'].includes(key) && prepared.commercialInputs[key]!==previous[key]);
        const variableUpdate=changed && /\d/.test(input.message) && calculateMargin(previous).available;
        let result,verifiedCalculation;
        const scenarios=!hasAttachments ? scenarioRequest(input.message) : { requested: false };
        const selection=!hasAttachments ? selectScenario(input.message,prepared.conversationMemory?.scenarios) : null;
        const market=prepared.conversationMemory?.market;
        const fx=!hasAttachments ? fxScenarioRequest(input.message,market) : null;
        if(allowed && selection && market?.fxScenarios){
            const chosen=sanitizeFxScenarios({...market.fxScenarios,selected:selection.number});
            if(selection.number>market.fxScenarios.rates.length)result=localReplyResult('Ese escenario no está en la tabla. ¿Qué número quieres usar?',started,'scenario_clarification');
            else{market.fxScenarios=chosen;result=localReplyResult(fxScenarioReply(chosen),started,'fx_scenarios');result.response.meta.fxScenarios=chosen;}
        }else if(allowed && fx){
            result=localReplyResult(fx.error || fxScenarioReply(fx.scenario),started,'fx_scenarios');
            if(fx.scenario){result.response.meta.fxScenarios=fx.scenario;if(market)market.fxScenarios=fx.scenario;}
        }else if(allowed && selection && prepared.conversationMemory?.scenarios?.length){
            if(!selection.option)result=localReplyResult('Ese escenario no está en la tabla. ¿Qué número de escenario quieres usar?',started,'scenario_clarification');
            else{
                const chosen={...prepared.commercialInputs,...selection.option.patch};
                if(Object.hasOwn(selection.option.patch,'freightPerKg'))delete chosen.freight;if(Object.hasOwn(selection.option.patch,'freight'))delete chosen.freightPerKg;
                const calculation=calculateMargin(chosen);result=localReplyResult(commercialReply(calculation,responseLength(input.message)),started,'commercial_calculation');
                result.response.meta.calculation=calculation;if(calculation.available){prepared.conversationMemory.inputs=chosen;prepared.conversationMemory.scenarios=[];}
            }
        }else if(allowed && scenarios.requested && (!prepared.conversationMemory?.market || prepared.conversationMemory.profile.products.length || Object.hasOwn(prepared.commercialInputs,'buyPricePerKg'))){
            const comparison=calculateScenarios(scenarios,prepared.commercialInputs);
            result=localReplyResult(scenarioReply(comparison),started,'commercial_scenarios');result.response.meta.scenarioComparison=comparison;
            if(comparison.available && prepared.conversationMemory){
                const restored={...prepared.commercialInputs};for(const dimension of scenarios.dimensions){const fields=dimension.field.startsWith('freight')?['freight','freightPerKg']:[dimension.field];for(const field of fields){if(previous && Object.hasOwn(previous,field))restored[field]=previous[field];else delete restored[field];}}
                prepared.conversationMemory.inputs=restored;prepared.conversationMemory.scenarios=comparison.options;
            }
        }else if (!hasAttachments && allowed && plan.locationClarification) {
            const city = plan.locationClarification;
            const text = `¿Te refieres a ${city.name} en ${city.alternatives.join(', o en ')}? Necesito confirmar el país para consultar el mercado correcto.`;
            result = localReplyResult(text, started);
            result.response.meta.taskType = 'location_clarification';
            if (prepared.conversationMemory) prepared.conversationMemory.pendingLocation = city.name;
        } else if (!hasAttachments && allowed && (wantsCommercialCalculation(input.message) || variableUpdate) && !plan.asksForecast && !plan.asksNews && !plan.needsTradeResearch && !plan.explicitRabobank
            && (Object.keys(prepared.commercialInputs).some(key=>['purchasedKg','buyPricePerKg','sellPricePerKg','shrinkFraction','freight','freightPerKg','insurance','duties','otherCosts'].includes(key)) || !prepared.conversationMemory?.market && /\b(?:mi margen|calcula|recalcula)\b/i.test(input.message))) {
            const session = await createOrionMcpSession({ commercial_margin: () => this.tools.execute('commercial_margin', prepared.commercialInputs) }, { signal: input.signal, timeoutMs: 1500 });
            let calculation;
            try { calculation = await session.call('commercial_margin'); } finally { await session.close().catch(() => {}); }
            verifiedCalculation=calculation;
            const asksExplanation=/\b(?:por que|explica|riesgos?|recomienda\w*|compara|alternativas?|escenarios?)\b/i.test(input.message.normalize('NFD').replace(/\p{Diacritic}/gu,''));
            if(calculation.available && asksExplanation){
                request.context += '\n\n[CÁLCULO COMERCIAL VERIFICADO POR EL SERVIDOR]\n'+JSON.stringify(calculation)+'\nConserva estos resultados y sus unidades. '+(calculation.perKgBasis?'Los importes están normalizados por unidad: no hay un volumen ni utilidad total del lote. ':'')+'Responde también las explicaciones o preguntas adicionales del turno. Son supuestos del ejercicio, no datos de mercado; los gastos excluidos siguen pendientes.';
            }else{
                result = localReplyResult(commercialReply(calculation,{...responseLength(input.message),previous:previous ? calculateMargin(previous) : null}),started);
                result.response.meta.taskType = 'commercial_calculation';
                result.response.meta.calculation = calculation;
                result.response.meta.toolExecution = { protocol: 'mcp', status: 'completed', tools: session.trace };
            }
        }
        if (result) {
            input.onText?.(result.text,result.text);
            result.queryId = await this.recordAudit({userKeyHash:input.userKeyHash,message:input.message,intent:result.response.meta.taskType,
                domainAllowed:true,retrievalStrategy:result.retrievalStrategy,evidenceCount:0,sourceCodes:[],model:result.model,responseText:result.text,latencyMs:Date.now()-started},[],result.text);
        }
        else result = await this[method](request);
        if(verifiedCalculation)result.response.meta.calculation=verifiedCalculation;
        result.response.meta.conversationMemory = prepared.conversationMemory;
        return result;
    }
    async stream(input) { return this.businessTurn(input,'streamInternal'); }
    async generateStructured(input) { return this.businessTurn(input,'generateStructuredInternal'); }

    async recordAudit(payload, records, text) {
        try {
            const queryId = await this.retriever.recordQuery(payload);
            await this.retriever.recordEvidence(queryId, records, text);
            return queryId;
        } catch {
            console.warn('[Orchestrator] La respuesta está lista, pero no se pudo guardar su auditoría.');
            return null;
        }
    }

    async validateTradeAnswer({ built, plan, evidence, result, tier, attachments, tools }) {
        let check = guardTradeResearch(plan, evidence, result.text);
        let revisionAttempted = false;
        if (check.needsRevision) {
            revisionAttempted = true;
            try {
                const revised = await this.generateWithFallback({ ...built, json: false, attachments, tools,
                    prompt: built.prompt + '\n\n[REVISIÓN OBLIGATORIA DE LA RESPUESTA]\nLa apertura del borrador negó nuevos acuerdos a pesar de documentos oficiales verificados en el contexto. Reescribe la respuesta desde esos anuncios, respetando el alcance general o sectorial solicitado y el periodo. No confundas acuerdos con tratados estructurales. Explica fecha, medida, alcance y estado de aplicación; no inventes cifras. Cita los documentos específicos.',
                }, tier);
                result = revised.result;
                tier = revised.tier;
                evidence = scopeTradeEvidence(plan, mergeGroundingEvidence(evidence, result.grounding));
                check = guardTradeResearch(plan, evidence, result.text);
            } catch (error) {
                console.warn('[Orchestrator] No se pudo revisar la respuesta comercial:', error.code || error.name);
            }
        }
        result = { ...result, text: check.text };
        let research = auditResearchAnswer(plan,evidence,result.text);
        if (research.needed && !revisionAttempted) {
            try {
                const compactLedger = JSON.stringify(research.ledger);
                const revised = await this.provider.generate({
                    ...built, tier, json:false, attachments, tools:null, timeoutMs:14000, maxOutputTokens:2048,
                    prompt: `${built.prompt.slice(0, 12000)}\n\n[CORRECCIÓN DE RESPALDO OBLIGATORIA]\nUsa EXCLUSIVAMENTE este registro verificado: ${compactLedger}\nProblemas detectados en tu borrador: ${research.issues.join(', ')}.\nReglas: 1) Cada párrafo, viñeta o fila de tabla con hechos/cifras DEBE incluir la fecha exacta YYYY-MM-DD y el enlace [Título](url) en esa misma línea. 2) Elimina cualquier cifra o fecha que no aparezca literalmente en "text" o "date" del registro. 3) Conserva los documentos con inPeriod:false marcados como "Antecedente".\nBorrador previo (solo texto a corregir): ${JSON.stringify(String(result.text).slice(0, 8000))}`,
                });
                check=guardTradeResearch(plan,evidence,revised.text);
                result={...revised,text:check.text};
                tier=effectiveTier(this.provider,tier,revised);
                research=auditResearchAnswer(plan,evidence,result.text);
            } catch (error) { built.signal?.throwIfAborted(); console.warn('[Orchestrator] Revisión de respaldo no completada:',error.code || error.name); }
        }
        if (research.ledger.records.length) evidence.researchAudit={ checkedClaims:research.checkedClaims || 0, documents:research.ledger.records.length,
            issues:research.issues, fallbackUsed:research.needed, check:'dated_reference_and_excerpt_provenance', semanticTruthCertified:false };
        if (research.needed) result={...result,text:verifiedResearchFallback(research.ledger)};
        return { result, evidence, tier, check };
    }

    // Four thousand tokens suffice for short replies. Researched comparisons
    // can reserve eight thousand, including Gemini's reasoning, to finish all
    // requested products. Server-side ceilings also apply after fallback.
    outputBudget(tier, requested = null) {
        const ceiling = tier === 'pro' ? 12288 : 8192;
        const candidate = Number(requested);
        return Number.isFinite(candidate) && candidate > 0 ? Math.min(Math.round(candidate), ceiling) : tier === 'pro' ? ceiling : 4096;
    }

    async generateWithFallback(request, tier) {
        try {
            const result = await this.provider.generate({ ...request, tier, maxOutputTokens: this.outputBudget(tier, request.maxOutputTokens) });
            return { result, tier: effectiveTier(this.provider, tier, result) };
        } catch (error) {
            if (error.cancelled || request.signal?.aborted || !canFallbackFromPro(error)) throw error;
            if (tier === 'pro' && this.provider.name !== 'gemini') {
                console.warn('[Orchestrator] Gemini Pro no disponible; se usa Flash como respaldo:', error.code);
                return { result: await this.provider.generate({ ...request, tier: 'flash', maxOutputTokens: this.outputBudget('flash', request.maxOutputTokens) }), tier: 'flash' };
            }
            if (Array.isArray(request.tools) && request.tools.length) {
                console.warn('[Orchestrator] Búsqueda web de Gemini agotó plazo; se responde con evidencia local verificada:', error.code);
                const fallbackResult = await this.provider.generate({ ...request, tools: null, tier: 'flash', modelProfile: 'nebula', maxOutputTokens: this.outputBudget('flash', request.maxOutputTokens) });
                return { result: { ...fallbackResult, modelFallback: true }, tier: 'flash' };
            }
            throw error;
        }
    }

    async streamWithFallback(request, tier, onText) {
        let emitted = false;
        const allowFallbackBeforeDelivery = !onText;
        const trackedOnText = (part, full) => {
            if (onText) {
                emitted = true;
                onText(part, full);
            }
        };
        try {
            const result = await this.provider.stream({ ...request, tier, maxOutputTokens: this.outputBudget(tier, request.maxOutputTokens), onText: trackedOnText, allowFallbackBeforeDelivery });
            return { result, tier: effectiveTier(this.provider, tier, result) };
        } catch (error) {
            // No cambiamos de modelo tras haber comenzado a transmitir: evitaría
            // repetir texto. Antes del primer fragmento, Flash conserva el chat
            // disponible cuando Pro alcanza cuota o presenta una falla temporal.
            if (emitted || error.cancelled || request.signal?.aborted || !canFallbackFromPro(error)) throw error;
            if (tier === 'pro' && this.provider.name !== 'gemini') {
                console.warn('[Orchestrator] Gemini Pro no inició; se usa Flash como respaldo:', error.code);
                return { result: await this.provider.stream({ ...request, tier: 'flash', maxOutputTokens: this.outputBudget('flash', request.maxOutputTokens), onText: trackedOnText, allowFallbackBeforeDelivery }), tier: 'flash' };
            }
            if (Array.isArray(request.tools) && request.tools.length) {
                console.warn('[Orchestrator] Streaming con búsqueda web agotó plazo; se usa respaldo rápido con evidencia local:', error.code);
                const fallbackResult = await this.provider.stream({ ...request, tools: null, tier: 'flash', modelProfile: 'nebula', maxOutputTokens: this.outputBudget('flash', request.maxOutputTokens), onText: trackedOnText, allowFallbackBeforeDelivery });
                return { result: { ...fallbackResult, modelFallback: true }, tier: 'flash' };
            }
            throw error;
        }
    }

    async enforceReportMinimum(built, result, tier) {
        if (built.taskType !== 'document' || built.responseLength?.explicit) return { result, tier, warnings: [] };
        let best = { result, tier };
        let bestWords = countVisibleWords(result.text);
        if (bestWords >= REPORT_MIN_WORDS) return { ...best, warnings: [] };

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const instruction = `\n\n[CONTROL FINAL DE EXTENSIÓN · INTENTO ${attempt} DE 3]\nEl mejor borrador disponible tiene aproximadamente ${bestWords} palabras y no cumple el mínimo obligatorio de ${REPORT_MIN_WORDS}. Reescribe el informe completo, no agregues un apéndice aislado. Conserva sólo afirmaciones respaldadas, responde al encargo concreto y entrega entre 1,200 y 1,800 palabras. Amplía con metodología, mecanismos, evidencia, escenarios, riesgos, recomendaciones y limitaciones sin repetir frases ni inventar datos. Antes de terminar, cuenta internamente el contenido y asegúrate de superar ${REPORT_MIN_WORDS} palabras visibles.\n\n[BORRADOR A MEJORAR]\n${best.result.text}`;
            try {
                const repaired = await this.generateWithFallback({
                    prompt: built.prompt + instruction,
                    systemInstruction: built.systemInstruction,
                    modelProfile: built.modelProfile,
                    signal: built.signal,
                    json: false,
                    attachments: [],
                    maxOutputTokens: 16384,
                }, best.tier);
                const repairedWords = countVisibleWords(repaired.result.text);
                if (repairedWords > bestWords) {
                    best = repaired;
                    bestWords = repairedWords;
                }
                if (bestWords >= REPORT_MIN_WORDS) return { ...best, warnings: [] };
            } catch (error) {
                if(built.signal?.aborted) throw error;
                console.warn(`[Orchestrator] No se pudo ampliar el informe en el intento ${attempt}:`, error.code || error.message);
            }
        }

        return { ...best, warnings: [`El proveedor no logró alcanzar el mínimo después de tres revisiones (${bestWords}/${REPORT_MIN_WORDS} palabras). Se entrega el borrador más completo disponible sin inventar contenido.`] };
    }

    async streamInternal({ message, history, context, mode = 'auto', tier = 'auto', modelProfile = null, onText, onStatus, attachments = [], userKeyHash = null, signal = null }) {
        const started = Date.now();
        const scope = domainDecision({ message, history, attachments });
        if (!scope.allowed) {
            const text = domainRedirectText(scope.reason);
            onText?.(text, text);
            const response = markdownToRichResponse(text, {
                mode: 'quick', taskType: 'domain_redirect', provider: 'local',
                model: 'vall-domain-guard', latencyMs: Date.now() - started,
            });
            response.meta = { ...(response.meta || {}), followUps: socialFollowUps(false) };
            return { response, text, tier: 'flash', mode: 'quick', model: 'vall-domain-guard' };
        }
        if (scope.reason === 'social') {
            const text = socialReply(message, history);
            onText?.(text, text);
            return localReplyResult(text, started, 'social', history);
        }

        // consistencia de los datos para el orquestadpr de datos para que se pueda enter erl modelo de ml para hacer aue dtos
        //los datos se puedan estructural de todos
        const plan = planQuery({ message, history, mode });
        const retrievalQuery = retrievalQuestion(message, history, scope.reason);
        const toolProgress = describeToolPlan(plan, retrievalQuery);
        onStatus?.('sources', toolProgress);
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
        const completedLabels = new Set();
        // No construimos una regresión ni consultamos cotizaciones en vivo si
        // la pregunta no lo requiere. Antes ambas tareas se ejecutaban en cada
        // turno y el primer fragmento esperaba varias llamadas de red ajenas a
        // una pregunta sencilla. El límite permite iniciar la respuesta con la
        // evidencia disponible sin inventar datos ni bloquear la conversación.
        const { values: [baseEvidence, conversion, liveData, statisticalModel, forecastAnalysis, reportEvidence, marranasML], execution } = await this.collectEvidence({
            plan, retrievalQuery, userKeyHash, directConversion, signal,
            onToolComplete(slot) {
                if (!toolProgress.tools.length) return;
                toolLabelsForSlot(slot, plan).forEach((label) => completedLabels.add(label));
                const remaining = toolProgress.tools.filter((label) => !completedLabels.has(label));
                if (remaining.length) {
                    onStatus?.('sources', {
                        tools: toolProgress.tools,
                        completedTools: [...completedLabels],
                        detail: `Consultando ${remaining.slice(0, 3).join(', ')}…`,
                    });
                }
            },
        });
        let evidence = scopeTradeEvidence(plan, mergeStatisticalEvidence(mergeEvidence(mergeEvidence(baseEvidence, liveData), reportEvidence), statisticalModel));
        evidence.toolExecution = execution;
        const inventorySection = (plan.needsDataInventory || plan.asksCoverageExplanation || plan.asksDataInventory || (plan.needsProteinPrices && !liveData?.proteinPrices?.available))
            ? buildDataInventoryContext({ plan, liveData, evidence })
            : '';
        const fewShotContext = await getDynamicFewShotContext({ message, plan }).catch(() => '');
        const enrichedContext = [planContext(plan), conversionContext(conversion), buildExecutiveSnapshotContext(plan), forecastAnalysis?.context, marranasML?.context, inventorySection, evidence.context, coverageContext(plan, evidence), researchInstructions(plan, evidence), decisionContext({message,history,plan,evidence,forecastAnalysis}), getChatReasoningContext({ message, plan: marranasML?.context ? { ...plan, skipInlineProteinMl: true } : plan }), fewShotContext, context].filter(Boolean).join('\n\n');
        const searchTools = googleSearchTools(shouldUseGoogleSearch(plan));
        const built = tradeResponseInstructions(buildPrompt({ message, history, context: enrichedContext, mode, responseFormat: 'markdown', attachments, webGrounding: Boolean(searchTools), plan }), plan);
        built.modelProfile = modelProfile;
        built.signal = signal;
        const resolvedTier = tier === 'pro' || tier === 'flash'
            ? tier
            : (plan.recommendedTier === 'pro' || built.recommendedTier === 'pro' ? 'pro' : 'flash');
        onStatus?.('reasoning', describeCompletedEvidence(execution, plan, retrievalQuery));
        
        // En chat transmitido priorizamos tiempo al primer fragmento. El antiguo
        // borrador oculto hacía una generación completa extra antes de mostrar
        // una sola palabra y prácticamente duplicaba la latencia en modo Pro.
        // Los anuncios comerciales se comprueban antes de mostrar texto. Un
        // aviso al final no retira una afirmación falsa ya transmitida.
        const buffered = plan.needsTradeResearch || plan.asksNews || plan.asksForecast || plan.needsProteinPrices || plan.needsLiveQuote || plan.asksDecision || plan.explicitRabobank || plan.topics?.some(topic=>['fx','bonds','equities'].includes(topic)) || /garanti\w*|sin riesgo|certeza/i.test(message);
        const deliver = buffered ? null : onText;
        let result, usedTier;
        try {
            ({ result, tier: usedTier } = await this.streamWithFallback({ ...built, attachments, tools: searchTools,
                maxOutputTokens: plan.asksAnalysis || plan.asksNews || plan.needsTradeResearch ? 8192 : 4096 }, resolvedTier, deliver));
        } catch (err) {
            const fallbackMd = process.env.NODE_ENV !== 'test' && this.provider.name === 'gemini'
                && ['AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_PROVIDER_ERROR', 'AI_BILLING'].includes(err?.code)
                ? buildDeterministicEvidenceFallback({ plan, evidence, liveData, reportEvidence, marranasML, forecastAnalysis, dataInventory: inventorySection, error: err })
                : null;
            if (!fallbackMd) throw err;
            console.warn('[Orchestrator] Proveedor IA sin cuota/tiempo; se entrega respaldo determinista con evidencia verificada.');
            result = { text: fallbackMd, model: 'orion-verified-fallback', modelFallback: true, grounding: null, finishReason: 'STOP' };
            usedTier = 'flash';
        }
        if (!result.text) throw Object.assign(new Error('El proveedor devolvió una respuesta vacía.'), { code: 'AI_EMPTY_RESPONSE', status: 502 });
        evidence = scopeTradeEvidence(plan, mergeGroundingEvidence(evidence, result.grounding));
        const validated = await this.validateTradeAnswer({ built, plan, evidence, result, tier: usedTier, attachments, tools: searchTools });
        result = validated.result;
        evidence = validated.evidence;
        usedTier = validated.tier;
        const tradeCheck = validated.check;
        const newsCheck = guardNewsCoverage(plan, result.text);
        result = { ...result, text: newsCheck.text };
        const quality = auditResponse({ text: result.text, plan, liveData, evidence });
        if (quality.priceCitations) evidence = { ...evidence, citations: quality.priceCitations, evidenceCount: quality.priceCitations.length };
        if (newsCheck.changed) quality.warnings.push('Se corrigió una conclusión de ausencia que la cobertura parcial de noticias no permite demostrar.');
        if (result.finishReason === 'MAX_TOKENS') {
            quality.warnings.push('El proveedor alcanzó el límite de salida; la respuesta quedó incompleta.');
            quality.disclosure = [quality.disclosure, '> **Respuesta incompleta:** el proveedor alcanzó el límite de salida. Las partes faltantes requieren una continuación; no se presentan como evaluadas.'].filter(Boolean).join('\n\n');
        }
        if (quality.replacement || quality.disclosure) {
            const previousText = result.text;
            result = { ...result, text: appendDisclosure(result.text, quality) };
            // El chat ya recibió el cuerpo por streaming. Se entrega el control
            // de calidad como último fragmento, sin reescribir lo mostrado.
            if (!buffered) onText?.(result.text.slice(previousText.length), result.text);
        }
        const reportQuality = tradeCheck.blocked || tradeCheck.needsRevision || evidence.researchAudit?.fallbackUsed
            ? { result, tier: usedTier, warnings: [evidence.researchAudit?.fallbackUsed ? 'Se conserva la evidencia disponible sin ampliaciones no verificadas.' : tradeCheck.needsRevision ? 'Se sustituyó una negación incompatible con documentos oficiales recuperados.' : 'No se obtuvo evidencia web para verificar los acuerdos comerciales.'] }
            : await this.enforceReportMinimum(built, result, usedTier);
        result = reportQuality.result;
        const expandedAudit=auditResearchAnswer(plan,evidence,result.text);
        if(expandedAudit.needed) {result={...result,text:verifiedResearchFallback(expandedAudit.ledger)};evidence.researchAudit={...evidence.researchAudit,issues:expandedAudit.issues,fallbackUsed:true};}
        if (process.env.NODE_ENV !== 'test' && (tradeCheck.blocked || expandedAudit.needed || quality.replacement)) {
            void recordFeedbackEvent({
                queryText: message,
                responseText: result.text,
                correctionText: tradeCheck.blocked
                    ? 'Bloqueo de respaldo comercial/evidencia'
                    : expandedAudit.needed
                        ? 'Fallo de auditoría de fuentes verificadas'
                        : 'Corrección de guardia de calidad de precios',
                category: built.taskType || 'quality_guard',
                sourceKind: 'quality_guard',
                userKeyHash,
            }).catch(() => {});
        }
        usedTier = reportQuality.tier;
        let response = markdownToRichResponse(result.text, {
            mode: built.mode, taskType: built.taskType, provider: this.provider.name,
            model: result.model, latencyMs: Date.now() - started, warnings: [...reportQuality.warnings, ...quality.warnings],
        });
        response = ensureRequestedChart(response, message);
        response = ensureRequestedTable(response, message);
        response = finalizeAnalysis(response, { message, history, plan, forecastAnalysis });
        response = attachStatisticalModel(response, statisticalModel);
        attachEvidence(response, evidence, plan);
        const text = toLegacyMarkdown(response);
        if (buffered) onText?.(text, text);
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
        return { response, text, tier: usedTier, mode: built.mode, model: result.model, modelProfile, modelFallback: !!result.modelFallback || usedTier !== resolvedTier, queryId,
            evidenceCount: evidence.evidenceCount, citations: response.meta.citations, retrievalStrategy: evidence.retrievalStrategy };
    }

    async generateStructuredInternal({ message, history, context, mode = 'auto', tier = 'auto', modelProfile = null, attachments = [], userKeyHash = null, signal = null }) {
        const started = Date.now();
        const scope = domainDecision({ message, history, attachments });
        if (!scope.allowed) {
            const text = domainRedirectText(scope.reason);
            const response = markdownToRichResponse(text, {
                mode: 'quick', taskType: 'domain_redirect', provider: 'local',
                model: 'vall-domain-guard', latencyMs: Date.now() - started,
            });
            response.meta = { ...(response.meta || {}), followUps: socialFollowUps(false) };
            return { response, text, tier: 'flash', mode: 'quick', model: 'vall-domain-guard' };
        }
        if (scope.reason === 'social') {
            return localReplyResult(socialReply(message, history), started, 'social', history);
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
        const { values: [baseEvidence, conversion, liveData, statisticalModel, forecastAnalysis, reportEvidence, marranasML], execution } = await this.collectEvidence({ plan, retrievalQuery, userKeyHash, directConversion, signal });
        let evidence = scopeTradeEvidence(plan, mergeStatisticalEvidence(mergeEvidence(mergeEvidence(baseEvidence, liveData), reportEvidence), statisticalModel));
        evidence.toolExecution = execution;
        const inventorySection = (plan.needsDataInventory || plan.asksCoverageExplanation || plan.asksDataInventory || (plan.needsProteinPrices && !liveData?.proteinPrices?.available))
            ? buildDataInventoryContext({ plan, liveData, evidence })
            : '';
        const fewShotContext = await getDynamicFewShotContext({ message, plan }).catch(() => '');
        const enrichedContext = [planContext(plan), conversionContext(conversion), buildExecutiveSnapshotContext(plan), forecastAnalysis?.context, marranasML?.context, inventorySection, evidence.context, coverageContext(plan, evidence), researchInstructions(plan, evidence), decisionContext({message,history,plan,evidence,forecastAnalysis}), getChatReasoningContext({ message, plan: marranasML?.context ? { ...plan, skipInlineProteinMl: true } : plan }), fewShotContext, context].filter(Boolean).join('\n\n');
        const searchTools = googleSearchTools(shouldUseGoogleSearch(plan));
        // Grounding con Search y `responseMimeType: application/json` tarda
        // innecesariamente con algunos proveedores. Para investigaciones se
        // pide Markdown y se normaliza después a bloques ricos; las consultas
        // sin búsqueda conservan el contrato JSON estricto.
        const groundedMarkdown = plan.needsTradeResearch || Boolean(searchTools);
        const built = tradeResponseInstructions(buildPrompt({
            message, history, context: enrichedContext, mode,
            responseFormat: groundedMarkdown ? 'markdown' : 'json', attachments,
            webGrounding: groundedMarkdown,
            plan,
        }), plan);
        built.modelProfile = modelProfile;
        built.signal = signal;
        const resolvedTier = tier === 'pro' || tier === 'flash'
            ? tier
            : (plan.recommendedTier === 'pro' || built.recommendedTier === 'pro' ? 'pro' : 'flash');
        
        // La evidencia recuperada es el respaldo. Un borrador de otra IA no
        // añade evidencia ni convierte propuestas pendientes en reglas activas.
        const finalBuilt = built;
        let result, usedTier;
        try {
            ({ result, tier: usedTier } = await this.generateWithFallback({
                ...finalBuilt, json: !groundedMarkdown, attachments, tools: searchTools,
                maxOutputTokens: this.outputBudget(resolvedTier),
            }, resolvedTier));
        } catch (err) {
            const fallbackMd = process.env.NODE_ENV !== 'test' && this.provider.name === 'gemini'
                && ['AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_PROVIDER_ERROR', 'AI_BILLING'].includes(err?.code)
                ? buildDeterministicEvidenceFallback({ plan, evidence, liveData, reportEvidence, marranasML, forecastAnalysis, dataInventory: inventorySection, error: err })
                : null;
            if (!fallbackMd) throw err;
            console.warn('[Orchestrator] Proveedor IA sin cuota/tiempo; se entrega respaldo determinista con evidencia verificada.');
            result = { text: fallbackMd, model: 'orion-verified-fallback', modelFallback: true, grounding: null, finishReason: 'STOP' };
            usedTier = 'flash';
        }
        evidence = scopeTradeEvidence(plan, mergeGroundingEvidence(evidence, result.grounding));
        const validated = await this.validateTradeAnswer({ built: finalBuilt, plan, evidence, result, tier: usedTier, attachments, tools: searchTools });
        result = validated.result;
        evidence = validated.evidence;
        usedTier = validated.tier;
        let parsed;
        let cleanText = result.text.trim();
        if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```[\w-]*\r?\n/, '').replace(/\r?\n```$/, '').trim();
        }
        try { parsed = JSON.parse(cleanText); }
        catch {
            const quality = auditResponse({ text: result.text, plan, liveData, evidence });
            if (quality.priceCitations) evidence = { ...evidence, citations: quality.priceCitations, evidenceCount: quality.priceCitations.length };
            result = { ...result, text: appendDisclosure(result.text, quality) };
            let response = markdownToRichResponse(result.text, {
                mode: built.mode, taskType: built.taskType, provider: this.provider.name,
                model: result.model, latencyMs: Date.now() - started,
                warnings: [groundedMarkdown
                    ? 'La respuesta fundamentada se convirtió a componentes compatibles.'
                    : 'El JSON del modelo no fue válido; se aplicó el modo compatible.', ...quality.warnings],
            });
            response = ensureRequestedChart(response, message);
            response = ensureRequestedTable(response, message);
            response = finalizeAnalysis(response, { message, history, plan, forecastAnalysis });
            response = attachStatisticalModel(response, statisticalModel);
            attachEvidence(response, evidence, plan);
            const text = toLegacyMarkdown(response);
            const queryId = await this.recordAudit({
                userKeyHash, message, intent: built.taskType, domainAllowed: true,
                retrievalQuery, retrievalStrategy: evidence.retrievalStrategy,
                retrievedChunks: evidence.retrievedChunks, evidenceCount: evidence.evidenceCount,
                retrievalLatencyMs: evidence.retrievalLatencyMs,
                sourceCodes: evidence.sourceCodes, model: result.model, responseText: text,
                latencyMs: Date.now() - started,
            }, evidence.evidenceRecords, text);
            return { response, text, tier: usedTier, mode: built.mode, model: result.model, modelProfile, modelFallback: !!result.modelFallback || usedTier !== resolvedTier, queryId,
            evidenceCount: evidence.evidenceCount, citations: response.meta.citations, retrievalStrategy: evidence.retrievalStrategy };
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
        if (quality.priceCitations) evidence = { ...evidence, citations: quality.priceCitations, evidenceCount: quality.priceCitations.length };
        if (quality.replacement || quality.disclosure) {
            const revised = appendDisclosure(toLegacyMarkdown(response), quality);
            response = markdownToRichResponse(revised, {
                mode: built.mode, taskType: built.taskType, provider: this.provider.name,
                model: result.model, latencyMs: Date.now() - started, warnings: quality.warnings,
            });
        } else if (quality.warnings.length) {
            response.meta.warnings.push(...quality.warnings);
        }
        const reportQuality = evidence.researchAudit?.fallbackUsed ? {result:{text:toLegacyMarkdown(response),model:result.model},tier:usedTier,warnings:[]} : await this.enforceReportMinimum(built, {
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
        const expandedAudit=auditResearchAnswer(plan,evidence,toLegacyMarkdown(response));
        if(expandedAudit.needed) {
            response=markdownToRichResponse(verifiedResearchFallback(expandedAudit.ledger),{mode:built.mode,taskType:built.taskType,provider:this.provider.name,model:result.model,latencyMs:Date.now()-started,warnings:response.meta?.warnings || []});
            evidence.researchAudit={...evidence.researchAudit,issues:expandedAudit.issues,fallbackUsed:true};
        }
        if (process.env.NODE_ENV !== 'test' && (validated.check?.blocked || expandedAudit.needed || quality.replacement)) {
            void recordFeedbackEvent({
                queryText: message,
                responseText: toLegacyMarkdown(response),
                correctionText: validated.check?.blocked
                    ? 'Bloqueo de respaldo comercial/evidencia'
                    : expandedAudit.needed
                        ? 'Fallo de auditoría de fuentes verificadas'
                        : 'Corrección de guardia de calidad de precios',
                category: built.taskType || 'quality_guard',
                sourceKind: 'quality_guard',
                userKeyHash,
            }).catch(() => {});
        }
        response = ensureRequestedChart(response, message);
        response = ensureRequestedTable(response, message);
        response = finalizeAnalysis(response, { message, history, plan, forecastAnalysis });
        response = attachStatisticalModel(response, statisticalModel);
        attachEvidence(response, evidence, plan);
        const text = toLegacyMarkdown(response);
        const queryId = await this.recordAudit({
            userKeyHash, message, intent: built.taskType, domainAllowed: true,
            retrievalQuery, retrievalStrategy: evidence.retrievalStrategy,
            retrievedChunks: evidence.retrievedChunks, evidenceCount: evidence.evidenceCount,
            retrievalLatencyMs: evidence.retrievalLatencyMs,
            sourceCodes: evidence.sourceCodes, model: result.model, responseText: text,
            latencyMs: Date.now() - started,
        }, evidence.evidenceRecords, text);
        return { response, text, tier: usedTier, mode: built.mode, model: result.model, modelProfile, modelFallback: !!result.modelFallback || usedTier !== resolvedTier, queryId,
            evidenceCount: evidence.evidenceCount, citations: response.meta.citations, retrievalStrategy: evidence.retrievalStrategy };
    }

    buildContext(input) { return createContext(input); }
}

const orchestrator = new AIOrchestrator();
module.exports = {
    AIOrchestrator, orchestrator, retrievalQuestion, attachEvidence, countVisibleWords,
    canFallbackFromPro, effectiveTier, shouldUseGoogleSearch, mergeGroundingEvidence,
    groundingSourcesMarkdown, describeToolPlan, describeCompletedEvidence,
};
