const monthIndex=date=>Number(date.slice(0,4))*12+Number(date.slice(5,7));
export function bondPublishedMonths(input,cutoff){
  const end=String(cutoff).slice(0,7),values=new Map(),conflicts=new Set();
  for(const point of input || []){
    const date=String(point?.date || '');
    if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(date) || date<'2020-01' || date>=end || !Number.isFinite(point.value))continue;
    if(values.has(date) && values.get(date)!==point.value)conflicts.add(date);
    values.set(date,point.value);
  }
  return [...values].filter(([date])=>!conflicts.has(date)).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));
}
export function bondInternationalReport(inputs,cutoff){
  const references=inputs.filter(item=>item.cadence==='monthly' && ['oecd-government-10y','ecb-convergence-10y'].includes(item.basis)).flatMap(item=>{
    const points=bondPublishedMonths(item.points || item.series,cutoff),last=points.at(-1);
    if(!last || monthIndex(String(cutoff))-monthIndex(last.date)>3)return [];
    const change=months=>{const target=monthIndex(last.date)-months,base=points.find(point=>monthIndex(point.date)===target);return base ? {base:base.value,last:last.value,baseDate:base.date,lastDate:last.date,value:(last.value-base.value)*100} : null;};
    return [{id:item.id,label:item.label || item.market+' · soberano largo plazo',market:item.market,country:item.market,currency:item.currency,region:item.region || '',code:item.code || '',basis:item.basis,cadence:'monthly',source:item.source || '',url:item.url || '',unit:'%',points,last,previous:points.at(-2),periods:{month:change(1),year:change(12)},level2020:points.find(point=>point.date==='2020-12'),changeBp:null}];
  }).sort((a,b)=>a.market.localeCompare(b.market,'es'));
  const series=references.filter(item=>item.points.length>=12 && monthIndex(item.last.date)-monthIndex(item.points[0].date)>=11).map(item=>({id:item.id,label:item.label,shortLabel:item.market+' · '+item.currency,country:item.market,currency:item.currency,region:item.region,source:item.source,url:item.url,points:item.points}));
  const note='Referencias soberanas de largo plazo, generalmente en torno a diez años. OCDE y BCE publican promedios mensuales en porcentaje anual; no son cierres diarios ni cierres de fin de mes. Cada referencia conserva su moneda y definición nacional. Sólo se utilizan meses publicados, sin completar huecos ni el mes en curso. Las diferencias de nivel entre monedas no son un spread de crédito ni un retorno cubierto.';
  const overview=series.length ? {type:'line',bondHistory:true,bondInternationalOverview:true,monthly:true,historyKey:'international',title:'Bonos internacionales · comparador de países',unit:'%',rangeStart:'2020-01-01',rangeEnd:String(cutoff).slice(0,10),series,note} : null;
  const specs=[['América',['CA','BR','CL']],['Zona euro',['DE','FR','IT']],['Europa · otras monedas',['GB','CH','NO']],['Asia',['JP','CN','IN']],['Oceanía',['AU','NZ']],['África',['ZA']]];
  const printVisuals=overview ? specs.flatMap(([title,codes])=>{const selected=codes.flatMap(code=>series.filter(item=>item.id==='GOV10Y-'+code));return selected.length ? [{...overview,bondInternationalOverview:false,title:'Bonos de largo plazo · '+title,series:selected}] : [];}) : [];
  const format=value=>Number.isFinite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:3}) : '—',bp=change=>change ? (change.value>0 ? '+' : '')+format(change.value)+' pb' : '—';
  const table=references.length ? {title:'Bonos internacionales · rendimientos mensuales por país',bondInternational:true,cadence:'monthly',columns:['País / referencia','Moneda','Nivel · % anual','Mes publicado','Mes · pb','Año · pb','Dic. 2020 · %','Fuente'],rows:references.map(item=>[item.label,item.currency,format(item.last.value),item.last.date,bp(item.periods.month),bp(item.periods.year),format(item.level2020?.value),item.basis==='ecb-convergence-10y' ? 'BCE' : 'OCDE']),note:note+' Mes/año: diferencia absoluta contra el mismo mes anterior o de hace doce meses, cuando existe. Dic. 2020 conserva ese promedio mensual, no una sesión del 31 de diciembre.'} : null;
  const europeanReferences=references.filter(item=>item.region==='Europa'),europeanSeries=series.filter(item=>item.region==='Europa');
  const europeOverview=europeanSeries.length ? {...overview,bondEuropeOverview:true,title:'Europa · panorama de bonos soberanos',series:europeanSeries,snapshots:europeanReferences.map(item=>({id:item.id,country:item.market,currency:item.currency,value:item.last.value,date:item.last.date,yearBp:item.periods.year?.value ?? null,source:item.source,url:item.url}))} : null;
  const europeSpecs=[['Europa del sur',['ES','PT','GR']],['Zona euro · núcleo ampliado',['NL','BE','AT']],['Países nórdicos',['SE','DK','FI']],['Europa central y oriental',['PL','CZ','RO']]];
  const europePrintVisuals=overview ? europeSpecs.flatMap(([title,codes])=>{const selected=codes.flatMap(code=>europeanSeries.filter(item=>item.id==='GOV10Y-'+code));return selected.length ? [{...overview,bondInternationalOverview:false,title,series:selected}] : [];}) : [];
  const europe={references:europeanReferences,overview:europeOverview,printVisuals:europePrintVisuals,countryCount:europeanReferences.length};
  return {references,overview,printVisuals,table,note,countryCount:new Set(references.map(item=>item.market)).size,europe};
}
