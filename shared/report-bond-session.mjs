import config from './report-bond-markets.json' with {type:'json'};
const finite=value=>typeof value==='number' && Number.isFinite(value);
const number=value=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:3}) : 'Sin dato';
const bp=value=>finite(value) ? `${value>0 ? '+' : ''}${number(Math.abs(value)<1e-9 ? 0 : value)} pb` : 'Sin comparación';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
function observations(input,cutoff,monthly=false) {
  const values=new Map(),conflicts=new Set();
  for(const point of input || []) {
    const date=String(point?.date || ''),time=Date.parse(date);
    if(monthly) {
      if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(date) || date>=new Date(cutoff).toISOString().slice(0,7) || !finite(point.value)) continue;
      if(values.has(date) && values.get(date)!==point.value) conflicts.add(date);
      values.set(date,point.value);continue;
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !finite(time) || new Date(time).toISOString().slice(0,10)!==date || time>cutoff || !finite(point.value)) continue;
    if(values.has(date) && values.get(date)!==point.value) conflicts.add(date);
    values.set(date,point.value);
  }
  return [...values].filter(([date])=>!conflicts.has(date)).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));
}
export function isBondSession(report) {
  const area=report?.baseReport?.collection || report?.collection;
  return (report?.baseReport?.key || report?.key)==='bonds' && (!area || area==='finance');
}
function readCauses(references,available,news,curve,day) {
  const lastDate=references.map(item=>item.last?.date).filter(Boolean).sort().at(-1);
  const earlier=news.filter(item=>lastDate && dayFormat.format(new Date(item.publishedAt))<=lastDate),later=news.filter(item=>!earlier.includes(item));
  const facts=earlier.slice(0,4).map(item=>`“${item.title}” (${item.source || 'Fuente del corte'}, ${item.publishedAt}). ${item.description || 'Sólo se dispone del titular.'}`);
  const evidence=earlier.map(item=>item.title+' '+item.description).join(' '),mechanisms=[];
  if(/inflaci[oó]n|tasas?|fed\b|banxico|banco central|empleo|crecimiento/i.test(evidence)) mechanisms.push('Inflación, actividad y política monetaria: un dato superior a lo esperado puede retrasar recortes o elevar la trayectoria esperada de tasas; el tramo corto puede subir. Un dato débil puede operar en sentido contrario. En el tramo largo también influyen inflación esperada y prima por plazo. Para atribuir el cambio al anuncio hay que comparar su sorpresa y la reacción posterior; una tasa de mercado puede cambiar sin una decisión del banco central.');
  if(/subasta|emisi[oó]n|d[eé]ficit|demanda|oferta|deuda/i.test(evidence)) mechanisms.push('Oferta y demanda de deuda: una colocación mayor o menor apetito por un vencimiento puede exigir una tasa superior; demanda más fuerte puede permitir una tasa inferior. Contrastar monto, demanda recibida, rendimiento de asignación y calendario de la subasta antes de afirmar que faltaron compradores.');
  if(/riesgo|refugio|conflicto|liquidez|geopol[ií]tic/i.test(evidence)) mechanisms.push('Riesgo y liquidez: compras de refugio pueden reducir rendimientos soberanos líquidos mientras aumenta el spread de emisores riesgosos. Una venta por necesidad de liquidez puede elevarlos. Un movimiento de Treasury no demuestra un cambio del riesgo de crédito mexicano o corporativo.');
  if(!mechanisms.length) mechanisms.push('Sin un detonante identificado, las causas siguen como hipótesis: revisar cambios en expectativas de tasas e inflación, demanda de subastas y prima por plazo. El mercado reacciona a la diferencia respecto a lo esperado; una noticia favorable ya descontada puede no reducir los rendimientos. Los niveles observados no permiten decidir cuál factor dominó.');
  const moves=available.map(item=>`${item.label}: ${bp(item.changeBp)} (${item.previous.date} a ${item.last.date}${item.cadence==='auction' ? ', entre publicaciones de subasta' : ''}).`).join(' ');
  const mexico=references.filter(item=>item.market==='México'),mxAvailable=mexico.filter(item=>finite(item.changeBp));
  const treasury10=available.find(item=>item.id==='UST-10Y' || item.symbol==='^TNX');
  const effects=[];
  const up=available.filter(item=>item.changeBp>1e-9).length,down=available.filter(item=>item.changeBp<-1e-9).length;
  if(up) effects.push(`${up} referencias subieron en rendimiento. Para bonos existentes de tasa fija, un mayor rendimiento exigido normalmente presiona el precio si se venden antes del vencimiento. Para una nueva inversión puede ofrecer una tasa mayor, con sus riesgos y plazo; la subida del rendimiento no es una ganancia del tenedor.`);
  if(down) effects.push(`${down} referencias bajaron en rendimiento. Esto puede apoyar el precio de bonos existentes de tasa fija, mientras reduce el ingreso al reinvertir vencimientos a tasas menores. El pago de un cupón fijo contratado no cambia por esa variación de mercado.`);
  if(!available.length) effects.push('Sin dos observaciones recientes no se cuantifica un efecto de esta sesión. La falta de dato no representa un rendimiento de cero.');
  effects.push('En financiamiento, el efecto pasa por moneda, referencia contractual, spread y fecha de revisión: deuda nueva o a tasa variable puede encarecerse si sube su referencia; una deuda fija vigente no modifica automáticamente su cupón. Más plazo suele implicar mayor sensibilidad al rendimiento, pero duración, cupón y opciones del bono determinan su magnitud.');
  if(treasury10) effects.push(`Ejemplo condicionado al movimiento de Treasury 10 años (${bp(treasury10.changeBp)}): una posición hipotética de USD 100,000 y duración modificada de 5 tendría un cambio aproximado de ${treasury10.changeBp>0 ? '-' : treasury10.changeBp<0 ? '+' : ''}USD ${number(Math.abs(100000*5*treasury10.changeBp/10000))}. Se supone un desplazamiento pequeño de rendimiento; no incorpora convexidad, intereses, spread ni divisa. La duración es un supuesto ilustrativo, no la duración medida de Treasury ni de una cartera.`);
  const local=mexico.length ? [{heading:'México: causas y repercusiones',body:mxAvailable.length ? `${mxAvailable.map(item=>item.label+': '+bp(item.changeBp)+' ('+item.previous.date+' a '+item.last.date+')').join('; ')}. Son cambios entre resultados de subastas, no variaciones diarias del precio de un bono. Revisar inflación, comunicación de Banxico, monto colocado y demanda de la misma subasta para investigar el detonante. Una tasa mayor puede elevar el rendimiento de una colocación nueva y el costo de fondeo; no modifica la tasa ya pactada de CETES comprados ni prueba un cambio de TIIE. Las referencias están en MXN y no se restan directamente de Treasury en USD como si fueran un spread de crédito.` : 'CETES conserva el último resultado de subasta con su fecha. Su frecuencia no es diaria: no se comparan dos subastas como una sesión ni se atribuye una causa del día a ese intervalo. Revisar monto colocado y demanda de la publicación antes de estimar el efecto sobre reinversión o fondeo; no sustituirlo por TIIE o tasa objetivo.'}] : [];
  return [
    {heading:'Qué pasó por plazo',body:moves || 'No hay dos observaciones recientes para medir el cambio por vencimiento.'},
    {heading:'Por qué pudo pasar',body:(facts.length ? facts.join('\n\n')+'\n\nEstos hechos son candidatos a contrastar: su fecha de publicación no prueba que precedieran a la valuación ni que causaran el cambio. CETES aporta sólo el nivel de su última subasta, fuera de la comparación diaria.' : 'Este corte no aporta una noticia fechada que confirme un detonante de las tasas mostradas. Revisar el anuncio original, la expectativa previa y la reacción del mismo mercado y periodo; no se atribuye el movimiento automáticamente a la Fed o a Banxico.')+(later.length ? '\n\nLas '+later.length+' noticias posteriores a la última fecha de tasas ('+(lastDate || 'sin dato')+') sirven para vigilar próximas publicaciones; no explican retroactivamente ese dato.' : '')},
    {heading:'Cómo se transmite a los bonos',body:mechanisms.join('\n\n')},
    {heading:'Qué explica la curva',body:curve ? `La pendiente Treasury 10 años menos 3 meses es ${bp(curve.current)} al ${curve.date}${finite(curve.change) ? ', con un cambio de '+bp(curve.change)+' frente al '+curve.previousDate : ''}. ${Math.abs(curve.current)<1e-9 ? 'Los extremos están al mismo nivel.' : curve.current>0 ? 'El plazo largo rinde más que el corto.' : 'El plazo corto rinde más que el largo: este tramo está invertido.'} ${finite(curve.change) ? Math.abs(curve.change)<1e-9 ? 'La pendiente no cambió entre las observaciones comunes.' : curve.change>0 ? 'La diferencia aumentó; comprobar si subió el largo o bajó el corto.' : 'La diferencia disminuyó; comprobar si bajó el largo o subió el corto.' : ''} La forma no predice por sí sola una recesión ni identifica la causa; también intervienen prima por plazo, oferta y demanda.` : 'No se calcula la pendiente 10 años–3 meses sin referencias de la misma base y fechas comunes recientes. Una tasa de descuento de letras y una tasa par no se tratan como si fueran equivalentes.'},
    ...local,
    {heading:'Qué consecuencias puede tener',body:effects.join('\n\n')},
    {heading:'Qué falta confirmar',body:`Contrastar anuncio, expectativas y hora de publicación con el periodo de cada tasa. Revisar subastas y primas por plazo; para crédito, añadir el spread de la contraparte. Para valorar una posición hacen falta precio, cupón, vencimiento, duración y moneda. El corte es ${day || 'sin fecha'}: no se proyecta el cambio observado hacia la siguiente sesión.`},
  ];
}
export function bondSessionReport(report,{t=value=>value,source=value=>value}={}) {
  const reverse=new Map(Object.entries(report.causeText || {}).map(([original,translated])=>[translated,original])),translate=value=>report.causeText?.[value] || t(value);
  const cutoff=Date.parse(report.generatedAt),day=finite(cutoff) ? dayFormat.format(new Date(cutoff)) : '',flags=report.personalization?.sections || {};
  const inputs=new Map(),observed=[report.bondObservations,report.sourceSnapshot?.bonds].find(items=>Array.isArray(items) && items.length) || [];
  for(const item of observed) inputs.set(item.id || item.label,{...item,points:item.series || item.points || item.recentSeries || []});
  if(!inputs.size) {
    for(const visual of report.visuals || []) if(visual.unit==='%' && visual.type==='line') for(const item of visual.series || []) inputs.set(item.label,{...item,points:item.points || []});
    for(const item of report.dailyReferences || []) if((reverse.get(item.unit) || source(item.unit))==='%') {
      const previous=inputs.get(item.label);if(!previous?.points?.length) inputs.set(item.label,{...item,points:item.points || []});
    }
  }
  const references=[...inputs.values()].map(item=>{
    const original=reverse.get(item.label) || source(item.label),meta=config.markets.find(entry=>item.id===entry.id || item.symbol && item.symbol===entry.symbol || original===entry.label);
    const cadence=item.cadence || meta?.cadence || 'daily',monthly=cadence==='monthly',points=observations(item.points,cutoff,monthly),last=points.at(-1),previous=points.at(-2),limit=monthly ? 120 : cadence==='auction' ? 35 : 7;
    const stale=last && cutoff-Date.parse(last.date)>limit*86400000,gap=last && previous && (monthly ? (Number(last.date.slice(0,4))*12+Number(last.date.slice(5)))-(Number(previous.date.slice(0,4))*12+Number(previous.date.slice(5)))!==1 : Date.parse(last.date)-Date.parse(previous.date)>limit*86400000);
    const basis=item.basis || ((item.symbol || meta?.symbol)==='^IRX' ? 'bank-discount' : meta ? 'legacy-yield' : 'unspecified');
    return {...meta,...item,id:item.id || meta?.id,label:original,cadence,basis,tenorYears:finite(item.tenorYears) ? item.tenorYears : meta?.tenorYears,maturity:item.maturity || meta?.maturity || '',market:item.market || meta?.market || 'Mercado sin identificar',currency:item.currency || meta?.currency || '',points,last,previous,stale,gap,changeBp:cadence==='daily' && last && previous && !stale && !gap ? (last.value-previous.value)*100 : null};
  }).filter(item=>item.label);
  const monthlyReferences=references.filter(item=>item.cadence==='monthly');
  const available=references.filter(item=>item.cadence!=='monthly' && finite(item.changeBp)),rising=available.filter(item=>item.changeBp>1e-9),falling=available.filter(item=>item.changeBp<-1e-9);
  const ranked=[...available].sort((a,b)=>Math.abs(b.changeBp)-Math.abs(a.changeBp));
  const usShort=references.find(item=>item.id==='UST-3M'),usLong=references.find(item=>item.id==='UST-10Y');
  let curve=null;
  if(usShort && usLong && !usShort.stale && !usLong.stale && usShort.basis!=='bank-discount' && usShort.basis===usLong.basis && usShort.basis!=='unspecified') {
    const common=usShort.points.filter(point=>usLong.points.some(other=>other.date===point.date)).slice(-2);
    if(common.length && cutoff-Date.parse(common.at(-1).date)<=7*86400000) {
      const spreads=common.map(point=>({date:point.date,value:(usLong.points.find(other=>other.date===point.date).value-point.value)*100}));
      curve={current:spreads.at(-1).value,date:spreads.at(-1).date,previousDate:spreads.at(-2)?.date,change:spreads.length===2 && Date.parse(spreads[1].date)-Date.parse(spreads[0].date)<=7*86400000 ? spreads[1].value-spreads[0].value : null};
    }
  }
  const domesticSummary=available.length ? `${rising.length} referencias subieron en rendimiento, ${falling.length} bajaron y ${available.length-rising.length-falling.length} quedaron sin cambio entre ${available.length} comparables. El mayor cambio absoluto fue ${ranked[0].label}: ${bp(ranked[0].changeBp)}, entre ${ranked[0].previous.date} y ${ranked[0].last.date}. Subir en rendimiento no equivale a subir de precio.` : 'No se obtuvieron dos observaciones recientes por referencia para calcular cambios de rendimiento.';
  const summary=domesticSummary+(monthlyReferences.length ? ' Además, '+monthlyReferences.length+' países conservan su último nivel mensual como contexto. No se comparan meses ni subastas como si fueran sesiones diarias.' : '');
  const missing=references.filter(item=>item.cadence==='daily' && !finite(item.changeBp)),dates=[...new Set(references.map(item=>item.last?.date).filter(Boolean))].sort();
  const countryCount=new Set(references.filter(item=>item.last).map(item=>item.market)).size;
  const coverage=`${countryCount} países con datos publicados. ${available.length} referencias diarias comparables; las series mensuales y subastas sólo aportan contexto con su periodo.${dates.length ? ' Últimas fechas publicadas: '+dates.join(', ')+'.' : ''} Rendimientos en % anual; cambios en puntos base (1 pb = 0.01 puntos porcentuales). Treasury usa publicaciones de mercado; CETES, resultados de subastas; OCDE y BCE, referencias mensuales de largo plazo. Cada fila declara su periodo y moneda.${missing.length ? ' '+missing.length+' referencias sin comparación reciente; se conservan visibles.' : ''}`;
  const metrics=flags.indicators===false ? [] : [
    {label:'Rendimientos al alza',value:String(rising.length),change:available.length+' comparables',tone:'neutral'},
    {label:'Rendimientos a la baja',value:String(falling.length),change:(available.length-rising.length-falling.length)+' sin cambio',tone:'neutral'},
    {label:'Mayor cambio absoluto',value:ranked[0] ? bp(ranked[0].changeBp) : 'Sin dato',change:ranked[0]?.label || '',tone:'neutral'},
    {label:'Pendiente Treasury 10A–3M',value:curve ? bp(curve.current) : 'Sin comparación',change:curve ? curve.date+' · '+(finite(curve.change) ? bp(curve.change)+' de cambio' : 'Sin cambio comparable') : 'Requiere misma base y fecha',tone:'neutral'},
  ];
  const groups=new Map();for(const item of references.filter(item=>item.cadence!=='monthly')) {const key=[item.market,item.currency,item.basis,item.cadence].join('|');if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(item);}
  const visuals=[];
  if(flags.charts!==false) for(const group of groups.values()) {
    const usable=group.filter(item=>finite(item.changeBp)),market=group[0].market,currency=group[0].currency;
    if(usable.length) visuals.push({type:'bar',yieldMovement:true,title:'Cambio de rendimiento · '+market,unit:'pb',bars:usable.map(item=>({label:item.label,value:item.changeBp})),note:'Cambios entre las dos últimas publicaciones de cada referencia; fechas en la tabla.',reading:usable.map(item=>item.label+': '+bp(item.changeBp)).join('; ')+'. Una subida de tasa puede presionar el precio de un bono existente de tasa fija; no es su rendimiento de inversión.'});
    const ordered=group.filter(item=>!item.stale && item.points.length && finite(item.tenorYears)).sort((a,b)=>a.tenorYears-b.tenorYears);
    const common=ordered.length>1 ? ordered[0].points.map(point=>point.date).filter(date=>ordered.every(item=>item.points.some(point=>point.date===date))).slice(group[0].cadence==='auction' ? -1 : -2) : [];
    if(common.length && cutoff-Date.parse(common.at(-1))<=(group[0].cadence==='auction' ? 35 : 7)*86400000) visuals.push({type:'line',yieldCurve:true,title:'Perfil por plazo · '+market,unit:'% anual · '+currency,curvePoints:ordered.map(item=>({label:item.maturity,tenorYears:item.tenorYears,value:item.points.find(point=>point.date===common.at(-1)).value,previous:common.length===2 ? item.points.find(point=>point.date===common[0]).value : null})),currentDate:common.at(-1),previousDate:common.length===2 ? common[0] : '',note:'Plazos ordenados con separación uniforme; misma moneda, base y fechas. No es un gráfico de precios.',reading:`Al ${common.at(-1)}, ${ordered[0].label} rinde ${number(ordered[0].points.find(point=>point.date===common.at(-1)).value)} % y ${ordered.at(-1).label}, ${number(ordered.at(-1).points.find(point=>point.date===common.at(-1)).value)} %. El perfil compara plazos de ${market}${common.length===2 ? ' con la publicación del '+common[0] : ''}; sus puntos no representan días sucesivos.`});
    const histories=group.filter(item=>item.cadence==='daily' && item.points.length>1 && !item.stale && !item.gap);
    for(let start=0;start<histories.length;start+=6) {
      const batch=histories.slice(start,start+6),periods=batch.flatMap(item=>item.points.slice(-2).map(point=>point.date)).sort();
      visuals.push({type:'line',title:'Evolución de rendimientos · '+market+(histories.length>6 ? ' · '+(start/6+1) : ''),unit:'%',series:batch.map(item=>({label:item.label,points:item.points.slice(-2)})),note:'Rendimientos observados en % anual; sin interpolación. Cada serie conserva sus fechas.',reading:`Ventana ${periods[0]} a ${periods.at(-1)}. ${batch.map(item=>item.label+': '+number(item.last.value)+' % ('+item.last.date+'), '+bp(item.changeBp)+' desde '+item.previous.date).join('; ')}. ${group[0].cadence==='auction' ? 'Cada punto corresponde a una publicación de subasta; no se rellena como una tasa diaria.' : 'La trayectoria de tasas no representa el precio ni el retorno de una cartera de bonos.'}`});
    }
  }
  const results=flags.tables===false ? [] : [{title:'Rendimientos y comparación por plazo',columns:['Referencia','Mercado / moneda','Anterior (%)','Fecha anterior','Último (%)','Fecha del dato','Cambio (pb)'],rows:references.filter(item=>item.cadence!=='monthly').map(item=>[item.label,item.market+(item.currency ? ' · '+item.currency : ''),item.cadence==='auction' ? 'No diaria' : item.previous ? number(item.previous.value) : 'Sin dato',item.cadence==='auction' ? 'No aplica' : item.previous?.date || 'Sin dato',item.last ? number(item.last.value) : 'Sin dato',item.last?.date || 'Sin dato',item.cadence==='auction' ? 'Subasta; sin variación diaria' : item.stale ? 'Dato antiguo' : item.gap ? 'Fechas separadas' : bp(item.changeBp)]),note:'El cambio es una diferencia de tasas en puntos base, no una variación porcentual del precio. Treasury compara las dos últimas sesiones; CETES muestra el último nivel de subasta sin una variación diaria. Las fechas pueden diferir.'}];
  if(flags.tables!==false && monthlyReferences.length) results.push({title:'Bonos internacionales · contexto mensual, sin variación diaria',columns:['País / fuente','Moneda','Último (%)','Mes publicado','Frecuencia / vigencia'],rows:monthlyReferences.map(item=>[item.market+' · '+(item.source?.startsWith('BCE') ? 'BCE' : 'OCDE'),item.currency,item.last ? number(item.last.value) : 'Sin dato',item.last?.date || 'Sin dato',item.stale ? 'Dato antiguo' : 'Mensual; sin comparación diaria']),note:'Último nivel publicado por país como contexto. No se comparan meses ni se calcula una variación diaria con promedios mensuales. Las referencias antiguas mantienen su periodo explícito.'});
  const news=(report.bondNews || []).filter(item=>finite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt)<=cutoff && dayFormat.format(new Date(item.publishedAt))===day);
  const commentary=[{heading:'Qué pasó en bonos',body:summary},{heading:'Fecha y cobertura',body:coverage},...readCauses(references.filter(item=>item.cadence!=='monthly'),available,news,curve,day),...(monthlyReferences.length ? [{heading:'Cobertura internacional y frecuencia',body:monthlyReferences.length+' países tienen un último nivel mensual publicado. Se conservan moneda, fuente y periodo, sin cambios entre meses y fuera de las gráficas diarias. Las subastas de CETES tampoco se comparan como una sesión diaria. Una frecuencia mensual no permite afirmar qué pasó hoy en la tasa de cada país.'}] : []),...(missing.length ? [{heading:'Cobertura pendiente',body:missing.map(item=>item.label+': '+(item.stale ? 'dato antiguo ('+item.last.date+')' : item.gap ? 'observaciones demasiado separadas para su frecuencia' : 'faltan dos publicaciones verificables')).join('; ')+'. No se sustituyen los datos ausentes por cero.'}] : [])];
  if(report.userEdition && report.summary) commentary.push({heading:'Lectura del informe',body:report.summary});
  const blocks=[{key:'session',number:'1',label:'Resumen de la sesión',count:null},{key:'results',number:'1.1',label:'Pulso de rendimientos',count:null},...(results.length ? [{key:'comparisons',number:'1.2',label:'Rendimientos y variaciones',count:null}] : []),...(visuals.length ? [{key:'charts',number:'2',label:'Gráficas y lectura de la sesión',count:visuals.length}] : []),{key:'sessionContext',number:visuals.length ? '3' : '2',label:'Causas y consecuencias',count:null}];
  return {sessionReport:true,bondSession:true,window:{today:day},blocks:blocks.map(item=>({...item,label:translate(item.label)})),summary:translate(summary),coverage:translate(coverage),references,curve,metrics:metrics.map(item=>({...item,label:translate(item.label),value:translate(item.value),change:translate(item.change)})),visuals:visuals.map(item=>({...item,title:translate(item.title),unit:translate(item.unit),note:translate(item.note),reading:translate(item.reading)})),results:results.map(item=>({...item,title:translate(item.title),note:translate(item.note),columns:item.columns.map(translate),rows:item.rows.map(row=>row.map(translate))})),commentary:commentary.map(item=>({heading:translate(item.heading),body:translate(item.body)})),followupHeading:translate('Qué vigilar en la próxima publicación'),followup:flags.risks===false ? [] : (report.watchlist || []).slice(0,4),tables:[],history:[],statistics:[]};
}
