import {useId,useState} from 'react';
import {useReportText} from '../lib/reportLocale.jsx';
import {reportNumber} from '../lib/reportNumberFormat.js';
import {bondChangeComparison,bondYearMonthGrid} from '../../../shared/report-bond-comparison.mjs';
import './ReportBondHistory.css';

const MODES=[['levels','Evolución'],['change','Cambio en pb'],['years','Mapa por año']];
export default function BondHistoryExplorer({visual,renderChart}){
  const t=useReportText(),id=useId(),[mode,setMode]=useState('levels'),[reference,setReference]=useState(null),[selected,setSelected]=useState(null);
  const series=visual.series.find(item=>item.id===reference) || visual.series[0],grid=bondYearMonthGrid(visual,series),comparison=bondChangeComparison(visual);
  const active=mode==='change' && !comparison ? 'levels' : mode,cell=grid?.rows.flatMap(row=>row.cells).find(item=>item.period===selected && item.value!==null);
  const months=Array.from({length:12},(_,month)=>new Intl.DateTimeFormat(t.locale,{month:'short',timeZone:'UTC'}).format(Date.UTC(2020,month,1)));
  return <section className="erh-bond-explorer" aria-label={visual.title}>
    <div className="erh-bond-modes" role="group" aria-label={t('Vista de {value0}',{value0:visual.title})}>
      {MODES.map(([key,label])=><button type="button" key={key} aria-pressed={active===key} disabled={key==='change' && !comparison} onClick={()=>setMode(key)}>{t(label)}</button>)}
    </div>
    {active==='years' && grid ? <figure className="erh-chart erh-market-chart erh-bond-calendar" aria-label={t('Mapa por año')+' · '+visual.title}>
      <figcaption><span>{visual.title}</span><small>{visual.unit}</small></figcaption>
      <label className="erh-bond-reference" htmlFor={id}>{t('Referencia')}<select id={id} value={series.id} onChange={event=>{setReference(event.target.value);setSelected(null);}}>{visual.series.map(item=><option key={item.id} value={item.id}>{item.shortLabel || item.label}</option>)}</select></label>
      <p className="erh-chart-period">{visual.rangeStart+' / '+visual.rangeEnd} · {t(visual.monthly ? 'Promedios mensuales publicados' : 'Última observación publicada de cada mes')}</p>
      <div className="erh-bond-calendar-scroll" tabIndex={0} role="region" aria-label={t('Mapa mensual de {value0}',{value0:series.label})}>
        <table><thead><tr><th scope="col">{t('Año')}</th>{months.map((month,index)=><th scope="col" key={index}>{month}</th>)}</tr></thead><tbody>{grid.rows.map(row=><tr key={row.year}><th scope="row">{row.year}</th>{row.cells.map(item=><td key={item.period}>{item.value===null ? <span className="erh-bond-missing" title={t(item.future ? 'Periodo futuro' : 'Sin dato')}>{item.future ? '·' : '—'}</span> : <button type="button" className={item.partial ? 'is-partial' : ''} style={{backgroundColor:`hsl(207 24% ${97-item.intensity*35}%)`,color:'#193758'}} aria-pressed={cell?.period===item.period} aria-label={series.label+' · '+item.date+' · '+reportNumber(item.value,2)+' '+visual.unit+(item.partial ? ' · '+t('Mes en curso') : '')} title={item.date+' · '+series.source} onClick={()=>setSelected(item.period)}>{reportNumber(item.value,2)}{item.partial ? '*' : ''}</button>}</td>)}</tr>)}</tbody></table>
      </div>
      <div className="erh-bond-color-key"><span>{reportNumber(grid.min,2)} {visual.unit}</span><i aria-hidden="true" /><span>{reportNumber(grid.max,2)} {visual.unit}</span></div>
      <p className="erh-history-method">{t(visual.monthly ? 'Más oscuro indica un promedio mensual mayor dentro de esta referencia. — Sin publicación disponible. Pulsa un valor para consultar su mes.' : 'Más oscuro indica un nivel mayor dentro de esta referencia. * Mes en curso, parcial. — Sin publicación disponible. Pulsa un valor para consultar su fecha.')}</p>
      <p className="erh-bond-cell-detail" aria-live="polite" aria-atomic="true">{cell ? series.label+' · '+cell.date+' · '+reportNumber(cell.value,3)+' '+visual.unit : t('Selecciona un mes para ver el dato publicado.')}</p>
      <p className="erh-history-method">{t('Fuente')}: <a href={series.url} target="_blank" rel="noreferrer">{series.source}</a></p>
    </figure> : <>{active==='change' && <p className="erh-bond-base">{t('Base común observada')}: <b>{comparison.baseDate}</b> · {t('Cambio absoluto, no retorno de inversión')}</p>}{renderChart(active==='change' ? comparison : visual)}</>}
  </section>;
}
