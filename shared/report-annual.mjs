export function isAnnualReport(report) {
  return report?.periodType==='annual' && Number.isInteger(report.reportYear) && report.reportYear>=2022 && report.reportYear<=2025;
}
// Annual editions already contain audited annual tables and monthly samples.
// Do not pass them through the two-session calculation used by daily reports.
export function annualReport(report,{t=value=>value}={}) {
  const labels=t;t=value=>report.causeText?.[value] || labels(value);
  const flags=report.personalization?.sections || {},fx=(report.baseReport?.collection || report.collection)==='finance' && (report.baseReport?.key || report.key)==='fx',restricted=label=>/^USD\/(?:RUB|VES)(?:\b| ·)/.test(String(label));
  const results=flags.tables===false ? [] : (report.tables || []).flatMap(table=>{
    if(!fx || !table.rows.some(row=>restricted(row[0])))return [table];
    const normal=table.rows.filter(row=>!restricted(row[0])),special=table.rows.filter(row=>restricted(row[0]));
    return [...(normal.length ? [{...table,title:table.title+' · monedas comerciales',rows:normal}] : []),{...table,title:'RUB y VES · análisis separado · '+report.reportYear,rows:special,note:table.note+' Referencias de régimen especial; fuera de las escalas comparativas de monedas comerciales.'}];
  });
  const visuals=flags.charts===false ? [] : (report.visuals || []).flatMap(visual=>{
    const value=!fx ? visual : visual.type==='bar' ? {...visual,bars:visual.bars.filter(item=>!restricted(item.label))} : {...visual,series:visual.series.filter(item=>!restricted(item.label))};
    if(value.type==='bar' ? !value.bars.length : !value.series.length)return [];
    return [{...value,...(value.type!=='bar' ? {monthly:true} : {}),reading:value.reading || value.note}];
  }),metrics=flags.indicators===false ? [] : report.metrics || [];
  const coverage=`Periodo anual: 01-01-${report.reportYear} a 31-12-${report.reportYear}. Reconstrucción histórica preparada el ${String(report.generatedAt || '').slice(0,10)} con la versión de datos disponible entonces. Las fechas de las observaciones pertenecen al año estudiado; el cierre anterior sólo sirve como base del cambio anual. Los huecos se identifican y no se rellenan con precios actuales.`;
  const commentary=[{heading:t('Resumen del año'),body:report.summary || ''},{heading:t('Periodo, versión y cobertura'),body:t(coverage)},...(report.sections || []).map(section=>({heading:section.heading,body:section.text}))];
  const blocks=[{key:'session',number:'1',label:'Resumen anual'},...(metrics.length ? [{key:'results',number:'1.1',label:'Indicadores del año'}] : []),...(results.length ? [{key:'comparisons',number:'1.2',label:'Resultados y cobertura anual'}] : []),...(visuals.length ? [{key:'charts',number:'2',label:'Gráficas y evolución del año',count:visuals.length}] : []),{key:'sessionContext',number:visuals.length ? '3' : '2',label:'Causas y consecuencias del año'}].map(block=>({...block,label:t(block.label),count:block.count ?? null}));
  return {annualReport:true,sessionReport:true,sectorSession:true,summary:report.summary || '',coverage:t(coverage),metrics,results,visuals,commentary,blocks,references:[],history:[],statistics:[],tables:[],followup:flags.risks===false ? [] : report.watchlist || [],followupHeading:t('Revisión y límites del año'),causes:{status:t('Lectura anual basada en fuentes fechadas.'),conditions:t('La coincidencia temporal no demuestra causalidad.'),groups:[]}};
}
