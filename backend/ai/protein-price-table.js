'use strict';

const { PRODUCTS } = require('../services/protein-market-intelligence');
const { stateName, stateFromMarket } = require('../services/mexico-price-scope');
const {matchesPresentation}=require('../services/local-commercial-prices');
const cell = value => String(value ?? '—').replace(/[|\r\n]/g, ' ');
const sourceLabel=record=>record.sourceShort || (record.sourceCode==='porcicultura_live_pork_prices' ? 'Porcicultura.com' : 'SNIIM');
const isSniim=record=>record.sourceCode==='sniim_mexico_protein_prices' || /^SNIIM/.test(record.source||'');
function priceText(record) {
    const amount = value => Number(value).toFixed(2);
    const price = record.priceType === 'reported_range'
        ? `${amount(record.rangeMin)}–${amount(record.rangeMax)} (rango)` : `${amount(record.value)}${record.productId === 'eggs' && record.countryCode === 'MX' && !record.commercialStage ? ' (frecuente)' : ''}`;
    const unit = String(record.unit || '');
    return `${price} ${cell(unit.includes(record.currency) ? unit : record.currency + ' / ' + unit)}`;
}

function matchingProteinRecords(profile, evidence) {
    const states = profile.mexicoStates || [];
    return (evidence.proteinPriceRecords || []).filter(record => record.verified
        && (!profile.countries?.length || profile.global || profile.countries.includes(record.countryCode))
        && profile.products.includes(record.productId)
        && (!record.commercialStage || matchesPresentation(record,profile))
        && (!states.length || record.countryCode === 'MX' && states.includes(record.stateCode || stateFromMarket(record.market)?.code))
        && (!profile.priceSource || (profile.priceSource === 'porcicultura' ? record.sourceCode === 'porcicultura_live_pork_prices' : isSniim(record)))
        && (!profile.commercialStages?.length || profile.commercialStages.includes(record.commercialStage || (record.priceBasis==='live' ? 'farm' : 'wholesale')))
        && (!profile.priceBasis || record.priceBasis === profile.priceBasis || profile.priceBasis==='retail' && record.commercialStage==='retail'
            || profile.priceBasis==='specific' && record.commercialStage && matchesPresentation(record,profile)));
}
function mexicoTableRecords(profile, evidence) {
    return matchingProteinRecords(profile,evidence).filter(record=>record.countryCode==='MX');
}
function proteinPriceTable(plan, evidence) {
    const profile=plan.proteinProfile,records=matchingProteinRecords(profile,evidence);
    const lines=[records.length ? '**Referencias de precios recuperadas.** Cada fila conserva su mercado, presentación y fecha; las unidades y etapas comerciales pueden ser distintas.'
        : '**No pude validar los precios solicitados en esta consulta.** Las noticias y enlaces de investigación no acreditan por sí solos un precio. Estos son los productos pendientes:', '',
        '| Producto / presentación | País / plaza | Precio / unidad | Fecha del dato | Fuente |',
        '| --- | --- | --- | --- | --- |'];
    for(const product of PRODUCTS.filter(item=>profile.products.includes(item.id))) {
        const observed=records.filter(record=>record.productId===product.id);
        for(const record of observed) lines.push(`| ${cell(product.name)} · ${cell(record.category)} | ${cell([record.country,record.market].filter(Boolean).join(' · '))} | ${priceText(record)} | ${cell(record.date)}${record.dateBasis==='catalog_update' ? ' · catálogo' : ''} | [${cell(record.source)}](${record.url}) |`);
        if(!observed.length)lines.push(`| ${product.name} | ${cell(profile.countries?.join(', ') || 'Sin plaza definida')} | Sin precio verificado | — | — |`);
    }
    if(records.length)lines.push('', 'La fecha es la observación publicada, no una actualización automática al día de hoy. No compares canal, animal en pie, cortes o docenas como si fueran el mismo producto; una referencia publicada tampoco confirma una oferta disponible para tu volumen.');
    lines.push('', !profile.countries?.length ? '¿En qué país necesitas estos precios?'
        : !profile.commercialStages?.length && !profile.priceBasis ? '¿Necesitas precio de productor, mayoreo o venta al público?'
            : 'Para los precios pendientes hace falta una publicación de la plaza y presentación solicitadas; no se completan con precios de otros mercados.');
    return lines.join('\n');
}
function mexicoPriceTable(plan, evidence) {
    const profile = plan.proteinProfile;
    const products = PRODUCTS.filter(product => profile.products.includes(product.id));
    const states = profile.mexicoStates || [];
    const records = mexicoTableRecords(profile,evidence);
    const coverage = evidence.proteinPrices?.coverage || [];
    const gaps = [];
    const scope = states.length === 32 ? 'México · 32 entidades' : states.length ? states.map(stateName).join(', ') : 'México';
    const sources = [...new Set(records.map(sourceLabel))];
    const stages=!!profile.commercialStages?.length || records.some(record=>record.commercialStage) || coverage.some(report=>report.stage);
    const stageText=record=>record.commercialStage==='retail' ? 'Venta al público' : record.commercialStage==='wholesale' ? 'Mayoreo · proveedor'
        : record.priceBasis==='live' ? 'En pie · referencia' : record.productId==='eggs' ? 'Mayoreo' : record.productId==='poultry' ? 'Distribución · entero' : 'Canal · rastro';
    const lines = [`**${scope}: últimas referencias comerciales recuperadas.**${sources.length ? ' Fuentes: '+sources.join(' y ')+'.' : ''} Cada fila corresponde a su plaza y categoría; son una muestra de registros, no un promedio nacional ni una oferta para tu empresa.`,
        '', stages ? '| Producto / presentación | Etapa | Plaza / establecimiento | Precio / unidad | Fecha / tipo de fecha | Fuente |' : '| Producto / presentación | Plaza | Precio / unidad | Fecha del dato | Fuente |',
        stages ? '| --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- |'];
    for (const state of states.length ? states : [null]) for (const product of products) {
        const observed = records.filter(record => record.productId === product.id && (!state || (record.stateCode || stateFromMarket(record.market)?.code) === state));
        if (!observed.length) {
            const reports = coverage.filter(item=>item.productId === product.id && item.stateCode === state);
            const report = reports[0];
            lines.push(`| ${product.name} |${stages ? ' Sin dato recuperado |' : ''} ${state ? stateName(state) : 'No recuperada'} | No disponible | — | ${report ? `[Ver reporte ${cell(report.source)}](${report.url})` : '—'} |`);
            for (const report of reports) gaps.push({product:product.name,state,report});
        }
        for (const record of observed) {
            const age = (Date.parse(evidence.proteinPrices?.fetchedAt)-Date.parse(record.date))/86_400_000;
            lines.push(`| ${cell(record.category)} |${stages ? ' '+stageText(record)+' |' : ''} ${cell(record.market)} | ${priceText(record)} | ${cell(record.date)}${record.dateBasis==='catalog_update' ? ' · catálogo' : record.commercialStage==='retail' ? ' · levantamiento' : ''}${age > 14 ? ' · dato rezagado' : ''} | [${sourceLabel(record)}](${record.url}) |`);
        }
        if(observed.length) for(const report of coverage.filter(item=>item.productId===product.id && item.stateCode===state && item.status!=='available')) gaps.push({product:product.name,state,report});
        if(stages && observed.length && !observed.some(record=>record.commercialStage==='retail')) {
            const report=coverage.find(item=>item.productId===product.id && item.stateCode===state && item.stage==='retail');
            if(report) lines.push(`| ${product.name} | Venta al público | ${state ? stateName(state) : 'Plaza pendiente'} | No disponible | — | [Consultar ${cell(report.source)}](${report.url}) |`);
        }
    }
    for (const city of profile.mexicoCities || []) lines.push('', `Ubicación solicitada: **${city.name}, ${stateName(city.stateCode)}**. El precio estatal publicado no es una cotización municipal; cada registro de rastro conserva su plaza.`);
    if (records.some(record=>record.sourceCode === 'porcicultura_live_pork_prices')) lines.push('', '**Porcicultura.com:** referencia estatal de cerdo en pie por kg vivo. No es precio de canal ni de cortes. Su fecha es la del registro publicado, no la de consulta.');
    if (/\bestimad[oa]/i.test(profile.query || '')) lines.push('', 'Las cifras de la tabla son referencias publicadas, no una estimación de precio local ni una conversión a canal.');
    if (records.some(isSniim)) lines.push('', 'SNIIM: cerdo y res en canal en rastro; pollo entero en centro de distribución; huevo blanco al mayoreo por kg, no docena. Los rangos son mínimo–máximo publicados; el huevo conserva su precio frecuente. La fecha del dato puede ser anterior a la consulta.');
    if(records.some(record=>record.commercialStage==='retail')) lines.push('', '**PROFECO · venta al público:** observaciones por establecimiento y presentación. La fecha corresponde al levantamiento; el precio puede cambiar. Los paquetes de huevo conservan su cantidad, sin tratarlos como kg.');
    if(records.some(record=>record.sourceCode==='dspc_wholesale_prices')) lines.push('', '**DSPC · mayoreo:** precios de lista públicos de un proveedor de Puebla/Cholula. La fecha es la actualización del catálogo, no una fecha de mercado. Las filas «desde N kg» requieren ese mínimo. Confirma existencia, peso real, flete y condiciones con el proveedor.');
    if(stages) lines.push('', 'Los cortes de pollo y res se identifican como cortes: no equivalen a pollo entero ni a carne en canal. Cada etapa conserva su fuente; no se estima mayoreo a partir del precio al público.');
    if (gaps.length) {
        lines.push('', '**Por qué faltan algunos precios:**');
        const grouped = new Map();
        for (const gap of gaps) {
            const key = `${gap.product}:${gap.report.source}:${gap.report.status}:${gap.report.url}`;
            if (!grouped.has(key)) grouped.set(key,{...gap,states:[]});
            if (gap.state) grouped.get(key).states.push(stateName(gap.state));
        }
        for (const {product,states,report} of grouped.values()) lines.push('', `${product}${states.length ? ' en '+states.join(', ') : ''}: ${report.status === 'source_error'
            ? 'el reporte no respondió correctamente; no se pudo comprobar su cobertura.'
            : report.status === 'partial_source_error' ? 'parte de los reportes no respondió; los consultados no aportaron el precio solicitado. La cobertura quedó incompleta.'
            : report.status === 'no_state_records' ? 'el reporte respondió y contiene otras plazas, pero no devolvió un registro local utilizable en el periodo consultado.'
                : report.status === 'not_queried' ? 'esta plaza no se consultó: la muestra de venta al público se limita a cuatro ciudades por consulta.'
                    : report.status === 'no_city_records' ? 'el catálogo público no identificó la ciudad solicitada; no se usaron observaciones de otro municipio como sustituto.'
                        : 'el reporte no aportó registros utilizables para esta consulta.'} Periodo consultado: ${report.period?.start || 'sin confirmar'} a ${report.period?.end || 'sin confirmar'}. [Consultar ${cell(report.source)}](${report.url}).`);
        lines.push('', 'Esto no significa que no haya producto a la venta. Para obtener el precio faltante se necesita una oferta local fechada de la presentación solicitada o una fuente que publique esa plaza. Los precios de otros estados y los precios minoristas tienen un alcance distinto.');
    }
    const incomplete = [...new Map(coverage.filter(report=>report.failedReports > 0).map(report=>[report.productId+report.source,report])).values()];
    for (const report of incomplete) lines.push('', `Cobertura parcial de ${PRODUCTS.find(product=>product.id===report.productId)?.name || report.productId} (${cell(report.source)}): ${report.failedReports} de ${report.reports.length} reportes mensuales fallaron. Los precios recuperados conservan su fecha; el dato más reciente podría estar en un reporte pendiente.`);
    if (records.some(record=>(Date.parse(evidence.proteinPrices?.fetchedAt)-Date.parse(record.date))/86_400_000 > 14)) lines.push('', '«Dato rezagado» indica más de 14 días entre la observación publicada y esta consulta. No equivale a una oferta vigente.');
    lines.push('', 'No se extrapolan precios de otros estados por cercanía. Para estimar canal a partir de cerdo vivo hacen falta rendimiento de sacrificio/despiece, costos de transformación y flete; la merma de distribución no sustituye ese rendimiento. No recalculo tu margen de carne usando un precio por kg vivo.');
    if (!records.length) lines.push('', 'En esta consulta el conector no recuperó registros utilizables. La falta de datos no acredita que no existan cotizaciones.');
    return lines.join('\n');
}

module.exports = { mexicoPriceTable, mexicoTableRecords, matchingProteinRecords, proteinPriceTable, priceText };
