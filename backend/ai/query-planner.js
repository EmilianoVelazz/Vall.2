'use strict';
const { ambiguousMexicoCities } = require('../services/mexico-price-scope');

const { normalizeForIntent, isLikelyFollowUp, conversationAnchor } = require('./conversation-context');
const { findCurrencyMentions } = require('./currency-catalog');
const { isMercolleidaQuery, requestedSectors } = require('../services/mercolleida-public');
const { isRabobankQuery, requestedResearchTopics } = require('../services/rabobank-public');
const { PRODUCTS, proteinProfile, proteinResearchContext } = require('../services/protein-market-intelligence');
const { isTradeResearchQuery } = require('../services/trade-research');
const { requestedProteinIssuers, issuerContext, PROTEIN_ISSUERS } = require('../services/protein-equities');
const { requestedInstruments } = require('./statistical-analysis');
const { activeUserContext, forecastRequest } = require('./answer-strategy');

// El modelo no debe decidir por sí solo qué tan actual es una pregunta ni qué
// tipo de evidencia necesita. Este plan es deliberadamente determinista para
// que la misma consulta se trate igual en chat, reportes y voz.
const TOPICS = Object.freeze({
    fx: /\b(?:usd|mxn|eur|gbp|cad|aud|jpy|brl|inr|d[oó]lar(?:es)?|peso(?:s)?|divisa(?:s)?|tipo de cambio|forex)(?=\s|$|[.,;:!?])/i,
    equities: /\b(?:bolsa|acciones?|acci[oó]n|ticker|s[ií]mbolo|s&p|nasdaq|dow|bmv|ipc|asx|ftse|dax|cac\s*40|nikkei|hang seng|nifty|ibovespa|tsx|kospi|taiex|jse|ibex|walmex|femsa|bimbo|gruma|bitcoin|btc|ethereum|eth)\b/i,
    bonds: /\b(?:bonos?|treasury|tesoro|yield|rendimiento|curva de tasas?|deuda soberana)\b/i,
    commodities: /\b(?:commodit(?:y|ies)|materias? primas?|ma[ií]z|trigo|soya|soja|forrajes?|avena|caf[eé]|az[uú]car|algod[oó]n|cacao|cerdos?|porcinos?|puercos?|pollos?|aves?|huevos?|res|bovinos?|ganado|beef|pork|poultry|chicken|eggs?|prote[ií]nas?|pescado|marisco|acero|steel|petr[oó]leo|wti|brent|gas natural|gasolina|oro|plata|platino|paladio|cobre|metal(?:es)?)(?=\s|$|[.,;:!?])/i,
    macro: /\b(?:inflaci[oó]n|inpc|tiie|cetes?|banxico|tasa de inter[eé]s|pol[ií]tica monetaria|pib|empleo)\b/i,
    news: /\b(?:noticias?|titulares?|qu[eé] pas[oó]|[uú]ltima hora|actualidad|evento(?:s)?)\b/i,
});

const FRESHNESS = /\b(?:hoy|ahora|actual(?:es)?|actualizad[oa]s?|en vivo|[uú]ltim[oa]s?|reciente(?:s)?|cierre|cotiza(?:ci[oó]n)?|precio(?:s)?|cu[aá]nto (?:vale|est[aá]|equivale))\b/i;
const TRADE_DEFINITION = /\b(?:qu[eé]\s+(?:es|significa)|define|definici[oó]n)\b/i;
const COMPLEX = /\b(?:analiza|analisis|margen|costos?|logistica|vigilar|verific(?:ar|o)|necesito|cierra|compare|risks?|supply|informe|reporte|panorama|perspectiva|escenario(?:s)?|estrategia|recomendaci[oó]n|riesgo(?:s)?|compar(?:a|aci[oó]n)|proyecci[oó]n|impacto|implicaci[oó]n|cobertura|qu[eé]\s+(?:esta|est[aá])\s+pasando|por\s+qu[eé]|factores?\s+principales?|regre[sc]i[oó]n|modelo\s+lineal|m[ií]nimos\s+cuadrados|an[aá]lisis\s+estad[ií]stic[oa])\b/i;
const COMPARISON = /\b(?:compara|comparaci[oó]n|versus|vs\.?|diferencia(?:s)?|mejor entre)\b/i;
const DECISION = /\b(?:qu[eé] (?:conviene|debo|recomiendas?)|decisi[oó]n|estrategia|cobertura|comprar|vender|invertir|prioridad)\b/i;
// Una cotización física local no es intercambiable por un futuro de Chicago,
// Nueva York o Londres. El plan la identifica antes de activar conectores de
// mercado para preservar país, eslabón de la cadena y unidad solicitados.
const LOCAL_PRICE_SIGNAL = /\b(?:precio|cotizaci[oó]n|mayoreo|menudeo|rastro|mercado\s+f[ií]sico|productor|acopio|central de abasto|granja|canal)\b/i;
const LOCAL_PRODUCT = /\b(?:cerdo|porcino|pollo|huevo|res|bovino|ganado|beef|carne|acero|steel|ma[ií]z|trigo|soya|soja|forraje|caf[eé]|az[uú]car)\b/i;
const PLACE_SIGNAL = /\b(?:m[eé]xico|puebla|australia|canad[aá]|estados?\s+unidos|ee\.?\s*uu\.?|argentina|brasil|chile|colombia|per[uú]|ecuador|uruguay|paraguay|bolivia|guatemala|honduras|el\s+salvador|costa\s+rica|panam[aá]|espa[nñ]a|francia|alemania|italia|reino\s+unido|portugal|jap[oó]n|china|india|corea|sud[aá]frica|nueva\s+zelanda)\b/i;

