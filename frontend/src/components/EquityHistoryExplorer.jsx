import {useState} from 'react';
import {useReportText} from '../lib/reportLocale.jsx';
import {equityHistorySvg} from '../../../shared/report-equity-history-svg.mjs';
import {equityRegion,equityRegionMatches,equityRegionSeries,equityRegionalLabel} from '../../../shared/report-equity-regions.mjs';

export default function EquityHistoryExplorer({visual,renderComparison}){
  const t=useReportText(),[region,setRegion]=useState(''),regions=[...new Set(visual.series.map(equityRegion))];
  if(!regions.includes('Latinoamérica') && visual.series.some(series=>equityRegionMatches(series,'Latinoamérica')))regions.splice(regions.indexOf('América')+1,0,'Latinoamérica');
  const activeRegion=regions.includes(region) ? region : '',selected=equityRegionSeries(visual.series,activeRegion),comparison={...visual,title:activeRegion ? visual.title+' · '+t(activeRegion==='Latinoamérica' ? 'México y Latinoamérica' : activeRegion) : visual.title,regionalComparison:Boolean(activeRegion),unifiedHistory:true,seriesOrdinals:selected.map(series=>visual.series.indexOf(series)),series:selected.map(series=>({...series,label:(['América','Latinoamérica'].includes(activeRegion) ? equityRegionalLabel(series,{t}) : series.label)+(series.returnBasis==='total-return' ? ' †' : '')}))};
  const download=()=>{const blob=new Blob([equityHistorySvg(visual)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='vallnews-bolsas-2020-'+visual.rangeEnd+'.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section className="erh-equity-history-explorer" aria-label={visual.title}>
    <header><div><h4>{visual.title}</h4><p>{visual.series.length} {t('bolsas con historia disponible')} · {t('Base 100 desde la primera observación de cada bolsa')}</p></div><button type="button" onClick={download}>{t('Descargar gráfica completa · SVG')}</button></header>
    <p className="erh-history-method">{t('Todas las bolsas comparten una sola gráfica. Pulsa una referencia de la leyenda para resaltar su trayectoria; pulsa otra vez para volver a ver todas.')}</p>
    <p className="erh-history-method">{t('Cada curva muestra cómo ha subido o bajado su índice desde 2020. Las historias parciales empiezan en su fecha real. Monedas originales; † incluye dividendos.')}</p>
    {regions.length>1 && <label className="erh-chart-group-controls">{t('Región')} <select aria-label={t('Región de las bolsas')} value={activeRegion} onChange={event=>setRegion(event.target.value)}><option value="">{t('Todas las regiones')}</option>{regions.map(value=><option key={value} value={value}>{t(value==='Latinoamérica' ? 'México y Latinoamérica' : value)}</option>)}</select><span>{selected.length} / {visual.series.length}</span></label>}
    {renderComparison(comparison)}
  </section>;
}
