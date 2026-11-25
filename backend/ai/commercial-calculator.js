'use strict';
const { normalizeForIntent } = require('./conversation-context');
const NUM = '(-?\\d+(?:[.,]\\d+)*)';
const LINK = '(?:(?:ahora|es|seria|sera|de|del|:|a|aumenta a|baja a|sube a)\\s*){0,3}';
function number(value) {
    const text = String(value).replace(/\s/g, '');
    const normalized = /^-?\d{1,3}(?:,\d{3})+$/.test(text) ? text.replace(/,/g, '')
        : text.includes(',') && text.includes('.') ? text.lastIndexOf(',')>text.lastIndexOf('.') ? text.replace(/\./g,'').replace(',','.') : text.replace(/,/g, '') : text.replace(',', '.');
    return Number(normalized);
}
function parseCommercialInputs(message, previous = {}) {
    const text = normalizeForIntent(message);
    const result = { ...previous };
    const match = pattern => new RegExp(pattern, 'i').exec(text);
    const quantity = match('(?:compro|compramos|adquiero|cantidad|volumen|lote de|llevar|transportar|ahora son|son)\\s*(?:es|de|:|a)?\\s*' + NUM + '\\s*(kg|kilogramos?|kilos?|toneladas?|ton|t)\\b')
        || match('(?:^|[,;])\\s*' + NUM + '\\s*(kg|kilogramos?|kilos?|toneladas?|ton|t)\\b');
    if (quantity) result.purchasedKg = number(quantity[1]) * (/^(?:ton|t$)/.test(quantity[2]) ? 1000 : 1);
    const buy = match('\\b(?:compro|compramos|compra|adquiero)\\b.{0,100}?\\ba\\s*\\$?\\s*' + NUM + '\\s*(?:mxn|usd|eur|pesos)?\\s*(?:/|por\\s+)(?:kg|kilo)')
        || match('(?:precio|costo)\\s*(?:(?:cif|fob|dap|ddp|exw|cfr|fca)\\s*)?(?:de\\s*)?compra\\s*'+LINK+'\\$?\\s*' + NUM)
        || match('\\bcompra\\s*(?:es|de|:|a|baja a|sube a)?\\s*\\$?\\s*'+NUM+'\\s*(?:mxn|usd|eur|pesos)?\\s*(?:/|por\\s+)(?:kg|kilo)');
    const sell = match('\\b(?:vendo|vendemos|venta|precio de venta)\\s*(?:en\\s+(?:canal|pie|cortes?)\\s*)?'+LINK+'\\$?\\s*' + NUM + '\\s*(?:mxn|usd|eur|pesos)?');
    if (buy) result.buyPricePerKg = number(buy[1]);
    if (sell && !/^\s*(?:kg|kilos?|toneladas?|t)\b/.test(text.slice(sell.index+sell[0].length))) result.sellPricePerKg = number(sell[1]);
    if(buy && /^\s*(?:%|por ciento)/.test(text.slice(buy.index+buy[0].length)))result.buyPricePerKg=null;
    if(sell && /^\s*(?:%|por ciento)/.test(text.slice(sell.index+sell[0].length)))result.sellPricePerKg=null;
    const shrink = match('(?:merma|perdida de peso)\\s*'+LINK + NUM + '\\s*(%|por ciento)?')
        || match(NUM + '\\s*(%|por ciento)\\s*(?:de\\s*)?(?:merma|perdida de peso)');
    if (shrink) {
        const amount = number(shrink[1]);
        if (shrink[2]) result.shrinkFraction = amount / 100;
        else if (amount >= 0 && amount < 1) result.shrinkFraction = amount;
        else result.shrinkFraction = null;
    }
    const costs = { freight: 'flete|transporte', insurance: 'seguro', duties: 'aranceles?|impuestos?', otherCosts: 'otros costos|otros gastos|comisiones' };
    for (const [field, label] of Object.entries(costs)) {
        const found = match('(?:' + label + ')\\s*'+LINK+'\\$?\\s*' + NUM + '\\s*(mxn|usd|eur|pesos|%|por ciento)?\\s*((?:/|por\\s+)(?:kg|kilo))?')
            || match('\\$?\\s*' + NUM + '\\s*(mxn|usd|eur|pesos|%|por ciento)?\\s*((?:/|por\\s+)(?:kg|kilo))?\\s*(?:de|en|por)\\s*(?:' + label + ')\\b');
        if (found) {
            // Los porcentajes de arancel/comisión necesitan base imponible.
            if (/%|por ciento/.test(found[2] || '')) result[field] = null;
            else if (found[3]) { result[field+'PerKg'] = number(found[1]); delete result[field]; }
            else { result[field] = number(found[1]); delete result[field+'PerKg']; }
        }
    }
    const currencies = [...new Set((text.match(/\b(?:mxn|usd|eur|cad|brl|gbp)\b/g) || []).map(c => c.toUpperCase()))];
    const retainedMoney=['buyPricePerKg','sellPricePerKg','freight','freightPerKg','insurance','insurancePerKg','duties','dutiesPerKg','otherCosts','otherCostsPerKg'].some(field=>Object.hasOwn(previous,field));
    if(currencies.length===1 && previous.currency && currencies[0]!==previous.currency && retainedMoney)result.mixedCurrencies=true;
    if (currencies.length === 1) result.currency = currencies[0];
    if (currencies.length === 1) result.currencySource = 'user';
    if (/\bpesos mexicanos\b/.test(text) && !currencies.length) result.currency = 'MXN';
    if (currencies.length > 1) result.mixedCurrencies = true;
    if (/\b(?:todos los costos en|usa solo)\b/.test(text) && currencies.length === 1) result.mixedCurrencies = false;
    const incoterm = text.match(/\b(?:cif|fob|dap|ddp|exw|cfr|fca)\b/);
    if (incoterm) result.incoterm = incoterm[0].toUpperCase();
    if (/\b(?:en pie|peso vivo)\b/.test(text) && /\b(?:canal|cortes?)\b/.test(text)) result.requiresTransformation = true;
    if (/\bmisma presentacion\b/.test(text)) result.requiresTransformation = false;
    return result;
}
function calculateMargin(input = {}) {
    const perKgBasis=input.purchasedKg == null && !['freight','insurance','duties','otherCosts'].some(field=>Object.hasOwn(input,field) && input[field]!==0);
    if(perKgBasis)input={...input,purchasedKg:1};
    const fields = ['purchasedKg', 'buyPricePerKg', 'sellPricePerKg', 'shrinkFraction'];
    const missing = fields.filter(field => input[field] == null);
    if (missing.length) return { available: false, missing, reason: 'Faltan condiciones del lote.' };
    if (input.mixedCurrencies) return { available: false, reason: 'Compra, venta y gastos deben expresarse en una sola moneda; falta una conversión documentada.' };
    if (input.requiresTransformation) return { available:false, reason:'Compra en pie y venta en canal/cortes requieren rendimiento de sacrificio o despiece y costos de transformación. La merma comercial por sí sola no convierte esas presentaciones.' };
    if (!input.currency) return { available: false, missing: ['currency'], reason: 'Falta la moneda de las condiciones comerciales.' };
    if (!fields.every(field => typeof input[field] === 'number' && Number.isFinite(input[field]))
        || fields.some(field=>Math.abs(input[field]) > 1e12) || input.purchasedKg <= 0 || input.buyPricePerKg < 0 || input.sellPricePerKg <= 0
        || input.shrinkFraction < 0 || input.shrinkFraction >= 1) return { available: false, reason: 'Peso, precios o merma fuera de rango.' };
    if (input.incoterm === 'CIF' && (input.freight > 0 || input.insurance > 0 || input.freightPerKg > 0 || input.insurancePerKg > 0) && input.extraCostsConfirmed !== true) {
        return { available: false, reason: 'El precio CIF incluye flete y seguro: confirma si esos gastos son adicionales antes de sumarlos.' };
    }
    const extraFields = ['freight', 'insurance', 'duties', 'otherCosts'];
    if (extraFields.flatMap(field=>[field,field+'PerKg']).some(field => Object.hasOwn(input, field) && (input[field] == null || !Number.isFinite(input[field]) || input[field] < 0 || input[field] > 1e12))) {
        return { available: false, reason: 'Un gasto no está expresado como importe válido; un porcentaje necesita su base de cálculo.' };
    }
    const sellableKg = input.purchasedKg * (1 - input.shrinkFraction);
    const purchaseCost = input.purchasedKg * input.buyPricePerKg;
    const extraCost = extraFields.reduce((sum, field) => sum + (input[field] || 0) + (input[field+'PerKg'] || 0)*input.purchasedKg, 0);
    const totalCost = purchaseCost + extraCost;
    const revenue = sellableKg * input.sellPricePerKg;
    const profit = revenue - totalCost;
    if([sellableKg,purchaseCost,totalCost,revenue,profit].some(value=>!Number.isFinite(value) || Math.abs(value)>Number.MAX_SAFE_INTEGER/100))return {available:false,reason:'Los importes exceden el rango admitido para conservar precisión monetaria.'};
    return { available: true, perKgBasis, inputs: { ...input }, sellableKg, purchaseCost, extraCost, totalCost, revenue, profit,
        costPerSellableKg: totalCost / sellableKg, profitPerKg: profit / sellableKg,
        marginOnSalePercent: profit / revenue * 100, markupOnCostPercent: totalCost > 0 ? profit / totalCost * 100 : null,
        excluded: extraFields.filter(field => !Object.hasOwn(input, field) && !Object.hasOwn(input,field+'PerKg')) };
}
function wantsCommercialCalculation(message) {
    return /\b(?:margen|rentabilidad|ganancia|utilidad|costo (?:puesto|vendible|total)|punto de equilibrio|recalcula)\b/.test(normalizeForIntent(message));
}
function commercialReply(calculation,{brief=false,maxWords=null,previous=null}={}) {
    if (!calculation.available) {
        const labels = { purchasedKg:'el peso comprado en kg', buyPricePerKg:'el precio de compra por kg', sellPricePerKg:'el precio de venta por kg', shrinkFraction:'la merma comercial en porcentaje', currency:'la moneda' };
        return `${calculation.reason} No sustituyo tus condiciones por una cotización de otro mercado.\n\n${calculation.missing?.length ? `¿Cuál es ${labels[calculation.missing[0]]}?` : '¿Puedes confirmar esa condición del lote?'}`;
    }
    const format = value => Number(value).toLocaleString('es-MX', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const currency = calculation.inputs.currency;
    const markup=calculation.markupOnCostPercent==null?'no definido (costo cero)':format(calculation.markupOnCostPercent)+'%';
    if(brief && maxWords && maxWords<20)return maxWords<7?`${format(calculation.marginOnSalePercent)}%`:`Margen provisional: ${format(calculation.marginOnSalePercent)}% sobre venta, con los supuestos indicados.`;
    if(calculation.perKgBasis){
        if(brief)return `Con tus supuestos por kg, el costo vendible es ${format(calculation.costPerSellableKg)} ${currency}/kg, el margen sobre venta es ${format(calculation.marginOnSalePercent)}% y el recargo sobre costo es ${markup}; el volumen total no está indicado.`;
        return `**Margen provisional por kg vendible: ${format(calculation.marginOnSalePercent)}% sobre venta.**\n\n| Concepto | Resultado |\n| --- | --- |\n| Costo por kg vendible | ${format(calculation.costPerSellableKg)} ${currency}/kg |\n| Resultado por kg vendible | ${format(calculation.profitPerKg)} ${currency}/kg |\n| Recargo sobre costo | ${markup} |\n| Equilibrio por kg vendible | ${format(calculation.costPerSellableKg)} ${currency}/kg |\n\nCalculado por unidad: costo por kg comprado / (1 − merma). El cálculo por unidad permite obtener estos porcentajes sin conocer el tamaño del lote. Sin volumen no se calcula utilidad total; si existen gastos fijos del lote, hacen falta su importe y el peso para repartirlos. Los gastos no indicados quedan excluidos y los supuestos no son cotizaciones actuales.`;
    }
    const comparison=previous?.available && !previous.perKgBasis && previous.inputs.currency===currency && previous.profit!==calculation.profit
        ? `\n\n**Cambio frente al cálculo anterior:** resultado de ${format(previous.profit)} a ${format(calculation.profit)} ${currency}; diferencia ${format(calculation.profit-previous.profit)} ${currency}, manteniendo las demás condiciones del ejercicio.` : '';
    if(brief)return `Con tus supuestos, el resultado provisional del lote es ${format(calculation.profit)} ${currency}, con un margen de ${format(calculation.marginOnSalePercent)}% sobre venta y equilibrio en ${format(calculation.costPerSellableKg)} ${currency}/kg vendible; no incluye gastos no indicados.`;
    return `**Margen calculado con tus condiciones: ${format(calculation.marginOnSalePercent)}% sobre venta.**\n\n`
        + `| Concepto | Resultado |\n| --- | --- |\n| Kg vendibles después de merma | ${format(calculation.sellableKg)} kg |\n`
        + `| Costo total del lote | ${format(calculation.totalCost)} ${currency} |\n| Costo por kg vendible | ${format(calculation.costPerSellableKg)} ${currency}/kg |\n`
        + `| Ingreso por venta | ${format(calculation.revenue)} ${currency} |\n| Resultado del lote | ${format(calculation.profit)} ${currency} |\n`
        + `| Margen por kg vendible | ${format(calculation.profitPerKg)} ${currency}/kg |\n\n`
        + `Recargo sobre costo: ${markup}.\n\n`
        + `**Para decidir:** tu punto de equilibrio con estos costos es ${format(calculation.costPerSellableKg)} ${currency}/kg vendible. Si la compra aumenta 1 ${currency}/kg y todo lo demás permanece igual, el resultado del lote disminuye ${format(calculation.inputs.purchasedKg)} ${currency}; si la venta aumenta 1 ${currency}/kg vendible, aumenta ${format(calculation.sellableKg)} ${currency}. Es sensibilidad matemática, no un pronóstico de precios.\n\n`
        + `Cálculo: ${format(calculation.inputs.purchasedKg)} kg × (1 − ${format(calculation.inputs.shrinkFraction * 100)}%) = ${format(calculation.sellableKg)} kg vendibles; costo total / kg vendibles = costo vendible. Margen sobre venta = resultado / ingreso.\n\n`
        + `Son condiciones aportadas por ti, no cotizaciones verificadas. ${calculation.inputs.currencySource === 'company_preference' ? 'La moneda se tomó de tu perfil comercial. ' : ''}La merma comercial no equivale al rendimiento de sacrificio. Los gastos por kg se aplican al peso comprado. ${calculation.excluded.length ? 'Los gastos no indicados (seguro, impuestos u otros costos) no se incorporaron; el resultado es provisional.' : 'No incluye gastos adicionales a los importes indicados.'}`+comparison;
}
module.exports = { parseCommercialInputs, calculateMargin, wantsCommercialCalculation, commercialReply,parseCommercialNumber:number };
