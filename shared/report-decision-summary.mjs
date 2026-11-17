import {mapReportText} from './report-localized-text.mjs';
const finite=Number.isFinite;
const n=value=>value.toLocaleString('es-MX',{maximumFractionDigits:2});
const short=(value,max=150)=>String(value || '').length<=max ? String(value || '') : String(value).slice(0,max).replace(/\s+\S*$/,'')+'…';
const fold=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const stamp=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && finite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const isFuture=reference=>/=F$/.test(reference.symbol || '') || /^(?:futuro|future|continuous|serie.*(?:futur|continu)|contrato.*futur)/i.test(reference.basis || '');

export function observedChange(reference,cutoff,period='day'){
 const change=reference?.periods?.[period];
 if(!change || !finite(Date.parse(cutoff)) || !finite(change.base) || !finite(change.last) || !stamp(change.baseDate) || !stamp(change.lastDate) || change.baseDate>=change.lastDate || Date.parse(change.lastDate)>Date.parse(cutoff) || reference.last?.date!==change.lastDate || reference.last?.value!==change.last || Date.parse(cutoff)-Date.parse(change.lastDate)>(period==='week' ? 14 : 7)*86400000)return null;
 return {...change,delta:change.last-change.base};
}

export function referenceImpact(reference,change,{kind='physical'}={}){
 if(!change || !finite(change.delta))return null;
 let quantity,unit,amount,currency=reference.currency;
 if(kind==='fx'){
  if(reference.unit!=='MXN por 1 USD')return null;
  quantity=100000;unit='USD';currency='MXN';amount=change.delta*quantity;
 }else if(kind==='equity'){
  if(change.base<=0)return null;quantity=100000;unit=currency || '';
  if(!unit)return null;amount=quantity*(change.last/change.base-1);
 }else if(kind==='funding'){
  if(!currency || reference.unit!=='%')return null;quantity=1000000;unit=currency;amount=quantity*change.delta/100;
 }else{
  if(isFuture(reference) || ['reference','unavailable','unconfirmed'].includes(reference.quoteStatus) || reference.evidenceOrigin==='catalog')return null;
  const label=String(reference.unit || '');currency=/^(MXN|USD|EUR|BRL|CAD|PEN)\//.exec(label)?.[1];
  if(!currency)return null;
  if(/\/(?:kg|100\s*lb|lb)(?:\b|$)/i.test(label)){quantity=1000;unit=/vivo/i.test(label) ? 'kg vivo' : 'kg';const divisor=/\/100\s*lb/i.test(label) ? 45.359237 : /\/lb/i.test(label) ? .45359237 : 1;amount=change.delta*quantity/divisor;}
  else if(/\/saco 60 kg$/i.test(label)){quantity=1000;unit='kg';amount=change.delta*quantity/60;}
  else if(/\/(?:barril|bbl)\b/i.test(label)){quantity=1000;unit='barriles';amount=change.delta*quantity;}
  else if(/\/(?:t|tonelada)$/i.test(label)){quantity=100;unit='toneladas';amount=change.delta*quantity;}
  else return null;
 }
 if(!finite(amount))return null;
 const action=amount>0 ? 'aumento de' : amount<0 ? 'reducción de' : 'un cambio de';
 let body;
 if(kind==='fx')body='Escala ilustrativa: por cada '+n(quantity)+' USD pendientes de pago, el movimiento observado equivale a '+action+' '+n(Math.abs(amount))+' MXN, antes de coberturas y comisiones.';
 else if(kind==='equity')body='Escala ilustrativa: '+n(quantity)+' '+currency+' de exposición equivalente a '+short(reference.label,70)+' variarían '+(amount>0 ? '+' : amount<0 ? '-' : '')+n(Math.abs(amount))+' '+currency+' por precios, antes de dividendos y costos; no es la cartera de la empresa.';
 else if(kind==='funding')body='Sensibilidad ilustrativa: si '+n(quantity)+' '+currency+' de deuda variable se reajustan por el mismo cambio de '+short(reference.label,40)+', el interés anual cambiaría '+(amount>0 ? '+' : amount<0 ? '-' : '')+n(Math.abs(amount))+' '+currency+'. Requiere revisión contractual; la deuda fija no se reajusta.';
 else body='Escala ilustrativa de '+short(reference.displayLabel || reference.label,85)+': por cada '+n(quantity)+' '+unit+', la variación equivale a '+action+' '+n(Math.abs(amount))+' '+currency+' en esa misma referencia. No incluye calidad, rendimiento, flete ni impuestos.';
 return {illustrative:true,quantity,unit,currency,amount,unitChange:change.delta,baseDate:change.baseDate,lastDate:change.lastDate,reference:reference.displayLabel || reference.label,body};
}