function normalizeMessage(message) {
    return normalizeForIntent(message);
}

function topicMatches(text) {
    const matches = Object.entries(TOPICS)
        .filter(([, expression]) => expression.test(text))
        .map(([topic]) => topic);
    if (PRODUCTS.some(product => product.re.test(normalizeForIntent(text))) && !matches.includes('commodities')) matches.push('commodities');
    if (findCurrencyMentions(text).length && !matches.includes('fx')) matches.unshift('fx');
    if (requestedProteinIssuers(text).length && !matches.includes('equities')) matches.unshift('equities');
    return matches;
}

function primaryTopic(matches) {
    // Noticias es una cualidad de la consulta; si además hay un activo, la
    // fuente de mercado debe seguir siendo la principal.
    return matches.find(topic => topic !== 'news') || matches[0] || 'general';
}

function recentConversationText(history = []) {
    if (!Array.isArray(history)) return '';
    return history.slice(-12).filter(item => item?.role === 'user')
        .map(item => String(item?.content || item?.text || '').trim())
        .filter(Boolean).join(' ');
}

const PRIOR_SUBJECT_REFERENCE = /\b(?:eso|esa|ese|esto|aquello|anteriores?|lo mismo|los mismos|las mismas|sobre lo anterior|dicho activo|ese mercado|ese pais|esa cifra|esos datos|comparalo|comparala|hazlo|hazla|muestralo|muestrala)\b/i;
const ANALYSIS_FOLLOW_UP = /\b(?:profundiza|amplia|detalla|explica mejor|mas completo|mas informacion|escenarios|riesgos|recomendaciones)\b/i;
const EXECUTIVE_BRIEF = /\b(?:panorama|perspectiva|resumen\s+ejecutivo|riesgos?\s+principales?|puntos?\s+clave|qu[eé]\s+(?:esta|est[aá])\s+pasando|qu[eé]\s+vigilar|implicaci[oó]n|catalizadores?)\b/i;

