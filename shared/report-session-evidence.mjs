// Preserve the original dated observations when a personal copy drops snapshots.
export function sessionEvidence(report) {
  const snapshot=report.sourceSnapshot || {},list=value=>Array.isArray(value) ? value : [];
  if(Array.isArray(report.sessionObservations)) return report.sessionObservations;
  const quotes=[...list(snapshot.grains),...list(snapshot.energy),...list(snapshot.proteins),...list(snapshot.quotes)];
  if(snapshot.leader) quotes.push({...snapshot.leader,unit:'puntos'});
  const histories=list(snapshot.fxHistories);
  for(const item of histories) quotes.push({...item,label:'USD/'+item.quoteCurrency,unit:item.quoteCurrency+' por 1 USD'});
  if(!histories.length && snapshot.fxHistory) quotes.push({...snapshot.fxHistory,label:'USD/MXN',unit:'MXN por 1 USD'});
  return quotes.map(item=>({label:item.label || item.name || '',unit:item.unit || '',region:item.region || '',market:item.market || '',exchange:item.exchange || '',source:item.source || '',url:item.url || '',cadence:item.cadence || 'daily',category:item.category || '',basis:item.basis || '',quoteStatus:item.quoteStatus || '',points:(item.series || item.recentSeries || item.points || []).slice(-65)}));
}

export function sessionNews(report) {
  return (report.sessionNews || report.headlines || report.sourceSnapshot?.headlines || []).slice(0,12).map(item=>({title:item.title || '',description:item.description || '',source:item.source || '',publishedAt:item.publishedAt || '',url:item.url || '',categoryLabel:item.categoryLabel || item.category || 'Otros temas'}));
}