export function withDecisionSummary(report,model,{t=value=>value}={}){
 if(report.periodType==='annual' || report.userEdition || report.aiEdition)return model;
 const key=report.baseReport?.key || report.key,main=report.analysisPeriod==='weekly' ? 'week' : 'day',refs=model.references || [],cutoff=report.generatedAt;
 let changeBody=model.summary || '',impact='',priority='',illustration=null,requiredInputs=[],context=[];
 const illustrative=(reference,kind)=>referenceImpact(reference,observedChange(reference,cutoff,main),{kind});
 const fxRef=items=>items.find(item=>item.unit==='MXN por 1 USD' && observedChange(item,cutoff,main));
 if(model.newsExecutive){
  const story=model.newsExecutive.stories[0];
  changeBody=story ? 'Publicación prioritaria: '+story.title+' · '+story.source+' · '+story.publishedAt.slice(0,10)+'.' : 'No hay publicaciones verificables en la ventana de este informe.';
  impact=story ? story.effect : 'Sin evidencia publicada suficiente para estimar un impacto.';
  priority=story ? story.watch : 'Revisar la siguiente consulta de fuentes antes de emitir una alerta o atribuir un cambio de mercado.';
 }else if(model.panorama){
  const signals=model.panorama.signals || [],items=signals.map(item=>({...item,last:{date:item.date,value:item.numericValue},periods:{[main]:{base:item.baseValue,last:item.numericValue,baseDate:item.baseDate,lastDate:item.date}}}));
  changeBody=signals.length ? signals.slice(0,3).map(item=>item.label+': '+(finite(item.numericChange) && item.baseDate ? (item.numericChange>0 ? 'subió ' : item.numericChange<0 ? 'bajó ' : 'sin cambio: ')+n(Math.abs(item.numericChange))+' '+item.changeUnit+' ('+item.baseDate+' / '+item.date+')'+(item.kind==='structural' ? ' · contexto anual' : '') : item.value+' '+item.unit+' ('+item.date+') · última publicación')).join('; ')+'. Cada referencia conserva su periodo.' : model.summary;
  illustration=illustrative(fxRef(items),'fx');
  impact=illustration?.body || model.panorama.implications[0]?.body || 'Relacionar las referencias publicadas con los contratos de la empresa antes de medir el efecto en caja.';
  const scope=model.panorama.scope;
  priority=scope==='markets' ? 'Compras: antes de fijar la próxima operación, ordenar alimento, energía y proteína por volumen comprometido y fecha de reposición. Confirmar costo entregado e inventario; recalcular si cambia el precio físico o la oferta del proveedor.' : scope==='mexico' ? 'Dirección y Compras: antes de contratar abasto o revisar el presupuesto, cruzar referencias de México con proveedores, pedidos y caja actuales. Separar estructura anual de disponibilidad de hoy; actualizar al confirmarse una nueva cotización o publicación.' : 'Dirección y Tesorería: antes de fijar compras o pagos, priorizar vencimientos próximos y datos recientes. Separar contexto anual o mensual de cambios de sesión; recalcular al publicarse la referencia del contrato.';
  requiredInputs=scope==='markets' ? ['Volumen por producto y fecha de reposición','Inventario, calidad, moneda y flete'] : ['Flujos netos por moneda y vencimiento','Compras por producto, presentación y destino'];
 }else if(model.equityExecutive){
  const desk=model.equityExecutive,sp=refs.find(item=>item.symbol==='^GSPC') || refs.find(item=>item.label==='S&P 500');
  illustration=illustrative(sp,'equity');impact=illustration?.body || desk.business[0]?.body || 'Falta una base comparable para medir el movimiento del índice.';
  priority='Finanzas: antes de cambiar exposición, contrastar el siguiente cierre de '+(sp?.label || 'la bolsa')+' con VIX y crédito del mismo periodo. Necesario: posiciones, moneda y horizonte. Si las fechas no coinciden, mantener la lectura de riesgo como parcial.';
  requiredInputs=['Posiciones, moneda y horizonte de la cartera'];
  const evidence=model.summaryPanels?.find(item=>item.heading==='Contexto y evidencia');if(evidence)context=[evidence];
 }else if(model.bondExecutive){
  const desk=model.bondExecutive,rate=refs.find(item=>item.id==='SOFR' && observedChange(item,cutoff,main)) || refs.find(item=>item.id==='SF331451' && observedChange(item,cutoff,main));
  illustration=illustrative(rate,'funding');impact=illustration?.body || desk.business[0]?.body;
  priority='Tesorería: antes de la próxima revisión de deuda, conciliar saldo variable, referencia, spread y vencimiento. Recalcular si cambia la tasa pactada; para valorar bonos se necesitan duración y cupón.';
  requiredInputs=['Saldo variable, referencia, spread y revisión contractual','Duración y cupón de las posiciones'];
  const evidence=model.summaryPanels?.find(item=>item.heading==='Contexto y evidencia');if(evidence)context=[evidence];
 }else if(model.fxExecutive || key==='mx_bolsa'){
  const reference=fxRef(refs),change=observedChange(reference,cutoff,main);
  if(change)changeBody=(reference.displayLabel || reference.label)+': de '+change.base.toLocaleString('es-MX',{maximumFractionDigits:4})+' a '+change.last.toLocaleString('es-MX',{maximumFractionDigits:4})+' '+reference.unit+' ('+change.baseDate+' / '+change.lastDate+').';
  illustration=referenceImpact(reference,change,{kind:'fx'});impact=illustration?.body || 'Sin una base comparable de USD/MXN para cuantificar el cambio.';
  priority='Tesorería: antes del próximo pago en USD, conciliar importe neto, vencimiento y cobertura contratada. Solicitar precio bancario para ese flujo; recalcular si cambia la referencia o el calendario de pagos.';
  requiredInputs=['Importe neto, fecha de pago y cobertura vigente'];
 }else if(key==='mx_production' || model.mexicoExecutive?.key==='mx_overview'){
  const signal=model.mexicoExecutive?.signals?.[0];impact=signal ? signal.label+': '+signal.value+' '+signal.unit+' ('+signal.period+'). '+signal.detail : 'El periodo histórico permite contextualizar la exposición; no mide disponibilidad comercial de hoy.';
  priority=key==='mx_production' ? 'Compras: antes de contratar abasto, cruzar concentración histórica con proveedores, inventarios, cosecha y rutas vigentes. Un cambio de disponibilidad confirmado requiere revisar el origen; la producción histórica no es inventario vendible.' : 'Dirección: antes de revisar el presupuesto, contrastar el contexto anual con pedidos, costos y caja actuales. Actualizar el escenario con la siguiente publicación económica; no interpretar una variación anual como cambio de sesión.';
  requiredInputs=key==='mx_production' ? ['Proveedores y orígenes de abasto','Inventario, contratos y rutas actuales'] : ['Pedidos, costos y presupuesto actuales'];
 }else{
  const physical=refs.filter(item=>observedChange(item,cutoff,main) && !isFuture(item) && !['reference','unavailable','unconfirmed'].includes(item.quoteStatus) && item.evidenceOrigin!=='catalog');
  const mexican=physical.filter(item=>/mexico/.test(fold(item.country || item.market)) || item.state);
  const candidates=[...mexican,...physical];let chosen;
  for(const candidate of candidates){const sample=illustrative(candidate,'physical');if(sample && (!illustration || Math.abs(sample.amount)>0)){illustration=sample;chosen=candidate;if(Math.abs(sample.amount)>0)break;}}
  if(chosen){const change=observedChange(chosen,cutoff,main);changeBody=(chosen.displayLabel || chosen.label)+': de '+n(change.base)+' a '+n(change.last)+' '+chosen.unit+' ('+change.baseDate+' / '+change.lastDate+').';}
  impact=illustration?.body || model.summaryPanels?.find(item=>/impacto|repercusiones|margen/.test(fold(item.heading)))?.body || 'Faltan bases físicas comparables para cuantificar un costo de compra. Mantener separados precios físicos, futuros y contexto histórico.';
  const purchasing={
   grains:{priority:'Compras: antes de reponer alimento, cruzar existencias y consumo de la fórmula con ofertas del mismo grano, calidad y destino. Cotizar costo entregado; revisar campaña, base local, divisa y flete si cambia el origen o la fecha de entrega.',inputs:['Consumo de la fórmula, existencias y próxima entrega','Grano, calidad, origen, divisa y flete']},
   proteins:{priority:'Compras: antes de reponer proteína, cotizar la misma especie, corte y etapa comercial. Cruzar inventario y pedidos con rendimiento, merma y próxima entrega; recalcular el costo por kg vendible si cambia el precio físico o el rendimiento.',inputs:['Volumen, especie, corte y etapa comercial','Inventario, pedidos, rendimiento, merma y flete']},
   energy_metals:{priority:'Operaciones: antes del próximo ajuste de tarifa, conciliar consumo y referencia contractual de combustible, energía o metal. Confirmar fecha y fórmula de ajuste; recalcular el costo por unidad producida con la factura y el consumo reales.',inputs:['Consumo y unidades producidas','Referencia, fórmula y fecha de ajuste contractual']},
  }[key];
  priority=purchasing?.priority || 'Compras: antes de fijar la siguiente operación, cotizar la misma presentación, volumen y destino. Comparar costo entregado con inventario y próxima entrega; actualizar si cambia la oferta, el flete o el rendimiento.';
  requiredInputs=purchasing?.inputs || ['Volumen, presentación, origen y destino','Flete, rendimiento, impuestos e inventario'];
  context=(model.summaryPanels || []).filter(item=>/contexto publicado|oferta y demanda/.test(fold(item.heading))).slice(0,1);
 }
 const panels=[{summaryKind:'session',heading:'Qué cambió',body:changeBody},{summaryKind:'implications',heading:'Cuánto importa',body:impact},...(report.personalization?.sections?.risks===false ? [] : [{summaryKind:'watch',heading:'Qué revisar primero',body:priority}])].filter(item=>item.body);
 // Keep the verified quantitative impact and use the validated editorial
 // interpretation in the same three panels consumed by reading and PDFs.
 const brief=report.executiveBrief;
 if(brief?.mode==='ai' && /^[a-f0-9]{64}$/.test(brief.evidenceHash || ''))for(const panel of panels){
  if(panel.summaryKind==='session' && typeof brief.thesis==='string' && brief.thesis.length<=420)panel.body=brief.thesis;
  if(panel.summaryKind==='watch' && typeof brief.committeeQuestion==='string' && brief.committeeQuestion.length<=260)panel.body=brief.committeeQuestion;
 }
 const localized=mapReportText({panels,illustration,requiredInputs},value=>report.causeText?.[value] || t(value));
 const result={...model,decisionSummary:localized,summaryPanels:[...localized.panels,...context],commentary:[...localized.panels,...context]};
 if(model.fxExecutive)result.fxExecutive={...model.fxExecutive,bullets:localized.panels};
 if(model.panorama)result.panorama={...model.panorama,implications:report.personalization?.sections?.risks===false ? [] : localized.panels};
 return result;
}
