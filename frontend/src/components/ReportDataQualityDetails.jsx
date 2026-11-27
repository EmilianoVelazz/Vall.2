import {readReportHealth} from '../lib/reportHealthReader.js';
import {useReportText} from '../lib/reportLocale.jsx';

const ISSUE_STATUSES=new Set(['missing','stale','preserved']);
const STATUS_LABELS={missing:'Sin dato',stale:'Desactualizado',preserved:'Conservado'};

function text(value) {
  return typeof value==='string' || typeof value==='number' ? String(value).replace(/[\x00-\x1f\x7f]+/g,' ').slice(0,160) : '';
}

export default function ReportDataQualityDetails({report}) {
  const t=useReportText(),health=readReportHealth(report);
  const issues=(health.references||[]).filter(item=>ISSUE_STATUSES.has(item.status));
  const visible=issues.slice(0,12);
  const coverage=health.coverage||{};

  return <section className={`erh-quality-details is-${health.state}`} aria-label={t('Detalle de calidad de datos')}>
    <div className="erh-quality-summary">
      <strong>{t('Calidad de datos')}: {t(health.label)}</strong>
      {Number.isFinite(coverage.total)&&coverage.total>0&&<span>{coverage.available}/{coverage.total} {t('referencias con dato')}</span>}
      {health.asOf&&<span>{t('Fecha del dato')}: {health.periodLabel||health.asOf}</span>}
    </div>
    <details>
      <summary>{t('Referencias para revisar')}{issues.length>0?` · ${issues.length}`:''}</summary>
      {visible.length ? <ul>{visible.map((item,index)=><li key={`${item.label}-${item.date}-${item.status}-${index}`}>
        <strong>{text(item.label)||t('Referencia')} — {t(STATUS_LABELS[item.status])}</strong>
        <small>{[item.source&&`${t('Fuente')}: ${text(item.source)}`,item.date?`${t('Fecha del dato')}: ${text(item.date)}`:t('Sin fecha'),text(item.unit)].filter(Boolean).join(' · ')}</small>
      </li>)}</ul> : <p>{health.references?.length ? t('No se detectaron referencias con datos faltantes, atrasados o conservados.') : t('No hay referencias individuales disponibles para revisar.')}</p>}
      {issues.length>visible.length&&<small>{t('Se muestran {shown} de {total} referencias.',{shown:visible.length,total:issues.length})}</small>}
    </details>
  </section>;
}
