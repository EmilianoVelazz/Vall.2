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
    equities: /\b(?:bolsa|acciones?|acci[oó]n|ticker|s[ií]mbolo|s&p|nasdaq|dow|bmv|ipc|vix|euro\s*stoxx|mercados?\s+accionarios?|asx|ftse|dax|cac\s*40|nikkei|hang seng|nifty|ibovespa|tsx|kospi|taiex|jse|ibex|walmex|femsa|bimbo|gruma|bitcoin|btc|ethereum|eth)\b/i,
    bonds: /\b(?:bonos?|treasury|tesoro|yield|rendimiento|curva de tasas?|deuda soberana|embig|riesgo\s+pa[ií]s)\b/i,
    commodities: /\b(?:commodit(?:y|ies)|materias? primas?|ma[ií]z|trigo|soya|soja|forrajes?|avena|caf[eé]|az[uú]car|algod[oó]n|cacao|cerdos?|porcinos?|puercos?|pollos?|aves?|huevos?|res|bovinos?|ganado|beef|pork|poultry|chicken|eggs?|prote[ií]nas?|pescado|marisco|acero|steel|petr[oó]leo|wti|brent|gas natural|gasolina|oro|plata|platino|paladio|cobre|metal(?:es)?)(?=\s|$|[.,;:!?])/i,
    macro: /\b(?:inflaci[oó]n|inpc|tiie|cetes?|banxico|tasa de inter[eé]s|pol[ií]tica monetaria|pib|empleo)\b/i,
    news: /\b(?:noticias?|titulares?|qu[eé] pas[oó]|[uú]ltima hora|actualidad|evento(?:s)?)\b/i,
});

