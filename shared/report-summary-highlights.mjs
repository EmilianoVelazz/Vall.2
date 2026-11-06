// Reuse the full report's narrative, never infer a cause from a price change.
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const causeHeading=value=>/causa|explica|transmit|oferta y demanda|factores/.test(fold(value));
const impactHeading=value=>/consecu|repercu|efecto|impacto/.test(fold(value));
export function reportSummaryHighlights(model,{t=value=>value,source=value=>value}={}){
  const input=(model.summaryPanels || model.commentary || []).filter(panel=>panel.body);
  const hasMechanism=input.some(panel=>/transmit/.test(fold(source(panel.heading))));
  const panels=input.map((panel,index)=>({...panel,heading:index===0 ? t('Qué pasó') : impactHeading(source(panel.heading)) ? t('Repercusiones posibles') : causeHeading(source(panel.heading)) ? hasMechanism && !/transmit/.test(fold(source(panel.heading))) ? panel.heading : t('Cómo se explica') : panel.heading}));
  if(!panels.length && model.summary)panels.push({heading:t('Qué pasó'),body:model.summary});
  if(!panels.length)return [];
  // Missing causal evidence is a conclusion about the available data, not a
  // license to attribute the movement to an unverified event.
  if(!input.some(panel=>causeHeading(source(panel.heading)))){
    const period=model.analysisPeriod==='weekly' ? 'week' : 'day';
    const changes=(model.references || []).map(ref=>ref.periods?.[period]?.value).filter(Number.isFinite);
    const mixed=changes.some(value=>value>0) && changes.some(value=>value<0);
    panels.push({heading:t('Cómo se explica'),body:t(mixed ? 'Las plazas comparadas combinan alzas y bajas; el mayor movimiento no representa al conjunto. Los precios no identifican una causa confirmada.' : 'La variación corresponde a la canasta y moneda del índice; no equivale al resultado de una cartera. Los precios no identifican una causa confirmada.')});
  }
  if(model.benchmark && !input.some(panel=>impactHeading(source(panel.heading)))){
    const period=model.analysisPeriod==='weekly' ? 'week' : 'day';
    const ranked=(model.references || []).filter(ref=>Number.isFinite(ref.periods?.[period]?.value)).sort((a,b)=>Math.abs(b.periods[period].value)-Math.abs(a.periods[period].value));
    const leader=ranked[0],value=leader?.periods[period]?.value;
    if(value!==undefined && value!==0){
      const template=value>0 ? 'El alza de {reference} puede elevar la valuación de posiciones compradas ligadas al índice; el efecto depende también de la moneda y de los costos.' : 'La baja de {reference} puede reducir la valuación de posiciones compradas ligadas al índice; el efecto depende también de la moneda y de los costos.';
      panels.push({heading:t('Repercusiones posibles'),body:t(template).replace('{reference}',leader.label)});
    }
  }
  return panels;
}

// Name a repeated instrument and its end date once; keep every horizon's base.
export function compactHorizonHighlights(groups,{t=value=>value,change=String}={}){
  const instruments=new Map();
  for(const item of groups){
    const id=JSON.stringify([item.selected.label,item.selected.unit,item.change.lastDate]);
    if(!instruments.has(id))instruments.set(id,{...item,items:[]});
    instruments.get(id).items.push(item);
  }
  return [...instruments.values()].map(({selected,change:last,items})=>
    t(selected.label)+' · '+t(selected.unit)+' · '+last.lastDate+':\n'+items.map(item=>item.labels.map(label=>t(label)).join(' / ')+': '+change(item.change.value)+' ('+t('base')+' '+item.change.baseDate+')').join('; ')+'.'
  ).join('\n\n');
}

// Show both directions when a market is mixed, rather than describe the whole
// market through a single extreme. Every observation keeps its own two dates.
export function executiveSessionFact(references,{period='day',t=value=>value,change=String}={}){
  const ranked=references.filter(item=>Number.isFinite(item.periods?.[period]?.value)).sort((a,b)=>b.periods[period].value-a.periods[period].value);
  if(!ranked.length)return '';
  const up=ranked.find(item=>item.periods[period].value>0),down=[...ranked].reverse().find(item=>item.periods[period].value<0);
  const selected=up || down ? [up,down].filter(Boolean) : ranked.slice(0,1);
  return selected.map(item=>{
    const observed=item.periods[period];
    return t(item.label)+': '+change(observed.value)+' ('+observed.baseDate+' / '+observed.lastDate+').';
  }).join(' ');
}
