'use strict';

const { externalGet, YF_UA } = require('../lib/http');
const { BoundedCache, createSingleFlight } = require('../lib/bounded-cache');
const { assessAdaptiveForecast, MODEL_VERSION } = require('../ml/adaptive-forecast');
const { marketProfile } = require('../ml/market-profiles');
const { learningStore: persistentLearningStore } = require('../ml/forecast-learning-store');
const { requestedInstruments, marketCountryConflict } = require('./statistical-analysis');
const { normalizeForIntent } = require('./conversation-context');
const { toLegacyMarkdown } = require('./response-schema');
const { buildPhysicalForecast } = require('./physical-forecast');

const cache = new BoundedCache({ maxEntries: 60, maxBytes: 2 * 1024 * 1024 });
const singleFlight = createSingleFlight(12);
const DAY = 86_400_000;
const number = value => Number(value).toLocaleString('es-MX', { maximumFractionDigits: 4 });
const percentage = value => Number(value * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 });

function unavailable(reason, records = []) {
    return { requested: true, available: records.some(record => record.available), reason, records,
        context: '[PRONÓSTICO NUMÉRICO DEL SERVIDOR]\n' + reason
            + '\nSin un pronóstico validado para un activo y horizonte, no inventes objetivos de precio ni probabilidades. Desarrolla escenarios condicionales y el dato necesario para verificarlos.' };
}

