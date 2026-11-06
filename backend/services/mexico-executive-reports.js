'use strict';
const catalog=require('../../shared/mexico-state-production.json');
const {createHash}=require('node:crypto');
const store=require('./mexico-report-store');
const {nextReportRefreshAt}=require('../lib/report-schedule');
const {normalizeReport}=require('./user-report-store');
const {enrichSectorReport}=require('../lib/report-sector-format');
const {withPreviousDailyEvidence}=require('../lib/report-daily-evidence');
const format=value=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(value);
const finite=value=>typeof value==='number' && Number.isFinite(value);
const safeUrl=value=>{try {const url=new URL(value);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password && url.href.length<=440 ? url.href : '';} catch {return '';}};
const isoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const cadenceLabel=value=>({daily:'diaria',weekly:'semanal','weekly-ai':'semanal con verificación asistida',monthly:'mensual',annual:'anual',auction:'por subasta'})[value] || 'sin frecuencia declarada';
function proteinReferenceLabel(parts) {
    const label=parts.join(' · ');
    if(label.length<=140)return label;
    // Keep the complete market identity in a stable suffix. The tables retain
    // the full presentation, markets and publisher; none of their text is cut.
    const identity=createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,20);
    return parts.slice(0,3).join(' · ').slice(0,112)+' · ref. '+identity;
}
function annualPoints(item,year) {
    const points=new Map(),conflicts=new Set();
    for(const point of [...(Array.isArray(item.series) ? item.series : []),{period:item.period,value:item.value}]) {
        if(!/^\d{4}$/.test(point?.period || '') || Number(point.period)>year || !finite(point.value)) continue;
        if(points.has(point.period) && points.get(point.period)!==point.value) conflicts.add(point.period);
        points.set(point.period,point.value);
    }
    return [...points].filter(([period])=>!conflicts.has(period)).sort(([a],[b])=>a.localeCompare(b)).slice(-8).map(([period,value])=>({period,value}));
}
function edition(key,title,generatedAt,body) {
    return {...normalizeReport({title,eyebrow:'México · Informe nacional',generatedAt,...body}),userEdition:false,collection:'mexico',key};
}
function buildMexicoReports({macro,bmv,proteins,sourceErrors=[]},time=new Date()) {
    const generatedAt=time.toISOString(),today=generatedAt.slice(0,10);
    const sourceLabels={macro:'indicadores macroeconómicos',bmv:'Bolsa México',proteins:'proteínas físicas'};
    const warnings=sourceErrors.length ? ['Fuentes pendientes en este corte: '+sourceErrors.map(key=>sourceLabels[key] || key).join(', ')+'. Las cifras faltantes no se estiman.'] : [];
    const indicators=(macro?.indicators || []).filter(item=>finite(item.value) && /^\d{4}$/.test(item.period) && Number(item.period)<=time.getUTCFullYear());
    const quotes=(bmv?.bmv || []).filter(item=>finite(item.price) && item.price>0 && (item.type==='currency' || typeof item.currency==='string') && Number.isFinite(Date.parse(item.observedAt)) && Date.parse(item.observedAt)<=time.getTime() && safeUrl(item.sourceUrl));
    const fx=quotes.find(item=>item.type==='currency');
    const dailyQuotes=quotes.map(item=>({label:item.name,unit:item.type==='currency' ? 'MXN por 1 USD' : item.currency+' por acción',points:[...(item.series || []),{date:item.observedAt,value:item.price}]}));
    const macroLinks=indicators.map(item=>({label:item.source+' · '+item.label,url:safeUrl(item.url)})).filter(item=>item.url);
    const annual=indicators.slice(0,6).map(item=>({item,points:annualPoints(item,time.getUTCFullYear())}));
    const stocks=quotes.filter(item=>item.type==='stock' && item.currency==='MXN');
    const changes=stocks.filter(item=>finite(item.previousPrice) && item.previousPrice>0).map(item=>({...item,change:(item.price/item.previousPrice-1)*100}));
    const overview=edition('mx_overview','Panorama nacional de México',generatedAt,{
        dailyReferences:dailyQuotes,
        objective:'Preparar la revisión de demanda, exposición cambiaria y abastecimiento en México con los periodos disponibles.',
        takeaways:[indicators.length ? `El corte reúne ${indicators.length} ${indicators.length===1 ? 'indicador estructural anual' : 'indicadores estructurales anuales'}; el periodo debe acompañar cualquier comparación.` : 'Falta evidencia macroeconómica utilizable; solicitar la actualización de la fuente antes de construir escenarios cuantitativos.','Antes de comprometer compras, vincular moneda, origen y destino con flete, plazo y disponibilidad de la empresa.'],
        summary:indicators.length ? `${indicators[0].label}: ${format(indicators[0].value)} ${indicators[0].unit}, periodo ${indicators[0].period}. Esta referencia aporta contexto estructural para revisar demanda y abastecimiento en México; no describe la sesión actual. Para presupuestar operaciones, contrastar el periodo de cada indicador con las condiciones vigentes de la empresa.` : 'No se recuperaron indicadores macroeconómicos utilizables. La revisión de demanda y abastecimiento requiere completar evidencia anual con las condiciones vigentes de la empresa; el corte no permite una conclusión cuantitativa.',
        metrics:indicators.map(item=>({label:item.label,value:format(item.value)+' '+item.unit,change:'Periodo '+item.period})),
        visuals:annual.filter(({points})=>points.length).map(({item,points})=>({type:'bar',title:item.label+' · observaciones anuales',unit:item.unit,bars:points.map(point=>({label:point.period,value:point.value})),note:`${item.source}. Periodos observados: ${points.map(point=>point.period).join(', ')}. Cada gráfica mantiene su propia unidad y escala. ${points.length>1 ? 'Los años sin dato se omiten; no se interpolan valores.' : 'Sólo hay una observación utilizable; no se infiere una tendencia.'} Son datos anuales, no de la sesión actual.`})),
        sections:[{heading:'Economía y comercio',text:'Los indicadores del Banco Mundial describen estructura económica y comercio exterior. Úsalos junto con condiciones comerciales verificadas de tu empresa. Una cifra anual no describe por sí sola la sesión actual ni una cotización de proveedor.'},{heading:'Decisiones de abastecimiento',text:'Relaciona el origen de la mercancía, la moneda de compra, la presentación y el destino. Confirma flete, plazo, sanidad y disponibilidad antes de comparar ofertas de res, cerdo, pollo o huevo.'},{heading:'Cobertura del corte',text:indicators.length ? `${indicators.length} ${indicators.length===1 ? 'indicador anual disponible' : 'indicadores anuales disponibles'}. ${macro?.stale ? 'Se conserva el último corte recuperado; la fuente no respondió a la actualización.' : 'Cada indicador conserva su periodo de observación.'}` : 'La fuente macroeconómica no devolvió observaciones utilizables en este corte.'}],
        tables:indicators.length ? [{title:'Indicadores estructurales',columns:['Indicador','Valor','Unidad','Periodo','Fuente'],rows:indicators.map(item=>[item.label,format(item.value),item.unit,item.period,item.source])},{title:'Observaciones anuales de las gráficas',note:'Valores publicados por la fuente, sin completar años faltantes. Cada indicador mantiene su unidad; no se suman ni comparan niveles de unidades distintas.',columns:['Indicador','Periodo','Valor','Unidad','Fuente'],rows:annual.flatMap(({item,points})=>points.map(point=>[item.label,point.period,format(point.value),item.unit,item.source]))}] : [],
        watchlist:[...warnings,'No convertir datos anuales en pronósticos ni confundir la fecha del informe con la observación.'],sourceLinks:macroLinks,closing:'Contrastar los datos del corte con las necesidades y restricciones de la empresa.'
    });
    const bolsa=edition('mx_bolsa','Bolsa México y tipo de cambio',generatedAt,{
        dailyReferences:dailyQuotes,
        objective:'Distinguir la referencia bursátil y cambiaria de las condiciones financieras efectivas de la empresa.',
        takeaways:[fx ? `USD/MXN: ${format(fx.price)} MXN/USD, observado en ${fx.observedAt}; validar la tasa negociable y las comisiones antes de presupuestar.` : 'No hay un tipo de cambio utilizable en el corte; obtener una referencia con fecha, fuente y condiciones bancarias.','La muestra bursátil sirve para seguimiento financiero; no sustituye precios de proteínas ni cotizaciones de proveedores.'],
        closing:'Definir moneda, importe y fecha de la exposición antes de evaluar su efecto en tesorería. Confirmar el siguiente cierre y la tasa aplicable con las fuentes y la entidad financiera.',
        summary:quotes.length ? `${quotes.length} referencias recuperadas de la muestra de emisoras mexicanas y tipo de cambio. Son cotizaciones de mercado, no precios físicos de proteínas ni el universo completo de la BMV.` : 'No se recuperaron cotizaciones con valor, fecha y fuente completos. La falta de respuesta no significa que el mercado carezca de precios.',
        metrics:quotes.slice(0,16).map(item=>({label:item.name,value:format(item.price)+' '+(item.type==='currency' ? 'MXN/USD' : item.currency),change:finite(item.previousPrice) && item.previousPrice>0 ? format((item.price/item.previousPrice-1)*100)+' % vs. cierre de referencia' : 'Variación no disponible'})),
        visuals:[...(stocks.length ? [{type:'bar',title:'Emisoras mexicanas · precio por acción',unit:'MXN por acción',bars:stocks.map(item=>({label:item.name,value:item.price})),note:'Muestra de acciones cotizadas en MXN, con las fechas individuales de la tabla. Excluye USD/MXN y activos en otras monedas. El precio por acción no mide tamaño, rentabilidad ni valoración relativa de las empresas.'}] : []),...(changes.length ? [{type:'bar',title:'Emisoras mexicanas · variación contra referencia',unit:'%',bars:changes.map(item=>({label:item.name,value:item.change})),note:'Cálculo: (precio / cierre de referencia - 1) x 100. La tabla conserva ambas cifras y la fecha observada. La referencia del proveedor puede anteceder a la última sesión; no se presenta como rendimiento diario. No se incluyen activos sin base positiva.'}] : [])],
        sections:[{heading:'Lectura de mercado',text:'La muestra incluye empresas listadas en México. Una cotización bursátil representa una acción y debe interpretarse con su moneda y fecha; no equivale al precio de su producto.'},{heading:'Exposición cambiaria',text:fx ? `La referencia recuperada para USD/MXN es ${format(fx.price)} MXN/USD, observada en ${fx.observedAt}. No incluye comisiones bancarias ni la tasa que negociará tu empresa.` : 'No hay una referencia cambiaria utilizable en este corte. Confirma la tasa aplicable antes de presupuestar importaciones.'}],
        tables:quotes.length ? [{title:'Muestra de mercado mexicano',columns:['Activo','Precio','Unidad','Fecha de observación','Fuente'],rows:quotes.map(item=>[item.name,format(item.price),item.type==='currency' ? 'MXN/USD' : item.currency,item.observedAt,'Yahoo Finance'])},...(changes.length ? [{title:'Respaldo de variaciones bursátiles',note:'Cálculo contra el cierre de referencia entregado por el proveedor, que puede anteceder a la última sesión. No es una serie histórica ni un rendimiento diario confirmado.',columns:['Emisora','Precio (MXN)','Cierre de referencia (MXN)','Variación (%)','Fecha observada'],rows:changes.map(item=>[item.name,format(item.price),format(item.previousPrice),format(item.change),item.observedAt])}] : [])] : [],
        sourceLinks:quotes.map(item=>({label:'Yahoo Finance · '+item.symbol,url:item.sourceUrl})),watchlist:[...warnings,'Las cotizaciones pueden corresponder al último cierre disponible. Confirmar moneda, comisiones y vigencia antes de utilizarlas.']
    });
    const species=[['pork','Cerdo','MXN/kg vivo','Ganado en pie'],['beef','Res','MXN/kg vivo','Ganado en pie'],['chicken','Pollo','MXN/kg','Mayoreo'],['egg','Huevo','MXN/kg','Mayoreo']];
    const links=new Map();
    const proteinVisuals=[];
    const proteinTables=species.map(([id,name,,stage])=>{
        const group=proteins?.prices?.[id] || {};
        const valid=(group.states || []).filter(row=>finite(row.price) && row.price>0 && isoDate(row.date) && row.date<=today);
        const states=new Map(valid.map(row=>[row.state,row]));
        // Comparar sólo referencias de la misma presentación, unidad, fecha y
        // frecuencia. El grupo más amplio se grafica; la tabla conserva todo.
        const cohorts=new Map();
        for(const {state} of catalog.STATE_GRAIN_PRODUCTION) {
            const row=states.get(state);if(!row) continue;
            const basis=row.level || row.basis || group.level || stage;
            const unit=row.unit || (/canal/i.test(basis) ? 'MXN/kg canal' : /pie|vivo/i.test(basis) ? 'MXN/kg vivo' : 'MXN/kg');
            const period=row.cadence==='monthly' ? row.date.slice(0,7) : row.date;
            const key=JSON.stringify([basis,unit,period,row.cadence || 'sin frecuencia declarada']);
            if(!cohorts.has(key)) cohorts.set(key,{basis,unit,period,cadence:row.cadence || 'sin frecuencia declarada',rows:[]});
            cohorts.get(key).rows.push({label:state,value:row.price});
        }
        const cohort=[...cohorts.values()].sort((a,b)=>b.rows.length-a.rows.length || b.period.localeCompare(a.period))[0];
        if(cohort) proteinVisuals.push({type:'bar',title:name+' · precios estatales comparables',unit:cohort.unit,bars:[...cohort.rows].sort((a,b)=>b.value-a.value).slice(0,10),note:`${cohort.basis}. Periodo: ${cohort.period}; frecuencia: ${cadenceLabel(cohort.cadence)}. Grupo con más entidades comparables: ${cohort.rows.length}; se muestran hasta diez, ordenadas por precio. El resto de referencias, presentaciones y fechas permanece en las tablas. No es un promedio nacional ni una oferta de proveedor.`});
        return {title:name+' · referencias estatales',note:'Resumen por entidad del conector: puede agrupar plazas. El dato mensual se identifica como mensual. No disponible significa ausencia de un registro utilizable; no es un precio de cero.',columns:['Estado','Precio / unidad','Etapa / presentación','Plazas incluidas','Periodo del dato','Fuente'],rows:catalog.STATE_GRAIN_PRODUCTION.map(({state})=>{
            const row=states.get(state);
            if(!row) return [state,'No disponible',group.level || stage,'—','—','—'];
            const url=safeUrl(row.sourceUrl || row.sourceUrls?.[0] || row.url || group.sourceUrl || (id==='pork' ? 'https://www.porcicultura.com/economia/precios-del-cerdo-en-pie-en-mexico' : 'https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/'));
            if(url && links.size<40) links.set(url,{label:row.source || (id==='pork' ? 'Porcicultura.com' : 'SNIIM'),url});
            const period=row.cadence==='monthly' ? row.date.slice(0,7)+' (mensual)' : row.date+(/weekly/.test(row.cadence || '') ? ' (fuente semanal)' : '');
            const basis=row.level || row.basis || group.level || stage;
            const priceUnit=row.unit || (/canal/i.test(basis) ? 'MXN/kg canal' : /pie|vivo/i.test(basis) ? 'MXN/kg vivo' : 'MXN/kg');
            return [state,format(row.price)+' '+priceUnit,basis,(row.markets || [row.market || 'Referencia estatal']).join('; '),period,(row.source || (id==='pork' ? 'Porcicultura.com' : 'SNIIM'))+' · '+url];
        })};
    });
    const coverageRows=proteinTables.map(table=>{
        const available=table.rows.filter(row=>row[1]!=='No disponible');
        const periods=[...new Set(available.map(row=>row[4]))].sort();
        return [table.title.replace(' · referencias estatales',''),String(available.length),String(32-available.length),periods.join('; ') || 'Sin periodo disponible',[...new Set(available.map(row=>row[2]))].join('; ') || 'Sin etapa verificada',available.some(row=>/mensual/.test(row[4])) ? 'Incluye periodo mensual; no es precio diario' : 'Ver fechas y frecuencia de cada fuente'];
    });
    const proteinsReport=edition('mx_proteins','Proteínas en México por estado',generatedAt,{
        dailyReferences:species.flatMap(([id,name,defaultUnit,stage])=>{
            const group=proteins?.prices?.[id] || {};
            return catalog.STATE_GRAIN_PRODUCTION.map(({state})=>{
                const row=group.states?.find(item=>item.state===state),basis=row?.level || row?.basis || group.level || stage;
                const unit=row?.unit || (/canal/i.test(basis) ? 'MXN/kg canal' : /pie|vivo/i.test(basis) ? 'MXN/kg vivo' : defaultUnit);
                const markets=(row?.markets || [row?.market || 'Referencia estatal']).join('; ');
                return {label:proteinReferenceLabel([name,state,basis,markets,row?.source || group.source || (id==='pork' ? 'Porcicultura.com' : 'SNIIM')]),unit,points:row && !/monthly|weekly|annual/.test(row.cadence || '') ? [{date:row.date,value:row.price}] : []};
            });
        }),
        objective:'Identificar referencias comparables para compras de res, cerdo, pollo y huevo por entidad y etapa comercial.',
        takeaways:[...proteinTables.map(table=>`${table.title.replace(' · referencias estatales','')}: ${table.rows.filter(row=>row[1]!=='No disponible').length} de 32 entidades con dato utilizable; revisar plaza, presentación y periodo en el detalle.`),'Solicitar cotización de proveedor con volumen, destino, vigencia y flete antes de cerrar una compra; las referencias estatales no son ofertas para la empresa.'],
        closing:'Preparar la comparación de proveedores únicamente con la misma especie, presentación, etapa, unidad y periodo. Completar las plazas sin dato con evidencia local antes de decidir, sin trasladar precios de otras entidades.',
        summary:'Res, cerdo, pollo y huevo por entidad, con su presentación, etapa comercial, periodo y fuente. La cobertura incluye todas las entidades y señala los registros faltantes.',
        metrics:proteinTables.map(table=>({label:table.title.replace(' · referencias estatales',''),value:table.rows.filter(row=>row[1]!=='No disponible').length+' de 32 entidades',change:'Cobertura del corte'})),
        sections:[{heading:'Cómo comparar referencias',text:'Cerdo y res pueden corresponder a ganado en pie; pollo y huevo se publican al mayoreo. Cada fila conserva la etapa indicada por su fuente. No compares kg vivo con kg de canal o cortes ni kg de huevo con docenas.'},{heading:'Vigencia y cobertura',text:'Los registros pueden tener frecuencias y fechas distintas. Un dato mensual no es el precio diario actual. El resumen estatal puede agrupar plazas y tipos; confirma una oferta con tu proveedor para la presentación y destino requeridos.'}],
        visuals:[...proteinVisuals,{type:'bar',title:'Cobertura de referencias estatales por proteína',unit:'entidades con dato utilizable',note:'De 32 entidades por especie. Cero significa que no se recuperó una referencia utilizable, no un precio de cero ni ausencia de producción. Esta gráfica mide cobertura; no compara precios de distintas etapas.',bars:coverageRows.map(row=>({label:row[0],value:Number(row[1])}))}],
        tables:[...proteinTables,{title:'Cobertura y comparabilidad de las proteínas',note:'Conteos calculados sobre las referencias estatales de este corte. Las etapas y periodos pueden diferir; no se calcula un precio nacional a partir de ellos.',columns:['Proteína','Entidades con dato','Entidades sin dato','Periodos recuperados','Etapas declaradas','Frecuencia / alcance'],rows:coverageRows}],sourceLinks:[...links.values()],watchlist:[...warnings,'Las entidades sin dato no se completan con precios de otros estados.','La referencia estatal no es una cotización comercial para la empresa.']
    });
    const grains=catalog.STATE_GRAIN_PRODUCTION,mining=catalog.STATE_MINING_PRODUCTION;
    const crops=[['corn','Maíz'],['wheat','Trigo'],['sorghum','Sorgo'],['soy','Soya']];
    const cropConcentration=crops.map(([key,name])=>{
        const available=grains.filter(row=>finite(row[key]) && row[key]>=0),ordered=[...available].sort((a,b)=>b[key]-a[key]);
        const total=available.reduce((sum,row)=>sum+row[key],0),top=ordered.slice(0,3),topVolume=top.reduce((sum,row)=>sum+row[key],0);
        return [name,format(total),String(available.length),top.map(row=>row.state).join(', '),format(topVolume),total>0 ? format(topVolume/total*100)+' %' : 'No calculable'];
    });
    const production=edition('mx_production','Producción estatal: granos y minería',generatedAt,{
        dailyReferences:[...crops.map(([,name])=>({label:name+' · producción',unit:'toneladas',points:[]})),{label:'Minería · valor de producción',unit:'MXN',points:[]}],
        objective:'Identificar concentración territorial de la producción histórica y la información necesaria para evaluar abastecimiento.',
        takeaways:[`Granos: cierre ${catalog.GRAIN_SOURCE.period}; minería: ${catalog.MINING_SOURCE.period}. Los periodos describen producción histórica, no precios actuales.`,'Para priorizar orígenes de compra, contrastar volumen registrado con cosecha, calidad, inventario y costo logístico disponibles.'],
        closing:'Definir los orígenes a evaluar y solicitar disponibilidad comercial vigente. Usar la producción histórica como contexto territorial, sin tratarla como inventario vendible ni pronóstico de oferta.',
        summary:`Producción agrícola del cierre ${catalog.GRAIN_SOURCE.period} y valor minero estatal de ${catalog.MINING_SOURCE.period}. Son series históricas de producción, no cotizaciones ni estimaciones del año actual.`,
        metrics:crops.map(([key,name])=>({label:name+' · volumen registrado',value:format(grains.reduce((sum,row)=>sum+(finite(row[key]) ? row[key] : 0),0))+' toneladas',change:'Cierre '+catalog.GRAIN_SOURCE.period})),
        visuals:[...crops.map(([key,name])=>({type:'bar',title:name+' · mayores volúmenes registrados',unit:'toneladas',note:'Cierre '+catalog.GRAIN_SOURCE.period+'. Selección de los diez mayores registros; el resto se conserva en la tabla estatal. No representa inventario comercial disponible.',bars:[...grains].filter(row=>finite(row[key]) && row[key]>0).sort((a,b)=>b[key]-a[key]).slice(0,10).map(row=>({label:row.state,value:row[key]}))})),{type:'bar',title:'Minería · ocho mayores valores estatales',unit:'MXN',note:'Periodo '+catalog.MINING_SOURCE.period+'. Valor de producción registrado, no cotización de minerales. El universo estatal completo se conserva en la tabla.',bars:[...mining].filter(row=>finite(row.value)).sort((a,b)=>b.value-a.value).slice(0,8).map(row=>({label:row.state,value:row.value}))}],
        tables:[{title:'Granos por entidad · '+catalog.GRAIN_SOURCE.period,columns:['Estado','Maíz (t)','Trigo (t)','Sorgo (t)','Soya (t)'],rows:grains.map(row=>[row.state,...crops.map(([key])=>finite(row[key]) ? format(row[key]) : 'Sin producción reportada')])},{title:'Valor minero por entidad · '+catalog.MINING_SOURCE.period,columns:['Estado','Valor (MXN)','Participación (%)','Minerales'],rows:mining.map(row=>[row.state,format(row.value),format(row.share),row.minerals])},{title:'Concentración de los volúmenes agrícolas registrados',note:'Cálculo sobre las entidades con volumen numérico en el catálogo del cierre '+catalog.GRAIN_SOURCE.period+'. La participación de las tres mayores se divide entre la suma disponible para cada cultivo; no mide dependencia de proveedores ni disponibilidad actual.',columns:['Cultivo','Total registrado (t)','Entidades con volumen','Tres mayores entidades','Volumen de las tres (t)','Participación en el total disponible'],rows:cropConcentration}],
        sections:[{heading:'Producción y abastecimiento',text:'El cierre agrícola permite identificar concentración regional del volumen registrado. Para decisiones de compra, añade cosecha, calidad, inventario disponible y logística. Sin producción reportada indica que el cultivo no aparece en el archivo; no se rellena con cero.'},{heading:'Concentración territorial del suministro histórico',text:cropConcentration.map(row=>`${row[0]}: ${row[3]} reúnen ${row[5]} del volumen numérico registrado en el catálogo, con ${row[4]} toneladas de ${row[1]} toneladas disponibles para el cálculo.`).join('\n\n')+'\n\nEsta concentración histórica ayuda a identificar orígenes que requieren seguimiento. Para valorar continuidad de suministro de tu empresa, contrastar su cartera real de proveedores, inventario, cosecha y rutas logísticas; el catálogo no acredita esas exposiciones.'},{heading:'Alcance de minería',text:'El valor minero estatal reúne minerales metálicos y no metálicos concesibles del anuario. No equivale a una cotización internacional de oro, plata o cobre.'}],
        sourceLinks:[{label:catalog.GRAIN_SOURCE.label,url:catalog.GRAIN_SOURCE.url},{label:catalog.MINING_SOURCE.label,url:catalog.MINING_SOURCE.url}],watchlist:['Los periodos agrícola y minero son distintos; no presentarlos como el corte económico de hoy.']
    });
    return [overview,bolsa,proteinsReport,production].map(report=>enrichSectorReport(report,'mexico'));
}
function mergeSourceInput(current,previous,key) {
    if(!previous)return current;
    if(!current)return structuredClone(previous);
    const merge=(fresh,prior,identity,valid)=>{
        const values=new Map((prior || []).filter(valid).map(item=>[identity(item),{...item,quoteStatus:'preserved'}]));
        for(const item of fresh || [])if(valid(item))values.set(identity(item),item);
        return [...values.values()];
    };
    if(key==='macro')return {...current,indicators:merge(current.indicators,previous.indicators,item=>(item.id || item.label)+'|'+item.unit,item=>finite(item?.value))};
    if(key==='bmv')return {...current,bmv:merge(current.bmv,previous.bmv,item=>(item.symbol || item.name)+'|'+item.currency,item=>finite(item?.price)&&item.price>0)};
    const prices={...current.prices};
    for(const species of ['pork','beef','chicken','egg']){
        const fresh=current.prices?.[species],prior=previous.prices?.[species];
        if(!fresh && prior)prices[species]=structuredClone(prior);
        else if(fresh)prices[species]={...fresh,states:merge(fresh.states,prior?.states,item=>item.state,item=>finite(item?.price)&&item.price>0&&isoDate(item.date))};
    }
    return {...current,prices};
}
function createMexicoReports({reportStore=store,loaders={macro:()=>require('./mexico-macro').getMexicoMacro(),bmv:()=>require('../routes/market').getBmvMarket(),proteins:()=>require('../lib/sniim-first-sale-service').getFirstSalePrices()},now=()=>new Date(),sourceTimeoutMs=14000}={}) {
    let work;const pending=new Map();
    async function collect(key,load) {
        if(!pending.has(key)) {const promise=Promise.resolve().then(load).finally(()=>pending.delete(key));pending.set(key,promise);}
        let timer;
        try {return await Promise.race([pending.get(key),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Fuente pendiente')),sourceTimeoutMs);})]);}
        finally {clearTimeout(timer);}
    }
    function refresh() {
        if(work) return work;
        work=(async()=>{
            const entries=Object.entries(loaders),results=await Promise.allSettled(entries.map(([key,load])=>collect(key,load))),input={sourceErrors:[]};
            results.forEach((result,i)=>{const key=entries[i][0];if(result.status==='fulfilled') {input[key]=result.value;const usable=key==='macro' ? result.value?.indicators?.some(item=>finite(item.value)) : key==='bmv' ? result.value?.bmv?.some(item=>finite(item.price)) : Object.values(result.value?.prices || {}).some(product=>product.states?.some(row=>finite(row.price)));if(!usable) input.sourceErrors.push(key);} else input.sourceErrors.push(key);});
            const time=now(),previous=await reportStore.load().catch(()=>null);
            for(const key of ['macro','bmv','proteins'])input[key]=mergeSourceInput(input.sourceErrors.includes(key)?null:input[key],previous?.sourceInputs?.[key],key);
            const dependency={mx_overview:'macro',mx_bolsa:'bmv',mx_proteins:'proteins'};
            const reports=buildMexicoReports(input,time).map(report=>{
                const prior=previous?.reports?.find(item=>item.key===report.key),key=dependency[report.key],failed=key && input.sourceErrors.includes(key);
                const base=failed && prior ? prior : report;
                const preserved=failed && Boolean(prior || input[key]);
                const partial=key && (input[key]?.indicators || input[key]?.bmv || Object.values(input[key]?.prices || {}).flatMap(item=>item.states || [])).some(item=>item.quoteStatus==='preserved');
                return {...withPreviousDailyEvidence(base,prior),dataStatus:{state:preserved?'preserved':failed||partial?'partial':'updated',lastSuccessfulAt:preserved ? prior?.dataStatus?.lastSuccessfulAt || prior?.generatedAt || '' : time.toISOString(),attemptedAt:time.toISOString()}};
            });
            const expiresAt=input.sourceErrors.length ? new Date(time.getTime()+60000).toISOString() : nextReportRefreshAt(time).toISOString();
            return reportStore.save({reports,generatedAt:time.toISOString(),expiresAt,sourceErrors:input.sourceErrors,sourceInputs:Object.fromEntries(['macro','bmv','proteins'].filter(key=>input[key]).map(key=>[key,input[key]]))});
        })().finally(()=>{work=null;});
        return work;
    }
    async function get() {
        const snapshot=await reportStore.load();
        if(!snapshot)return refresh();
        const expired=!(Date.parse(snapshot.expiresAt)>now().getTime());
        // Opening the library must not depend on slow or unavailable providers.
        // Scheduled generation still awaits refresh() and checks original dates.
        if(expired)void refresh().catch(()=>console.warn('[mexico-reports] Actualización pendiente; se mantiene el último corte disponible.'));
        return {...snapshot,refreshing:expired,reports:snapshot.reports.map(report=>enrichSectorReport(expired ? {...report,dataStatus:{...report.dataStatus,state:'preserved',lastSuccessfulAt:report.dataStatus?.lastSuccessfulAt || report.generatedAt}} : report,'mexico'))};
    }
    return {get,refresh};
}
module.exports={buildMexicoReports,createMexicoReports,mexicoReports:createMexicoReports()};
