import {useReportText} from '../lib/reportLocale.jsx';
import './ReportEquityExecutive.css';
export default function BondExecutiveOpening({model}){
  const t=useReportText(),desk=model.bondExecutive;
  return <div className="erh-equity-desk">
    {desk.dashboard.length>0 && <div className="erh-equity-dashboard">{desk.dashboard.map(item=><section key={item.id}><h4>{item.label}</h4><strong>{item.value}</strong><small>{item.date}</small><a href={item.url} target="_blank" rel="noreferrer">{item.source}</a></section>)}</div>}
    <ol className="erh-equity-movers">{model.summaryPanels.map(panel=><li key={panel.heading}><h4>{panel.heading}</h4><p>{panel.body}</p></li>)}</ol>
    {desk.movers.length>0 && <details className="erh-market-method"><summary>{t('Publicaciones del corte')}</summary>{desk.movers.map(item=><p key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> · {item.source} · {item.publishedAt.slice(0,10)}</p>)}</details>}
    <p className="erh-history-method"><a href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool" target="_blank" rel="noreferrer">{t('Consultar CME FedWatch · próxima reunión de la Fed')}</a></p>
  </div>;
}
