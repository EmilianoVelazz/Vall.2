const list=value=>Array.isArray(value) ? value : [];
const number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:3});
const signed=(value,unit)=>(value>0 ? '↑ +' : value<0 ? '↓ ' : '→ ')+number(value)+' '+unit;
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function published(reference,cutoff){
 const age=Date.parse(cutoff)-Date.parse(reference.last?.date);
 return Number.isFinite(reference.last?.value) && age>=0 && age<=({daily:7,weekly:21,monthly:70,auction:14}[reference.cadence] || 7)*86400000;
}
export function panoramaSignals(chapters,{scope='finance',cutoff,weekly=false,t=value=>value}={}){
 const pool=chapters.flatMap(chapter=>list(chapter.model?.references).map(reference=>({reference,chapter}))),selected=[],used=new Set(),period=weekly ? 'week' : 'day';
 const take=(key,area,test,unit)=>{
  const entry=pool.find(({reference,chapter})=>chapter.componentReport.collection===area && test(reference) && published(reference,cutoff));if(!entry)return;
  const {reference:item,chapter}=entry,id=JSON.stringify([item.label,item.unit,item.source]);if(used.has(id))return;used.add(id);
  const change=item.periods?.[period],amount=change ? unit==='pb' ? (change.last-change.base)*100 : change.value : null;
  selected.push({id:key,chapterId:chapter.id,label:item.displayLabel || item.label,reference:item.label,value:number(item.last.value),numericValue:item.last.value,unit:item.unit,date:item.last.date,kind:'market',cadence:item.cadence,source:item.source,url:item.url,change:Number.isFinite(amount) ? signed(amount,unit || '%') : null,numericChange:amount,changeUnit:unit || '%',baseDate:change?.baseDate || null,baseValue:change?.base ?? null,points:list(item.points).filter(point=>point.date>='2020-01-01'),note:item.basis || ''});
 };
 if(scope==='finance'){
  take('sp500','finance',item=>item.symbol==='^GSPC');take('treasury10','finance',item=>/treasury 10 a/.test(fold(item.label)),'pb');
  take('sofr','finance',item=>/^sofr/.test(fold(item.label)),'pb');take('usdmxn','finance',item=>/^USD\/MXN/.test(item.label));
  // Risk signals belong to the equity context rather than its index universe.
  const equity=chapters.find(chapter=>chapter.model?.equityExecutive),vix=equity?.model.equityExecutive.signals?.find(item=>/vix/i.test(item.label));
  if(vix && published(vix,cutoff)){pool.push({reference:vix,chapter:equity});take('vix','finance',item=>item===vix);}
 }
 if(scope!=='mexico'){
  take('wti','markets',item=>item.symbol==='EIA-WTI-SPOT');take('corn','markets',item=>item.symbol==='ZC=F');
  if(scope==='markets'){take('gas','markets',item=>item.symbol==='EIA-HENRY-SPOT');take('gold','markets',item=>item.symbol==='GC=F');}
  take('pork','markets',item=>/cutout/.test(fold(item.label)) && /porcin|cerdo/.test(fold(item.label)) && item.country==='Estados Unidos');
  if(scope==='markets')take('mexico-corn','markets',item=>item.country==='México' && /maiz/.test(fold(item.label)));
 }else{
  take('usdmxn','mexico',item=>item.unit==='MXN por 1 USD');
  take('mx-chicken','mexico',item=>/pollo/.test(fold(item.label)));take('mx-egg','mexico',item=>/huevo/.test(fold(item.label)));
  const macro=chapters.find(chapter=>chapter.componentReport.key==='mx_overview');
  for(const name of ['Crecimiento real del PIB','Desempleo','Remesas recibidas']){
   const visual=macro?.model.visuals.find(item=>item.type==='bar' && item.title.startsWith(name)),points=list(visual?.bars).filter(point=>/^20\d{2}$/.test(point.label) && point.label>='2020' && point.label<=cutoff.slice(0,4) && Number.isFinite(point.value)).map(point=>({date:point.label,value:point.value})).toSorted((a,b)=>a.date.localeCompare(b.date)),last=points.at(-1),base=points.at(-2);if(!last)continue;
   const amount=base ? visual.unit==='%' ? last.value-base.value : base.value>0 ? (last.value/base.value-1)*100 : null : null;
   selected.push({id:'macro-'+name,chapterId:macro.id,label:t(name),value:number(last.value),numericValue:last.value,unit:visual.unit,date:last.date,kind:'structural',cadence:'annual',change:Number.isFinite(amount) ? signed(amount,visual.unit==='%' ? 'p. p.' : '%') : null,numericChange:amount,changeUnit:visual.unit==='%' ? 'p. p.' : '%',baseDate:base?.date || null,baseValue:base?.value ?? null,points,source:macro.componentReport.sources?.[0] || '',note:t('Observaciones anuales; no son movimientos de la sesión.')});
  }
 }
 return selected.slice(0,8);
}
export function panoramaImplications(signals,chapters,{t=value=>value}={}){
 const read=item=>item.label+' '+(Number.isFinite(item.numericChange) ? item.numericChange>0 ? 'sube' : item.numericChange<0 ? 'baja' : 'sin cambio' : 'con publicación disponible')+' ('+(item.baseDate ? item.baseDate+' / ' : '')+item.date+')',effects=[];
 const cash=signals.filter(item=>['usdmxn','sofr','treasury10'].includes(item.id)),inputs=signals.filter(item=>['corn','wti','pork','mx-chicken','mx-egg','mexico-corn'].includes(item.id)),structure=signals.filter(item=>item.kind==='structural');
 if(cash.length)effects.push({heading:t('Tesorería · moneda y fondeo'),body:t(cash.map(read).join('; ')+'. Contrastar pagos y cobros netos por moneda con los contratos de deuda próximos a reajustarse. El efecto depende del saldo, referencia y diferencial pactados.')});
 if(inputs.length)effects.push({heading:t('Compras · reposición y costos'),body:t(inputs.slice(0,3).map(read).join('; ')+'. Revisar primero los contratos y compras próximos a fijarse. Vincular cada referencia con el producto comprado, calidad, moneda y entrega; estas trayectorias no constituyen un margen conjunto.')});
 if(structure.length)effects.push({heading:t('Dirección · demanda y exposición regional'),body:t('Contexto anual: '+structure.map(read).join('; ')+'. Contrastar el presupuesto con pedidos y continuidad de proveedores actuales; los datos anuales describen estructura, no la demanda de hoy.')});
 else {const equity=chapters.find(chapter=>chapter.model?.equityExecutive);if(equity)effects.push({heading:t('Dirección · riesgo y concentración'),body:t((equity.model.equityExecutive.risk?.label || 'Revisar riesgo de mercado')+'. Contrastar concentración por país y sector con volatilidad y crédito del mismo periodo. Identificar vencimientos y decisiones corporativas documentadas antes de modificar la exposición.')});}
 return effects.slice(0,3);
}
