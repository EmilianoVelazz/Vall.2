import {useReportText} from '../lib/reportLocale.jsx';
import {reportNumber} from '../lib/reportNumberFormat.js';
import './ReportEquityExecutive.css';

export function EquityExecutiveOpening({model}){
  const t=useReportText(),desk=model.equityExecutive;
  return <div className="erh-equity-desk">
    <div className={'erh-equity-risk is-'+desk.risk.tone}><strong>{desk.risk.label}</strong><span>{desk.risk.basis}</span></div>
    {desk.dashboard.length>0 && <div className="erh-equity-dashboard">{desk.dashboard.map(item=><section key={item.id}><h4>{t(item.label)}</h4><strong>{item.value}</strong><b>{item.change}</b><small>{item.dates}</small><a href={item.url} target="_blank" rel="noreferrer">{item.source}</a></section>)}</div>}
    <ol className="erh-equity-movers">{model.summaryPanels.map(panel=><li key={panel.heading}><h4>{panel.heading}</h4><p>{panel.body}</p></li>)}</ol>
    {desk.movers.length>0 && <details className="erh-market-method"><summary>{t('Publicaciones del corte')}</summary>{desk.movers.map(item=><p key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> · {item.source} · {item.publishedAt.slice(0,10)}<br />{t(item.channel)}</p>)}</details>}
  </div>;
}

export function EquityHeatmap({visual}){
  const t=useReportText();
  return <figure className="erh-chart erh-equity-heatmap" aria-label={visual.title}>
    <figcaption><span>{visual.title}</span><small>{visual.unit}</small></figcaption>
    <div className="erh-equity-heatmap-grid">{visual.bars.map(item=><div key={item.label} className={item.value>0 ? 'is-up' : item.value<0 ? 'is-down' : 'is-neutral'}><b>{item.label}</b><strong>{(item.value>0 ? '↑ +' : item.value<0 ? '↓ ' : '→ ')+reportNumber(item.value,3)} {t('p. p.')}</strong><small>{item.baseDate} / {item.lastDate}</small></div>)}</div>
    <p>{visual.note}</p>
  </figure>;
}

export function EquityBusiness({desk}){
  return <div className="erh-equity-business">{desk.business.map(panel=><section key={panel.heading}><h4>{panel.heading}</h4><p>{panel.body}</p></section>)}</div>;
}

export function EquityYearComparison({visual}){
  const t=useReportText(),sparse=visual.rows.some(row=>row.cells.some(cell=>!Number.isFinite(cell.value)));
  return <figure className="erh-chart erh-equity-year-comparison" aria-label={visual.title}>
    <figcaption><span>{visual.title}</span><small>{visual.unit}</small></figcaption>
    <p className="erh-equity-year-cut">{t('Mismo tramo del año hasta')} <b>{visual.cutoff.slice(8,10)+'/'+visual.cutoff.slice(5,7)}</b> · {t('Cada columna conserva el mismo índice y su metodología.')}</p><p className="erh-equity-year-hint">{t('Desliza para revisar los años y las bolsas; el año actual permanece visible.')}</p>
    <div className="erh-equity-year-scroll" role="region" tabIndex={0} aria-label={visual.title}><table><thead><tr><th scope="col">{t('Bolsa / país')}</th>{sparse ? <th scope="col">{t('Años publicados')}</th> : visual.years.map(year=><th scope="col" key={year} className={year===visual.currentYear ? 'is-current' : ''}>{year}{year===visual.currentYear && <small>{t('Actual')}</small>}</th>)}</tr></thead><tbody>{visual.rows.map(row=><tr key={row.symbol || row.label}><th scope="row">{row.label}{row.returnBasis==='total-return' && ' †'}<small>{row.country}</small></th>{sparse ? <td><div className="erh-equity-year-facts">{row.cells.filter(cell=>Number.isFinite(cell.value)).map(cell=><span key={cell.year} className={cell.value>0 ? 'is-up' : cell.value<0 ? 'is-down' : 'is-flat'} title={cell.baseDate+' / '+cell.lastDate+' · '+row.source}><b>{cell.year}</b> {(cell.value>0 ? '+' : '')+reportNumber(cell.value,1)+' %'}</span>)}</div></td> : row.cells.map(cell=><td key={cell.year} className={(cell.value===null ? 'is-missing' : cell.value>0 ? 'is-up' : cell.value<0 ? 'is-down' : 'is-flat')+(cell.year===visual.currentYear ? ' is-current' : '')}><span title={cell.value===null ? t('Sin base comparable') : cell.baseDate+' / '+cell.lastDate+' · '+row.source}>{cell.value===null ? '—' : (cell.value>0 ? '+' : '')+reportNumber(cell.value,1)+' %'}</span></td>)}</tr>)}</tbody></table></div>
    <details className="erh-market-method"><summary>{t('Metodología y fechas de cada comparación')}</summary><p>{visual.note}</p><ul>{visual.rows.map(row=><li key={row.symbol || row.label}>{row.label}: {row.cells.filter(cell=>cell.value!==null).map(cell=>cell.year+' ('+cell.baseDate+' / '+cell.lastDate+')').join(' · ')}</li>)}</ul></details>
  </figure>;
}