function planQuery({ message = '', history = [], mode = 'auto' } = {}) {
    const text = normalizeMessage(message);
    const currentTopics = topicMatches(text);
    const explicitlyBroadTrade = isTradeResearchQuery(text) && !proteinProfile(message).products.length
        && !PRIOR_SUBJECT_REFERENCE.test(text);
    if (isTradeResearchQuery(text) && !currentTopics.some(topic => topic !== 'news')) currentTopics.unshift('trade');
    if (/\b(?:granos?|cereales?|leche|lacteos?|acuicultura|fertilizantes?)\b/i.test(text) && !currentTopics.includes('commodities')) currentTopics.unshift('commodities');
    if (isMercolleidaQuery(text) && !currentTopics.includes('commodities')) currentTopics.unshift('commodities');
    const activeAnchor = conversationAnchor(history);
    const historyTopics = topicMatches(activeAnchor || recentConversationText(history));
    const followsThread = isLikelyFollowUp(text, history) && !explicitlyBroadTrade;
    const proteinThread = followsThread ? activeUserContext(message, history).reduce((profile, turn) => proteinProfile(turn, profile?.query || '', profile), null) : null;
    const protein = proteinProfile(message, followsThread ? activeAnchor : '', proteinThread);
    const namedIssuers = requestedProteinIssuers(message);
    if (!protein.products.length && namedIssuers.length) {
        protein.products = [...new Set(namedIssuers.flatMap(issuer => issuer.ticker === 'CALM' ? ['eggs']
            : issuer.ticker === 'PPC' ? ['poultry'] : ['poultry', 'pork', 'beef']))];
    }
    const tradeSubject = followsThread ? `${text} ${activeAnchor}` : text;
    const needsTradeResearch = isTradeResearchQuery(tradeSubject)
        && (!TRADE_DEFINITION.test(text) || FRESHNESS.test(text));
    const needsMercolleida = isMercolleidaQuery(text) || (followsThread && isMercolleidaQuery(activeAnchor));
    const explicitRabobank = isRabobankQuery(text) || (followsThread && isRabobankQuery(activeAnchor));
    const rabobankQuery = (followsThread && !requestedResearchTopics(text).length
        ? `${text} ${activeAnchor}` : text) + (explicitRabobank && !requestedResearchTopics(text).length && protein.products.length ? ` ${protein.products.join(' ')}` : '');
    const mercolleidaQuery = needsMercolleida && followsThread && !requestedSectors(text).length
        ? `${text} ${activeAnchor}` : text;
    // «Dame noticias de eso» y «¿y hoy?» heredan el activo del hilo. La
    // palabra «noticias» describe el formato, no debe borrar el tema anterior.
    const inheritsTopic = followsThread && (
        currentTopics.length === 0
        || (currentTopics.length === 1 && currentTopics[0] === 'news')
        || PRIOR_SUBJECT_REFERENCE.test(text)
        || /\b(?:conserva|mism[oa]s?|horizonte|plazo|mi objetivo)\b/.test(text) && !namedIssuers.length && !requestedInstruments(message).length
    );
    const topics = [...new Set([
        ...currentTopics,
        ...(inheritsTopic ? historyTopics.filter(topic => topic !== 'news') : []),
    ])];
    const topic = primaryTopic(topics);
    const asksCurrentData = FRESHNESS.test(text);
    const forecast = forecastRequest(message, history);
    const asksForecast = forecast.requested;
    const asksAnalysis = asksForecast || COMPLEX.test(text) || ANALYSIS_FOLLOW_UP.test(text) || text.length > 420;
    const asksNews = currentTopics.includes('news')
        || (followsThread && currentTopics.length === 0 && historyTopics.includes('news'));
    const explicitQuestions = (text.match(/\?/g) || []).length;
    const segmentedQuestions = text.split(/(?:\?|\n|\b(?:adem[aá]s|tambi[eé]n|y luego)\b)/i)
        .filter(part => part.trim().length > 24).length;
    const questionCount = Math.max(explicitQuestions, segmentedQuestions > 1 ? segmentedQuestions : 0);
    const asksComparison = COMPARISON.test(text);
    const asksDecision = DECISION.test(text);
    const asksExecutiveBrief = EXECUTIVE_BRIEF.test(text);
    const marketQuery = followsThread && inheritsTopic ? `${text} ${activeAnchor}` : text;
    // Los supuestos de un ejercicio no son solicitudes de cotizaciones. La
    // restricción del usuario se conserva en el hilo hasta pedir datos externos.
    const scenarioText = normalizeForIntent(followsThread ? `${activeAnchor} ${text}` : text);
    const externalText = text.split(/[.;!?\n]/).filter(clause => !/\bno\s+(?:busques|busca|consultes|consulta|investigues|investiga|sustituyas)\b/.test(clause)).join(' ');
    const externalRequest = /\b(?:busca|consulta|investiga|actualiza)\b/.test(externalText)
        || /\b(?:precios?|cotizaciones?)\b/.test(externalText) && proteinProfile(message).countries.length > 0
            && !/\b(?:no busques|no consultes|supuestos?|hipotetico|ejercicio)\b/.test(text)
        || /\b(?:precio(?:s)? actual(?:es)?|cotizacion(?:es)? actual(?:es)?|tipo de cambio actual|noticias? de hoy)\b/.test(externalText);
    const providedInputsOnly = !externalRequest && /\d/.test(scenarioText)
        && /\b(?:supuestos?|hipotetico|ejercicio)\b/.test(scenarioText)
        && /\b(?:no busques|no consultes|usa (?:unicamente|solo) (?:estos|mis|los) (?:supuestos|datos|cifras))\b/.test(scenarioText);
    const proteinIssuers = requestedProteinIssuers(marketQuery);
    if (!proteinIssuers.length && topics.includes('equities') && protein.products.length && (asksNews || asksAnalysis || asksExecutiveBrief)) proteinIssuers.push(...PROTEIN_ISSUERS);
    const instruments = requestedInstruments(marketQuery, { limit: 8 });
    const equitySubject = topics.includes('equities') || proteinIssuers.length > 0;
    // A product name in an issuer/industry description is not a request for its
    // physical price. In mixed questions the product must have its own price clause.
    const physicalPriceClause = text.split(/[.;!?\n]|\by\b/).some(clause =>
        proteinProfile(clause).products.length && proteinProfile(clause).asksPrices
        && !/\b(?:acciones?|accion|ticker|simbolo|bolsa|tyson|pilgrim|cal[ -]?maine|tsn|ppc|calm|jbs)\b/i.test(clause));
    const proteinPhysicalPrice = protein.products.length > 0 && protein.asksPrices && !protein.futures
        && (!equitySubject || physicalPriceClause);
    const localPhysicalPrice = proteinPhysicalPrice || topic === 'commodities'
        && LOCAL_PRICE_SIGNAL.test(text)
        && LOCAL_PRODUCT.test(text)
        && PLACE_SIGNAL.test(text);
    const complexity = [asksAnalysis, asksComparison, asksDecision, asksExecutiveBrief, topics.length > 1, questionCount > 1].filter(Boolean).length;
    const needsRabobank = explicitRabobank || ((!needsMercolleida || protein.global) && topic === 'commodities'
        && requestedResearchTopics(rabobankQuery).some(item => ['pork', 'beef', 'poultry', 'seafood', 'dairy', 'grains', 'inputs', 'animal_protein'].includes(item))
        && (asksAnalysis || asksExecutiveBrief || asksNews || needsTradeResearch));
    const asksQuote = /\b(?:cotizacion(?:es)?|cotiza(?:n)?|precios?|cierre|cuanto (?:vale|esta|equivale)|valor actual|rendimiento actual)\b/i.test(text)
        || asksCurrentData && !asksNews && !asksAnalysis;
    const quoteEquities = asksQuote && (!/\b(?:futuros?|cme|cbot)\b/i.test(text) || /\b(?:acciones?|accion|bursatil|ticker)\b/i.test(text));
    const explicitStockQuote = requestedProteinIssuers(marketQuery).length > 0 && quoteEquities;
    const explicitFx = /\b(?:tipo de cambio|divisas?|forex|convierte|conversion)\b|\b[a-z]{3}\s*\/\s*[a-z]{3}\b/i.test(text);
    const needsFxQuote = topics.includes('fx') && (!equitySubject || explicitFx) && (!localPhysicalPrice || explicitFx) && asksQuote;
    const needsLiveQuote = (explicitStockQuote || needsFxQuote || asksQuote && !localPhysicalPrice && !needsMercolleida && !explicitRabobank && !needsTradeResearch
        && (instruments.length > 0 || topic === 'bonds'));
    const needsProteinPrices = proteinPhysicalPrice && (!needsMercolleida || protein.global || explicitRabobank || protein.products.length > 1) && (!explicitRabobank || asksCurrentData);
    const needsProteinResearch = protein.products.length > 0 && (proteinPhysicalPrice || asksNews || asksAnalysis || asksExecutiveBrief || needsTradeResearch);
    const internationalNews = /\b(?:noticias? internacionales?|noticieros?|reuters|bloomberg|bbc|financial times)\b/i.test(text);
    const needsLiveNews = (asksNews && (!explicitRabobank || internationalNews || proteinPhysicalPrice)) || (needsProteinResearch && !needsMercolleida && !explicitRabobank && (asksExecutiveBrief || protein.global && proteinPhysicalPrice));
    const usesVerifiedRepository = ['macro', 'bonds', 'equities', 'commodities'].includes(topic);
    // Un panorama o una pregunta sobre implicaciones exige contraste externo,
    // aunque no mencione literalmente la palabra "análisis". Así se evita una
    // respuesta de memoria cuando la persona espera contexto actual y útil.
    const needsIssuerResearch = proteinIssuers.length > 0 && (asksAnalysis || asksComparison || asksDecision || asksNews || asksExecutiveBrief);
    const requiresWebResearch = needsIssuerResearch || needsProteinResearch || needsRabobank || needsTradeResearch || localPhysicalPrice || asksAnalysis || asksNews || asksExecutiveBrief;
    const needsSources = needsRabobank || needsMercolleida || needsLiveQuote || needsLiveNews || requiresWebResearch || ['macro', 'bonds'].includes(topic);
    // Una consulta corta puede requerir razonamiento profundo si compara varios
    // frentes o pide una decisión. No usamos sólo longitud como señal.
    const recommendedTier = needsTradeResearch || asksAnalysis || asksExecutiveBrief || complexity >= 2 || mode === 'executive' || mode === 'technical' ? 'pro' : 'flash';

    const plan = {
        locationClarification: proteinPhysicalPrice && !protein.mexicoCities.length ? ambiguousMexicoCities(message)[0] || null : null,
        topic,
        topics,
        asksCurrentData,
        asksAnalysis,
        asksForecast,
        forecast,
        asksNews,
        asksComparison,
        asksDecision,
        asksExecutiveBrief,
        localPhysicalPrice,
        requiresWebResearch,
        questionCount,
        complexity,
        needsLiveQuote,
        needsFxQuote,
        quoteEquities,
        marketQuery,
        proteinIssuers,
        needsIssuerResearch,
        needsLiveNews,
        needsProteinPrices,
        needsProteinResearch,
        proteinProfile: protein,
        proteinQuery: needsProteinResearch && followsThread ? `${text} ${activeAnchor}` : text,
        needsMercolleida,
        needsRabobank,
        explicitRabobank,
        rabobankQuery: needsRabobank ? rabobankQuery : null,
        needsTradeResearch,
        tradeScope: needsTradeResearch && protein.products.length ? 'proteins' : 'general',
        tradeResearchQuery: needsTradeResearch ? tradeSubject : null,
        mercolleidaQuery: needsMercolleida ? mercolleidaQuery : null,
        usesVerifiedRepository,
        needsSources,
        recommendedTier,
        followsThread,
        activeAnchor,
        providedInputsOnly,
        historyTurns: Array.isArray(history) ? history.length : 0,
        inheritedTopics: inheritsTopic ? historyTopics.filter(topic => !currentTopics.includes(topic)) : [],
    };
    if (providedInputsOnly) {
        for (const flag of ['asksCurrentData', 'localPhysicalPrice', 'requiresWebResearch', 'needsLiveQuote', 'needsFxQuote', 'needsIssuerResearch', 'needsLiveNews', 'needsProteinPrices', 'needsProteinResearch', 'needsMercolleida', 'needsRabobank', 'needsTradeResearch', 'usesVerifiedRepository', 'needsSources']) plan[flag] = false;
    }
    return plan;
}

