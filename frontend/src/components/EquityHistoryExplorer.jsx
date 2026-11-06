import {useReportText} from '../lib/reportLocale.jsx';
import {equityHistorySvg} from '../../../shared/report-equity-history-svg.mjs';

export default function EquityHistoryExplorer({visual,renderComparison}){
  const t=useReportText(),comparison={...visual,unifiedHistory:true,series:visual.series.map(series=>({...series,label:series.label+(series.returnBasis==='total-return' ? ' †' : '')}))};
  const download=()=>{const blob=new Blob([equityHistorySvg(visual)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='vallnews-bolsas-2020-'+visual.rangeEnd+'.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section className="erh-equity-history-explorer" aria-label={visual.title}>
    <header><div><h4>{visual.title}</h4><p>{visual.series.length} {t('bolsas con historia disponible')} · {t('Base 100 desde la primera observación de cada bolsa')}</p></div><button type="button" onClick={download}>{t('Descargar gráfica completa · SVG')}</button></header>
    <p className="erh-history-method">{t('Todas las bolsas comparten una sola gráfica. Pulsa una referencia de la leyenda para resaltar su trayectoria; pulsa otra vez para volver a ver todas.')}</p>
    <p className="erh-history-method">{t('Cada curva muestra cómo ha subido o bajado su índice desde 2020. Las historias parciales empiezan en su fecha real. Monedas originales; † incluye dividendos.')}</p>
    {renderComparison(comparison)}
  </section>;
}
