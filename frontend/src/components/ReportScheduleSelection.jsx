import {ReportSelectField} from './ReportCustomizationFields.jsx';
import {useReportText} from '../lib/reportLocale.jsx';

export default function ReportScheduleSelection({props:p,disabled}) {
  const t=useReportText();
  const reports=p.reportSets[p.deliveryCategory]?.data || [];
  return <fieldset className="erh-schedule-selection" disabled={disabled}>
    <legend>{t('Qué informes quieres recibir')}</legend>
    <ReportSelectField label={t('Categoría de informes')} value={p.deliveryCategory} options={['finance','markets','mexico'].map(area=>[area,t(p.areas[area].label)])} onChange={p.setDeliveryCategory} />
    {p.deliveryCatalogLoading ? <p role="status">{t('Cargando informes de la categoría…')}</p> : p.deliveryCatalogError ? <div><p role="alert">{t('No se pudieron cargar los informes de esta categoría.')}</p><button type="button" className="erh-secondary-button" onClick={p.retryDeliveryCatalog}>{t('Reintentar')}</button></div> : <>
      <button type="button" className="erh-secondary-button" disabled={!reports.length} onClick={()=>p.selectDeliveryCategory(reports)}>{t('Seleccionar toda la categoría')}</button>
      <div className="erh-schedule-report-options">{reports.map(report=>{
        const key=p.deliveryCategory+':'+report.key;
        return <label key={key}><input type="checkbox" checked={p.deliveryTargets.includes(key)} onChange={()=>p.toggleDeliveryTarget(key)} /><span>{t(report.title)}</span></label>;
      })}</div>
    </>}
    <p role="status">{t('Informes seleccionados: {count}',{count:p.deliveryTargets.length})}</p>
    {p.deliveryTargets.length>0 && <ul className="erh-schedule-picked">{p.deliveryTargets.map(key=>{
      const [area,reportKey]=key.split(':');
      const report=p.reportSets[area]?.data?.find(row=>row.key===reportKey);
      return <li key={key}><span>{t(p.areas[area].label)} · {t(report?.title || reportKey)}</span><button type="button" aria-label={t('Quitar {title}',{title:t(report?.title || reportKey)})} onClick={()=>p.toggleDeliveryTarget(key)}><i className="fas fa-xmark" aria-hidden="true" /></button></li>;
    })}</ul>}
    <small>{t('Puedes combinar informes de distintas categorías. Cada uno llegará en un correo separado con su PDF.')}</small>
    <small>{t('El horario, destinatario e idioma se aplican a los informes marcados. Las demás programaciones se conservan.')}</small>
  </fieldset>;
}
