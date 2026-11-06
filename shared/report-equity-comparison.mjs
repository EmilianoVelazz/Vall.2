import financeColors from './report-finance-colors.json' with {type:'json'};
export const EQUITY_CHART_COLORS=Object.freeze([...financeColors]);
export const EQUITY_COMPARISON_NOTE='Cada bolsa parte de 100 en su primera observación disponible desde 2020; la fecha base se indica en la leyenda. Las series con historia parcial comienzan en su fecha real. Se comparan trayectorias relativas en moneda local, no niveles de puntos ni rendimientos de un mismo periodo cuando las bases difieren. No se rellenan fechas sin publicación ni se extrapolan precios.';
export const EQUITY_LOG_NOTE='Escala logarítmica: distancias iguales representan cambios proporcionales iguales; así, las bolsas con mayores movimientos no ocultan las demás trayectorias.';

// Keep every eligible index and every available observation. Different trading
// calendars must not shorten the whole chart to the most recent common date.
export function globalEquityComparison(references,{cutoff,benchmark,t=value=>value}={}) {
  const end=String(cutoff || '').slice(0,10),seen=new Set(),series=[];
  for(const reference of references){
    if(seen.has(reference.label))continue;
    const points=reference.points.filter(point=>point.date>='2020-01-01' && point.date<=end && Number.isFinite(point.value) && point.value>0);
    if(points.length<2)continue;
    seen.add(reference.label);const base=points[0];
    series.push({label:t(reference.label),baseDate:base.date,points:points.map(point=>({date:point.date,value:point.value/base.value*100}))});
  }
  if(!series.length)return null;
  series.sort((a,b)=>Number(b.label===t(benchmark || ''))-Number(a.label===t(benchmark || '')));
  return {type:'line',equityComparison:true,globalComparison:true,requiredInPrint:true,title:t('Bolsas globales · comparación desde 2020'),unit:t('Índice base 100'),rangeStart:'2020-01-01',rangeEnd:end,
    note:t(EQUITY_COMPARISON_NOTE)+' '+t(EQUITY_LOG_NOTE),series};
}
