'use strict';
const {isPublicRule}=require('./knowledge-policy');

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
    {
        id: 'loopus-base-chat-ml-walkforward',
        domain: 'chat',
        topic: 'ml_walkforward_forecasting',
        keywords: ['pronostico', 'prediccion', 'proyeccion', 'walk-forward', 'mae', 'baseline', 'conformal', 'horizonte', 'modelo', 'futuro'],
        condition_trigger: 'Consultas de pronóstico cuantitativo, validación walk-forward o intervalos de incertidumbre ML',
        learned_rule: 'Distingue el último cierre verificado del valor proyectado por el ensamble walk-forward; reporta siempre la mejora porcentual en MAE frente al baseline ingenuo y acota el escenario con las bandas empíricas o Conformal (P80/P90) sin atribuir probabilidades subjetivas ni certeza puntual.',
        reasoning_chain: 'Corte y último valor observado -> Ventaja MAE fuera de muestra -> Banda Conformal P80/P90 -> Condición que invalida el escenario',
    },
    {
        id: 'loopus-base-chat-multivariate-arx',
        domain: 'chat',
        topic: 'multivariate_transmission',
        keywords: ['multivariable', 'arx', 'elasticidad', 'racion', 'transmision', 'cruzado', 'var', 'insumos', 'paridad'],
        condition_trigger: 'Análisis de transmisión multivariable entre divisas, granos, energía y paridad pecuaria',
        learned_rule: 'Evalúa el efecto conjunto de los impulsores exógenos rezagados (maíz, pasta de soya, petróleo WTI y tipo de cambio USD/MXN) sin fuga temporal; desglosa qué proporción de la presión en costo proviene del grano en origen y qué proporción proviene de la depreciación cambiaria.',
        reasoning_chain: 'Impulsores exógenos rezagados -> Elasticidad cruzada y peso ARX -> Costo estimado de ración y paridad -> Escenario de estrés P90',
    },
    {
        id: 'loopus-base-chat-global-livestock',
        domain: 'chat',
        topic: 'global_livestock_benchmarks',
        keywords: ['mercolleida', 'usda', 'cepea', 'dg agri', 'odepa', 'europa', 'espana', 'brasil', 'estados unidos', 'internacional', 'ppa', 'sanidad'],
        condition_trigger: 'Comparativas internacionales de porcino, bovino y aves o alertas zoosanitarias (PPA, influenza aviar)',
        learned_rule: 'Homologa o explicita la base física de cada referencia internacional (vivo en granja Lleida vs canal magra CME/USDA vs arroba CEPEA) antes de comparar niveles; ante brotes sanitarios o aranceles, delimita jurisdicción, especie y fecha oficial sin extrapolar vetos regionales a todo un país.',
        reasoning_chain: 'Plaza y base de cotización -> Moneda y factor de rendimiento -> Restricción sanitaria o comercial -> Impacto relativo en flujo',
    },
    {
        id: 'loopus-base-chat-energy-logistics',
        domain: 'chat',
        topic: 'energy_cold_chain',
        keywords: ['petroleo', 'wti', 'gas natural', 'henry hub', 'diesel', 'energia', 'fertilizante', 'flete', 'refrigeracion', 'cadena de frio'],
        condition_trigger: 'Impacto de precios de energía (WTI, gas natural, diésel) en agroindustria, fertilizantes y cadena de frío',
        learned_rule: 'Conecta el gas natural con el costo de amoniaco/urea y secado de grano, y el crudo/diésel con el flete terrestre y la refrigeración en rastro y distribución; trata la transmisión hacia el precio final del alimento como rezagada y condicional a los contratos de transporte vigentes.',
        reasoning_chain: 'Referencia energética primaria -> Canal de costo (fertilizante, secado o flete frío) -> Rezago de transmisión -> Medida de eficiencia operativa',
    },
    {
        id: 'loopus-base-chat-equities-issuers',
        domain: 'chat',
        topic: 'equities_agribusiness_issuers',
        keywords: ['accion', 'bolsa', 'ipc', 'bmv', 'emisora', 'gruma', 'bachoco', 'bimbo', 'valuacion', 'ebitda', 'inversor', 'portafolio'],
        condition_trigger: 'Análisis de emisoras bursátiles vinculadas a alimentos, consumo o agroindustria en México y EE. UU.',
        learned_rule: 'Vincula la evolución de los insumos agrícolas y del tipo de cambio con la estructura de ventas por moneda, política de coberturas y poder de fijación de precios de la emisora; un movimiento spot en maíz o cerdo no altera de inmediato el EBITDA cuando existen coberturas de seis a doce meses.',
        reasoning_chain: 'Exposición geográfica y cambiaria -> Cobertura de insumos y traspaso a precio -> Sensibilidad de margen operativo -> Catalizador trimestral',
    },
    {
        id: 'loopus-base-chat-statistical-rigor',
        domain: 'chat',
        topic: 'statistical_anomaly_rigor',
        keywords: ['regresion', 'ols', 'correlacion', 'anomalia', 'atipico', 'z-score', 'mad', 'isolation forest', 'volatilidad', 'regimen'],
        condition_trigger: 'Consultas de regresión lineal (OLS), detección de anomalías o cambios de régimen de volatilidad',
        learned_rule: 'Verifica tamaño de muestra, continuidad temporal y homogeneidad de unidades antes de interpretar pendientes o correlaciones; emplea dispersión robusta (MAD z-score / Isolation Forest) para separar choques transitorios de cambios estructurales de régimen y recuerda que correlación histórica no implica causalidad.',
        reasoning_chain: 'Auditoría de serie y continuidad -> Estadístico robusto y régimen activo -> Separación ruido vs tendencia -> Límite metodológico',
    },
    {
        id: 'loopus-base-chat-commercial-incoterms',
        domain: 'chat',
        topic: 'commercial_margin_incoterms',
        keywords: ['margen', 'merma', 'fob', 'cif', 'incoterm', 'lote', 'comercializador', 'distribuidor', 'puesto en planta', 'vendible'],
        condition_trigger: 'Cálculo de márgenes comerciales con merma, flete o términos de comercio internacional FOB/CIF',
        learned_rule: 'Calcula el costo por kilogramo vendible dividiendo el costo total puesto en destino entre el volumen neto tras merma (1 - m); verifica qué conceptos ya incluye el Incoterm pactado para no duplicar seguro o flete marítimo y expresa las fórmulas en texto plano verificable.',
        reasoning_chain: 'Volumen comprado y merma declarada -> Costo unitario sobre kg vendible -> Diferencia margen sobre venta vs recargo -> Variable pendiente',
    },
    {
        id: 'loopus-base-report-mexico',
        domain: 'reports',
        topic: 'report_mexico_macro',
        keywords: ['mexico', 'mx_overview', 'mx_finanzas', 'mx_mercados', 'mx_agro', 'banxico', 'inflacion', 'inpc', 'nearshoring', 'regional'],
        condition_trigger: 'Ediciones de informes enfocadas en panorama económico, financiero y agropecuario de México',
        learned_rule: 'Articula la interacción entre inflación subyacente, postura monetaria de Banxico, paridad cambiaria y brechas regionales de precios físicos (norte, centro y sur); fundamenta cada conclusión exclusivamente en las cifras y fechas del corte verificado.',
        reasoning_chain: 'Indicador macro nacional -> Diferencial regional o sectorial -> Transmisión a costos internos -> Señal doméstica a vigilar',
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
                        if (!item?.condition_trigger || !item?.learned_rule || !isPublicRule(item)) return false;
                        if (item.status === 'rejected') return false;
                        if (remoteRejectedKeys.has(ruleKey(item.condition_trigger, item.learned_rule))) return false;
                        return item.status === 'approved' || Number(item.confidence_score) >= 0.82;
                    })
                    .map(item => ({
                        id: item.id || item.fingerprint || `sb-${fold(item.condition_trigger).slice(0, 32)}`,
                        domain: item.domain || item.source?.domain || 'both',
                        audience: item.audience || item.source?.audience || 'general',
                        topic: item.topic || item.source?.topic || 'general',
                        keywords: fold(`${item.topic || ''} ${item.condition_trigger}`).split(/[^a-z0-9]+/).filter(w => w.length >= 3),
                        condition_trigger: clean(item.condition_trigger, 200),
                        learned_rule: clean(item.learned_rule, 400),
                        reasoning_chain: clean(item.reasoning_chain || item.source?.reasoning_chain || '', 260) || null,
                        status: item.status === 'approved' ? 'approved' : 'playbook',public_retrieval:true,
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
        .filter(item => item?.status === 'approved' && item?.condition_trigger && item?.learned_rule && isPublicRule(item))
        .filter(item => !rejectedKeys.has(ruleKey(item.condition_trigger, item.learned_rule)))
        .map(item => {
            const src = item.source && typeof item.source === 'object' ? item.source : {};
            return {
                id: item.fingerprint || `approved-${fold(item.condition_trigger).slice(0, 32)}`,
                domain: item.domain || src.domain || 'both',
                audience: item.audience || src.audience || 'general',
                topic: item.topic || src.topic || 'general',
                keywords: fold(`${item.topic || ''} ${src.topic || ''} ${item.condition_trigger}`).split(/[^a-z0-9]+/).filter(w => w.length >= 3),
                condition_trigger: clean(item.condition_trigger, 200),
                learned_rule: clean(item.learned_rule, 400),
                reasoning_chain: clean(item.reasoning_chain || src.reasoning_chain || '', 260) || null,
                status: 'approved',public_retrieval:true,
            };
        });

    const playbookRules = playbook
        .filter(item => item?.status !== 'rejected' && item?.condition_trigger && item?.learned_rule && Number(item?.confidence_score || 0) >= 82 && isPublicRule(item))
        .filter(item => !rejectedKeys.has(ruleKey(item.condition_trigger, item.learned_rule)))
        .map(item => ({
            id: item.id || `playbook-${fold(item.condition_trigger).slice(0, 32)}`,
            domain: item.domain || 'both',
            audience: item.audience || item.source?.audience || 'general',
            topic: item.topic || 'general',
            keywords: fold(`${item.topic || ''} ${item.condition_trigger} ${(item.keywords || []).join(' ')}`).split(/[^a-z0-9]+/).filter(w => w.length >= 3),
            condition_trigger: clean(item.condition_trigger, 200),
            learned_rule: clean(item.learned_rule, 400),
            reasoning_chain: clean(item.reasoning_chain || '', 260) || null,
            status: item.status || 'playbook',public_retrieval:true,
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

    let predictiveCtx = '';
    try {
        const { getPredictiveContextForQuery } = require('../ml/predictive-showcase');
        predictiveCtx = getPredictiveContextForQuery(queryText, { stripNumbers: false, includeProtein: false }) || '';
    } catch { /* showcase opcional */ }

    let vallProteinasCtx = '';
    const wantsInlineProteinMl = Boolean(plan?.needsVallProteinasML || plan?.needsMarranasML
        || plan?.proteinProfile?.products?.length)
        || /\b(?:vall[-\s]?prote[ií]nas?|marranas?|paridad\s+de\s+importacion|shap|radar\s+nlp|h5n1|peste\s+porcina|gusano\s+barrenador|sube\s+o\s+baja|pronostic\w*)\b/i.test(queryText);
    if (wantsInlineProteinMl && plan?.skipInlineProteinMl !== true) {
        try {
            const { getProteinMLContextForQuery } = require('../ml/protein-ml-engine');
            vallProteinasCtx = getProteinMLContextForQuery(queryText, { stripNumbers: false, limit: 6 }) || '';
        } catch { /* ML de proteínas opcional */ }
    }

    if (!rules.length && !predictiveCtx && !vallProteinasCtx) return '';
    const ruleLimit = (predictiveCtx || vallProteinasCtx) ? Math.min(limit, 2) : limit;
    const lines = [];
    if (rules.length) {
        lines.push(
            '[GUÍA DE RACIOCINIO ANALÍTICO · PROYECTO LOOPUS]',
            'Aplica estos criterios metodológicos para estructurar raciocinio y límites de evidencia (nunca sustituyen cifras):',
        );
    }
    for (const r of rules.slice(0, ruleLimit)) {
        const cond = clean(r.condition_trigger, 100);
        const crit = clean(r.learned_rule, 155);
        const chain = r.reasoning_chain ? clean(r.reasoning_chain, 90) : '';
        lines.push(`- Cuando: ${cond} -> Criterio: ${crit}${chain ? ` (Cadena lógica: ${chain})` : ''}`);
    }
    if (predictiveCtx) lines.push('', predictiveCtx.slice(0, 750));
    if (vallProteinasCtx) {
        lines.push(
            '',
            '[RAZONAMIENTO ESPECIALIZADO · VALL-PROTEÍNAS]',
            'Usa este modelo sólo para predicciones y señales de proteínas animales. Conserva especie, plaza, presentación, unidad, corte y horizonte; no reemplaces un pronóstico local ausente por uno extranjero. Distingue predicción validada de referencia física, paridad y noticia; los impulsores son asociaciones, no causas comprobadas. Si el bloque indica abstención, explícala y no inventes una dirección.',
            vallProteinasCtx.slice(0, 2600),
        );
    }
    const joined = lines.join('\n');
    const maxBudget = vallProteinasCtx ? 5200 : 1980;
    return joined.length <= maxBudget ? joined : `${joined.slice(0, maxBudget - 3).replace(/\n[^\n]*$/, '')}...`.slice(0, maxBudget);
}

const REPORT_KEY_EXPANSIONS = Object.freeze({
    fx: 'divisas dolar peso usd mxn tipo de cambio cobertura tesoreria',
    bonds: 'bonos tasas cetes tiie treasury banxico fed curva rendimiento deuda',
    equities: 'bolsa acciones ipc bmv emisoras valuacion renta variable',
    daily_news: 'noticias financieras regulacion politica monetaria macroeconomia',
    grains: 'granos maiz soya trigo forraje alimento cbot base fisica flete',
    proteins: 'proteinas cerdo pollo res huevo canal pie sniim usda mercolleida margen paridad importacion arbitraje sanidad',
    energy_metals: 'energia petroleo wti gas natural diesel fertilizante cobre aluminio flete',
    market_news: 'noticias mercados comercio aranceles sanidad abasto logistica',
    overview: 'panorama ejecutivo comite direccion finanzas mercados riesgo escenarios',
    mx_overview: 'mexico economia inflacion banxico tipo de cambio consumo regional',
    mx_proteins: 'mexico proteinas cerdo pollo huevo res sniim profeco plazas regionales paridad importacion arbitraje sanidad',
    mx_bolsa: 'mexico bolsa bmv ipc emisoras consumo exposicion cambiaria',
    mx_production: 'mexico produccion pecuaria siap estados regiones abasto sanidad',
});

function getReportReasoningContext({ area = '', key = '', audience = 'general', instructions = '', depth = 'standard', limit = null } = {}) {
    const keyTokens = fold(key).split(/[^a-z0-9_]+/).filter(Boolean);
    const expanded = keyTokens.map(k => REPORT_KEY_EXPANSIONS[k] || '').filter(Boolean).join(' ');
    const queryText = fold(`${area} ${key} ${expanded} ${audience} ${instructions}`);
    const resolvedLimit = Number.isInteger(limit) && limit > 0 ? limit : (depth === 'detailed' ? 6 : depth === 'brief' ? 3 : 5);
    const rules = loadApprovedAndPlaybookRules()
        .map(rule => {
            let score = scoreRule(rule, queryText, 'reports');
            if (score > 0 && audience && rule.audience && fold(rule.audience) === fold(audience)) score += 3;
            return { rule, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, resolvedLimit)
        .map(item => item.rule);

    const lines = [
        ...(rules.length ? ['CRITERIOS DE RAZONAMIENTO EDITORIAL Y PROFUNDIDAD (Proyecto Loopus ML · sólo metodología, prohibido introducir cifras que no estén en DATOS VERIFICADOS):'] : []),
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
        const predictiveMethodology = getPredictiveContextForQuery(queryText, { stripNumbers: true, includeProtein: false });
        if (predictiveMethodology) {
            const safeMethod = clean(String(predictiveMethodology || '').replace(/\b\d+(?:[.,]\d+)?%?/g, '').replace(/\s{2,}/g, ' '), 1500);
            if (safeMethod) lines.push(safeMethod);
        }
    } catch { /* showcase opcional */ }
    try {
        const { getProteinMLContextForQuery } = require('../ml/protein-ml-engine');
        const vallProteinasQual = getProteinMLContextForQuery(queryText, { stripNumbers: true, limit: 4 });
        if (vallProteinasQual) {
            const safeVallProteinas = clean(String(vallProteinasQual || '').replace(/\d+(?:[.,–-]\d+)?%?/g, '').replace(/\s{2,}/g, ' '), 2400);
            if (safeVallProteinas) {
                lines.push(
                    'RAZONAMIENTO ESPECIALIZADO DE VALL-PROTEÍNAS: usa la dirección sólo para mercados con pronóstico validado; si falta cobertura de la especie o plaza solicitada, declara la brecha y no la sustituyas por otro mercado. Expón evidencia, implicación condicional y dato pendiente; no atribuyas causalidad a factores asociados.',
                    safeVallProteinas,
                );
            }
        }
    } catch { /* Modelo especializado de proteínas opcional. */ }
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
        const isPublic = isPublicRule(raw);
        const entry = {
            id: raw.id || `pb-${byKey.size + 1}`,
            domain: ['chat', 'reports', 'both'].includes(raw?.domain) ? raw.domain : 'both',
            audience: ['general', 'finance', 'purchasing', 'operations', 'commercial'].includes(raw?.audience) ? raw.audience : 'general',
            topic: clean(raw?.topic || 'general', 80),
            condition_trigger,
            learned_rule,
            reasoning_chain: stripNumbersForReportRule(raw?.reasoning_chain || ''),
            confidence_score: Math.min(100, Math.max(0, Number(raw?.confidence_score) || 85)),
            ...(isPublic ? { public_retrieval: true } : {}),
            updated_at: new Date().toISOString(),
        };
        if (!byKey.has(key)) added++;
        byKey.set(key, entry);
    }
    const finalEntries = [...byKey.values()].slice(-220);
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