const FRESHNESS = /\b(?:hoy|ahora|actual(?:es)?|actualizad[oa]s?|en vivo|[uú]ltim[oa]s?|reciente(?:s)?|cierre|cotiza(?:ci[oó]n)?|precio(?:s)?|cu[aá]nto (?:vale|est[aá]|equivale))\b/i;
const TRADE_DEFINITION = /\b(?:qu[eé]\s+(?:es|significa)|define|definici[oó]n)\b/i;
const COMPLEX = /\b(?:analiza|analisis|margen|costos?|logistica|vigilar|verific(?:ar|o)|necesito|cierra|compare|risks?|supply|informe|reporte|panorama|perspectiva|escenario(?:s)?|estrategia|recomendaci[oó]n|riesgo(?:s)?|compar(?:a|aci[oó]n)|proyecci[oó]n|impact(?:o|a|an|ar)|implicaci[oó]n|cobertura|qu[eé]\s+(?:esta|est[aá])\s+pasando|por\s+qu[eé]|factores?\s+principales?|regre[sc]i[oó]n|modelo\s+lineal|m[ií]nimos\s+cuadrados|an[aá]lisis\s+estad[ií]stic[oa])\b/i;
const COMPARISON = /\b(?:compara|comparaci[oó]n|comparativ[oa]s?|versus|vs\.?|frente\s+a|diferencia(?:s)?|mejor entre|matriz)\b/i;
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
    const asksSanitaryRadar = /\b(?:radar\s+(?:nlp|sanitario)|riesgo\s+sanitario|influenza\s+aviar|h5n1|gripe\s+aviar|peste\s+porcina|gusano\s+barrenador|screwworm|senasica)\b/i.test(text);
    const explicitBilateralTrade = /\b(?:acuerdos?\s+comerciales?|tratados?\s+comerciales?|t-?mec|china.{0,30}(?:ee\.?\s*uu\.?|estados?\s+unidos)|(?:ee\.?\s*uu\.?|estados?\s+unidos).{0,30}china)\b/i.test(text);
    const tradeSubject = followsThread ? `${text} ${activeAnchor}` : text;
    const needsTradeResearch = isTradeResearchQuery(tradeSubject)
        && (!TRADE_DEFINITION.test(text) || FRESHNESS.test(text))
        && (!asksSanitaryRadar || explicitBilateralTrade);
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
    const asksCoverageExplanation = /\b(?:por\s+qu[eé]|porqu[eé]|why)\b.{0,90}\b(?:(?:solo|s[oó]lo|[uú]nicamente)\s+(?:me\s+)?(?:diste|mostraste|incluiste|salieron|sali[oó]|hablaste|pusiste|tienes|hay|de\s+(?:estados\s+unidos|ee\.?\s*uu\.?|un\s+pa[ií]s|esa?\s+(?:regi[oó]n|especie)))|no\s+(?:me\s+)?(?:diste|incluiste|salieron|sali[oó]|mostraste|aparec(?:e|en|i[oó]|ieron)|encontraste|validaste)|falt(?:a|an|aron|[oó])\s+(?:otros?|pa[ií]ses?|europa|m[eé]xico|brasil|pollo|huevo|datos?|precios?)|sin\s+(?:precios?|cobertura|otros?\s+pa[ií]ses?)|excluyeron|retiraron)\b/i.test(text);
    const asksDataInventory = (
        /\b(?:(?:qu[eé]|cu[aá]les?)\s+(?:datos?|fuentes?|informes?|reportes?|modelos?|series?|activos?|cobertura|informaci[oó]n)\b.{0,45}\b(?:tienes|manejas|cuentas|disponibles?|ahorita|ahora\s+mismo|actualmente|cargad[oa]s?|conectad[oa]s?|en\s+(?:vivo|cach[eé]|tu\s+sistema|memoria))|con\s+qu[eé]\s+(?:datos?|fuentes?|informes?|modelos?)\s+(?:cuentas|trabajas|operas)|(?:inventario|cat[aá]logo)\s+de\s+(?:datos?|fuentes?|modelos?))\b/i.test(text)
    ) && !/\b(?:cu[aá]nto\s+(?:cuesta|vale)|precio\s+de[l]?\s+\w+)\b/i.test(text);
    const explicitFreshPriceRequest = /\b(?:dame|mu[eé]strame|busca(?:me)?|actualiza(?:me)?|compara(?:me)?|cotiza(?:me)?|cu[aá]nto\s+(?:cuesta|vale)|qu[eé]\s+precios?\s+(?:hay|tienes))\b/i.test(text);
    const suppressMetaResearch = (asksCoverageExplanation || asksDataInventory) && !explicitFreshPriceRequest;
    const needsDataInventory = asksCoverageExplanation || asksDataInventory;
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
    const impliedProteinComparison = (protein.products.length >= 2 && (asksComparison || asksCurrentData) && (protein.countries.length > 0 || protein.global || protein.european))
        || (protein.products.length >= 1 && asksComparison && (protein.mexicoStates.length > 0 || protein.countries.length > 0))
        || (protein.products.length >= 1 && /\b(?:cutout|usda\s+ams|cuesta\s+\d+|como\s+esta(?:n)?\s+(?:hoy\s+)?(?:el\s+|la\s+)?(?:cerdo|pollo|res|huevo|cutout))\b/i.test(text));
    const proteinPhysicalPrice = !suppressMetaResearch && protein.products.length > 0 && (protein.asksPrices || !needsTradeResearch && impliedProteinComparison) && !protein.futures
        && (!equitySubject || physicalPriceClause);
    const localPhysicalPrice = proteinPhysicalPrice || !suppressMetaResearch && topic === 'commodities'
        && LOCAL_PRICE_SIGNAL.test(text)
        && LOCAL_PRODUCT.test(text)
        && PLACE_SIGNAL.test(text);
    const complexity = [asksAnalysis, asksComparison, asksDecision, asksExecutiveBrief, topics.length > 1, questionCount > 1].filter(Boolean).length;
    const needsRabobank = explicitRabobank || ((!needsMercolleida || protein.global) && topic === 'commodities'
        && requestedResearchTopics(rabobankQuery).some(item => ['pork', 'beef', 'poultry', 'seafood', 'dairy', 'grains', 'inputs', 'animal_protein'].includes(item))
        && (asksAnalysis || asksExecutiveBrief || asksNews || needsTradeResearch));
    const explicitFx = /\b(?:tipo de cambio|divisas?|forex|convierte|conversion|dolar(?:es)?|usd\s*\/\s*mxn)\b|\b[a-z]{3}\s*\/\s*[a-z]{3}\b/i.test(text);
    const asksRateOrBenchmark = /\b(?:tipo de cambio|usd\s*\/\s*mxn|eur\s*\/\s*mxn|cetes|tiie|treasury|bonos?\s+del\s+tesoro|bonos?\s+soberanos?|tasa\s+de\s+referencia|rendimiento|s&p|ipc|bmv|nasdaq|dow|wti|brent|gas\s+natural|oro|cobre|maiz|soya|comportamiento\s+reciente|desempeno\s+reciente|matriz\s+comparativa|mercados?\s+globales?)\b/i.test(text);
    const asksQuote = /\b(?:cotizacion(?:es)?|cotiza(?:n)?|precios?|cierre|cuanto (?:vale|esta|equivale)|valor actual|rendimiento actual)\b/i.test(text)
        || asksCurrentData && !asksNews && !asksAnalysis
        || (asksCurrentData || asksComparison) && (explicitFx || asksRateOrBenchmark) && !asksNews;
    const quoteEquities = asksQuote && (!/\b(?:futuros?|cme|cbot)\b/i.test(text) || /\b(?:acciones?|accion|bursatil|ticker)\b/i.test(text));
    const explicitStockQuote = requestedProteinIssuers(marketQuery).length > 0 && quoteEquities;
    const needsFxQuote = topics.includes('fx') && (!equitySubject || explicitFx) && (!localPhysicalPrice || explicitFx) && asksQuote;
    const needsLiveQuote = (explicitStockQuote || needsFxQuote || asksQuote && !needsMercolleida && !explicitRabobank && !needsTradeResearch
        && (instruments.length > 0 || topic === 'bonds' || topics.includes('bonds'))
        && (!localPhysicalPrice || instruments.some(i => !/^(?:HE|LE|GF)=F$/i.test(i.ticker))));
    const needsProteinPrices = proteinPhysicalPrice && (!needsMercolleida || protein.global || explicitRabobank || protein.products.length > 1 || protein.countries.length > 1) && (!explicitRabobank || asksCurrentData);
    const needsProteinResearch = !suppressMetaResearch && protein.products.length > 0 && (proteinPhysicalPrice || asksNews || asksAnalysis || asksExecutiveBrief || needsTradeResearch);
    const internationalNews = /\b(?:noticias? internacionales?|noticieros?|reuters|bloomberg|bbc|financial times)\b/i.test(text);
    const needsLiveNews = !suppressMetaResearch && ((asksNews && (!explicitRabobank || internationalNews || proteinPhysicalPrice)) || (needsProteinResearch && !needsMercolleida && !explicitRabobank && (asksExecutiveBrief || protein.global && proteinPhysicalPrice)));
    const usesVerifiedRepository = !suppressMetaResearch && ['macro', 'bonds', 'equities', 'commodities'].includes(topic);
    // Un panorama o una pregunta sobre implicaciones exige contraste externo,
    // aunque no mencione literalmente la palabra "análisis". Así se evita una
    // respuesta de memoria cuando la persona espera contexto actual y útil.
    const needsIssuerResearch = !suppressMetaResearch && proteinIssuers.length > 0 && (asksAnalysis || asksComparison || asksDecision || asksNews || asksExecutiveBrief);
    const requiresWebResearch = needsIssuerResearch || needsProteinResearch || needsRabobank || needsTradeResearch || localPhysicalPrice || (!suppressMetaResearch && (asksAnalysis || asksNews || asksExecutiveBrief));
    const needsSources = !suppressMetaResearch && (needsRabobank || needsMercolleida || needsLiveQuote || needsLiveNews || requiresWebResearch || ['macro', 'bonds'].includes(topic));
    // Una consulta corta puede requerir razonamiento profundo si compara varios
    // frentes o pide una decisión. No usamos sólo longitud como señal.
    const recommendedTier = needsTradeResearch || asksAnalysis || asksExecutiveBrief || complexity >= 2 || mode === 'executive' || mode === 'technical' ? 'pro' : 'flash';
    const needsExecutiveReport = !providedInputsOnly && !suppressMetaResearch && (
        /\b(?:informes?\s+ejecutivos?|nuestros?\s+informes|los\s+informes|biblioteca\s+de\s+informes|informe\s+(?:de\s+)?(?:finanzas|mercados|mexico|bonos|divisas|fx|acciones|proteinas|granos|energia|bolsa|noticias|produccion)|panorama\s+(?:ejecutivo|nacional|financiero|de\s+mercados|visual|global|economico)|reportes?\s+(?:(?:mas\s+)?recientes?\s+)?(?:del\s+apartado\s+de\s+|de\s+)?(?:finanzas|mercados|mexico)|report\s*reader)\b/i.test(text)
        || topic === 'macro'
        || asksExecutiveBrief
        || (topics.length >= 2 && (asksComparison || asksCurrentData || asksDecision || /\b(?:matriz|global(?:es)?|mundo|mercados?\s+globales?|esta\s+semana|riesgos?)\b/i.test(text)))
        || /\b(?:cetes|tiie|embig|riesgo\s+pais|bonos?\s+soberanos?|\bvix\b|inpc|inflacion|banxico|remesas)\b/i.test(text)
        || /\b(?:riesgos?\s+(?:macro|sanitari|energ|de\s+la\s+semana)|vigilar\s+esta\s+semana|esta\s+semana\s+que\s+puedan)\b/i.test(text)
    );
    const needsMarranasML = !providedInputsOnly && (
        /\b(?:marranas?|orion\s+ml|walk-?forward|pronosticos?\s+ml|paridad\s+de\s+importacion|arbitraje|shap|h5n1|influenza\s+aviar|gripe\s+aviar|peste\s+porcina|gusano\s+barrenador|screwworm|senasica|radar\s+(?:nlp|sanitario)|modelos?\s+ml|machine\s+learning)\b/i.test(text)
        || protein.products.length > 0
        || (asksExecutiveBrief && ['commodities', 'markets', 'macro'].includes(topic))
    );

    const plan = {
        locationClarification: proteinPhysicalPrice && !protein.mexicoCities.length ? ambiguousMexicoCities(message)[0] || null : null,
        topic,
        topics,
        asksCurrentData,
        asksAnalysis,
        asksForecast,
        asksCoverageExplanation,
        asksDataInventory,
        needsDataInventory,
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
        needsExecutiveReport,
        needsMarranasML,
        historyTurns: Array.isArray(history) ? history.length : 0,
        inheritedTopics: inheritsTopic ? historyTopics.filter(topic => !currentTopics.includes(topic)) : [],
    };
    if (providedInputsOnly) {
        for (const flag of ['asksCurrentData', 'asksCoverageExplanation', 'asksDataInventory', 'needsDataInventory', 'localPhysicalPrice', 'requiresWebResearch', 'needsLiveQuote', 'needsFxQuote', 'needsIssuerResearch', 'needsLiveNews', 'needsProteinPrices', 'needsProteinResearch', 'needsMercolleida', 'needsRabobank', 'needsTradeResearch', 'usesVerifiedRepository', 'needsSources', 'needsExecutiveReport']) plan[flag] = false;
    }
    return plan;
}

