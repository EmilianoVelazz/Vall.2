'use strict';
const { buildAnswerStrategy } = require('./answer-strategy');
const { calculateMargin } = require('./commercial-calculator');
const { researchLedger } = require('./research-evidence');
const { sourceDate } = require('./evidence-coverage');

function decisionBrief({message,history,plan,evidence={},inputs={},forecastAnalysis}) {
    const {audience}=buildAnswerStrategy({message,history,plan});
    const facts=(evidence.marketQuotes || []).filter(quote=>Number.isFinite(quote.value)&&sourceDate(quote.updatedAt)&&quote.url)
        .slice(0,3).map(quote=>({text:`${quote.label}: ${quote.value} ${quote.unit}`,date:quote.updatedAt,url:quote.url,
            changePct:Number.isFinite(quote.change)?quote.change:null,kind:'observed_quote'}));
    for(const price of (evidence.proteinPriceRecords || []).filter(row=>row.verified===true&&Number.isFinite(row.value)&&sourceDate(row.date)&&row.url).slice(0,3-facts.length)) {
        facts.push({text:`${price.product || price.productId} · ${price.market || price.country} · ${price.category}: ${price.value} ${price.unit}`,date:price.date,url:price.url,kind:'verified_physical_price'});
    }
    const ledger=researchLedger(plan,evidence);
    for(const record of ledger.records.filter(record=>record.inPeriod).slice(0,3-facts.length)) facts.push({text:record.title,date:record.date,url:record.url,kind:'read_document'});
    const physical=plan.proteinProfile?.products?.length&&!plan.proteinProfile.futures;
    const commercial=['merchant','buyer','producer'].includes(audience)||physical;
    const effect=commercial?'Si sube tu costo puesto en destino y no cambia el precio neto de venta, el margen por unidad disminuye. El precio de referencia sólo afecta tu costo cuando cambian tus condiciones reales de compra.'
        :plan.topics?.includes('fx')?'Si tienes pagos en la divisa que se encarece frente a tu moneda de ingreso, aumenta su costo en moneda local. La exposición depende de importes, fechas y coberturas ya contratadas.'
            :'Un cambio de precio no demuestra una mejora de beneficios. Relaciona la señal con ventas, costos, deuda y el horizonte de la decisión.';
    const verification=physical?'Comprueba cotización del mismo producto, presentación y plaza, fecha, moneda, flete, merma y crédito antes de cambiar una compra.'
        :plan.needsTradeResearch?'Confirma medida, productos cubiertos y fecha de entrada en vigor antes de asumir un efecto arancelario o una compra ejecutada.'
            :plan.topics?.includes('fx')?'Verifica la tasa ejecutable, fecha de pago y exposición neta; una referencia informativa puede diferir de la tasa bancaria.'
                :'Confirma la fecha del próximo dato o comunicado pertinente y qué resultado cambiaría tu decisión.';
    const forecast=forecastAnalysis?.records || [];
    const calculation=calculateMargin(inputs);
    return {audience,facts,effect,verification,
        forecastStatus:forecast.some(record=>record.available)?'validated_estimate':plan.asksForecast?'scenario_only':'not_requested',
        uncertainty:facts.length?'Las referencias disponibles pueden ser parciales; el efecto indicado es condicional.':'No se recuperó un dato observado suficiente para afirmar qué cambió; conserva una lectura condicional.',
        business:calculation.available?{currency:inputs.currency,breakEvenPerKg:calculation.costPerSellableKg,profit:calculation.profit,
            profitChangePerOneBuyUnit:-inputs.purchasedKg,profitChangePerOneSaleUnit:calculation.sellableKg}:null};
}
function decisionContext(input) {
    if(!input.plan.asksDecision&&!input.plan.asksAnalysis&&!input.plan.asksNews) return '';
    return ['[GUÍA DE DECISIÓN PARA ESTA CONSULTA]',JSON.stringify(decisionBrief(input)),
        'Organiza la respuesta según lo pedido: qué cambió (sólo hechos fechados), cómo podría afectar compras o márgenes (mecanismo condicional) y qué verificar antes de actuar (condición concreta). No conviertas el escenario en orden de compra/venta ni inventes un umbral o una fecha.',
        'Usa los datos de negocio ya expresados; no preguntes de nuevo por ellos. Si falta un dato indispensable, elige una sola variable para preguntar. No agregues un bloque genérico que repita la respuesta.'].join('\n');
}
module.exports={decisionBrief,decisionContext};
