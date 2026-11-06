import {heterogeneousProteinBasis} from './report-mexico-brief.mjs';
const number=(value,digits=2)=>value.toLocaleString('es-MX',{maximumFractionDigits:digits});
const numeric=value=>{const text=String(value ?? '').replace(/,/g,'').trim();return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;};
export function mexicoSignals(key,{results,references,visuals,weekly},translate=value=>value){
 const text=(pattern,parameters={})=>String(translate(pattern)).replace(/\{(\w+)\}/g,(match,key)=>String(parameters[key] ?? match));
 const signals=[],period=weekly ? 'week' : 'day';
 if(key==='mx_overview')for(const row of results[0]?.rows || []){
  const value=numeric(row[1]);if(value===null)continue;
  const scale=row[0]==='Remesas recibidas' ? 1e9 : row[2]==='personas' ? 1e6 : 1,unit=scale===1e9 ? 'mil millones USD' : scale===1e6 ? 'millones de personas' : row[2];
  const prior=String(row[4]).match(/^([\d,.]+) \((\d{4})\)$/),previous=prior && numeric(prior[1]),previousLabel=previous!==null && prior ? number(previous/scale)+' ('+prior[2]+')' : row[4];
  signals.push({label:text(row[0]),value:number(value/scale),unit:text(unit),period:row[3],detail:text('Anterior publicado: {value} · Cambio: {change}',{value:previousLabel,change:row[5]}),tone:'neutral'});
 }
 if(key==='mx_bolsa'){
  const stocks=references.filter(item=>item.unit==='MXN por acción' && item.periods[period]),groups=new Map();
  for(const item of stocks){const change=item.periods[period],dates=change.baseDate+' / '+change.lastDate;if(!groups.has(dates))groups.set(dates,[]);groups.get(dates).push(item);}
  const group=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length || b[0].localeCompare(a[0]))[0];
  if(group){const [dates,items]=group,ranked=items.toSorted((a,b)=>b.periods[period].value-a.periods[period].value),rising=items.filter(item=>item.periods[period].value>0).length,falling=items.filter(item=>item.periods[period].value<0).length;
   signals.push({label:text('Balance de emisoras comparables'),value:rising+' ↑ / '+falling+' ↓',unit:text('emisoras'),period:dates,detail:text('{flat} sin cambio · muestra de {count}; no es un índice bursátil.',{flat:items.length-rising-falling,count:items.length}),tone:'neutral'});
   for(const [label,item] of [['Mayor avance',ranked.find(item=>item.periods[period].value>0)],['Mayor retroceso',[...ranked].reverse().find(item=>item.periods[period].value<0)]])if(item){const value=item.periods[period].value;signals.push({label:text(label),value:(value>0 ? '+' : '')+number(value),unit:'%',period:dates,detail:item.displayLabel,tone:value>0 ? 'up' : 'down'});}
  }
 }
 if(key==='mx_proteins')for(const species of ['Cerdo','Res','Pollo','Huevo']){
  const groups=new Map();for(const item of references.filter(item=>item.category===species)){const id=JSON.stringify([item.unit,item.basis,item.periodLabel,item.cadence]);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);}
  const cohort=[...groups.values()].sort((a,b)=>b.length-a.length || b[0].last.date.localeCompare(a[0].last.date))[0];if(!cohort)continue;
  const ranked=cohort.toSorted((a,b)=>a.last.value-b.last.value),low=ranked[0],high=ranked.at(-1),dispersion=(high.last.value/low.last.value-1)*100;
  const mixed=heterogeneousProteinBasis(low.basis),single=cohort.length===1;
  const qualification=mixed ? 'La base mezcla tipos o presentaciones; no es una comparación homogénea.' : 'La brecha no incluye flete ni calidad.';
  const basis=text(low.basis).replace(/[.。]+$/,'')+'.';
  signals.push({label:text(species)+' · '+text(single ? 'precio publicado' : mixed ? 'rango descriptivo' : 'rango de referencias'),value:single ? number(low.last.value) : number(low.last.value)+' – '+number(high.last.value),unit:text(low.unit),period:low.periodLabel,detail:single ? text('{state}. {basis} Confirmar plaza y entrega.',{state:low.state,basis}) : text('{count} estados · {low} / {high}. {basis}',{count:cohort.length,low:low.state,high:high.state,basis})+' '+(!mixed ? text('Diferencia entre extremos: {value} %.',{value:number(dispersion)})+' ' : '')+text(qualification),tone:'neutral'});
 }
 if(key==='mx_production')for(const visual of visuals.filter(item=>['production','mining'].includes(item.mexicoWindow))){
  const bars=visual.mexicoAllBars || visual.bars,ranked=bars.toSorted((a,b)=>b.value-a.value),total=visual.mexicoRegisteredTotal ?? ranked.reduce((sum,item)=>sum+item.value,0),leader=ranked[0];if(!leader || total<=0)continue;
  const product=visual.mexicoWindow==='mining' ? text('Minería') : text(visual.title.split(' · ')[0]);
  signals.push({label:visual.mexicoSelection ? text('{product} · participación de {state}',{product,state:leader.state}) : text('{product} · entidad principal',{product}),value:number(leader.value/total*100),unit:text('% del total registrado'),period:visual.periodLabel,detail:text('{state} · {value} {unit}. Participación en la suma de entidades con dato.',{state:leader.label,value:number(leader.value),unit:text(visual.unit)}),tone:'neutral'});
 }
 if(key==='mx_overview'){const priority=item=>/crecimiento.*PIB|PIB.*crecimiento|crecimiento real/i.test(item.label) ? 0 : /inflaci[oó]n/i.test(item.label) ? 1 : /remesas/i.test(item.label) ? 2 : /desemple|desocup/i.test(item.label) ? 3 : 4;return signals.sort((a,b)=>priority(a)-priority(b)).slice(0,3);}
 return signals;
}
