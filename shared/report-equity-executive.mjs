import {safeEquityContext,equityUsdChange,equityCurrency} from './report-equity-context.mjs';
import {mapReportText} from './report-localized-text.mjs';
import {LATAM_COUNTRIES,equityYearComparison,equityBenchmarkChart} from './report-equity-history.mjs';
import {globalEquityComparison} from './report-equity-comparison.mjs';
const finite=Number.isFinite;
const n=value=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:3}) : '—';
const pct=value=>finite(value) ? (value>0 ? '↑ +' : value<0 ? '↓ ' : '→ ')+n(value)+' %' : '—';
const bp=value=>finite(value) ? (value>0 ? '↑ +' : value<0 ? '↓ ' : '→ ')+n(value)+' pb' : '—';
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const brief=(text,limit)=>String(text).length<=limit ? String(text) : String(text).slice(0,limit).replace(/\s+\S*$/,'')+'…';
const group=item=>item.country==='Estados Unidos' ? 'Wall Street' : item.region==='Europa' ? 'Europa' : ['México','Brasil','Argentina','Chile','Colombia','Perú'].includes(item.country) ? 'Latinoamérica' : item.region==='Asia' ? 'Asia' : 'Otros mercados';
const groups=['Wall Street','Europa','Latinoamérica','Asia','Otros mercados'];
const aligned=(a,b)=>a && b && a.baseDate===b.baseDate && a.lastDate===b.lastDate;
function comparison(references,symbols,title,t){
  const selected=symbols.map(symbol=>references.find(item=>item.symbol===symbol && item.returnBasis!=='total-return')).filter(Boolean);if(selected.length<2)return null;
  const common=selected[0].points.filter(point=>point.date>='2020-01-01' && selected.every(item=>item.points.some(value=>value.date===point.date && value.value>0)));
  if(common.length<2)return null;
  const first=common[0].date,last=common.at(-1).date;
  return {type:'line',title:t(title),unit:t('Índice base 100'),equityComparison:true,dataInTables:true,indexBaseDate:first,indexEndDate:last,series:selected.map(item=>{const base=item.points.find(point=>point.date===first).value;return {label:item.label,points:item.points.filter(point=>point.date>=first && point.date<=last).map(point=>({date:point.date,value:point.value/base*100}))};}),note:t('Base común observada')+': '+first+' / '+last+'. '+t('Moneda local; índices de precios. DAX e Ibovespa, de retorno total, permanecen en la tabla y se excluyen de estas comparativas. No se rellenan días ni historias anteriores a la fuente.')};
}
function catalysts(report,context,baseDate,lastDate){
  const rows=[...context.news,...safeEquityContext({news:report.equityNews},report.generatedAt).news],seen=new Set(),topics=new Set(),result=[];
  const topic=item=>/fed\b|fomc|ecb|banxico|bce\b|monetar|interest rate|tasa de interes/.test(fold(item.title+' '+item.description)) ? 'Tasas y liquidez' : /inflaci|inflation|employment|empleo|nomina|payroll|cpi\b/.test(fold(item.title+' '+item.description)) ? 'Inflación y empleo' : /earnings|results|utilidad|resultados|revenue|semiconductor|chip\b|opi\b|ipo\b|salida a bolsa|tecnolog/.test(fold(item.title+' '+item.description)) ? 'Resultados y sectores' : /tariff|arancel|oil|petroleo|energy|comercio|trade|conflicto/.test(fold(item.title+' '+item.description)) ? 'Comercio y costos' : '';
  const channels={'Tasas y liquidez':'Canal: tasas esperadas y costo de fondeo; revisar la reacción del Treasury y del dólar.','Inflación y empleo':'Canal: expectativas de tasas y demanda; contrastar el dato publicado con el consenso antes de extrapolar.','Resultados y sectores':'Canal: expectativas de ventas y márgenes; contrastar el liderazgo sectorial con la contribución de las emisoras.','Comercio y costos':'Canal: costos de insumos y suministro; distinguir productores de empresas consumidoras.'};
  for(const item of rows){const day=String(item.publishedAt || '').slice(0,10),key=topic(item);if(!key || topics.has(key) || seen.has(item.url) || !item.url || !finite(Date.parse(item.publishedAt)) || Date.parse(item.publishedAt)>Date.parse(report.generatedAt) || day>lastDate || day<=baseDate)continue;topics.add(key);seen.add(item.url);result.push({...item,topic:key,channel:channels[key]});if(result.length===3)break;}
  return result;
}
export function equityExecutiveReport(report,model,{t:translate=value=>value,periods}={}){
  const t=value=>value;
  const context=safeEquityContext(report.equityContext,report.generatedAt),main=report.analysisPeriod==='weekly' ? 'week' : 'day';
  const references=model.references.map(item=>({...item,returnBasis:['^GDAXI','^BVSP','^MERV'].includes(item.symbol) ? 'total-return' : 'source-index',currency:equityCurrency(item.currency),usdPeriods:Object.fromEntries(['day','week','month','quarter','semester','year','ytd'].map(key=>[key,equityUsdChange(item,item.periods[key],context)]))}));
  const signals=context.quotes.map(item=>({...item,last:item.points.at(-1),previous:item.points.at(-2),periods:periods(item.points)}));
  const byId=id=>signals.find(item=>item.id===id),sp=references.find(item=>item.symbol==='^GSPC') || references.find(item=>item.label==='S&P 500');
  const mainSp=sp?.periods[main],vix=byId('vix'),credit=byId('credit'),ten=byId('us10y'),dxy=byId('dxy');
  const usable=mainSp && [vix,credit].every(item=>aligned(item?.periods[main],mainSp));
  const defensive=usable && mainSp.value<0 && vix.periods[main].value>0 && credit.periods[main].value>0;
  const favorable=usable && mainSp.value>0 && vix.periods[main].value<0 && credit.periods[main].value<=0;
  const risk={label:t(!usable ? 'Lectura de riesgo parcial' : defensive ? 'Sesgo defensivo' : favorable ? 'Sesgo favorable' : 'Señales mixtas'),tone:defensive ? 'down' : favorable ? 'up' : 'neutral',basis:t(usable ? 'Termómetro de EE. UU.: S&P 500, VIX y crédito de alto rendimiento con las mismas fechas; no es un pronóstico global.' : 'El semáforo requiere bolsa, VIX y crédito con las mismas fechas; las referencias disponibles conservan su fecha.')};
  const dashboard=['vix','us10y','credit','dxy','wti'].map(byId).filter(Boolean).map(item=>{const change=item.periods[main],rates=['yield','spread'].includes(item.role);return {...item,value:n(item.last.value)+' '+item.unit,change:change ? rates ? bp((change.last-change.base)*100) : pct(change.value) : '—',dates:change ? change.baseDate+' / '+change.lastDate : item.last.date};});
  const ranked=references.filter(item=>finite(item.periods[main]?.value)).sort((a,b)=>b.periods[main].value-a.periods[main].value),up=ranked.find(item=>item.periods[main].value>0),down=[...ranked].reverse().find(item=>item.periods[main].value<0);
  const fact=[...new Map([sp?.periods[main] ? sp : null,up,down].filter(Boolean).map(item=>[item.label,item])).values()].map(item=>item.label+' '+pct(item.periods[main].value)+' ('+item.periods[main].baseDate+' / '+item.periods[main].lastDate+')').join('; ') || model.summary;
  const baseDate=mainSp?.baseDate || ranked[0]?.periods[main]?.baseDate || report.generatedAt.slice(0,10),lastDate=mainSp?.lastDate || ranked[0]?.last.date || report.generatedAt.slice(0,10);
  const movers=catalysts(report,context,baseDate,lastDate),sectors=signals.filter(item=>item.role==='sector' && item.periods[main]);
  const sectorRank=[...sectors].sort((a,b)=>b.periods[main].value-a.periods[main].value);
  const rotation=sectorRank.length>1 ? t('En EE. UU. lidera')+' '+t(sectorRank[0].label)+' '+pct(sectorRank[0].periods[main].value)+'; '+t('el mayor rezago corresponde a')+' '+t(sectorRank.at(-1).label)+' '+pct(sectorRank.at(-1).periods[main].value)+'.' : '';
  const rates=ten?.periods[main] ? 'Treasury 10A '+n(ten.last.value)+' %; '+bp((ten.periods[main].last-ten.periods[main].base)*100)+' ('+ten.periods[main].baseDate+' / '+ten.last.date+').' : '';
  const explanation=movers[0] ? t('Según')+' '+brief(movers[0].source.replace(' · RSS de noticias',''),60)+' ('+movers[0].publishedAt.slice(0,10)+'): '+brief(movers[0].title,160)+'. '+t(movers[0].channel) : [rotation,rates].filter(Boolean).join(' ') || t('Vigilar el próximo anuncio de tasas, inflación o resultados junto con la reacción de las bolsas; el informe no asigna un detonante sin una publicación fechada.');
  const scenario=sp?.last ? t('Próxima sesión: vigilar el S&P 500 frente a su último cierre de')+' '+n(sp.last.value)+' '+t('puntos y si el VIX confirma. Una divergencia debilitaría la continuidad del movimiento.') : t('Próxima sesión: vigilar la dirección de las bolsas junto con volatilidad, dólar y rendimientos antes de ampliar exposición.');
  const summaryPanels=[{heading:t('Qué pasó'),body:fact+'.'},{heading:t('Catalizadores y rotación'),body:explanation},{heading:t('Qué vigilar'),body:scenario}];
  const masterGroups=groups.map(label=>({label:t(label),references:references.filter(item=>group(item)===label)})).filter(item=>item.references.length);
  const masterTables=masterGroups.map(({label,references})=>({title:label+' · '+t('tabla maestra de bolsas'),equityMaster:true,columns:['Índice','País','Cierre · puntos',main==='week' ? 'Semana · %' : 'Día · %',main==='week' ? 'Semana USD · %' : 'Día USD · %','Mes · %','YTD · %','Sesiones comparadas'].map(t),rows:references.map(item=>[item.label+(item.returnBasis==='total-return' ? ' †' : ''),t(item.country),n(item.last.value),pct(item.periods[main]?.value),pct(item.usdPeriods[main]?.value),pct(item.periods.month?.value),pct(item.periods.ytd?.value),item.periods[main] ? item.periods[main].baseDate+' / '+item.periods[main].lastDate : item.last.date]),note:t('Día: dos últimas sesiones publicadas. Semana: siete días calendario. Mes: fecha equivalente; YTD: base de cierre del año anterior. USD exige divisa identificada y FX de ambas fechas; — indica que falta una base comparable, no rendimiento cero.')+' '+t('† DAX e Ibovespa incorporan dividendos; sus metodologías no se homogeneizan con índices de precios.')}));
  const levels=(items,title)=>items.length ? {title:t(title),equityContext:true,columns:['Referencia','Último','Unidad','Cambio de sesión','Fecha base','Fecha del dato'].map(t),rows:items.map(item=>{const change=item.periods[main];return [t(item.label),n(item.last.value),item.unit,change ? ['yield','spread'].includes(item.role) ? bp((change.last-change.base)*100) : pct(change.value) : '—',change?.baseDate || '—',item.last.date];}),note:t('Cada referencia conserva fuente, unidad y sus fechas. Futuros: no equivalen a costos físicos entregados ni a retorno por renovación de contratos.')} : null;
  const sectorTable=sectors.length ? {title:t('Rotación sectorial · Estados Unidos'),equityContext:true,columns:['Sector / ETF',main==='week' ? 'Semana · %' : 'Día · %','Mes · %','YTD · %'].map(t),rows:sectors.map(item=>[t(item.label)+' · '+item.symbol,pct(item.periods[main]?.value),pct(item.periods.month?.value),pct(item.periods.ytd?.value)]),note:t('ETF sectoriales SPDR de EE. UU.; variación de precios sin reinversión de dividendos. No representan una clasificación sectorial mundial.')} : null;
  const commodityTable=signals.filter(item=>item.role==='commodity').length ? {
    title: t('Materias primas e insumos · futuros'),
    equityContext: true,
    columns: ['Insumo / Futuro','Último','Unidad',main==='week' ? 'Semana · %' : 'Día · %','2020 a la fecha · %','Fecha base 2020','Fecha del dato'].map(t),
    rows: signals.filter(item=>item.role==='commodity').map(item=>{
      const change=item.periods[main],hist=item.periods?.since2020;
      return [t(item.label),n(item.last.value,item.last.value>=100 ? 2 : 3),item.unit,change ? pct(change.value) : '—',hist ? pct(hist.value) : '—',hist?.baseDate || '—',item.last.date];
    }),
    note: t('Futuros continuos de materias primas; variación desde la primera observación de 2020. No equivalen a costos físicos entregados ni a retorno por renovación de contratos.')
  } : null;
  const riskTable=levels(signals.filter(item=>['risk','yield','spread','dollar'].includes(item.role)),'Riesgo, crédito y dólar');
  const relative=references.filter(item=>item!==sp && item.returnBasis!=='total-return' && aligned(item.periods[main],mainSp)).map(item=>({label:item.label,country:item.country,value:item.periods[main].value-mainSp.value,baseDate:mainSp.baseDate,lastDate:mainSp.lastDate})).sort((a,b)=>b.value-a.value);
  const heatmapRows=[...new Map([...relative.slice(0,3),...relative.slice(-3)].map(item=>[item.label,item])).values()];
  const heatmap=heatmapRows.length ? {type:'bar',equityHeatmap:true,title:t('Diferencia frente al S&P 500'),unit:'p. p.',bars:heatmapRows,note:t('Mayores y menores diferencias del mismo periodo frente al S&P 500. Se excluyen comparaciones con fechas distintas; positivo significa mejor desempeño relativo, no necesariamente un alza.')} : null;
  const developed=equityBenchmarkChart(sp,['^NDX','^N225','^FTSE'].map(symbol=>references.find(item=>item.symbol===symbol)).filter(Boolean),{title:'Mercados desarrollados frente al S&P 500'});
  const latam=LATAM_COUNTRIES.flatMap(country=>references.filter(item=>item.country===country));
  const priceCharts=latam.filter(item=>item.returnBasis!=='total-return').map(item=>equityBenchmarkChart(sp,[item],{title:item.country+' frente al S&P 500'})).filter(Boolean);
  const trSignal=byId('benchmark:sp500tr'),tr=trSignal ? {...trSignal,country:'Estados Unidos',returnBasis:'total-return'} : null;
  const totalCharts=latam.filter(item=>item.returnBasis==='total-return').map(item=>equityBenchmarkChart(tr,[item],{title:item.country+' frente al S&P 500 TR',totalReturn:true})).filter(Boolean);
  const latamCharts=latam.map(item=>[...priceCharts,...totalCharts].find(chart=>chart.title.startsWith(item.country+' '))).filter(Boolean);
  const annualComparison=equityYearComparison(references,lastDate);
  const globalHistory=globalEquityComparison(references,{cutoff:report.generatedAt,benchmark:sp?.label || 'S&P 500'});
  if(globalHistory){globalHistory.equityHistoryOverview=true;globalHistory.unifiedHistory=true;globalHistory.title='Evolución de todas las bolsas · 2020 a la fecha';globalHistory.series=globalHistory.series.map(series=>{const reference=references.find(item=>item.label===series.label);return {...series,country:reference?.country || '',source:reference?.source || '',returnBasis:reference?.returnBasis || 'source-index'};});globalHistory.note+=' Cada índice conserva su metodología original: † incluye dividendos. No es un ranking de rentabilidad homogénea ni una conversión a USD.';}
  const excludedInflation=globalHistory ? globalHistory.series.slice(1).filter(s=>(s.points.at(-1)?.value || 0)>500) : [];
  const spVsGlobalChart=globalHistory ? {
    ...globalHistory,
    title: t('S&P 500 frente a todas las bolsas · 2020 a la fecha'),
    equityBenchmark: true,
    benchmark: 'S&P 500',
    indexBaseDate: '2020-01-02',
    indexEndDate: lastDate,
    spComparison: true,
    series: globalHistory.series.filter((s,index)=>index===0 || (s.points.at(-1)?.value || 0)<=500),
    note: t('Base 100 en la primera observación de cada índice desde 2020. Escala logarítmica. Trayectoria del S&P 500 frente a las bolsas mundiales')+(excludedInflation.length ? ' ('+t('se excluyen')+' '+excludedInflation.map(s=>s.label.split(' · ')[0]).join(', ')+' '+t('por distorsión inflacionaria en moneda local > 500 %; detalle de todas las series en Hoja 03')+').' : '.')
  } : (developed || null);
  const printCharts=[spVsGlobalChart].filter(Boolean);
  const business=[];
  if(ten?.periods[main])business.push({heading:t('Fondeo'),body:t(ten.periods[main].last>ten.periods[main].base ? 'Con el Treasury al alza, revisar deuda nueva y vencimientos variables frente a la tasa y el spread ejecutables de la empresa.' : 'Comparar refinanciamiento y reinversión con la tasa ejecutable y el spread de la empresa.')});
  const mxn=byId('fx:MXN');if(mxn?.periods[main])business.push({heading:t('Tesorería'),body:t(mxn.periods[main].value>0 ? 'USD/MXN al alza: pagos y cobros en USD valen más pesos. Revisar la exposición neta antes de cambiar coberturas.' : mxn.periods[main].value<0 ? 'USD/MXN a la baja: pagos y cobros en USD valen menos pesos. Revisar la exposición neta antes de cambiar coberturas.' : 'Sin cambio en USD/MXN: revisar flujos netos, diferencial ejecutable y vencimientos de coberturas.')});
  const oil=byId('wti') || byId('brent');if(oil?.periods[main])business.push({heading:t('Compras y márgenes'),body:oil.label+': '+t(oil.periods[main].value<0 ? 'la baja puede aliviar reposición y transporte al ajustarse los contratos. Revisar inventarios, fórmula y fecha de ajuste.' : oil.periods[main].value>0 ? 'el alza puede presionar combustible y transporte al ajustarse los contratos. Revisar inventarios, fórmula y fecha de ajuste.' : 'sin cambio en el futuro: revisar inventarios, fletes y fórmula de ajuste del contrato antes de modificar márgenes.')});
  if(!business.length)business.push({heading:t('Prioridad de seguimiento'),body:rotation || scenario});
  const tables=report.personalization?.sections?.tables===false ? [] : [...masterTables,sectorTable,commodityTable,riskTable].filter(Boolean),visuals=report.personalization?.sections?.charts===false ? [] : [spVsGlobalChart,annualComparison,developed,heatmap].filter(Boolean).map(visual=>({...visual,dataInTables:tables.length>0}));
  const blocks=[{key:'session',label:t('Tablero ejecutivo y catalizadores')},...(masterTables.length && tables.length ? [{key:'comparisons',label:t('Tabla maestra · todas las bolsas con datos')}] : []),...(visuals.length ? [{key:'charts',label:t('Comparación visual por bloques')}] : []),...(tables.some(item=>item.equityContext) ? [{key:'equityContext',label:t('Rotación sectorial y materias primas')}] : []),{key:'equityBusiness',label:t('Implicaciones para el negocio')}].map((block,index)=>({...block,number:String(index+1),count:null}));
  const usdAnnex={title:t('Respaldo de conversión a USD'),columns:['Índice','Moneda local','Horizonte','Fecha base','Fecha final','Índice base','Índice final','FX base · local/USD','FX final · local/USD','Variación USD · %','Fuente FX'].map(t),rows:references.flatMap(item=>Object.entries(item.usdPeriods).filter(([,value])=>value).map(([key,value])=>[item.label,item.currency,key,value.baseDate,value.lastDate,value.base,value.last,value.fxBase,value.fxLast,value.value,value.source || 'USD'])),note:t('Variación del índice en USD = (índice final / índice base) × (FX base / FX final) − 1. FX expresado en moneda local por 1 USD; se conserva la metodología del índice, sin añadir dividendos ni costos. No es un precio ejecutable.')};
  const yearsAnnex=annualComparison ? {title:annualComparison.title,columns:['Índice','País','Año','Cierre de base','Fecha base','Cierre del tramo','Fecha final','Variación · %','Fuente'],rows:annualComparison.rows.flatMap(row=>row.cells.filter(cell=>cell.value!==null).map(cell=>[row.label,row.country,cell.year,cell.base,cell.baseDate,cell.last,cell.lastDate,cell.value,row.source])),note:annualComparison.note} : null;
  const historyAnnex=globalHistory ? {title:globalHistory.title,columns:['Índice','País','Fecha base','Base','Fecha final','Último · base 100','Cambio desde su base · %','Metodología','Fuente'],rows:globalHistory.series.map(series=>[series.label,series.country,series.baseDate,100,series.points.at(-1).date,series.points.at(-1).value,series.points.at(-1).value-100,series.returnBasis==='total-return' ? 'Retorno total con dividendos' : 'Metodología original del índice',series.source]),note:globalHistory.note} : null;
  return mapReportText({...model,equityExecutive:{risk,dashboard,movers,masterGroups,sectors,signals,sectorTable,commodityTable,business,scenario,developed,spVsGlobalChart,printCharts,globalHistory,annualComparison,heatmap,period:main},references,summary:summaryPanels[0].body,summaryPanels,commentary:summaryPanels,results:tables,visuals,blocks,metrics:[],annexTables:[...model.results,usdAnnex,yearsAnnex,historyAnnex].filter(Boolean),annexVisuals:model.visuals},translate);
}
