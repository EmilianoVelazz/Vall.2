'use strict';
const { physicalPriceStore } = require('../ml/physical-price-store');
const { learningStore: defaultLearningStore } = require('../ml/forecast-learning-store');
const { assessAdaptiveForecast, MODEL_VERSION } = require('../ml/adaptive-forecast');
const { marketProfile } = require('../ml/market-profiles');
const { normalizeForIntent } = require('./conversation-context');
const { PRODUCTS } = require('../services/protein-market-intelligence');

const DAY = 86_400_000;
function matchesScope(identity, profile) {
    return profile.products.includes(identity.productId)
        && (!profile.countries.length || profile.countries.includes(identity.countryCode))
        && (!profile.mexicoStates?.length || profile.mexicoStates.includes(identity.stateCode))
        && (!profile.priceBasis || profile.priceBasis === identity.priceBasis)
        && (!profile.commercialStages?.length || profile.commercialStages.some(stage=>normalizeForIntent(identity.category+' '+identity.market).includes(stage==='retail'?'menudeo':'mayoreo')))
        && (!profile.mexicoCities?.length || profile.mexicoCities.some(city=>normalizeForIntent(identity.market).includes(normalizeForIntent(city.name))));
}
function physicalHorizon(request, frequency) {
    if (frequency !== 'weekly') return request.horizon;
    if (!request.assumption) return null;
    if (/semana/.test(request.label)) return request.horizon / 5;
    if (/mes/.test(request.label)) return request.horizon / 20 * 4;
    return null;
}
async function buildPhysicalForecast(plan, { archive = physicalPriceStore, learningStore = defaultLearningStore, now = Date.now(), persist = true, reviewOnly = false, signal } = {}) {
    const records = [];
    const profile = plan.proteinProfile;
    const unavailable = reason => ({ requested: true, available: false, records,
        reason, context: '[PRONÓSTICO FÍSICO]\n'+reason+'\nNo sustituyas este mercado por futuros ni inventes una estimación. Conserva producto, plaza, presentación y horizonte.' });
    signal?.throwIfAborted();
    if (!profile.countries.length) return unavailable('El país determina la serie física comparable. ¿En qué país quieres analizar ese producto?');
    if (profile.countries.length===1&&profile.countries[0]==='MX'&&!profile.mexicoStates?.length) return unavailable('Un precio físico de una plaza no representa automáticamente a todo México. ¿En qué estado quieres analizar ese producto?');
    if (!profile.priceBasis&&!profile.commercialStages?.length) return unavailable('La presentación cambia el precio y el histórico necesario. ¿Qué presentación quieres analizar: en pie, canal, producto entero o un corte?');
    let candidates;
    try { candidates=await archive.series(profile); }
    catch { return unavailable('No se pudo consultar el almacén histórico persistente de precios físicos. No se simulan observaciones ni se sustituye la serie con otro mercado.'); }
    const series = candidates.filter(row=>matchesScope(row.identity,profile));
    if (!series.length) return unavailable('Para pronosticar un precio físico todavía falta histórico comparable guardado del producto, ubicación y presentación pedidos. Las nuevas cotizaciones verificadas se acumulan por separado; una cotización aislada no permite validar un pronóstico.');
    if (series.length > 4 || profile.products.length === 1 && series.length > 1) {
        const markets=[...new Set(series.map(row=>row.identity.market))];
        return unavailable(markets.length>1?`Hay varias plazas y no se promedian. ¿Qué plaza quieres analizar: ${markets.slice(0,4).join(', ')}?`:`Hay varias categorías y no se mezclan. ¿Qué presentación quieres analizar: ${[...new Set(series.map(row=>row.identity.category))].slice(0,4).join(', ')}?`);
    }
    for (const seriesRecord of series) {
        signal?.throwIfAborted();
        const identity = seriesRecord.identity;
        const horizon = physicalHorizon(plan.forecast,identity.frequency);
        const base = { ticker: 'P:'+seriesRecord.key.slice(0,16), name: `${PRODUCTS.find(product=>product.id===identity.productId)?.name || identity.productId} · ${identity.market} · ${identity.category}`,
            scope: identity, source: identity.source, sourceUrl: identity.sourceEndpoint,
            unit: identity.unit, priceBasis: `${identity.priceBasis} · ${identity.category}`, frequency: identity.frequency,
            horizon, horizonLabel: identity.frequency==='weekly'?`${horizon} observaciones semanales`:`${horizon} observaciones diarias`, cutoff: seriesRecord.points.at(-1)?.date, observations: seriesRecord.points.length };
        const points = seriesRecord.points.filter(row=>!row.revised);
        const model = marketProfile({ physical: true, frequency: identity.frequency });
        base.marketProfile = { id: model.id, name: model.name };
        if (!horizon || !Number.isInteger(horizon) || horizon > 20) { records.push({ ...base, available: false, reason: 'La frecuencia semanal no permite convertir ese plazo en sesiones diarias. Indica el horizonte en semanas o meses.' }); continue; }
        const gaps = points.slice(1).map((point,i)=>(Date.parse(point.date)-Date.parse(points[i].date))/DAY);
        const regular = !gaps.length || gaps.filter(gap=>identity.frequency === 'weekly' ? gap>=6&&gap<=8 : gap>=1&&gap<=4).length/gaps.length>=.8;
        const latest = points.at(-1);
        if (!latest || !regular || now-Date.parse(latest.date)>(identity.frequency==='weekly'?21:7)*DAY) {
            records.push({ ...base, available: false, reason: 'El histórico presenta huecos importantes, revisiones pendientes o un corte antiguo; no se interpolan precios para ocultar esa falta.' }); continue;
        }
        base.cutoff = latest.date;
        const options = { now, persist, unit: base.unit, priceBasis: base.priceBasis, modelVersion: `${MODEL_VERSION}/${model.id}` };
        const reviewed = learningStore ? await learningStore.review(base.ticker,horizon,points,options) : { status: 'disabled', feedback: [], summary: {} };
        let assessment = assessAdaptiveForecast(points,{horizon,profileId:model.id,feedback:reviewed.feedback,now});
        signal?.throwIfAborted();
        const saved = learningStore && reviewed.status==='connected' && !reviewOnly ? await learningStore.record(base.ticker,horizon,points,assessment,options) : { status: reviewed.status, assessment };
        assessment = saved.assessment;
        records.push({ ...base, observations: points.length, available: assessment.eligible, reason: assessment.reason,
            lastValue: latest.value, prediction: assessment.eligible ? assessment.forecast : null,
            evaluation: assessment.evaluation || null, learning: { ...assessment.learning, ...reviewed.summary, storageStatus: saved.status } });
    }
    return { requested: true, available: records.some(row=>row.available), records, assumption: plan.forecast.assumption,
        context: '[PRONÓSTICO FÍSICO DEL SERVIDOR]\n'+JSON.stringify(records)+'\nLa ubicación, categoría, unidad y frecuencia identifican la serie exacta. Un mes de serie semanal se aproxima a cuatro observaciones, no a veinte sesiones. Sólo usa las estimaciones aprobadas. El precio físico no se deriva de futuros.' };
}
module.exports = { buildPhysicalForecast, physicalHorizon, matchesScope };
