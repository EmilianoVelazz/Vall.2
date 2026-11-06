'use strict';
const { proteinProfile, PRODUCTS, COUNTRIES } = require('../services/protein-market-intelligence');
const { normalizeForIntent, isLikelyFollowUp } = require('./conversation-context');
const { parseCommercialInputs } = require('./commercial-calculator');
const { stateName, STATES, requestedMexicoCities } = require('../services/mexico-price-scope');
const { forecastRequest } = require('./answer-strategy');
const array = value => Array.isArray(value) ? value : [];
const { normalizeBusinessProfile } = require('../lib/business-profile');
function sanitizeMemory(memory) {
    if (!memory || typeof memory !== 'object') return null;
    const profile = memory.profile || {};
    const cleanProfile = { products:array(profile.products).filter(id=>PRODUCTS.some(p=>p.id === id)).slice(0,4),
        countries:array(profile.countries).filter(id=>COUNTRIES.some(c=>c.code === id)).slice(0,12),
        mexicoStates:array(profile.mexicoStates).filter(s=>STATES.some(state=>state.code===s)).slice(0,32),
        mexicoCities:array(profile.mexicoCities).flatMap(city=>requestedMexicoCities(String(city?.name || '').slice(0,80),true).filter(row=>row.stateCode===city.stateCode)).slice(0,8),
        commercialStages:array(profile.commercialStages).filter(stage=>['wholesale','retail'].includes(stage)).slice(0,2),
        presentationQuery:typeof profile.presentationQuery==='string' ? profile.presentationQuery.slice(0,1400) : '',
        futures:profile.futures===true, european:profile.european===true,
        asksPrices:profile.asksPrices === true, global:profile.global === true, specificPrice:profile.specificPrice === true,
        priceSource:['porcicultura','sniim'].includes(profile.priceSource) ? profile.priceSource : null,
        priceBasis:['live','carcass','cut','retail','pieces','farm','specific','whole','wholesale'].includes(profile.priceBasis) ? profile.priceBasis : null };
    const inputs = {};
    for (const key of ['purchasedKg','buyPricePerKg','sellPricePerKg','shrinkFraction',...['freight','insurance','duties','otherCosts'].flatMap(field=>[field,field+'PerKg'])]) {
        if (Object.hasOwn(memory.inputs || {},key) && (memory.inputs[key] === null || typeof memory.inputs[key] === 'number' && Number.isFinite(memory.inputs[key]) && Math.abs(memory.inputs[key]) <= 1e12)) inputs[key] = memory.inputs[key];
    }
    if (/^[A-Z]{3}$/.test(memory.inputs?.currency || '')) inputs.currency = memory.inputs.currency;
    if (['user','company_preference'].includes(memory.inputs?.currencySource)) inputs.currencySource = memory.inputs.currencySource;
    if (/^(?:CIF|FOB|DAP|DDP|EXW|CFR|FCA)$/.test(memory.inputs?.incoterm || '')) inputs.incoterm = memory.inputs.incoterm;
    if (memory.inputs?.mixedCurrencies) inputs.mixedCurrencies = true;
    if (memory.inputs?.requiresTransformation) inputs.requiresTransformation = true;
    const forecast = memory.forecast;
    const cleanForecast = Number.isInteger(forecast?.horizon) && forecast.horizon>0 && forecast.horizon<=252
        && /^[\p{L}\p{N}\s]{1,100}$/u.test(forecast.label || '') ? { horizon:forecast.horizon,label:forecast.label,assumption:forecast.assumption===true,supported:forecast.horizon<=20,requested:true } : null;
    return { version:2, profile:cleanProfile, inputs, forecast:cleanForecast, anchor:typeof memory.anchor === 'string' ? memory.anchor.slice(0,1200) : '', noExternalLookup:memory.noExternalLookup === true,
        pendingLocation:['Mérida','León','Córdoba'].includes(memory.pendingLocation) ? memory.pendingLocation : null };
}
function memorySummary(memory) {
    if (!memory) return '';
    const p = memory.profile;
    const lines = ['Condiciones anteriores aportadas por el usuario; no son cotizaciones actuales.'];
    if (memory.forecast) lines.push('Encargo vigente: pronóstico '+memory.forecast.label+'.');
    if (p.products.length) lines.push('Producto: ' + p.products.map(id=>PRODUCTS.find(p=>p.id===id).name).join(', '));
    if (p.countries.length) lines.push('Mercado: ' + p.countries.map(id=>COUNTRIES.find(c=>c.code===id).name).join(', '));
    if (p.mexicoStates.length) lines.push('Entidades: ' + p.mexicoStates.map(stateName).join(', '));
    if (p.priceBasis) lines.push('Presentación: ' + ({live:'en pie',carcass:'en canal',cut:'corte',retail:'menudeo',pieces:'por piezas',farm:'productor',specific:'específica',whole:'entero',wholesale:'mayoreo'})[p.priceBasis]);
    const presentation = normalizeForIntent(p.presentationQuery).match(/\b(?:pechugas?|pancetas?|costillas?|lomos?|muslos?|ribeye|sirloin|arrachera|chuletas?|congelad[oa]s?|refrigerad[oa]s?|deshuesad[oa]s?|marinad[oa]s?|docenas?|cajas?|charolas?|huevo rojo|huevo blanco|organicos?)\b/g);
    if (presentation?.length) lines.push('Características conservadas: '+[...new Set(presentation)].join(', '));
    if (p.commercialStages.length) lines.push('Etapa comercial: '+p.commercialStages.map(stage=>stage==='retail'?'menudeo':'mayoreo').join(' y '));
    if (p.mexicoCities.length) lines.push('Municipio solicitado: '+p.mexicoCities.map(city=>city.name).join(', '));
    if (p.priceSource) lines.push('Fuente solicitada: ' + p.priceSource);
    if (Object.keys(memory.inputs).length) lines.push('Supuestos del ejercicio, nunca precios actuales: ' + JSON.stringify(memory.inputs));
    if (p.asksPrices) lines.push('Solicitud anterior: precios.');
    if (memory.noExternalLookup) lines.push('Ejercicio hipotético: no busques precios externos; usa solo mis supuestos.');
    return lines.join('\n');
}
function commercialSeed(state, profile, message) {
    if (!state) return {};
    const named = proteinProfile(message);
    const differentProduct = named.products.length && (
        named.products.length !== state.profile.products.length
        || named.products.some(id => !state.profile.products.includes(id))
    );
    const differentBasis = state.profile.priceBasis && profile.priceBasis
        && state.profile.priceBasis !== profile.priceBasis;
    // Comparaciones hipotéticas pueden reutilizar un lote si el usuario lo pide.
    // Una especie o presentación nueva no hereda automáticamente sus costos.
    const keep = /\b(?:mismos? (?:supuestos|precios|costos|datos|valores)|mismas? condiciones)\b/.test(normalizeForIntent(message));
    if ((!differentProduct && !differentBasis) || keep) return state.inputs;
    return state.inputs.currency ? { currency: state.inputs.currency, currencySource: state.inputs.currencySource } : {};
}
function reduceMemory(history = [], initial = null) {
    let state = sanitizeMemory(initial);
    const users = history.filter(turn=>turn?.role === 'user' && !turn._hidden).slice(-80);
    const previous = state ? [{role:'user',content:memorySummary(state)}] : [];
    for (const turn of users) {
        const message = String(turn.content || turn.text || '').slice(0,12000);
        const named = proteinProfile(message);
        const follows = isLikelyFollowUp(message, previous);
        if (!follows && (named.products.length || /\b(?:cambiando de tema|otro tema|bitcoin|ethereum)\b/.test(normalizeForIntent(message)))) state = null;
        const profile = proteinProfile(message, state ? memorySummary(state) : '', state?.profile || null);
        if (follows && state && profile.products.every(id=>state.profile.products.includes(id)) && !profile.priceBasis) profile.priceBasis = state.profile.priceBasis;
        if (profile.products.length || state) {
            const inputs = parseCommercialInputs(message,commercialSeed(state,profile,message));
            const forecast = forecastRequest(message,previous);
            state = sanitizeMemory({ profile, inputs, forecast:forecast.requested ? forecast : null, anchor:state?.anchor || message,
                noExternalLookup: /\bno (?:busques|consultes)\b/.test(normalizeForIntent(message)) || state?.noExternalLookup });
            if (/\b(?:busca|consulta|actualiza)\b/.test(normalizeForIntent(message)) && !/\bno (?:busques|consultes)\b/.test(normalizeForIntent(message))) state.noExternalLookup = false;
        }
        previous.push({role:'user',content:message});
    }
    return state;
}
function prepareBusinessConversation({ message, history = [], conversationMemory = null, businessProfile = null, context = '' }) {
    const company = normalizeBusinessProfile(businessProfile || {});
    const remembered = sanitizeMemory(conversationMemory) || reduceMemory(history);
    const locationReply = remembered?.pendingLocation && /^(?:en |de |es |si[, ]+)?(?:mexico|espana|argentina|colombia|venezuela|nicaragua|yucatan|guanajuato|veracruz)[.\s]*$/.test(normalizeForIntent(message));
    if (locationReply) message = `Ahora en ${remembered.pendingLocation}, ${message}`;
    const follows = remembered && (locationReply || isLikelyFollowUp(message,[{role:'user',content:memorySummary(remembered)},...history]));
    const activeHistory = follows ? [{role:'user',content:memorySummary(remembered)},...history.slice(-22)] : history;
    const state = reduceMemory([{role:'user',content:message}], follows ? remembered : null);
    const commercialInputs = state ? { ...state.inputs } : parseCommercialInputs(message);
    if (!commercialInputs.currency && company.currency) { commercialInputs.currency = company.currency; commercialInputs.currencySource = 'company_preference'; }
    if (state && commercialInputs.currency) { state.inputs.currency = commercialInputs.currency; state.inputs.currencySource = commercialInputs.currencySource || 'user'; }
    // El perfil orienta la explicación; nunca aporta precios ni sustituye un
    // producto, país o moneda expresamente pedido.
    const companyContext = company.products.length || company.markets.length
        ? `Perfil comercial editable: ${company.products.map(id=>PRODUCTS.find(p=>p.id===id).name).join(', ')}; mercados habituales: ${company.markets.join(', ')}; moneda preferida: ${company.currency || 'sin indicar'}; actividad: ${{merchant:'comercialización',buyer:'compras',producer:'producción',investor:'inversión'}[company.role]}. La consulta actual tiene prioridad; un mercado habitual no es el mercado solicitado.` : '';
    return { message, history:activeHistory, conversationMemory:state, commercialInputs,
        context:[context,companyContext,state ? '[CONDICIONES VIGENTES DEL EJERCICIO]\n'+memorySummary(state)
            +'\nPara cálculos usa sólo los supuestos de este bloque. Un importe ausente está pendiente: no lo recuperes de un lote anterior de otra especie o presentación. Reutiliza condiciones anteriores únicamente si el usuario lo pidió expresamente.' : ''].filter(Boolean).join('\n\n') };
}
module.exports = { normalizeBusinessProfile, sanitizeMemory, memorySummary, reduceMemory, prepareBusinessConversation };