function planContext(plan) {
    const obligations = [
        '[PLAN DE RESPUESTA VERIFICABLE]',
        `Tema principal detectado: ${plan.topic}.`,
        'Responde primero la pregunta concreta; no sustituyas un dato por una explicación general.',
    ];
    if (plan.asksCoverageExplanation || plan.asksDataInventory) {
        obligations.push('Usa [INVENTARIO Y COBERTURA EN VIVO DE VALLNEWS / ORION] para explicar con exactitud qué cachés, modelos ML, fechas de corte y conectores están disponibles ahora mismo o por qué una respuesta previa tuvo cobertura parcial. No generes tablas vacías de "Sin precio verificado" ni rechazos genéricos cuando solo se pide explicación o inventario.');
    }
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
    if (plan.needsExecutiveReport) {
        obligations.push('Cuando el usuario pregunte por nuestros informes ejecutivos o panóramas publicados, usa exclusivamente las cifras, cortes, fuentes y alertas de [LECTURA DE INFORMES EJECUTIVOS · REPORT READER]. Si un dato solicitado no aparece en el corte del informe, dilo explícitamente.');
    }
    if (plan.needsMarranasML) {
        obligations.push('Responde siempre con la identidad unificada de ORION, apoyado en tus modelos internos de Machine Learning (proteínas, probabilidades direccionales Subida/Baja, bandas Conformal P80, atribución causal SHAP, Paridad de Importación en MXN/kg y Radar NLP de eventos sanitarios/comerciales). Integra estas señales de forma natural junto con los precios observados y distingue siempre entre precio observado y señal estadística (nunca certeza absoluta ni recomendación de inversión).');
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
        fxRates: live.fxRates || evidence.fxRates || null,
        marketQuotes: live.marketQuotes || evidence.marketQuotes || [],
        quotesAvailable: live.quotesAvailable ?? evidence.quotesAvailable,
        newsAvailable: live.newsAvailable ?? evidence.newsAvailable,
        issuerDocuments: live.issuerDocuments || evidence.issuerDocuments || [],
    };
}

module.exports = { planQuery, planContext, mergeEvidence, normalizeMessage };
