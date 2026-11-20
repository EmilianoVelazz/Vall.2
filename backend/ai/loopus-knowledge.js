'use strict';

const fs = require('fs');
const path = require('path');

const PROPOSALS_FILE = path.join(__dirname, '../cache/learning-proposals.json');
const BRAIN_PROPOSALS_FILE = path.join(__dirname, '../cache/brain-proposals.json');
const PLAYBOOK_FILE = path.join(__dirname, '../cache/loopus-reasoning-playbook.json');

const clean = (value, max = 420) => String(value || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const fold = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// Reglas metodológicas base de razonamiento analítico para Chat y Creación de Informes.
// Nunca contienen precios fijos ni cifras históricas: sólo estructuran el raciocinio
// causal, cruce de variables, distinción de unidades/etapas y disciplina de evidencia.
const BASELINE_REASONING_RULES = Object.freeze([
    {
        id: 'loopus-base-chat-fx-imports',
        domain: 'chat',
        topic: 'fx_commodities',
        keywords: ['usd', 'mxn', 'dolar', 'peso', 'divisa', 'tipo de cambio', 'maiz', 'soya', 'importacion', 'cobertura', 'margen'],
        condition_trigger: 'Consultas que combinan tipo de cambio (USD/MXN) con insumos importados o márgenes comerciales',
        learned_rule: 'Cruza la variación cambiaria con la moneda original del insumo y el plazo de liquidación: separa el efecto precio en origen (USD/ton o centavos/bushel) del efecto paridad (MXN/USD) y presenta la implicación financiera como escenario condicional.',
        reasoning_chain: 'Paridad observada -> Moneda del contrato/insumo -> Sensibilidad del costo puesto en planta -> Disparador de revisión de cobertura',
    },
    {
        id: 'loopus-base-chat-protein-stages',
        domain: 'chat',
        topic: 'proteins_physical',
        keywords: ['cerdo', 'porcino', 'pollo', 'res', 'bovino', 'huevo', 'canal', 'pie', 'mayoreo', 'menudeo', 'rastro', 'sniim', 'profeco', 'dspc'],
        condition_trigger: 'Consultas de precios físicos o comparativas de proteínas animales por plaza y etapa comercial',
        learned_rule: 'No compares animal en pie, canal en rastro, mayoreo de distribuidor y menudeo al consumidor como si fueran equivalentes: explicita la merma/rendimiento entre eslabones, conserva unidad y fecha exacta de cada plaza y advierte cuando una cotización es de catálogo y no de mercado abierto.',
        reasoning_chain: 'Especie y presentación -> Etapa comercial y unidad -> Fecha y fuente por plaza -> Límite de comparabilidad',
    },
    {
        id: 'loopus-base-chat-feed-margin',
        domain: 'chat',
        topic: 'agribusiness_costs',
        keywords: ['granos', 'maiz', 'pasta de soya', 'trigo', 'forraje', 'alimento', 'costo', 'produccion', 'conversion', 'flete', 'diesel'],
        condition_trigger: 'Análisis de costos pecuarios, formulación de alimento balanceado o logística agroindustrial',
        learned_rule: 'Relaciona el movimiento de futuros de grano/oleaginosa con la base física más flete e internación hacia la región productora; distingue costo spot de reposición frente a inventario ya comprometido antes de inferir presión sobre el margen pecuario.',
        reasoning_chain: 'Referencia futuro/origen -> Base logística y energía -> Costo de reposición -> Impacto condicional en margen operativo',
    },
    {
        id: 'loopus-base-chat-rates-liquidity',
        domain: 'chat',
        topic: 'rates_bonds',
        keywords: ['bonos', 'tasas', 'cetes', 'tiie', 'treasury', 'banxico', 'fed', 'curva', 'deuda', 'financiamiento', 'liquidez', 'inflacion'],
        condition_trigger: 'Consultas sobre curva soberana, diferencial de tasas México-EE. UU. o costo de capital de trabajo',
        learned_rule: 'Interpreta la pendiente de la curva (corto vs largo plazo) y el diferencial en puntos base sin mezclar tasas de descuento con rendimientos par ni frecuencias de subasta con sesiones diarias; vincula el nivel de tasa corta con el costo de financiar inventarios y cuentas por cobrar.',
        reasoning_chain: 'Nivel y cambio en pb -> Forma de la curva y diferencial -> Transmisión a crédito/capital de trabajo -> Condición macro a vigilar',
    },
    {
        id: 'loopus-base-report-committee',
        domain: 'reports',
        topic: 'executive_synthesis',
        keywords: ['finanzas', 'mercados', 'mexico', 'overview', 'comite', 'general', 'direccion', 'ejecutivo'],
        condition_trigger: 'Síntesis ejecutiva y creación de informes para Comité Directivo o audiencia general',
        learned_rule: 'Abre la tesis con el hallazgo verificable de mayor impacto operativo citando su cifra, unidad y corte exactos; une cada impulsor (driver) con una implicación condicional de negocio y formula cada riesgo con la condición observable y el indicador que permitiría confirmarlo.',
        reasoning_chain: 'Hecho rector con cifra literal -> Exposición del negocio -> Impulsores con evidencia -> Riesgo con disparador -> Pregunta de validación para comité',
    },
    {
        id: 'loopus-base-report-purchasing',
        domain: 'reports',
        topic: 'report_purchasing',
        keywords: ['purchasing', 'compras', 'abastecimiento', 'proteins', 'grains', 'mx_proteins', 'proveedores', 'insumos'],
        condition_trigger: 'Ediciones de informes orientadas a Compras, Abastecimiento o mercados físicos de proteínas y granos',
        learned_rule: 'Prioriza dispersión regional de precios, presentación física, divisa de facturación y continuidad de abasto; distingue referencias públicas (SNIIM, CME, USDA) de cotizaciones en firme de proveedor y señala qué condiciones logísticas o sanitarias deben validarse antes de cerrar volumen.',
        reasoning_chain: 'Referencia publicada y fecha -> Brecha frente a puesta en planta -> Riesgo de abasto/sanidad -> Validación comercial previa a compra',
    },
    {
        id: 'loopus-base-report-finance',
        domain: 'reports',
        topic: 'report_treasury',
        keywords: ['finance', 'tesoreria', 'fx', 'bonds', 'equities', 'mx_bolsa', 'liquidez', 'cobertura', 'divisas'],
        condition_trigger: 'Ediciones de informes orientadas a Finanzas, Tesorería, Divisas, Bonos o Bolsa',
        learned_rule: 'Estructura el análisis separando volatilidad de sesión, tendencia del periodo disponible y sensibilidad de flujos en moneda extranjera o deuda a tasa variable; nunca conviertas índices o cierres en recomendaciones de inversión ni inventes conteos o promedios no publicados.',
        reasoning_chain: 'Cierre y variación literal -> Sensibilidad de caja y pasivos -> Ventana y costo de cobertura -> Pregunta de tesorería',
    },
]);

let cachedCustomRules = null;
let cachedAt = 0;
let remoteRulesCache = [];
let remoteRejectedKeys = new Set();
let remoteFetchedAt = 0;
let remoteInFlight = null;
const CACHE_TTL_MS = 20_000;
const REMOTE_TTL_MS = 45_000;

function ruleKey(conditionTrigger, learnedRule) {
    return `${fold(conditionTrigger)}|${fold(learnedRule)}`;
}

function triggerRemoteSupabaseHydration() {
    if (process.env.NODE_ENV === 'test') return;
    const now = Date.now();
    if (remoteInFlight || now - remoteFetchedAt < REMOTE_TTL_MS) return;
    remoteFetchedAt = now;
    try {
        const { listRuleProposals } = require('./ml-persistence');
        remoteInFlight = Promise.all([
            listRuleProposals({ status: 'approved', limit: 200 }),
            listRuleProposals({ status: 'pending_human_review', limit: 150 }),
            listRuleProposals({ status: 'rejected', limit: 200 }),
        ])
            .then(([approvedRows, pendingRows, rejectedRows]) => {
                remoteRejectedKeys = new Set(
                    (Array.isArray(rejectedRows) ? rejectedRows : [])
                        .filter(item => item?.condition_trigger && item?.learned_rule)
                        .map(item => ruleKey(item.condition_trigger, item.learned_rule))
                );
                const rows = [
                    ...(Array.isArray(approvedRows) ? approvedRows : []),
                    ...(Array.isArray(pendingRows) ? pendingRows : []),
                ];
                if (!rows.length && !remoteRejectedKeys.size) return;
                remoteRulesCache = rows
                    .filter(item => {
                        if (!item?.condition_trigger || !item?.learned_rule) return false;
                        if (item.status === 'rejected') return false;
                        if (remoteRejectedKeys.has(ruleKey(item.condition_trigger, item.learned_rule))) return false;
                        return item.status === 'approved' || Number(item.confidence_score) >= 0.82;
                    })
                    .map(item => ({
                        id: item.id || item.fingerprint || `sb-${fold(item.condition_trigger).slice(0, 32)}`,
                        domain: item.domain || item.source?.domain || 'both',
                        topic: item.topic || item.source?.topic || 'general',
                        keywords: fold(`${item.topic || ''} ${item.condition_trigger}`).split(/[^a-z0-9]+/).filter(w => w.length >= 3),
                        condition_trigger: clean(item.condition_trigger, 200),
                        learned_rule: clean(item.learned_rule, 400),
                        reasoning_chain: clean(item.reasoning_chain || item.source?.reasoning_chain || '', 260) || null,
                        status: item.status === 'approved' ? 'approved' : 'playbook',
                    }));
                cachedCustomRules = null;
            })
            .catch(() => {})
            .finally(() => { remoteInFlight = null; });
    } catch {
        remoteInFlight = null;
    }
}

function readJsonArray(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.entries)) return parsed.entries;
        return [];
    } catch {
        return [];
    }
}

