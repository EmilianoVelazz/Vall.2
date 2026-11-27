// Presentation removes only exact repetitions, preserving distinct evidence.
export function uniqueReportLines(lines = [], excluded = []) {
  const key = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
  const seen = new Set(excluded.map(key));
  return lines.filter(value => {
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function executiveReading(report) {
  const brief = report?.executiveBrief?.generated ? report.executiveBrief : null;
  const highlights = uniqueReportLines([...(report?.takeaways || []), ...(brief?.mode !== 'deterministic' || !report?.takeaways?.length ? brief?.drivers || [] : [])], [report?.summary]);
  const risks = uniqueReportLines([...(report?.watchlist || []), ...(report?.executiveBrief?.mode !== 'deterministic' || !report?.watchlist?.length ? report?.executiveBrief?.risks || [] : [])]);
  const traceFor=(items,claims,trace)=>items.map(item=>{
    const index=claims.indexOf(item);
    return index>=0 ? trace?.[index] : {kind:'pending',evidenceIds:[]};
  });
  return {
    highlights,
    risks,
    highlightTraceability:traceFor(highlights,brief?.drivers||[],brief?.traceability?.drivers),
    riskTraceability:traceFor(risks,brief?.risks||[],brief?.traceability?.risks),
    brief: brief ? {
      ...brief,
      headline: brief.mode === 'deterministic' ? '' : uniqueReportLines([brief.headline], [report?.title])[0] || '',
      context: brief.mode === 'deterministic' ? '' : uniqueReportLines([brief.context], [report?.objective, report?.summary])[0] || '',
      thesis: brief.mode === 'deterministic' ? '' : uniqueReportLines([brief.thesis], [report?.summary, brief.context])[0] || '',
      drivers: [], risks: [],
    } : null,
  };
}