async function loadForecast(instrument, horizon, { get = externalGet, now = Date.now(), learningStore = get === externalGet ? persistentLearningStore : null, persist = true, signal, reviewOnly = false } = {}) {
    signal?.throwIfAborted();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.ticker)}?interval=1d&range=2y`;
    const response = await get(url, { 'User-Agent': YF_UA, Accept: 'application/json' }, 8000, { signal });
    if (!response.ok) throw new Error('La serie no está disponible.');
    const result = (await response.json())?.chart?.result?.[0];
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
    const today = new Date(now).toISOString().slice(0, 10);
    const regular = result?.meta?.currentTradingPeriod?.regular;
    const sessionClosed = Number.isFinite(regular?.start) && Number.isFinite(regular?.end)
        && now >= regular.end * 1000 + 15 * 60_000;
    const sessionTarget = Number.isFinite(regular?.start) && Number.isFinite(regular?.end) && !sessionClosed
        ? { date: new Date(regular.start * 1000).toISOString().slice(0, 10), closesAt: new Date(regular.end * 1000 + 15 * 60_000).toISOString() } : null;
    const points = new Map();
    for (let index = 0; index < timestamps.length; index++) {
        const timestamp = timestamps[index] * 1000;
        const raw = Array.isArray(adjusted) ? adjusted[index] : closes[index];
        if (raw == null || raw === '' || typeof raw === 'boolean' || !Number.isFinite(timestamp) || timestamp > now) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) continue;
        const date = new Date(timestamp).toISOString().slice(0, 10);
        if (regular && !sessionClosed && timestamp >= regular.start * 1000 && timestamp <= regular.end * 1000) continue;
        // No entrenar con la vela todavía abierta ni asignar al último cierre
        // la fecha de una observación nula o de la petición.
        if (date < today || date === today && sessionClosed && timestamp >= regular.start * 1000 && timestamp <= regular.end * 1000) points.set(date, value);
    }
    const rows = [...points].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })).slice(-740);
    const latest = rows.at(-1);
    const base = { ticker: instrument.ticker, name: instrument.name, unit: instrument.unit || result?.meta?.currency || 'moneda sin confirmar',
        source: 'Yahoo Finance · serie diaria', sourceUrl: url, horizon, cutoff: latest?.date || null,
        priceBasis: Array.isArray(adjusted) ? 'cierres ajustados por el proveedor' : 'cierres sin ajuste confirmado' };
    if (!latest || now - Date.parse(latest.date) > 5 * DAY) return { ...base, available: false, reason: 'La serie está ausente o su último cierre tiene más de cinco días de antigüedad.' };
    if (!instrument.unit && !result?.meta?.currency) return { ...base, available: false, reason: 'No se confirmó la moneda de la serie.' };
    if (!Array.isArray(adjusted) && !/[=^]|-[A-Z]{3}$/.test(instrument.ticker)) {
        return { ...base, available: false, reason: 'Faltan cierres ajustados de la acción; no se calcula un precio objetivo con una serie que puede contener saltos por dividendos o splits.' };
    }
    const profile = marketProfile(instrument);
    base.marketProfile = { id: profile.id, name: profile.name };
    if (instrument.ticker.endsWith('=F')) base.seriesLimit = 'Referencia continua del proveedor, sin vencimiento individual confirmado. Un salto por cambio de contrato puede afectar el modelo. No es precio físico local.';
    const options = { now, persist, unit: base.unit, priceBasis: base.priceBasis, sessionTarget, modelVersion: `${MODEL_VERSION}/${profile.id}` };
    const reviewed = learningStore ? await learningStore.review(instrument.ticker, horizon, rows, options)
        : { status: 'disabled', feedback: [], summary: { realEvaluations: 0, pending: 0 } };
    signal?.throwIfAborted();
    let assessment = assessAdaptiveForecast(rows, { horizon, feedback: reviewed.feedback, now, profileId: profile.id });
    signal?.throwIfAborted();
    const saved = learningStore && reviewed.status === 'connected' && !reviewOnly
        ? await learningStore.record(instrument.ticker, horizon, rows, assessment, options) : { status: reviewed.status, assessment };
    assessment = saved.assessment;
    const learning = { ...(assessment.learning || {}), ...reviewed.summary, storageStatus: saved.status,
        storageReason: reviewed.reason || null, notice: 'Los ejemplos simulados se distinguen de los pronósticos registrados y evaluados con resultados reales.' };
    const evaluation = assessment.evaluation || null;
    if (!assessment.eligible) return { ...base, available: false, reason: assessment.reason, observations: rows.length, evaluation, learning };
    const { value, lowerBound, upperBound, changePct } = assessment.forecast;
    if (![value, lowerBound, upperBound].every(Number.isFinite) || value <= 0) return { ...base, available: false, reason: 'El modelo produjo una estimación inestable o no compatible con una serie de precios.', evaluation };
    return { ...base, available: true, observations: rows.length, lastValue: latest.value,
        prediction: { value, lowerBound: Math.max(0, lowerBound), upperBound, changePct, probabilityUp: null,
            rangeMethod: 'errores fuera de muestra al mismo horizonte' }, evaluation, learning };
}

async function buildForecastAnalysis(plan = {}, dependencies = {}) {
    if (!plan.asksForecast) return null;
    const request = plan.forecast;
    if (!request?.horizon) return unavailable('Falta definir el horizonte. Un pronóstico a una sesión y uno a un mes requieren validaciones distintas.');
    if (!request.supported) return unavailable('El horizonte pedido supera las 20 observaciones que valida este motor. Se ofrecen escenarios cualitativos; no se extrapola una cifra fuera del horizonte probado.');
    const query = plan.marketQuery || '';
    const text = normalizeForIntent(query);
    if (/\b(?:pronostic\w*|proyect\w*|predic\w*|estimar|prever)\b[^.!?]{0,32}\b(?:mi |el |su )?margen(?:es)?\b/.test(text)) {
        return unavailable('Para estimar margen se necesitan precio neto de venta y costo completo por unidad del negocio analizado. Un pronóstico de cotización o de futuros no valida ese margen.');
    }
    const candidates = requestedInstruments(query, { limit: 4 });
    const conflict = marketCountryConflict(query, candidates);
    if (conflict) return unavailable(conflict.reason || 'El país y el activo indicados no coinciden; confirma cuál quieres analizar.');
    const affirmative = text.replace(/\b(?:no|sin|evita|excluye)\b[^.;:\n]*\b(?:futuros?|cme|cbot)\b[^.;:\n]*/g, '');
    const explicitFutures = /\b(?:futuros?|cme|cbot)\b/.test(affirmative);
    const instruments = candidates.filter(instrument => !instrument.ticker.endsWith('=F') || explicitFutures);
    if (!instruments.length && plan.proteinProfile?.products?.length) return buildPhysicalForecast(plan,{
        ...dependencies, ...(dependencies.get && !dependencies.archive ? { archive: { series: async()=>[] } } : {}),
    });
    if (!instruments.length) return unavailable(plan.proteinProfile?.products?.length
        ? 'Para pronosticar un precio físico se necesita una serie del país, producto y etapa comercial pedidos. Los futuros de otro mercado no sustituyen esa serie.'
        : 'Falta un activo o una serie comparable con observaciones fechadas para calcular un pronóstico numérico.');
    const now = dependencies.now ?? Date.now();
    const records = await Promise.all(instruments.map(async instrument => {
        let horizon = request.horizon;
        if (/-[A-Z]{3}$/.test(instrument.ticker) && request.assumption) {
            if (/semana/.test(request.label)) horizon = horizon / 5 * 7;
            if (/mes/.test(request.label)) horizon = horizon / 20 * 30;
        }
        if (horizon > 20) return { ticker: instrument.ticker, name: instrument.name, available: false, reason: 'El horizonte calendario de este activo excede 20 observaciones.' };
        const key = `${instrument.ticker}:${horizon}:${dependencies.persist === false ? 'readonly' : 'persist'}`;
        try {
            const saved = dependencies.get ? null : cache.get(key);
            if (saved && now - saved.savedAt < 10 * 60_000 && now - Date.parse(saved.record.cutoff) <= 5 * DAY) return saved.record;
            const load = () => loadForecast(instrument, horizon, { ...dependencies, now });
            const record = dependencies.get ? await load() : await singleFlight(key, load);
            if (!dependencies.get && record.cutoff) cache.set(key, { savedAt: now, record });
            return record;
        } catch {
            return { ticker: instrument.ticker, name: instrument.name, available: false, reason: 'No se pudo verificar una serie reciente durante esta consulta.' };
        }
    }));
    const context = ['[PRONÓSTICO NUMÉRICO DEL SERVIDOR]',
        'Se compararon persistencia, autoregresión completa, autoregresión reciente y tendencia amortiguada con hasta dos años de historia. Los pesos y sesgos se ajustan sólo con errores cuyo resultado ya se conocía en cada origen. Sólo se publica al reducir el MAE al menos 2% frente al último valor en la evaluación reciente y en un mínimo de ocho ventanas sin solapamiento, al mismo horizonte.',
        request.assumption ? `Conversión orientativa del horizonte: ${request.label} se expresa en observaciones de mercado. No se confirma una fecha exacta ni un calendario de festivos.` : '',
        ...records.map(record => JSON.stringify(record)),
        'El rango describe errores históricos fuera de muestra; no es un intervalo calibrado de 95% ni una garantía de rentabilidad. Su cobertura se mide usando sólo errores conocidos antes de cada estimación. No hay probabilidad direccional validada. Las ventanas sin solapamiento evitan contar dos veces el mismo tramo, pero no garantizan independencia estadística.',
        'Las noticias, cambios sanitarios y resultados nuevos pueden invalidar el patrón histórico. La ficha numérica se añade desde el servidor: interpreta sus límites, no inventes otra estimación.',
        'El aprendizaje indica por separado simulaciones y resultados reales. Sin resultados reales maduros no afirmes que ya aprendió de un fallo en producción. Los diagnósticos describen sobreestimación, dirección y rango; no demuestran una causa económica ni que una noticia causó el error.',
    ].filter(Boolean).join('\n');
    return { requested: true, available: records.some(record => record.available), horizon: request.label, assumption: request.assumption, records, context };
}

function forecastMarkdown(analysis) {
    if (!analysis) return '';
    const escape = value => String(value || '').replace(/[|\r\n]/g, ' ');
    const records = analysis.records || [];
    const accepted = records.filter(record => record.available);
    const rejected = records.filter(record => !record.available);
    const lines = [accepted.length ? '### Pronóstico cuantitativo evaluado' : '### Estado del pronóstico'];
    if (accepted.length) {
        lines.push('| Activo | Corte histórico | Horizonte | Estimación | Rango orientativo | Error MAE / referencia |', '| --- | --- | --- | --- | --- | --- |');
        for (const record of accepted) lines.push(`| ${escape(record.name)} (${escape(record.ticker)}) | ${record.cutoff} | ${escape(record.horizonLabel || record.horizon+' observaciones')} | ${number(record.prediction.value)} ${escape(record.unit)} | ${number(record.prediction.lowerBound)}–${number(record.prediction.upperBound)} ${escape(record.unit)} | ${number(record.evaluation.modelMae)} / ${number(record.evaluation.baselineMae)} ${escape(record.unit)} |`);
        lines.push('', 'Rango orientativo basado en errores fuera de muestra; no es una probabilidad de acierto ni garantiza cobertura futura. Las observaciones se cuentan desde el corte histórico y excluyen velas sin cierre confirmado.');
        if (analysis.assumption) lines.push('El periodo calendario se aproxima con observaciones del mercado; no confirma una fecha exacta ni días festivos.');
        for (const record of accepted) lines.push(`- [Serie de ${escape(record.ticker)}](${record.sourceUrl}) · ${record.observations} observaciones; ${record.evaluation.evaluationPoints} evaluaciones temporales; ${escape(record.priceBasis)}. La referencia conserva el último precio conocido.`);
        for (const record of records.filter(record=>record.marketProfile)) lines.push(`- **Modelo de ${escape(record.ticker)}:** ${escape(record.marketProfile.name)}.${record.seriesLimit ? ' '+record.seriesLimit : ''}`);
        for (const record of accepted.filter(record => record.evaluation.nonOverlapping)) {
            const assessment = record.evaluation;
            const windows = assessment.nonOverlapping;
            lines.push(`- **Control adicional de ${escape(record.ticker)}:** ${windows.evaluationPoints} ventanas sin solapamiento; MAE ${number(windows.modelMae)} frente a ${number(windows.baselineMae)} ${escape(record.unit)} de la referencia. Sesgo reciente (observado menos estimado): ${number(assessment.meanSignedError)} ${escape(record.unit)}.`);
            if (assessment.intervalChecks) lines.push(`  El rango previo cubrió ${percentage(assessment.intervalCoverage)}% de ${assessment.intervalChecks} resultados históricos posteriores. Es cobertura observada, no probabilidad de acierto futura.`);
        }
    }
    if (analysis.reason) lines.push('', analysis.reason);
    for (const record of rejected) lines.push(`- ${escape(record.name || record.ticker)}${record.cutoff ? ` · corte ${record.cutoff}` : ''}${record.horizon ? ` · ${record.horizon} observaciones` : ''}: ${record.reason}${record.evaluation ? ` MAE del modelo: ${number(record.evaluation.modelMae)} ${escape(record.unit)}; referencia: ${number(record.evaluation.baselineMae)} ${escape(record.unit)}.` : ''}`);
    if (!accepted.length) lines.push('', 'La lectura cualitativa conserva su utilidad, pero no se publica un precio objetivo propio sin validación.');
    if (records.some(record => record.learning)) {
        lines.push('', '### Aprendizaje de resultados');
        for (const record of records.filter(record => record.learning)) {
            const state = record.learning;
            lines.push(`- **${escape(record.ticker)}:** ${state.realEvaluations || 0} resultados reales evaluados; ${state.simulatedExamples || 0} ejemplos de validación histórica. ${state.storageStatus === 'recorded' ? 'La estimación original quedó registrada para revisarla con las nuevas observaciones.' : state.storageStatus === 'not_recorded' ? 'Esta consulta de prueba no guarda un pronóstico nuevo.' : 'No se confirmó el registro persistente durante esta consulta.'}`);
            if (state.realMae != null) lines.push(`  Error real reciente: ${number(state.realMae)} ${escape(record.unit)}; referencia: ${number(state.baselineMae)} ${escape(record.unit)}.`);
            if (state.storageBackend === 'local_persistent') lines.push('  Seguimiento guardado en el disco privado de este servidor; se conserva al reiniciar. No se comparte automáticamente entre servidores.');
            if (state.publishedMae != null) lines.push(`  MAE reciente de las estimaciones publicadas: ${number(state.publishedMae)} ${escape(record.unit)}.`);
            if (state.evaluatedWindow) lines.push(`  Ventana de seguimiento: ${state.evaluatedWindow} resultados registrados, incluidos ensayos no publicados. En todo el historial compatible: ${state.publishedEvaluations || 0} publicados y ${state.shadowEvaluations || 0} ensayos. Cobertura reciente del rango: ${percentage(state.intervalCoverage)}%; sesgo: ${number(state.meanSignedError)} ${escape(record.unit)}.`);
            for (const error of state.recentErrors || []) lines.push(`  Resultado del ${error.resultDate}${error.published ? '' : ' (estimación de prueba)'}: estimado ${number(error.predicted)}, observado ${number(error.actual)} ${escape(record.unit)}. ${error.diagnosis.join(' ')}`);
        }
        lines.push('Los errores ajustan el peso de los métodos y una corrección limitada de sesgo. Se revisan al recibir una serie nueva; las causas económicas requieren evidencia adicional.');
    }
    return lines.join('\n');
}

function attachForecastAnalysis(response, analysis) {
    if (!analysis) return response;
    response.meta = response.meta || {};
    const { context: _context, ...metadata } = analysis;
    response.meta.forecastAnalysis = metadata;
    const content = forecastMarkdown(analysis);
    const original = toLegacyMarkdown(response);
    response.blocks.push({ type: 'markdown', content });
    response.markdown = [original, content].filter(Boolean).join('\n\n');
    return response;
}

function guardForecastAnswer(plan, text) {
    if (!plan.asksForecast) {
        const cleaned=String(text || '').replace(/^#{1,6}\s+(?:Estado del pronóstico|Pronóstico cuantitativo evaluado)\s*\r?\n[\s\S]*?(?=^#{1,6}\s|$(?![\s\S]))/gmi,'').trim();
        return {text:cleaned,changed:cleaned!==String(text || '').trim()};
    }
    let changed = false;
    const physicalBusiness = plan.proteinProfile?.products?.length && !plan.proteinProfile.futures && !plan.topics?.includes('equities');
    const correction = physicalBusiness ? 'No puedo asignar una probabilidad exacta de ventas o margen sin datos del negocio y un modelo validado. Puedo explicar escenarios condicionales y las señales que permitirían revisarlos.' : 'No hay una rentabilidad garantizada ni una probabilidad de acierto calibrada. La estimación propia, si supera la validación, aparece en la ficha cuantitativa del servidor.';
    const sentences = String(text || '').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¿])|\n/);
    const safe = sentences.map(sentence => {
        const folded = normalizeForIntent(sentence);
        const guarantee = /\b(?:subira|bajara|ganaras|rentabilidad|rendimiento)\b.{0,60}\b(?:seguro|garantizado|sin riesgo|con certeza)\b|\b(?:garantizo|garantizamos)\b/.test(folded);
        const probability = /\b(?:probabilidad|certeza|chance|acierto)\b[^.!?]{0,55}\d+(?:[.,]\d+)?\s*%|\d+(?:[.,]\d+)?\s*%[^.!?]{0,35}\b(?:probabilidad|certeza|acierto)\b/.test(folded);
        const negated = /\b(?:no|sin|nunca)\s+(?:hay\s+|existe\s+|tengo\s+|una\s+|se\s+)?(?:garantia|probabilidad|certeza)|\bno\s+(?:se puede\s+|puedo\s+)?(?:garantizar|afirmar|asegurar)\b/.test(folded)
            && !/\b(?:pero|aunque|aun asi|sin embargo)\b/.test(folded);
        const inventedTarget = /\b(?:mi pronostico|mi prediccion|estimo|preveo|subira|bajara|alcanzara|cotizara|llegara a|senal observable|superacion|hacia niveles|precio objetivo|rango esperado|rango previsto)\b[^!?]{0,150}(?:\d+(?:[.,]\d+)?\s*(?:%|usd|mxn|eur|pesos|dolares)|\$\s*\d)/.test(folded)
            && !/\b(?:si|supuesto|hipotetico|ilustrativo)\b/.test(folded);
        if ((guarantee || probability) && !negated || inventedTarget && !negated) {
            changed = true;
            return correction;
        }
        return sentence;
    });
    let correctionSeen = false;
    const corrected = safe.filter(sentence => {
        if (sentence !== correction) return true;
        if (correctionSeen) return false;
        correctionSeen = true;
        return true;
    }).join('\n');
    return { text: changed ? corrected : text, changed };
}

module.exports = { buildForecastAnalysis, loadForecast, forecastMarkdown, attachForecastAnalysis, guardForecastAnswer };
