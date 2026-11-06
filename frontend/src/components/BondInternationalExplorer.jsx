import {useId,useState} from 'react';
import {useReportText} from '../lib/reportLocale.jsx';
import BondHistoryExplorer from './BondHistoryExplorer.jsx';

export default function BondInternationalExplorer({visual,renderChart}){
  const t=useReportText(),id=useId(),[region,setRegion]=useState(''),[requested,setRequested]=useState([]);
  const regions=[...new Set(visual.series.map(item=>item.region).filter(Boolean))],candidates=visual.series.filter(item=>!region || item.region===region);
  const preferred=(visual.bondEuropeOverview ? ['GOV10Y-ES','GOV10Y-PT','GOV10Y-GR'] : ['GOV10Y-BR','GOV10Y-DE','GOV10Y-JP']).flatMap(key=>candidates.filter(item=>item.id===key));
  const selected=[...new Set([...requested.filter(key=>candidates.some(item=>item.id===key)),...preferred.map(item=>item.id),...candidates.map(item=>item.id)])].slice(0,3);
  const selectedVisual={...visual,bondInternationalOverview:false,series:selected.map(key=>candidates.find(item=>item.id===key))};
  const snapshots=(visual.snapshots || []).filter(item=>candidates.some(series=>series.id===item.id)),number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:2});
  return <section className="erh-bond-international" aria-label={visual.title}>
    <header><h4>{visual.title}</h4><span>{visual.series.length} {t('países con historia disponible')}</span></header>
    <p className="erh-history-method">{t('Compara hasta tres países. Las referencias internacionales son promedios mensuales en sus monedas originales; no son cierres diarios ni rendimientos de una inversión.')}</p>
    {visual.bondEuropeOverview && <>
      <p className="erh-bond-europe-hint">{t('Selecciona un país para llevarlo a la gráfica. Cada tarjeta muestra el nivel publicado y el cambio anual en puntos base.')}</p>
      <div className="erh-bond-europe-grid" aria-label={t('Países europeos disponibles')}>
        {snapshots.map(item=><button type="button" key={item.id} aria-pressed={selected.includes(item.id)} onClick={()=>setRequested([item.id,...selected.filter(key=>key!==item.id)].slice(0,3))}>
          <span className="erh-bond-europe-country">{item.country}<small>{item.currency}</small></span>
          <strong>{number(item.value)}<small>% anual</small></strong>
          <span className="erh-bond-europe-period">{item.date}{Number.isFinite(item.yearBp) && <span>{t('Año')}: {(item.yearBp>0 ? '+' : '')+number(item.yearBp)+' pb'}</span>}</span>
        </button>)}
      </div>
    </>}
    <div className="erh-bond-country-controls">
      <label htmlFor={id+'-region'}>{t('Región')}<select id={id+'-region'} value={region} onChange={event=>{setRegion(event.target.value);setRequested([]);}}><option value="">{t('Todas las regiones')}</option>{regions.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
      {selected.map((key,index)=><label key={index} htmlFor={id+'-'+index}>{t('País')} {index+1}<select id={id+'-'+index} value={key} onChange={event=>setRequested(selected.map((value,ordinal)=>ordinal===index ? event.target.value : value))}>{candidates.map(item=><option key={item.id} value={item.id} disabled={selected.includes(item.id) && item.id!==key}>{item.shortLabel}</option>)}</select></label>)}
    </div>
    {selected.length>0 && <BondHistoryExplorer visual={selectedVisual} renderChart={renderChart} />}
  </section>;
}