function planContext(plan) {
    const obligations = [
        '[PLAN DE RESPUESTA VERIFICABLE]',
        `Tema principal detectado: ${plan.topic}.`,
        'Responde primero la pregunta concreta; no sustituyas un dato por una explicación general.',
    ];
    if (plan.needsProteinResearch) obligations.push(proteinResearchContext(plan.proteinProfile));
    if (plan.proteinIssuers?.length) obligations.push(issuerContext(plan.proteinIssuers));
    if (plan.needsTradeResearch) {
        obligations.push(plan.tradeScope === 'general'
            ? 'ALCANCE ACTUAL: acuerdos y anuncios comerciales generales entre los países solicitados. Cubre los frentes arancelarios, agrícolas, energéticos, de inversión y servicios que estén documentados. La pregunta actual amplía el alcance: no la reduzcas a proteínas animales ni a tratados estructurales, aunque el historial trate sobre carnes. Presenta los anuncios generales primero.'
            : 'ALCANCE ACTUAL: impacto de los acuerdos en los productos solicitados. Incluye marcos comerciales generales cuando sus disposiciones o listas afecten esos productos; no exijas que sean tratados exclusivos de proteínas.');
        obligations.push('Si hay [DOCUMENTOS COMERCIALES OFICIALES VERIFICADOS], responde con esos hallazgos aunque el modelo de respaldo no devuelva metadatos de Google Search. El fallo de una búsqueda complementaria no invalida los documentos ya leídos. No pidas al usuario que vuelva a buscar documentación que ya está en el contexto. Da una cronología breve y la implicación financiera por producto; declara el alcance y las brechas concretas.');
        obligations.push('La solicitud pide hechos sobre acuerdos comerciales y exige investigación web: busca anuncios fechados, fuentes oficiales de ambos países y cobertura sectorial de Mercolleida cuando sea pertinente. Una portada o el repositorio de VALL no cubren el archivo completo ni prueban que no existan acuerdos.');
        obligations.push('Si se dice "últimos meses" sin número, declara un alcance de seis meses anteriores a la [FECHA DE REFERENCIA]; respeta cualquier periodo explícito. Separa fecha del anuncio, entrada en vigor y cumplimiento observado. Un antecedente anterior al periodo debe etiquetarse como antecedente.');
        obligations.push('Distingue tratado formal, acuerdo o marco comercial, suspensión/reducción arancelaria, autorización sanitaria y compromiso de compra. Responde a acuerdos en sentido amplio; no descartes un compromiso porque no sea un tratado. Identifica productos cubiertos: carnes, pescado/marisco y proteína vegetal/soya si corresponden. No extiendas a todas las proteínas una medida sobre productos seleccionados.');
        obligations.push('Para cada hallazgo presenta fecha, países, medida, productos y enlace al documento que lo respalda; explica después su efecto financiero como inferencia. No digas "no hay acuerdos", "no cambiaron los aranceles" ni "es la única confirmación válida" por falta de resultados. Una búsqueda fallida significa que no se pudo verificar, no que el hecho no exista.');
        obligations.push('Abre con los hallazgos positivos documentados; no declares que no hubo tratados formales sin una fuente que confirme esa ausencia. Cada efecto financiero debe rotularse como inferencia y formularse de manera condicional (podría, si se ejecuta); no afirmes reducciones inmediatas de costos o alzas de precios sin datos. Las ventas y embarques de exportación no acreditan contratos de futuros ni coberturas financieras.');
    }
    if (plan.needsMercolleida) {
        obligations.push('La fuente solicitada es Mercolleida. Usa la sección [MERCOLLEIDA · INFORMACIÓN PÚBLICA] para sus tendencias y comentarios. Muestra fuente, fecha y enlace. La portada no proporciona precios absolutos ni históricos completos: si se solicitan, declara la brecha y ofrece el enlace oficial. No atribuyas cifras de VALL, otra lonja, futuros o memoria del modelo a Mercolleida.');
    }
    if (plan.needsRabobank) {
        obligations.push('Usa [RABOBANK · INVESTIGACIÓN PÚBLICA VERIFICADA] como análisis sectorial complementario. Atribuye cada hallazgo al banco, con fecha de publicación y enlace; distingue pronósticos de datos observados. La API pública de North America no representa todo el archivo global ni el contenido exclusivo de RaboResearch.');
        obligations.push('Responde con los extractos públicos pertinentes aunque el proveedor use un modelo de respaldo o no devuelva búsqueda web. No atribuyas precios de VALL, Mercolleida, futuros o memoria a Rabobank. Si faltan publicaciones para un país, producto o periodo, explica esa brecha. La ausencia en el canal no prueba ausencia de investigación del banco. Resume en español con tus propias palabras y conserva el año del análisis.');
        obligations.push('Para evaluar si un documento cubre un año solicitado, usa su horizonte explícito. No extiendas un pronóstico de 2025 a 2026 como postura del banco. Las extrapolaciones propias deben señalarse como inferencias y formularse condicionalmente; no conviertas un escenario en un hecho observado.');
    }
    if (plan.needsLiveQuote) {
        obligations.push('La consulta pide una cotización actual. Usa exclusivamente la sección [DATOS EN VIVO VERIFICADOS] si está disponible; conserva su fuente, hora de corte, activo y unidad. Si esa sección no está disponible, di que no hay cotización verificable en este momento.');
        obligations.push('Cotización de sesión y barra diaria no son lo mismo: usa el corte exacto del proveedor, indica si es referencia con posible retraso y no la llames cierre final ni tiempo real sin confirmación. No atribuyas causas a la variación de una acción con datos de precio solamente.');
        if (!plan.asksAnalysis && !plan.asksComparison && !plan.asksNews && !plan.needsTradeResearch) obligations.push('Responde los datos solicitados con sus fechas, unidades y enlaces. No agregues una explicación causal del movimiento bursátil sin noticias o comunicados que la sustenten.');
    }
    if (plan.localPhysicalPrice) {
        obligations.push('La solicitud pide una cotización física local. Conserva exactamente el país, la etapa comercial y la unidad pedidas; investiga fuentes nacionales o sectoriales del lugar solicitado. No sustituyas el dato con futuros, índices ni precios de otro país.');
    }
    if (plan.asksNews) {
        obligations.push('La consulta pide actualidad. Limita la búsqueda a economía, finanzas, mercados, divisas, commodities, geopolítica con impacto económico, México, agro o empresas. Excluye espectáculos, deportes y sucesos sin impacto económico. Entrega entre 3 y 6 hallazgos cuando haya evidencia; para cada uno muestra titular, fuente, fecha, enlace disponible y una frase de por qué importa. Distingue titulares de hechos confirmados.');
        obligations.push('Respeta el periodo solicitado. Un titular con fecha de indexación y sin fecha de publicación no confirma que la noticia se publicó dentro de esa ventana. Si no puedes confirmar la fecha o el contenido, declara la brecha; no rellenes la lista con acontecimientos anteriores ni hipotéticos.');
    }
    if (plan.usesVerifiedRepository) {
        obligations.push('Para indicadores, series e históricos usa primero la evidencia verificada de VALL. No mezcles periodos, unidades ni fuentes sin explicarlo.');
    }
    if (plan.needsSources) {
        obligations.push('Toda cifra material debe indicar fuente y periodo/corte. Si haces una inferencia, etiquétala como inferencia y explica el supuesto.');
    }
    if (plan.asksAnalysis || plan.asksExecutiveBrief || plan.asksDecision || plan.asksComparison) {
        obligations.push('Entrega una respuesta orientada a decisión: abre con una conclusión concreta de una a tres frases; después prioriza sólo de 2 a 5 factores que cambian materialmente la lectura; separa hechos verificados, inferencias y escenarios; cierra con el riesgo principal y el dato o evento que se debe vigilar. No llenes la respuesta con definiciones, antecedentes o métricas que no respondan a la pregunta.');
    }
    if (plan.questionCount > 1) {
        obligations.push(`La consulta contiene ${plan.questionCount} partes. Responde cada parte de forma visible y en el mismo orden; no dejes una subpregunta implícita sin respuesta.`);
    }
    if (plan.followsThread) {
        obligations.push('Esta es una continuación. Resuelve la nueva instrucción sobre el sujeto activo del hilo y conserva las restricciones ya acordadas; no reinicies la conversación ni entregues una introducción genérica.');
    }
    if (plan.asksComparison) {
        obligations.push('Compara con criterios, periodo y unidad comunes. Explica cuál diferencia cambia la decisión; no declares un ganador sin condición.');
    }
    if (plan.asksDecision) {
        obligations.push('La persona busca apoyo para decidir. Da una recomendación condicionada, separa hechos de inferencias y nombra el indicador que cambiaría la recomendación.');
    }
    obligations.push('Antes de finalizar comprueba: activo correcto, unidad correcta, fecha compatible y respuesta directa a la solicitud.');
    return obligations.join('\n');
}

