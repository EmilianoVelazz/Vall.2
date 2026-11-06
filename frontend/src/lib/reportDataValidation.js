// Valida lo que la lectura renderiza sin transformar cifras ni evidencia.
const object=value=>Boolean(value && typeof value==='object' && !Array.isArray(value));
const text=value=>value==null || typeof value==='string';
const cell=value=>text(value) || typeof value==='number' && Number.isFinite(value);
const fields=(value,keys,valid=text)=>object(value) && keys.every(key=>valid(value[key]));
const list=(value,valid)=>value==null || Array.isArray(value) && value.every(valid);
const preferences=value=>value==null || fields(value,['audience','audienceKey','audienceLabel','depth','decisionHorizon','horizon','customTitle','recipientName','organization','objective','confidentiality','confidentialityLabel','theme'])
  && (value.sections==null || object(value.sections) && Object.values(value.sections).every(item=>typeof item==='boolean'));

export function isReportDocument(report) {
  return fields(report,['title','key','eyebrow','summary','objective','closing','content','generatedAt'])
    && (report.panoramaParts==null || Array.isArray(report.panoramaParts) && report.panoramaParts.length<=12 && report.panoramaParts.every(part=>object(part) && part.panoramaParts==null && isReportDocument(part)))
    && list(report.marketNews,item=>fields(item,['title','description','source','url','publishedAt','originalTitle','language','topic','sourceType','provider','region']))
    && list(report.financialNews,item=>fields(item,['title','description','source','url','publishedAt','originalTitle','language','topic','sourceType','provider','region']))
    && typeof report.title==='string' && Boolean(report.title.trim())
    && (report.causeText==null || object(report.causeText) && Object.values(report.causeText).every(value=>typeof value==='string'))
    && list(report.sections,item=>fields(item,['heading','text']))
    && list(report.metrics,item=>fields(item,['label','value','change'],cell))
    && list(report.tables,item=>fields(item,['title','note','kind']) && list(item.columns,cell) && list(item.rows,row=>Array.isArray(row) && row.every(cell)))
    && list(report.visuals,item=>fields(item,['title','unit','note','type'])
      && list(item.bars,bar=>fields(bar,['label']) && cell(bar.value))
      && list(item.series,series=>fields(series,['label']) && list(series.points,point=>fields(point,['date']) && cell(point.value))))
    && ['sources','watchlist','takeaways'].every(key=>list(report[key],item=>typeof item==='string'))
    && list(report.sourceLinks,item=>fields(item,['label','url']))
    && preferences(report.personalization)
    && (report.aiEdition==null || fields(report.aiEdition,['model','generatedAt','instructions','tone','mode']) && preferences(report.aiEdition.preferences) && list(report.aiEdition.preferenceOverrides,item=>typeof item==='string'))
    && (report.executiveBrief==null || fields(report.executiveBrief,['headline','agent','context','thesis','committeeQuestion','evidenceNote','mode']) && ['drivers','risks'].every(key=>list(report.executiveBrief[key],item=>typeof item==='string')))
    && (report.decisionGuide==null || fields(report.decisionGuide,['heading','action','horizonNote','coverageNote']))
    && (report.baseReport==null || fields(report.baseReport,['title','key','collection','generatedAt']));
}

export function isReportLibrary(data,privateReports=false) {
  return Array.isArray(data) && new Set(data.map(report=>report?.key)).size===data.length
    && data.every(report=>fields(report,['title','key','eyebrow','updatedAt'])
      && typeof report.key==='string' && Boolean(report.key)
      && typeof report.title==='string' && Boolean(report.title.trim())
      && (privateReports ? typeof report.editionId==='string' && Boolean(report.editionId) && (report.editionVersion==null || Number.isInteger(report.editionVersion) && report.editionVersion>0) : isReportDocument(report)));
}