// Filtra cifras sueltas para que una regla metodológica nunca inyecte números ajenos
// que puedan chocar con el validador estricto de cifras literales en informes.
function stripNumbersForReportRule(text) {
    return clean(
        String(text || '')
            .replace(/\b\d+(?:[.,]\d+)?%?/g, '')
            .replace(/\s{2,}/g, ' '),
        380
    );
}

function loadApprovedAndPlaybookRules() {
    triggerRemoteSupabaseHydration();
    const now = Date.now();
    if (cachedCustomRules && now - cachedAt < CACHE_TTL_MS) return cachedCustomRules;

    const proposals = readJsonArray(PROPOSALS_FILE);
    const brain = readJsonArray(BRAIN_PROPOSALS_FILE);
    const playbook = readJsonArray(PLAYBOOK_FILE);

    const rejectedKeys = new Set(remoteRejectedKeys);
    for (const item of [...proposals, ...brain, ...playbook]) {
        if (item?.status === 'rejected' && item?.condition_trigger && item?.learned_rule) {
            rejectedKeys.add(ruleKey(item.condition_trigger, item.learned_rule));
        }
    }

    const approved = [...proposals, ...brain]
        .filter(item => item?.status === 'approved' && item?.condition_trigger && item?.learned_rule)
        .filter(item => !rejectedKeys.has(ruleKey(item.condition_trigger, item.learned_rule)))
        .map(item => {
            const src = item.source && typeof item.source === 'object' ? item.source : {};
            return {
                id: item.fingerprint || `approved-${fold(item.condition_trigger).slice(0, 32)}`,
                domain: item.domain || src.domain || 'both',
                topic: item.topic || src.topic || 'general',
                keywords: fold(`${item.topic || ''} ${src.topic || ''} ${item.condition_trigger}`).split(/[^a-z0-9]+/).filter(w => w.length >= 3),
                condition_trigger: clean(item.condition_trigger, 200),
                learned_rule: clean(item.learned_rule, 400),
                reasoning_chain: clean(item.reasoning_chain || src.reasoning_chain || '', 260) || null,
                status: 'approved',
            };
        });

    const playbookRules = playbook
        .filter(item => item?.status !== 'rejected' && item?.condition_trigger && item?.learned_rule && Number(item?.confidence_score || 0) >= 82)
        .filter(item => !rejectedKeys.has(ruleKey(item.condition_trigger, item.learned_rule)))
        .map(item => ({
            id: item.id || `playbook-${fold(item.condition_trigger).slice(0, 32)}`,
            domain: item.domain || 'both',
            topic: item.topic || 'general',
            keywords: fold(`${item.topic || ''} ${item.condition_trigger} ${(item.keywords || []).join(' ')}`).split(/[^a-z0-9]+/).filter(w => w.length >= 3),
            condition_trigger: clean(item.condition_trigger, 200),
            learned_rule: clean(item.learned_rule, 400),
            reasoning_chain: clean(item.reasoning_chain || '', 260) || null,
            status: item.status || 'playbook',
        }));

    const seen = new Set();
    const merged = [];
    for (const rule of [...approved, ...remoteRulesCache, ...playbookRules, ...BASELINE_REASONING_RULES]) {
        const key = ruleKey(rule.condition_trigger, rule.learned_rule);
        if (rejectedKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        merged.push(rule);
    }
    cachedCustomRules = merged;
    cachedAt = now;
    return merged;
}

function scoreRule(rule, queryText, targetDomain) {
    if (targetDomain && rule.domain !== 'both' && rule.domain !== targetDomain) return -1;
    let hits = 0;
    for (const kw of rule.keywords || []) {
        if (kw && queryText.includes(kw)) hits++;
    }
    if (rule.status && rule.status !== 'baseline' && queryText.trim().length >= 8 && hits === 0) return -1;
    let score = rule.status === 'approved' ? 4 : rule.status === 'playbook' ? 2 : 1;
    if (rule.domain === targetDomain) score += 2;
    return score + hits * 3;
}

function getChatReasoningContext({ message = '', plan = {}, limit = 3 } = {}) {
    if (plan?.providedInputsOnly) return '';
    const queryText = fold([
        message,
        plan?.topic || '',
        ...(plan?.topics || []),
        ...(plan?.proteinProfile?.products || []),
        plan?.asksDecision ? 'decision comite riesgo' : '',
        plan?.asksComparison ? 'comparacion etapa unidad' : '',
    ].join(' '));

    const rules = loadApprovedAndPlaybookRules()
        .map(rule => ({ rule, score: scoreRule(rule, queryText, 'chat') }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.rule);

    if (!rules.length) return '';
    let predictiveCtx = '';
    try {
        const { getPredictiveContextForQuery } = require('../ml/predictive-showcase');
        predictiveCtx = getPredictiveContextForQuery(queryText, { stripNumbers: false }) || '';
    } catch { /* showcase opcional */ }

    const ruleLimit = predictiveCtx ? Math.min(limit, 2) : limit;
    const lines = [
        '[GUÍA DE RACIOCINIO ANALÍTICO · PROYECTO LOOPUS]',
        'Aplica estos criterios metodológicos para estructurar raciocinio y límites de evidencia (nunca sustituyen cifras):',
    ];
    for (const r of rules.slice(0, ruleLimit)) {
        const cond = clean(r.condition_trigger, 100);
        const crit = clean(r.learned_rule, 155);
        const chain = r.reasoning_chain ? clean(r.reasoning_chain, 90) : '';
        lines.push(`- Cuando: ${cond} -> Criterio: ${crit}${chain ? ` (Cadena lógica: ${chain})` : ''}`);
    }
    if (predictiveCtx) lines.push('', predictiveCtx.slice(0, 750));
    const joined = lines.join('\n');
    return joined.length <= 1980 ? joined : `${joined.slice(0, 1977).replace(/\n[^\n]*$/, '')}...`.slice(0, 1980);
}

function getReportReasoningContext({ area = '', key = '', audience = 'general', instructions = '', limit = 3 } = {}) {
    const queryText = fold(`${area} ${key} ${audience} ${instructions}`);
    const rules = loadApprovedAndPlaybookRules()
        .map(rule => ({ rule, score: scoreRule(rule, queryText, 'reports') }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.rule);

    if (!rules.length) return '';
    const lines = [
        'CRITERIOS DE RAZONAMIENTO EDITORIAL (Proyecto Loopus · sólo metodología, prohibido introducir cifras que no estén en DATOS VERIFICADOS):',
    ];
    for (const r of rules) {
        const safeCondition = stripNumbersForReportRule(r.condition_trigger);
        const safeRule = stripNumbersForReportRule(r.learned_rule);
        const safeChain = r.reasoning_chain ? stripNumbersForReportRule(r.reasoning_chain) : '';
        if (safeCondition && safeRule) {
            lines.push(`- [${safeCondition}]: ${safeRule}${safeChain ? ` | Secuencia: ${safeChain}` : ''}`);
        }
    }
    try {
        const { getPredictiveContextForQuery } = require('../ml/predictive-showcase');
        const predictiveMethodology = getPredictiveContextForQuery(queryText, { stripNumbers: true });
        if (predictiveMethodology) {
            const safeMethod = stripNumbersForReportRule(predictiveMethodology);
            if (safeMethod) lines.push(safeMethod);
        }
    } catch { /* showcase opcional */ }
    return lines.join('\n');
}

function updateReasoningPlaybook(newEntries = []) {
    if (!Array.isArray(newEntries) || !newEntries.length) return 0;
    const existing = readJsonArray(PLAYBOOK_FILE);
    const byKey = new Map();
    for (const item of existing) {
        if (item?.condition_trigger && item?.learned_rule) {
            byKey.set(`${fold(item.condition_trigger)}|${fold(item.learned_rule)}`, item);
        }
    }
    let added = 0;
    for (const raw of newEntries) {
        const condition_trigger = stripNumbersForReportRule(raw?.condition_trigger);
        const learned_rule = stripNumbersForReportRule(raw?.learned_rule);
        if (!condition_trigger || condition_trigger.length < 15 || !learned_rule || learned_rule.length < 35) continue;
        const key = `${fold(condition_trigger)}|${fold(learned_rule)}`;
        const entry = {
            id: raw.id || `pb-${byKey.size + 1}`,
            domain: ['chat', 'reports', 'both'].includes(raw?.domain) ? raw.domain : 'both',
            topic: clean(raw?.topic || 'general', 80),
            condition_trigger,
            learned_rule,
            reasoning_chain: stripNumbersForReportRule(raw?.reasoning_chain || ''),
            confidence_score: Math.min(100, Math.max(0, Number(raw?.confidence_score) || 85)),
            updated_at: new Date().toISOString(),
        };
        if (!byKey.has(key)) added++;
        byKey.set(key, entry);
    }
    const finalEntries = [...byKey.values()].slice(-160);
    fs.mkdirSync(path.dirname(PLAYBOOK_FILE), { recursive: true });
    fs.writeFileSync(PLAYBOOK_FILE, JSON.stringify({
        project: 'Proyecto Loopus Reasoning Playbook',
        updatedAt: new Date().toISOString(),
        totalRules: finalEntries.length,
        entries: finalEntries,
    }, null, 2), 'utf8');
    cachedCustomRules = null;
    return added;
}

function invalidateReasoningCache() {
    cachedCustomRules = null;
    cachedAt = 0;
    remoteFetchedAt = 0;
}

module.exports = {
    BASELINE_REASONING_RULES,
    getChatReasoningContext,
    getReportReasoningContext,
    updateReasoningPlaybook,
    loadApprovedAndPlaybookRules,
    stripNumbersForReportRule,
    invalidateReasoningCache,
};
