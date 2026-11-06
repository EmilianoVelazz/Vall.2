// One observed-session model for the reader, PDF and exports.
import marketConfig from './report-equity-markets.json' with {type:'json'};
const finite=value=>typeof value==='number' && Number.isFinite(value);
const number=value=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:2}) : 'Sin dato';
const percent=value=>finite(value) ? `${value>0 ? '+' : ''}${number(value)} %` : 'Sin comparación';
const regions=marketConfig.regions;
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
const regionFor=label=>/nikkei|hang seng|shanghai|kospi|sensex|nifty/i.test(label) ? 'Asia' : /australia|asx/i.test(label) ? 'Oceanía' : /stoxx|dax|cac|ftse|ibex|mib/i.test(label) ? 'Europa' : /s&p|nasdaq|dow|ipc|bovespa|brasil|merval|tsx/i.test(label) ? 'América' : 'Otras plazas';
function causalReading(context,{up,down,available,vix,references,news,day,mixed}) {
  const evidence=[...context.map(item=>item.body),...news.map(item=>item.title+' '+item.description)].join(' ');
  const channels=[];
  if(/tasas?|inflaci[oó]n|banco central|fed\b|treasury|rendimientos?/i.test(evidence)) channels.push({cause:'tasas e inflación',mechanism:'Tasas e inflación: si un anuncio eleva la trayectoria esperada de las tasas, aumenta el rendimiento exigido y la tasa con la que se descuentan las utilidades futuras; eso puede presionar las valuaciones y encarecer deuda nueva o variable. Una revisión de tasas a la baja puede operar en sentido contrario. Contrastar el dato contra la expectativa previa y la reacción de rendimientos; el anuncio por sí solo no determina la dirección.'});
  if(/utilidad|beneficio|resultados? corporativos?|ganancias?|ventas|earnings/i.test(evidence)) channels.push({cause:'resultados y expectativas de utilidades',mechanism:'Resultados corporativos: ventas, márgenes o una guía mejores de lo esperado pueden elevar las utilidades proyectadas y apoyar el precio; una decepción puede reducirlo. Su repercusión en el índice depende del peso de la emisora: unas pocas empresas grandes pueden moverlo sin que suba la mayoría de acciones. Confirmar resultados, consenso previo y contribución de cada componente.'});
  if(/arancel|geopol[ií]tic|conflicto|comercio|petr[oó]leo|energ[ií]a/i.test(evidence)) channels.push({cause:'costos, comercio y riesgo',mechanism:'Comercio, energía y riesgo: aranceles, fletes o energía más caros pueden comprimir los márgenes de empresas consumidoras si no trasladan el costo a precios. Un productor puede reaccionar de manera diferente. La incertidumbre puede elevar la prima de riesgo y el costo de captar capital. Confirmar qué empresas importan, exportan o producen el insumo; el mismo hecho puede beneficiar a unas y perjudicar a otras.'});
  const ranked=[...available].sort((a,b)=>b.change-a.change),top=ranked[0],bottom=ranked.at(-1);
  const observation=available.length ? `${up} de ${available.length} referencias comparables subieron y ${down} bajaron. ${top.label} marcó ${percent(top.change)} (${top.previous.date} a ${top.last.date})${bottom!==top ? '; '+bottom.label+', '+percent(bottom.change)+' ('+bottom.previous.date+' a '+bottom.last.date+')' : ''}. Esto describe la muestra de índices, no la proporción de acciones ganadoras ni el volumen negociado.` : 'No se dispone de dos cierres recientes comparables para diagnosticar la dirección de la sesión.';
  const facts=news.slice(0,4).map(item=>`“${item.title}” (${item.source || 'Fuente del corte'}, ${item.publishedAt}). ${item.description || 'La fuente sólo aporta el titular; falta el anuncio original.'}`);
  const why=facts.length ? `Hechos publicados dentro del corte:\n\n${facts.join('\n\n')}\n\n${channels.length ? 'Estos hechos permiten investigar '+channels.map(item=>item.cause).join(', ')+'.' : 'Estos titulares no identifican por sí solos el detonante del índice.'} La publicación no demuestra a qué hora ocurrió el hecho ni que precediera al cierre de cada plaza: no se confirma causalidad sin esa secuencia.` : context.length ? 'El corte conserva contexto editorial, pero no aporta noticias estructuradas con fecha verificable para identificar un detonante concreto. Los temas mencionados sirven como hipótesis; falta contrastar el anuncio original, su sorpresa respecto a lo esperado y la reacción posterior de las emisoras. La coincidencia no demuestra causalidad.' : 'Este corte no incluye un hecho fechado que confirme la causa del movimiento. Atribuirlo a tasas, resultados o geopolítica sería una hipótesis. Se necesita el anuncio original y la reacción posterior, dentro de la sesión de cada plaza.';
  const effects=[];
  if(up) effects.push(`Las alzas de ${up} índices pueden aumentar la valuación de posiciones compradas que sigan esas referencias. No representan una ganancia realizada mientras no se cierre la posición.`);
  if(down) effects.push(`Las bajas de ${down} índices pueden reducir el valor de posiciones compradas y garantías ligadas a esos activos; con apalancamiento podrían exigir más colateral según el contrato. El índice no permite calcular una llamada de margen sin conocer la posición.`);
  effects.push('Para una empresa emisora, un precio menor puede reducir lo que recaudaría al emitir acciones nuevas; no reduce automáticamente su caja ni sus ventas. Para un inversionista en pesos, el resultado de activos extranjeros también depende del tipo de cambio, comisiones y coberturas, que este cálculo de índices no incorpora.');
  if(vix && finite(vix.change)) effects.push(`El VIX ${vix.change>0 ? 'subió' : vix.change<0 ? 'bajó' : 'no cambió'} (${percent(vix.change)}, ${vix.last.date}); mide volatilidad esperada a 30 días del S&P 500. No mide la volatilidad de México ni predice la dirección de la siguiente sesión.`);
  const mexico=references.find(item=>item.symbol==='^MXX' || /IPC.*México|BMV.*IPC/i.test(item.label));
  const biva=references.find(item=>/FTSE.?BIVA/i.test(item.label));
  const us=references.find(item=>item.symbol==='^GSPC' || item.label==='S&P 500');
  const mexicoText=[];
  if(mexico) {
    mexicoText.push(finite(mexico.change) ? `${mexico.label}: ${percent(mexico.change)} entre ${mexico.previous.date} y ${mexico.last.date}. Por cada $100,000 MXN de una posición hipotética que replicara exactamente el índice, la variación sería ${mexico.change<0 ? '-' : '+'}$${number(Math.abs(mexico.change)*1000)} MXN, antes de costos, dividendos y diferencias de seguimiento. Es una ilustración de valuación, no el rendimiento de una cartera real.` : 'BMV / S&P/BMV IPC: falta una comparación de cierres reciente y verificable. No se interpreta la ausencia de cotización como una caída.');
    if(finite(mexico.change) && finite(us?.change) && mexico.last.date===us.last.date && mexico.previous.date===us.previous.date) mexicoText.push(`En las mismas fechas, S&P 500 marcó ${percent(us.change)}: ${Math.sign(mexico.change)===Math.sign(us.change) ? 'coinciden en dirección; un factor común es una hipótesis que requiere contrastar tasas y noticias internacionales' : 'las direcciones difieren; atribuir todo a Wall Street no explica la sesión mexicana'}. Para distinguir un factor local, revisar contribuciones de las principales emisoras, reportes corporativos y anuncios de Banxico o comerciales publicados antes del cierre.`);
    else mexicoText.push('Para explicar México hay que cruzar anuncios de Banxico, resultados de las emisoras y cambios comerciales con sus horas de publicación. Tasas pueden afectar valuaciones y financiamiento; el peso puede modificar ingresos o costos según la exposición de cada empresa. Este corte no prueba que esas variables se hayan movido ni causado el resultado.');
  }
  if(biva) mexicoText.push(biva.last ? 'FTSE BIVA conserva su propia serie fechada; su composición difiere del IPC, por lo que sus cambios no son intercambiables.' : 'BIVA / FTSE BIVA está incluida; no hay fuente de cotización conectada para este índice. Se requiere su cierre oficial para comparar su desempeño; no se le asigna el cambio del IPC.');
  const regional=regions.flatMap(region=>{
    const group=available.filter(item=>item.region===region);if(!group.length) return [];
    const dates=[...new Set(group.map(item=>item.last.date))];
    return [`${region}: ${group.filter(item=>item.change>0).length} al alza, ${group.filter(item=>item.change<0).length} a la baja y ${group.filter(item=>item.change===0).length} sin cambio; cierres ${dates.sort().join(', ')}.`];
  }).join(' ');
  return [
    {heading:'Qué muestran los movimientos',body:observation+(regional ? '\n\n'+regional : '')+(mixed ? '\n\nHay fechas de cierre diferentes: no se interpreta la clasificación como una reacción simultánea a la misma noticia.' : '')},
    {heading:'Por qué pudo pasar',body:why},
    {heading:'Cómo se transmite a las bolsas',body:channels.length ? channels.map(item=>item.mechanism).join('\n\n') : 'Sin un detonante confirmado, el mecanismo sólo puede plantearse en forma condicional: una mejora de utilidades esperadas o un menor rendimiento exigido puede apoyar el precio; un deterioro de utilidades o mayor prima de riesgo puede presionarlo. Hace falta identificar qué expectativa cambió respecto a lo que el mercado ya descontaba; una noticia favorable puede acompañar una baja si resultó peor de lo esperado.'},
    ...(mexicoText.length ? [{heading:'México: causas y repercusiones',body:mexicoText.join('\n\n')}] : []),
    {heading:'Qué consecuencias puede tener',body:effects.join('\n\n')},
    {heading:'Qué falta confirmar',body:`1. Contrastar hora del hecho y hora del cierre local: un anuncio posterior no explica un cierre anterior.\n\n2. Comparar el dato o resultado con la expectativa previa y las contribuciones de las emisoras; un índice por sí solo no identifica el detonante.\n\n3. Revisar tasas, divisas y volumen de la misma sesión y comprobar si respaldan o contradicen la hipótesis.\n\n4. Traducir el movimiento a la exposición real por activo y moneda. La fecha de corte es ${day || 'no disponible'}; sin nueva evidencia no se extrapola la sesión.`},
  ];
}
function pointsFor(points,cutoff) {
  if(!Number.isFinite(cutoff)) return [];
  const values=new Map(),conflicts=new Set();
  for(const point of points || []) {
    const date=String(point?.date || ''),time=Date.parse(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==date || time>cutoff || !finite(point?.value) || point.value<=0) continue;
    if(values.has(date) && values.get(date).value!==point.value) conflicts.add(date);
    values.set(date,{date,value:point.value});
  }
  return [...values.values()].filter(point=>!conflicts.has(point.date)).sort((a,b)=>a.date.localeCompare(b.date));
}
export function isEquitySession(report) {
  const area=report?.baseReport?.collection || report?.collection;
  return (report?.baseReport?.key || report?.key)==='equities' && (!area || area==='finance');
}
export function equitySessionReport(report,{t=value=>value,source=value=>value}={}) {
  const labels=t,translate=value=>report.causeText?.[value] || labels(value);
  t=value=>value;
  const reverse=new Map(Object.entries(report.causeText || {}).map(([original,translated])=>[translated,original]));
  const cutoff=Date.parse(report.generatedAt),flags=report.personalization?.sections || {};
  const day=Number.isFinite(cutoff) ? dateFormat.format(new Date(cutoff)) : '';
  const inputs=new Map();
  const observed=[report.equityObservations,report.sourceSnapshot?.equities,report.equitySeries].find(items=>Array.isArray(items) && items.length) || [];
  for(const item of observed) inputs.set(item.label,{...item,points:item.series || item.points || item.recentSeries || []});
  // The full catalogue already includes every reference. Older daily projections
  // may use different names for Shanghai or VIX; do not duplicate those quotes.
  for(const item of report.dailyReferences || []) if(!report.equityCatalogVersion && !inputs.has(item.label)) inputs.set(item.label,{...item,points:item.points || []});
  const references=[...inputs.values()].map(item=>{
    const points=pointsFor(item.points,cutoff),last=points.at(-1),previous=points.at(-2);
    const catalog=marketConfig.markets.find(entry=>item.symbol && entry.symbol===item.symbol || entry.label===item.label);
    const stale=last && cutoff-Date.parse(last.date)>7*86400000,gap=last && previous && Date.parse(last.date)-Date.parse(previous.date)>7*86400000;
    return {...catalog,...item,label:item.label,region:catalog?.region || item.region || regionFor(item.label),stale,gap,vix:item.symbol==='^VIX' || /\bvix\b/i.test(item.label),points,last,previous,change:last && previous && !stale && !gap ? (last.value/previous.value-1)*100 : null};
  }).filter(item=>item.label);
  const indices=references.filter(item=>!item.vix && item.kind!=='informational'),available=indices.filter(item=>finite(item.change));
  const ranked=[...available].sort((a,b)=>b.change-a.change),up=available.filter(item=>item.change>0).length,down=available.filter(item=>item.change<0).length,flat=available.length-up-down;
  const range=[...new Set(indices.map(item=>item.last?.date).filter(Boolean))].sort(),latest=range.at(-1),mixed=range.length>1;
  const summary=available.length ? `${up} índices al alza, ${down} a la baja y ${flat} sin cambio entre ${available.length} referencias comparables. ${ranked[0].label} presentó la mayor variación (${percent(ranked[0].change)}); ${ranked.at(-1).label}, la menor (${percent(ranked.at(-1).change)}).` : 'No hay dos cierres recientes válidos por referencia para calcular la variación de sesión.';
  const missing=indices.filter(item=>!finite(item.change));
  const catalogued=report.equityCatalogVersion ? ` Se incluyen las ${marketConfig.markets.filter(item=>item.exchange!=='Índice adicional').length} bolsas del catálogo del proyecto y tres índices complementarios; no es un censo de todas las bolsas del mundo.` : '';
  const coverage=`${available.length} de ${indices.length} índices con comparación disponible.${latest ? ' Último cierre publicado: '+latest+'.' : ''}${mixed ? ' Las plazas tienen fechas de cierre distintas; la clasificación reúne sus últimas sesiones disponibles.' : ''}${latest && latest!==day ? ' El corte todavía no contiene un cierre fechado hoy; se muestra la última sesión disponible.' : ''}${catalogued}${missing.length ? ' '+missing.length+' referencias sin comparación reciente: se mantienen visibles y no entran en las alzas ni bajas.' : ''}`;
  const vix=references.find(item=>item.vix && item.last && !item.stale);
  const metrics=flags.indicators===false ? [] : [
    {label:t('Índices al alza'),value:String(up),change:`${available.length} ${t('comparables')}`,tone:'up'},
    {label:t('Índices a la baja'),value:String(down),change:`${flat} ${t('sin cambio')}`,tone:'down'},
    {label:t('Mayor variación'),value:ranked[0] ? percent(ranked[0].change) : t('Sin dato'),change:ranked[0]?.label || '',tone:ranked[0]?.change>0 ? 'up' : 'neutral'},
    {label:t('VIX'),value:vix ? number(vix.last.value) : t('Sin dato'),change:vix ? `${vix.last.date} · ${percent(vix.change)}` : t('Sin cierre disponible'),tone:'neutral'},
  ];
  const visuals=[];
  if(flags.charts!==false) {
    const barGroups=available.length<=18 ? [{region:'',items:available}] : regions.map(region=>({region,items:available.filter(item=>item.region===region)})).filter(group=>group.items.length);
    for(const {region,items} of barGroups.filter(group=>group.items.length)) {
      const best=[...items].sort((a,b)=>b.change-a.change),high=best[0],low=best.at(-1);
      const reading=region ? `${region}: ${items.filter(item=>item.change>0).length} referencias subieron y ${items.filter(item=>item.change<0).length} bajaron. Mayor variación: ${high.label} (${percent(high.change)}, ${high.last.date}); menor: ${low.label} (${percent(low.change)}, ${low.last.date}). La diferencia describe el desempeño de las referencias, no identifica su causa.` : summary;
      visuals.push({type:'bar',sessionMovement:true,title:region ? 'Variación de sesión · '+region : t('Variación de la última sesión por índice'),unit:'%',bars:items.map(item=>({label:item.label,value:item.change})),note:region ? 'Últimos dos cierres recientes de cada referencia; fechas en la tabla.' : coverage,reading});
    }
    for(const region of regions) {
      const all=indices.filter(item=>item.region===region && item.points.length>1 && !item.stale && !item.gap);
      for(let start=0;start<all.length;start+=6) {
        const group=all.slice(start,start+6);
        const pairs=new Map();for(const item of group){const dates=item.points.slice(-2).map(point=>point.date),pair=dates.join('|');if(!pairs.has(pair))pairs.set(pair,{group:[],dates});pairs.get(pair).group.push(item);}
        const chunks=[...pairs.values()];
        for(const chunk of chunks) {
          const series=chunk.group.map(item=>{const points=chunk.dates.map(date=>item.points.find(point=>point.date===date)),base=points[0].value;return {label:item.label,points:points.map(point=>({date:point.date,value:point.value/base*100}))};});
          const regionRanked=[...chunk.group].sort((a,b)=>b.change-a.change),rising=regionRanked.filter(item=>item.change>0).length;
          const moves=`En la última sesión disponible, ${rising} de ${regionRanked.length} referencias de este panel avanzaron. Mayor variación: ${regionRanked[0].label} (${percent(regionRanked[0].change)}, ${regionRanked[0].last.date}); menor: ${regionRanked.at(-1).label} (${percent(regionRanked.at(-1).change)}, ${regionRanked.at(-1).last.date}). La curva compara ${chunk.dates[0]} a ${chunk.dates.at(-1)} con base 100; sólo se muestran las dos sesiones publicadas, sin semanas ni meses.`;
          visuals.push({type:'line',title:'Bolsa de '+region+(all.length>6 ? ' · '+(Math.floor(start/6)+1) : '')+(chunks.length>1 ? ' · '+chunk.group[0].label : ''),unit:t('Índice base 100'),series,note:chunk.dates[0]+' a '+chunk.dates.at(-1)+'. Base 100 en el primer cierre común; '+chunk.dates.length+' fechas compartidas.',reading:moves});
        }
      }
    }
  }
  const results=flags.tables===false ? [] : [{title:t('Cierres y comparación por referencia'),columns:[t('Referencia / bolsa'),t('País / región'),t('Anterior'),t('Fecha anterior'),t('Último cierre'),t('Fecha del cierre'),t('Variación')],rows:references.filter(item=>!item.vix).map(item=>[item.label+(item.exchange && item.exchange!=='Índice adicional' ? ' · '+item.exchange : ''),item.market || item.region,item.previous ? number(item.previous.value) : t('Sin dato'),item.previous?.date || t('Sin dato'),item.last ? number(item.last.value) : t('Sin dato'),item.last?.date || t('Sin dato'),item.stale ? t('Cierre antiguo') : item.gap ? t('Fechas separadas') : percent(item.change)]),note:t('Niveles en puntos; comparación entre los dos últimos cierres observados. Sin comparación = faltan cierres válidos recientes; no representa variación cero. No se grafican referencias sin datos, cierres de más de siete días ni saltos de más de siete días entre observaciones.') }];
  const context=(report.sections || []).filter(section=>['Hechos del día','Noticias del corte'].includes(reverse.get(section.heading) || source(section.heading))).map(section=>({heading:section.heading,body:reverse.get(section.text) || section.text}));
  const news=(report.equityNews || []).filter(item=>Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt)<=cutoff && dateFormat.format(new Date(item.publishedAt))===day);
  const pendingGroups=[['Sin fuente de cotización conectada',missing.filter(item=>!item.symbol)],['Proveedor sin dos cierres recientes',missing.filter(item=>item.symbol && !item.stale && !item.gap)],['Cierre antiguo o fechas separadas',missing.filter(item=>item.stale || item.gap)]].filter(([,items])=>items.length).map(([label,items])=>label+': '+items.map(item=>item.label+(item.exchange ? ' / '+item.exchange : '')+(item.stale ? ' ('+item.last.date+')' : '')).join(', ')+'.').join('\n\n');
  const commentary=[{heading:t('Qué pasó en las bolsas'),body:summary},{heading:t('Fecha y cobertura'),body:coverage},...context,...causalReading(context,{up,down,available,vix,references,news,day,mixed}),...(missing.length ? [{heading:'Cobertura pendiente de cotización',body:pendingGroups+' Estas ausencias no se interpretan como caídas ni como mercados cerrados.'}] : [])];
  if(report.userEdition && report.summary) commentary.push({heading:t('Lectura del informe'),body:report.summary});
  const blocks=[{key:'session',number:'1',label:'Resumen de la sesión',count:null},{key:'results',number:'1.1',label:'Pulso de las bolsas',count:null},...(results.length ? [{key:'comparisons',number:'1.2',label:'Cierres y variaciones',count:null}] : []),...(visuals.length ? [{key:'charts',number:'2',label:'Gráficas y lectura de la sesión',count:visuals.length}] : []),{key:'sessionContext',number:visuals.length ? '3' : '2',label:'Causas y consecuencias',count:null}];
  return {sessionReport:true,equitySession:true,window:{today:day},blocks:blocks.map(item=>({...item,label:translate(item.label)})),metrics:metrics.map(item=>({...item,label:translate(item.label),value:translate(item.value),change:translate(item.change)})),visuals:visuals.map(item=>({...item,title:translate(item.title),unit:translate(item.unit),note:translate(item.note),reading:translate(item.reading)})),results:results.map(item=>({...item,title:translate(item.title),columns:item.columns.map(translate),rows:item.rows.map(row=>row.map(translate)),note:translate(item.note)})),tables:[],history:[],statistics:[],commentary:commentary.map(item=>({heading:translate(item.heading),body:translate(item.body)})),summary:translate(summary),coverage:translate(coverage),references,followupHeading:translate('Qué vigilar en la próxima sesión'),followup:flags.risks===false ? [] : (report.watchlist || []).slice(0,4)};
}
