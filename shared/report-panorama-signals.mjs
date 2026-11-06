const list=value=>Array.isArray(value) ? value : [];
const number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:3});
const money=value=>value.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
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
 const effects=[],fx=signals.find(item=>item.id==='usdmxn'),wti=signals.find(item=>item.id==='wti'),growth=signals.find(item=>item.id==='macro-Crecimiento real del PIB');
 if(fx && Number.isFinite(fx.baseValue)){
  const amount=(fx.numericValue-fx.baseValue)*100000;
  effects.push({heading:t('Exposición al dólar'),body:t('Escenario para USD 100,000: ')+(amount===0 ? t('sin cambio en la conversión a pesos') : money(Math.abs(amount))+' MXN '+t(amount>0 ? 'más para pagar; mayor conversión para quien cobra' : 'menos para pagar; menor conversión para quien cobra'))+' ('+fx.baseDate+' / '+fx.date+'). '+t('Comparación de referencia, antes de comisiones y coberturas; no es una oferta bancaria.')});
 }
 if(wti && Number.isFinite(wti.baseValue)){
  const amount=(wti.numericValue-wti.baseValue)*1000;
  effects.push({heading:t('Compras de energía'),body:t('En 1,000 barriles ligados uno a uno al WTI físico, el cambio de referencia equivale a ')+(amount<0 ? '-' : '+')+money(Math.abs(amount))+' USD ('+wti.baseDate+' / '+wti.date+'). '+t('El efecto entregado depende del contrato, calidad y transporte; no se traslada automáticamente a combustibles o electricidad.')});
 }
 if(growth && Number.isFinite(growth.numericChange))effects.push({heading:t('Demanda y planeación'),body:t('El crecimiento del PIB cambió ')+signed(growth.numericChange,'p. p.')+' ('+growth.baseDate+' / '+growth.date+'). '+t('Contrastar el presupuesto de ventas con pedidos e inventarios actuales; es contexto anual y no confirma el comportamiento de la demanda de hoy.')});
 if(chapters.some(chapter=>chapter.componentReport?.key==='bonds'))effects.push({heading:t('Fondeo y tesorería'),body:t('Revisar SOFR y TIIE junto con la próxima fecha de reajuste de la deuda. La curva soberana y los diferenciales de crédito ayudan a distinguir tasa base y prima de riesgo; no sustituyen la tasa pactada de la empresa.')});
 if(chapters.some(chapter=>['grains','proteins','mx_proteins'].includes(chapter.componentReport?.key)))effects.push({heading:t('Abastecimiento y margen'),body:t('Priorizar los productos comprados por la empresa. Antes de fijar precio, contrastar la referencia física, presentación, moneda y entrega; los futuros y cutouts aportan contexto y no equivalen a una oferta del producto final.')});
 if(chapters.some(chapter=>chapter.componentReport?.key==='mx_production'))effects.push({heading:t('Continuidad regional'),body:t('Usar las tablas de concentración agrícola y minera para revisar orígenes alternativos, transporte y proveedores. La producción del periodo declarado no demuestra inventario comercial disponible hoy.')});
 return effects.slice(0,chapters.every(chapter=>chapter.componentReport?.collection==='mexico') ? 2 : 3);
}