function mergeEvidence(evidence, live = null) {
    if (!live?.context) return evidence;
    const citations = [...(live.citations || []), ...(evidence.citations || [])];
    return {
        ...evidence,
        context: [live.context, evidence.context].filter(Boolean).join('\n\n'),
        citations,
        sourceCodes: [...new Set([...(live.sourceCodes || []), ...(evidence.sourceCodes || [])])],
        evidenceCount: (evidence.evidenceCount || 0) + (live.citations?.length || 0),
        retrievalStrategy: `${evidence.retrievalStrategy || 'rag'}+${live.strategy || 'live_data_v1'}`,
        tradeDocuments: live.tradeDocuments || evidence.tradeDocuments || [],
        tradePeriod: live.tradePeriod || evidence.tradePeriod || null,
        rabobank: live.rabobank || evidence.rabobank || null,
        rabobankRecords: live.rabobankRecords || evidence.rabobankRecords || [],
        proteinPrices: live.proteinPrices || evidence.proteinPrices || null,
        proteinPriceRecords: live.proteinPriceRecords || evidence.proteinPriceRecords || [],
        marketQuotes: live.marketQuotes || [],
        quotesAvailable: live.quotesAvailable,
        newsAvailable: live.newsAvailable,
        issuerDocuments: live.issuerDocuments || [],
    };
}

module.exports = { planQuery, planContext, mergeEvidence, normalizeMessage };
