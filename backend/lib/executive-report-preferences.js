'use strict';
const {isFxReport}=require('./report-fx');

const AUDIENCES = {
    general: 'Comité directivo', finance: 'Finanzas y tesorería', purchasing: 'Compras y abastecimiento',
    operations: 'Operaciones', commercial: 'Dirección comercial',
};
const DEFAULT_SECTIONS = { indicators: true, charts: true, tables: true, risks: true, sources: true };
const HORIZONS = { current: 'Corte actual', month: 'Próximos 30 días', quarter: 'Próximo trimestre', year: 'Próximos 12 meses' };
const CONFIDENTIALITY = { internal: 'Uso interno', confidential: 'Confidencial', shareable: 'Compartible' };

function text(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizePreferences(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    const audience = Object.hasOwn(AUDIENCES, input.audience) ? input.audience : 'general';
    const depth = ['standard', 'brief', 'detailed'].includes(input.depth) ? input.depth : 'standard';
    const sections = Object.fromEntries(Object.keys(DEFAULT_SECTIONS).map(key => [key, input.sections?.[key] !== false]));
    const decisionHorizon = Object.hasOwn(HORIZONS, input.decisionHorizon) ? input.decisionHorizon : 'current';
    const confidentiality = Object.hasOwn(CONFIDENTIALITY, input.confidentiality) ? input.confidentiality : 'internal';
    // La identidad visual actual es única. Esto también migra preferencias
    // guardadas con los temas antiguos ocean/emerald.
    const theme = 'graphite';
    return {
        audience, depth, decisionHorizon, confidentiality, theme,
        recipientName: text(input.recipientName, 80), organization: text(input.organization, 100),
        customTitle: text(input.customTitle, 110), objective: text(input.objective, 400), sections,
    };
}

function changed(input) {
    const preferences = normalizePreferences(input);
    return preferences.audience !== 'general' || preferences.depth !== 'standard' || Boolean(preferences.objective)
        || Boolean(preferences.recipientName) || Boolean(preferences.organization) || Boolean(preferences.customTitle)
        || preferences.decisionHorizon !== 'current' || preferences.confidentiality !== 'internal' || preferences.theme !== 'graphite'
        || Object.keys(DEFAULT_SECTIONS).some(key => !preferences.sections[key]);
}

function personalizeExecutiveReport(report, input) {
    if (!report || !changed(input)) return report;
    const preferences = normalizePreferences(input);
    const audience = AUDIENCES[preferences.audience];
    const brief = preferences.depth === 'brief';
    const focus = {
        general: { terms: ['panorama', 'resumen', 'global', 'crecimiento'], action: 'Comparar las señales del corte y definir qué decisión requiere seguimiento del equipo.' },
        finance: { terms: ['divisa', 'tipo de cambio', 'volatilidad', 'tasas', 'vix', 'rendimiento', 'bolsa'], action: 'Revisar exposición a divisas, volatilidad y costos financieros; contrastar las señales con los límites de tesorería antes de decidir.' },
        purchasing: { terms: ['costo', 'granos', 'maíz', 'soya', 'oferta', 'inventario', 'precio', 'cerdo', 'pollo'], action: 'Contrastar precios e inventarios con las cotizaciones de proveedores, volúmenes requeridos y fechas de compra.' },
        operations: { terms: ['producción', 'logística', 'suministro', 'energía', 'capacidad', 'sanitario'], action: 'Revisar continuidad del suministro, costos de energía y restricciones logísticas frente al plan de producción.' },
        commercial: { terms: ['demanda', 'consumo', 'exportación', 'importación', 'arancel', 'venta', 'mercado'], action: 'Contrastar demanda, acceso comercial y costos con los márgenes y compromisos vigentes antes de ajustar precios.' },
    }[preferences.audience];
    const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const terms = [...new Set(fold(preferences.objective).split(/[^a-z0-9]+/).filter(term => term.length > 3 && !['para', 'como', 'este', 'esta', 'sobre', 'quiero', 'necesito', 'informe', 'analizar'].includes(term)))];
    const score = item => {
        const body = fold(typeof item === 'object' ? JSON.stringify(item) : item);
        return terms.reduce((total, term) => total + (body.includes(term) ? 4 : 0), 0) + focus.terms.reduce((total, term) => total + (body.includes(fold(term)) ? 1 : 0), 0);
    };
    const prioritize = items => (items || []).map((item, index) => ({ item, index, score: score(item) })).sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.item);
    const evidence = [...(report.metrics || []), ...(report.sections || []), ...(report.takeaways || [])];
    const objectiveCovered = !terms.length || evidence.some(item => terms.some(term => fold(typeof item === 'object' ? JSON.stringify(item) : item).includes(term)));
    const horizonNote = preferences.decisionHorizon === 'current'
        ? 'Valida la decisión con los datos y la fecha de este corte.'
        : `Usa este corte como punto de partida para ${HORIZONS[preferences.decisionHorizon].toLowerCase()}; actualiza las señales en cada nuevo corte. Seleccionar un horizonte no convierte los datos actuales en una predicción.`;
    const personalized = {
        ...report,
        title: preferences.customTitle || (preferences.audience === 'general' ? report.title : `${report.title} · ${audience}`),
        eyebrow: `${report.eyebrow || 'Informe ejecutivo'} · Edición personalizada`,
        objective: [preferences.objective ? `Solicitud del usuario: ${preferences.objective}.` : '', `Audiencia prioritaria: ${audience}.`, `Horizonte de decisión: ${HORIZONS[preferences.decisionHorizon]}.`, report.objective || ''].filter(Boolean).join(' '),
        summary: `${report.summary || ''}${preferences.objective ? ` La lectura prioriza: ${preferences.objective}.` : ''}`.trim(),
        personalization: {
            ...preferences,
            audienceKey: preferences.audience,
            audienceLabel: audience,
            audience,
            horizon: HORIZONS[preferences.decisionHorizon],
            confidentialityLabel: CONFIDENTIALITY[preferences.confidentiality],
        },
        decisionGuide: {
            heading: `Lectura para ${audience}`,
            action: focus.action,
            horizonNote,
            coverageNote: objectiveCovered ? '' : 'El corte no contiene evidencia específica suficiente para el objetivo solicitado. Amplía las fuentes antes de decidir.',
        },
    };
    for (const key of ['metrics', 'visuals', 'tables', 'sections', 'takeaways', 'watchlist']) personalized[key] = prioritize(report[key]);
    if (!preferences.sections.indicators) personalized.metrics = [];
    else if (brief && !isFxReport(report)) personalized.metrics = (personalized.metrics || []).slice(0, 4);
    if (!preferences.sections.charts) personalized.visuals = [];
    else if (brief && !isFxReport(report)) personalized.visuals = (personalized.visuals || []).slice(0, 1);
    if (!preferences.sections.tables) personalized.tables = [];
    else if (brief) personalized.tables = (personalized.tables || []).slice(0, 1);
    if (!preferences.sections.risks) personalized.watchlist = [];
    if (!preferences.sections.sources) { personalized.sources = []; personalized.sourceLinks = []; }
    if (brief) {
        personalized.sections = (personalized.sections || []).slice(0, 3);
        personalized.takeaways = (personalized.takeaways || []).slice(0, 3);
        personalized.watchlist = (personalized.watchlist || []).slice(0, 2);
        personalized.sources = (personalized.sources || []).slice(0, 5);
        personalized.sourceLinks = (personalized.sourceLinks || []).slice(0, 5);
        personalized.summary = String(personalized.summary).split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ])/).slice(0, 3).join(' ');
    }
    if (preferences.depth === 'detailed') personalized.sections = [...personalized.sections, {
        heading: 'Verificación de la evidencia',
        text: [`Corte de referencia: ${report.generatedAt || 'fecha no declarada'}.`, `${personalized.metrics.length} indicadores, ${personalized.visuals.length} gráficas y ${personalized.tables.length} tablas incluidos en esta edición.`, 'Comprueba la fecha, unidad y observación previa de cada dato; distingue los valores observados de los escenarios y contrasta las conclusiones con las fuentes del corte.', preferences.sections.sources ? `Referencias declaradas: ${(report.sources || []).join('; ') || 'sin referencias declaradas'}.` : 'El bloque de fuentes fue excluido por el usuario.'].join('\n\n'),
    }];
    if (personalized.executiveBrief) personalized.executiveBrief = {
        ...personalized.executiveBrief,
        context: [preferences.objective ? `Prioridad solicitada: ${preferences.objective}.` : '', personalized.executiveBrief.context || ''].filter(Boolean).join(' '),
        committeeQuestion: preferences.objective
            ? `Para ${audience}, ¿qué evidencia adicional permitiría actuar sobre “${preferences.objective}” sin rebasar los datos de este corte?`
            : personalized.executiveBrief.committeeQuestion,
        drivers: prioritize(personalized.executiveBrief.drivers).slice(0, brief ? 2 : undefined),
        risks: preferences.sections.risks ? prioritize(personalized.executiveBrief.risks).slice(0, brief ? 2 : undefined) : [],
    };
    // Raw content and historical snapshots cannot bypass the selected edition.
    personalized.content = '';
    if (!preferences.sections.indicators) personalized.comparisons = [];
    return personalized;
}

module.exports = { normalizePreferences, personalizeExecutiveReport, changed };
