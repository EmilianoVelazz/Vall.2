import {marketEvidence,marketPeriods,directionalChange} from './report-market-analysis.mjs';
import {mapReportText,reportSourceText} from './report-localized-text.mjs';
import {mexicoSignals} from './report-mexico-signals.mjs';
import {uniqueTableNotes} from './report-concision.mjs';
import {mexicoExecutiveBrief} from './report-mexico-brief.mjs';
const list=value=>Array.isArray(value) ? value : [];
const finite=value=>typeof value==='number' && Number.isFinite(value);
const number=(value,digits=2)=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:digits}) : '—';
const numeric=value=>{const text=String(value ?? '').trim().replace(/,/g,'');return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;};
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const keys=['mx_overview','mx_bolsa','mx_proteins','mx_production'];
export const isMexicoExecutive=report=>(report.baseReport?.collection || report.collection)==='mexico' && keys.includes(report.baseReport?.key || report.key) && report.periodType!=='annual';
const profiles={
 mx_overview:{title:'México · economía y entorno empresarial',scope:'Indicadores económicos con su año de observación. El contexto estructural y el tipo de cambio se presentan por separado.',effect:'Relacionar actividad y remesas con la demanda atendida; comercio exterior y dólar, con cobros, pagos e insumos importados. Una cifra anual no describe el consumo ni el costo de hoy.',watch:'Contrastar pedidos, inventario y exposición en USD con la siguiente publicación oficial de actividad, empleo y comercio. Confirmar la cotización operable antes de presupuestar.'},
 mx_bolsa:{title:'México · emisoras y riesgo cambiario',scope:'Muestra de emisoras disponibles, en pesos por acción. Las variaciones comparan observaciones de la misma emisora; USD/MXN tiene su propio bloque. La última referencia puede ser intradía y no acredita un cierre definitivo.',effect:'Distinguir la valuación de posiciones del flujo operativo de la empresa. Relacionar USD/MXN con pagos y cobros netos en dólares; la subida del dólar encarece pagos en USD y aumenta su conversión a pesos para quien cobra en USD.',watch:'Revisar resultados y anuncios de las emisoras, decisiones de tasas y vencimientos cambiarios dentro de las fechas observadas. La muestra no representa toda la Bolsa mexicana.'},
 mx_proteins:{title:'México · proteínas y abastecimiento estatal',scope:'Referencias físicas por especie, estado, presentación y unidad. Las publicaciones semanales y mensuales conservan su periodo; no se presentan como cambios diarios.',effect:'Un alza de la referencia puede encarecer la reposición si el contrato está ligado a ella. Validar rendimiento, merma, calidad y flete: kg vivo, kg canal y producto al mayoreo no son sustitutos directos.',watch:'Confirmar con el proveedor especie, presentación, plazas, fecha, volumen y precio entregado. Revisar disponibilidad, sanidad y logística del mismo mercado antes de atribuir una causa o cambiar compras.'},
 mx_production:{title:'México · producción y concentración regional',scope:'Producción agrícola y valor minero de los periodos declarados. Los volúmenes históricos no equivalen a inventario actual ni a precios de compra.',effect:'La concentración señala regiones donde revisar continuidad de proveedores, clima y transporte. Una mayor producción registrada no garantiza oferta comercial disponible hoy; el valor minero también depende de precios y mezcla de minerales.',watch:'Verificar campaña, cosecha, superficie y rendimiento agrícola; en minería, separar volumen y valor. Confirmar inventarios, calidad y rutas antes de convertir el registro histórico en un plan de abastecimiento.'},
};
function annualObserved(report,label,unit,period,fallback){
 const values=[...new Set(list(report.visuals).filter(item=>item.type==='bar' && item.title.split(' · ')[0]===label && item.unit===unit).flatMap(item=>list(item.bars).filter(point=>point.label===period && finite(point.value)).map(point=>point.value)))];
 return values.length===1 && finite(fallback) && Math.abs(values[0]-fallback)<=.0051 ? values[0] : fallback;
}
function fresh(period,cadence,cutoff){
 const match=String(period).match(/^\d{4}-\d{2}(?:-\d{2})?/);if(!match)return false;
 const date=match[0],stamp=Date.parse(date.length===7 ? date+'-01' : date),end=Date.parse(cutoff);
 if(!finite(stamp) || stamp>end || new Date(stamp).toISOString().slice(0,date.length)!==date)return false;
 return end-stamp<=({daily:7,weekly:21,monthly:70}[cadence] || 7)*86400000;
}
function marketReferences(report){return marketEvidence(report).filter(item=>item.points.length && item.points.at(-1).value>0 && fresh(item.points.at(-1).date,item.cadence,report.generatedAt)).map(item=>{
 const last=item.points.at(-1),dated=list(report.dailyReferences).find(row=>row.label===item.label && row.unit===item.unit),instant=list(dated?.points).filter(point=>String(point.date).includes('T') && String(point.date).slice(0,10)===last.date && finite(point.value) && Math.abs(point.value-last.value)<.00001 && Date.parse(point.date)<=Date.parse(report.generatedAt)).toSorted((a,b)=>Date.parse(b.date)-Date.parse(a.date))[0];
 return {...item,displayLabel:item.label,last,observedAt:instant?.date || null,previous:item.points.at(-2),periods:marketPeriods(item.points,item.cadence),country:'México'};
});}
function proteinReferences(report,tables){
 const history=marketEvidence(report),records=[];
 for(const table of tables.filter(table=>/^(Cerdo|Res|Pollo|Huevo) · referencias estatales$/.test(table.title))){
  const species=table.title.split(' · ')[0];
  for(const row of table.rows){
   const price=String(row[1]).match(/^([\d,.]+)\s+(MXN\/[^\n]+)$/),period=String(row[4] || ''),cadence=/mensual/.test(period) ? 'monthly' : /semanal/.test(period) ? 'weekly' : 'daily';
   if(!price || !fresh(period,cadence,report.generatedAt))continue;
   const value=numeric(price[1]);if(!(value>0))continue;
   const prefix=species+' · '+row[0]+' · '+row[2],date=period.match(/^\d{4}-\d{2}(?:-\d{2})?/)[0];
   // Changed plaza groups have distinct canonical identities. Only one exact
   // current observation may supply a history; ambiguous matches stay quotes.
   const candidates=cadence==='daily' ? history.filter(item=>item.label.startsWith(prefix+' · ') && item.unit===price[2] && item.points.at(-1)?.date===date && Math.abs(item.points.at(-1).value-value)<=.0051) : [];
   const match=candidates.length===1 ? candidates[0] : null,points=match?.points || (cadence==='daily' ? [{date,value}] : []),last=match?.points.at(-1) || {date,value};
   records.push({...match,label:match?.label || prefix,displayLabel:species+' · '+row[0],state:String(row[0]),country:'México',category:species,unit:price[2],cadence,basis:String(row[2]),market:String(row[3]),source:String(row[5]).split(' · http')[0],url:String(row[5]).match(/https?:\/\/\S+/)?.[0] || '',periodLabel:period,points,last,previous:points.at(-2),periods:cadence==='daily' ? marketPeriods(points,cadence) : {}});
  }
 }
 return records.sort((a,b)=>['Cerdo','Res','Pollo','Huevo'].indexOf(a.category)-['Cerdo','Res','Pollo','Huevo'].indexOf(b.category) || a.state.localeCompare(b.state,'es'));
}
function changesFact(references,weekly){
 const period=weekly ? 'week' : 'day',ranked=references.filter(item=>item.periods[period]).toSorted((a,b)=>Math.abs(b.periods[period].value)-Math.abs(a.periods[period].value));
 const up=ranked.find(item=>item.periods[period].value>0),down=ranked.find(item=>item.periods[period].value<0),selected=[up,down].filter(Boolean);
 if(!selected.length && ranked.length)selected.push(ranked[0]);
 return selected.length ? selected.map(item=>{const change=item.periods[period];return item.displayLabel+': '+directionalChange(change.value)+' ('+change.baseDate+' / '+change.lastDate+').';}).join(' ') : references.length ? references.slice(0,2).map(item=>item.displayLabel+': '+number(item.last.value)+' '+item.unit+' ('+(item.periodLabel || item.last.date)+').').join(' ')+' No hay una base comparable para publicar variación.' : 'No hay cotizaciones recientes verificables en este corte.';
}
function quoteTable(title,records,weekly){
 const period=weekly ? 'week' : 'day',fields=[[period,weekly ? 'Semana %' : 'Día %'],['month','Mes %'],['ytd','Acum. %']].filter(([key])=>records.some(item=>item.periods[key]));
 return {title,printGroup:records.every(item=>item.unit==='MXN por 1 USD') ? 'mexico-fx' : 'mexico-equities',columns:['Referencia','Unidad','Último',weekly ? 'Base semanal' : 'Anterior',...fields.map(([,label])=>label),'Fechas · base / última'],rows:records.map(item=>{const digits=item.unit==='MXN por 1 USD' ? 4 : 2;return [item.displayLabel,item.unit,number(item.last.value,digits),number(weekly ? item.periods.week?.base : item.previous?.value,digits),...fields.map(([key])=>directionalChange(item.periods[key]?.value)),((weekly ? item.periods.week?.baseDate : item.previous?.date) || '—')+' / '+item.last.date];}),note:'Última publicación contra una base de la misma referencia y unidad. Las fechas de cada comparación permanecen identificadas; no es una recomendación de inversión.'};
}
function lineGroups(records,{relative=false,window='trend'}={}){
 const groups=new Map(),visuals=[];
 for(const item of records.filter(item=>item.points.length>=3)){
  const key=JSON.stringify([item.category || 'Emisoras',item.unit,item.cadence,item.basis || 'mercado']);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
 }
 for(const items of groups.values())for(let start=0;start<items.length;start+=4){
  const batch=items.slice(start,start+4),common=relative ? batch[0].points.find(point=>point.value>0 && batch.every(item=>item.points.some(other=>other.date===point.date && other.value>0)))?.date : null;
  if(relative && !common)continue;
  const series=batch.map(item=>{const base=relative ? item.points.find(point=>point.date===common).value : 1;return {label:item.displayLabel,state:item.state || '',points:item.points.filter(point=>!common || point.date>=common).map(point=>({...point,value:point.value/base*(relative ? 100 : 1)}))};});
  if(series.some(item=>item.points.length<3))continue;
  const first=series.flatMap(item=>item.points.map(point=>point.date)).sort()[0],last=series.flatMap(item=>item.points.map(point=>point.date)).sort().at(-1);
  visuals.push({type:'line',title:(batch[0].category || (relative ? 'Emisoras · trayectoria relativa' : 'USD/MXN'))+' · '+first+' / '+last+(items.length>4 ? ' · '+(start/4+1) : ''),unit:relative ? 'Índice base 100' : batch[0].unit,series,mexicoWindow:window,financePalette:true,dataInTables:true,indexBaseDate:common || undefined,note:relative ? 'Base 100 en la primera fecha común observada: '+common+'. Se comparan trayectorias, no precios por acción. Sin interpolar días ni fabricar historia anterior.' : 'Historia disponible de la misma unidad, presentación y frecuencia. Cada referencia conserva sus fechas; las diferencias no equivalen a un costo entregado.'});
 }
 return visuals;
}
function priceCharts(records){
 const groups=new Map();for(const item of records){const key=JSON.stringify([item.category,item.unit,item.basis,item.periodLabel,item.cadence]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 return [...groups.values()].flatMap(items=>{const sorted=items.toSorted((a,b)=>b.last.value-a.last.value);return Array.from({length:Math.ceil(items.length/10)},(_,index)=>({type:'bar',title:items[0].category+' · referencias estatales · '+items[0].periodLabel+(items.length>10 ? ' · '+(index+1) : ''),unit:items[0].unit,bars:sorted.slice(index*10,index*10+10).map(item=>({label:item.state,state:item.state,value:item.last.value})),mexicoWindow:'states',periodLabel:items[0].periodLabel,cadence:items[0].cadence,financePalette:true,dataInTables:true,note:items[0].basis+'. Misma unidad, periodo y frecuencia. Las plazas, calidad y condiciones pueden diferir; no es un promedio nacional ni una oferta de proveedor.'}));});
}
export function mexicoExecutiveReport(input,model,{t:labels=value=>value,source=value=>value}={}){
 if(!isMexicoExecutive(input))return model;
 const report=input.causeText ? mapReportText(input,reportSourceText(input,source)) : input,key=report.baseReport?.key || report.key,profile=profiles[key],weekly=report.analysisPeriod==='weekly',flags=report.personalization?.sections || {},tables=list(report.tables).filter(table=>table.kind!=='guide'),annex=[...list(model.annexTables),...tables],results=[];let references=[],visuals=[],fact='',states=[];
 if(key==='mx_bolsa'){
  const available=marketReferences(report),stocks=available.filter(item=>item.unit==='MXN por acción'),fx=available.filter(item=>item.unit==='MXN por 1 USD');references=[...stocks,...fx];
  if(stocks.length)results.push(quoteTable('Emisoras · cotizaciones y variaciones',stocks,weekly));if(fx.length)results.push(quoteTable('USD/MXN · exposición cambiaria',fx,weekly));
  const grouped=new Map(),period=weekly ? 'week' : 'day';for(const item of stocks.filter(item=>item.periods[period])){const change=item.periods[period],id=change.baseDate+' / '+change.lastDate;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(item);}
  for(const [dates,items] of grouped){const size=Math.ceil(items.length/Math.ceil(items.length/14));for(let start=0;start<items.length;start+=size)visuals.push({type:'bar',title:'Emisoras · '+(weekly ? 'semana' : 'sesión')+' · '+dates+(items.length>14 ? ' · '+(start/size+1) : ''),unit:'%',bars:items.slice(start,start+size).map(item=>({label:item.displayLabel,value:item.periods[period].value})),mexicoWindow:'session',sessionMovement:true,financePalette:true,dataInTables:true,note:'Variación de cada emisora contra su propia base observada. Las empresas no se comparan por el precio absoluto de una acción.'});}
  visuals.push(...lineGroups(stocks,{relative:true}),...lineGroups(fx,{window:'fx'}));fact=changesFact(stocks,weekly);
 }else if(key==='mx_proteins'){
  references=proteinReferences(report,tables);states=[...new Set(references.map(item=>item.state))];
  for(const species of ['Cerdo','Res','Pollo','Huevo']){const records=references.filter(item=>item.category===species);if(!records.length)continue;const changes=records.some(item=>item.periods[weekly ? 'week' : 'day']);results.push({title:species+' · precios publicados por estado',printGroup:'mexico-proteins-'+species,columns:['Estado','Último','Unidad','Etapa / presentación','Base / último publicado',...(changes ? [weekly ? 'Semana %' : 'Día %'] : [])],rowStates:records.map(item=>item.state),rows:records.map(item=>[item.state,number(item.last.value),item.unit,item.basis,item.periods[weekly ? 'week' : 'day'] ? item.periods[weekly ? 'week' : 'day'].baseDate+' / '+item.periods[weekly ? 'week' : 'day'].lastDate : item.periodLabel,...(changes ? [directionalChange(item.periods[weekly ? 'week' : 'day']?.value)] : [])]),note:'Sólo referencias recientes de esta especie. La variación requiere dos observaciones de la misma identidad comercial; los datos semanales o mensuales no reciben cambio diario. Plazas y fuentes completas en anexos.'});}
  visuals=[...lineGroups(references),...priceCharts(references)];fact=changesFact(references,weekly);
 }else if(key==='mx_overview'){
  const main=tables.find(table=>table.title==='Indicadores estructurales');
  if(main){const observations=tables.find(table=>table.title==='Observaciones anuales de las gráficas'),rows=main.rows.flatMap(row=>{const value=annualObserved(report,row[0],row[2],row[3],numeric(row[1]));if(!finite(value) || !/^20\d{2}$/.test(row[3]) || row[3]>report.generatedAt.slice(0,4))return [];const prior=list(observations?.rows).filter(other=>other[0]===row[0] && other[3]===row[2] && /^20\d{2}$/.test(other[1]) && other[1]<row[3] && finite(numeric(other[2]))).toSorted((a,b)=>b[1].localeCompare(a[1]))[0],previous=prior && annualObserved(report,row[0],row[2],prior[1],numeric(prior[2])),change=finite(previous) ? row[2]==='%' ? number(Number((value-previous).toPrecision(12)))+' p. p.' : previous>0 ? directionalChange((value/previous-1)*100) : '—' : '—';return [[row[0],number(value),row[2],row[3],prior ? number(previous)+' ('+prior[1]+')' : '—',change]];});if(rows.length){results.push({title:'Economía nacional · últimas observaciones anuales',columns:['Indicador','Último','Unidad','Año','Anterior publicado','Cambio entre observaciones'],rows,note:'Son indicadores estructurales del año señalado, no datos de la sesión. En tasas expresadas en %, el cambio es en puntos porcentuales; en magnitudes, en porcentaje con base positiva. Las variaciones se calculan antes de redondear los valores mostrados.'});fact=rows.slice(0,2).map(row=>row[0]+': '+row[1]+' '+row[2]+' ('+row[3]+'); anterior '+row[4]+'.').join(' ');}}
  references=marketReferences(report).filter(item=>/por 1 USD/.test(item.unit));if(references.length)results.push(quoteTable('USD/MXN · contexto de pagos y cobros',references,weekly));
  visuals=list(report.visuals).filter(visual=>visual.type==='bar').flatMap(visual=>{const scale=visual.title.startsWith('Remesas recibidas') ? 1e9 : visual.unit==='personas' ? 1e6 : 1,unit=scale===1e9 ? 'Miles de millones de USD' : scale===1e6 ? 'Millones de personas' : visual.unit,bars=list(visual.bars).filter(bar=>/^20\d{2}$/.test(bar.label) && bar.label<=report.generatedAt.slice(0,4) && finite(bar.value)).map(bar=>({...bar,value:bar.value/scale}));return bars.length ? [{...visual,unit,bars,mexicoWindow:'years',financePalette:true,dataInTables:true,note:visual.note+' Se conservan todos los años disponibles; no se convierte una observación anual en variación diaria.'+(scale!==1 ? ' Escala gráfica dividida entre '+number(scale)+'; las tablas conservan la unidad publicada.' : '')}] : [];});visuals.push(...lineGroups(references,{window:'fx'}));
 }else{
  const grains=tables.find(table=>/^Granos por entidad/.test(table.title)),mining=tables.find(table=>/^Valor minero por entidad/.test(table.title)),concentration=tables.find(table=>/^Concentración de los volúmenes agrícolas/.test(table.title));
  if(concentration){results.push({...concentration,title:'Concentración agrícola · alcance del abastecimiento'});fact=concentration.rows.slice(0,2).map(row=>row[0]+': '+row[5]+' del volumen registrado en '+row[3]+'.').join(' ');}
  if(grains)results.push({...grains,rowStates:grains.rows.map(row=>row[0])});if(mining)results.push({...mining,columns:mining.columns.slice(0,3),rows:mining.rows.map(row=>row.slice(0,3)),rowStates:mining.rows.map(row=>row[0]),note:'Valor registrado del periodo del título, no precio de minerales ni producción disponible hoy. El desglose de minerales se conserva en anexos.'});
  states=[...new Set([...(grains?.rows || []),...(mining?.rows || [])].map(row=>row[0]))];
  visuals=list(report.visuals).filter(visual=>visual.type==='bar').map(visual=>{const mineral=/Minería/.test(visual.title),year=(mineral ? mining?.title : grains?.title)?.match(/20\d{2}/)?.[0] || '';return {...visual,title:visual.title+(year ? ' · '+year : ''),periodLabel:year,unit:mineral ? 'Miles de millones de MXN' : visual.unit,note:mineral ? visual.note+' Los valores de la gráfica se dividen entre 1,000,000,000; la tabla conserva los MXN publicados.' : visual.note,mexicoWindow:mineral ? 'mining' : 'production',financePalette:true,dataInTables:true,bars:visual.bars.map(bar=>({...bar,state:bar.label,value:mineral ? bar.value/1e9 : bar.value}))};});
  visuals=visuals.map(visual=>{const mineral=visual.mexicoWindow==='mining',table=mineral ? mining : grains,column=mineral ? 1 : table?.columns.findIndex(label=>label.startsWith(visual.title.split(' · ')[0]+' (')),known=new Map(visual.bars.map(bar=>[bar.state,bar]));if(!table || column<1)return visual;const all=table.rows.flatMap(row=>{const value=numeric(row[column]);return value>0 ? [known.get(row[0]) || {label:row[0],state:row[0],value:mineral ? value/1e9 : value}] : [];}).toSorted((a,b)=>b.value-a.value);return {...visual,mexicoAllBars:all,note:'Periodo '+visual.periodLabel+'. Entidades ordenadas de mayor a menor valor registrado. El explorador permite consultar todas las entidades con valor positivo; las tablas conservan las ausencias sin convertirlas en cero. '+(mineral ? 'La gráfica expresa miles de millones de MXN; la tabla conserva los pesos publicados. Es valor de producción, no cotización de minerales.' : 'Volumen agrícola histórico; no representa inventario comercial disponible.')};});
  visuals=visuals.map(visual=>visual.mexicoAllBars ? {...visual,mexicoRegisteredTotal:visual.mexicoAllBars.reduce((sum,item)=>sum+item.value,0)} : visual);
  if(concentration)visuals.unshift({type:'bar',title:'Concentración agrícola · participación de las tres mayores entidades',unit:'%',periodLabel:grains?.title.match(/20\d{2}/)?.[0] || '',mexicoWindow:'concentration',financePalette:true,dataInTables:true,bars:concentration.rows.flatMap(row=>{const value=numeric(String(row[5]).replace(/\s*%$/,''));return finite(value) ? [{label:row[0],value}] : []; }),note:concentration.note});
 }
 const signals=mexicoSignals(key,{results,references,visuals,weekly});
 const observed=references.filter(item=>item.observedAt).map(item=>item.observedAt).toSorted(),timing=observed.length ? 'Referencias con hora registrada: '+observed[0].replace('T',' ').replace('.000Z',' UTC')+' / '+observed.at(-1).replace('T',' ').replace('.000Z',' UTC')+'. La última referencia puede ser intradía; no equivale a un cierre definitivo.' : '';
 const brief=mexicoExecutiveBrief(key,{results,references,signals,weekly,timing,profile,risks:flags.risks!==false,fallback:fact}),summary=brief.summary,summaryPanels=brief.panels;
 if(signals.length && flags.tables!==false)annex.push({title:'Señales ejecutivas de México',columns:['Indicador','Valor','Unidad','Periodo observado','Alcance'],rows:signals.map(item=>[item.label,item.value,item.unit,item.period,item.detail])});
 if(observed.length && flags.tables!==false)annex.push({title:'Hora conservada de las referencias de mercado',columns:['Referencia','Unidad','Último','Fecha y hora original'],rows:references.filter(item=>item.observedAt).map(item=>[item.label,item.unit,item.last.value,item.observedAt]),note:'Hora de la observación guardada. Un dato intradía no sustituye al cierre definitivo publicado después del corte.'});
 if(flags.charts===false)visuals=[];
 const leader=key==='mx_proteins' ? references.filter(item=>item.periods[weekly ? 'week' : 'day']).toSorted((a,b)=>Math.abs(b.periods[weekly ? 'week' : 'day'].value)-Math.abs(a.periods[weekly ? 'week' : 'day'].value))[0] : null,egg=visuals.findIndex(visual=>visual.mexicoWindow==='states' && visual.title.startsWith('Huevo ·')),preferred=leader ? visuals.findIndex(visual=>visual.series?.some(item=>item.label===leader.displayLabel) || visual.title.startsWith(leader.category+' ·') && visual.bars?.some(bar=>bar.state===leader.state)) : 0,lead=preferred<0 ? 0 : preferred;
 visuals=visuals.map((visual,index)=>({...visual,displayDigits:2,executiveLead:index===lead,requiredInPrint:visual.mexicoWindow==='fx' || key==='mx_production' && visual.mexicoWindow==='mining' || key==='mx_proteins' && index===egg}));
 const visible=flags.tables===false ? [] : results,blocks=[{key:'session',label:'Lectura ejecutiva'},...(visuals.length ? [{key:'charts',label:'Comparativas y evolución'}] : []),...(visible.length ? [{key:'comparisons',label:'Datos del corte y contexto'}] : [])].map((block,index)=>({...block,number:String(index+1)}));
 const output={...model,mexicoExecutive:{key,period:weekly ? 'week' : 'day',title:profile.title,scope:profile.scope,timing,cutoff:report.generatedAt,signals,states:states.toSorted((a,b)=>a.localeCompare(b,'es'))},focusedMarket:true,sessionReport:true,causes:null,summary,summaryPanels,commentary:summaryPanels,metrics:[],references,results:visible,visuals,annexTables:annex,blocks,coverage:'',followup:[],chartNotes:[]};
 return mapReportText(output,value=>input.causeText?.[value] || labels(value));
}

export function filteredMexicoModel(model,{state='',query=''}={}, {t=value=>value,source=value=>value}={}){
 if(!state && !query)return model;
 const match=text=>!query || fold(text).includes(fold(query));
 const results=model.results.flatMap(table=>{const indices=table.rows.flatMap((row,index)=>(!state || table.rowStates?.[index]===state) && match(table.title+' '+row.join(' ')) ? [index] : []);return indices.length ? [{...table,rows:indices.map(index=>table.rows[index]),...(table.rowStates ? {rowStates:indices.map(index=>table.rowStates[index])} : {})}] : [];});
 const visuals=model.visuals.map(visual=>{
  if(visual.type!=='bar')return {...visual,series:visual.series.filter(item=>(!state || item.state===state) && match(item.label+' '+visual.title))};
  const bars=(visual.mexicoAllBars || visual.bars).filter(bar=>(!state || bar.state===state) && match(bar.label+' '+visual.title));
  return {...visual,title:visual.mexicoAllBars ? visual.title.split(' · ')[0]+' · '+visual.periodLabel : visual.title,bars:visual.mexicoAllBars ? bars.slice(0,10) : bars,...(visual.mexicoAllBars ? {mexicoAllBars:bars,mexicoRegisteredTotal:visual.mexicoRegisteredTotal ?? visual.mexicoAllBars.reduce((sum,item)=>sum+item.value,0),mexicoSelection:true} : {})};
 }).filter(visual=>visual.type==='bar' ? visual.bars.length : visual.series.length);
 const references=model.references.filter(item=>(!state || item.state===state) && match([item.label,item.displayLabel,item.state].join(' '))),canonical=mapReportText({results,references,visuals},source);
 const signals=mexicoSignals(model.mexicoExecutive.key,{...canonical,weekly:model.mexicoExecutive.period==='week'},t),selection=[state,query].filter(Boolean).join(' · ');
 const summary=String(t('Las tablas y gráficas corresponden a {selection}. El contexto empresarial siguiente es nacional.',{selection})).replace('{selection}',selection);
 const panels=results.length || visuals.length ? [{heading:t('Selección visible'),body:summary},...model.summaryPanels.slice(1).map(panel=>({...panel,heading:t('Contexto nacional')+' · '+panel.heading}))] : [];
 return {...model,references,mexicoExecutive:{...model.mexicoExecutive,signals,selection},summary:panels.length ? summary : '',summaryPanels:panels,commentary:panels,results:uniqueTableNotes(results),visuals,blocks:model.blocks.filter(block=>block.key==='charts' ? visuals.length : block.key==='comparisons' ? results.length : true).map((block,index)=>({...block,number:String(index+1)}))};
}
