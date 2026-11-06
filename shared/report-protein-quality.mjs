export function safeProteinMarketContext(items,cutoff){
 const end=Date.parse(cutoff);if(!Number.isFinite(end))return [];
 const seen=new Set();
 return (Array.isArray(items) ? items : []).flatMap(item=>{
  const time=Date.parse(item?.publishedAt),day=String(item?.publishedAt || '').slice(0,10);let url;
  try{url=new URL(item.url);}catch{return [];}
  if(!Number.isFinite(time) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(Date.parse(day)).toISOString().slice(0,10)!==day || time>end || end-time>14*86400000 || url.protocol!=='https:' || url.username || url.password || !/^(?:www\.)?mercolleida\.com$/.test(url.hostname) || !/^Comentario (?:porcino|vacuno)/i.test(item.title || '') || !String(item.description || '').trim())return [];
  const key=item.title+'|'+item.publishedAt;if(seen.has(key))return [];seen.add(key);
  return [{title:String(item.title).slice(0,180),description:String(item.description).slice(0,400),publishedAt:new Date(time).toISOString().slice(0,10),source:'Mercolleida',url:url.href}];
 }).slice(0,2);
}

export function proteinPublicComments(tables,cutoff){
 return safeProteinMarketContext((Array.isArray(tables) ? tables : []).filter(table=>table.title==='Mercolleida · comentarios publicados').flatMap(table=>(table.rows || []).map(row=>({title:row[0],publishedAt:row[1],description:row[2],url:'https://www.mercolleida.com/es/'}))),cutoff);
}

export function proteinQualityAnnex(references,cutoff,{t=value=>value}={}){
 const labels={reference:'Catálogo de respaldo',preserved:'Conservado de consulta anterior',verified:'Consultado por el conector',unconfirmed:'Verificación no documentada'};
 return {title:t('Proteínas · actualización y procedencia de los datos'),columns:['País','Referencia','Unidad original','Fecha del precio','Antigüedad al corte · días','Frecuencia','Estado de la referencia','Fecha de consulta registrada','Fuente','Enlace'].map(t),rows:references.map(item=>[t(item.country),t(item.label),item.unit,item.last.date,Math.max(0,Math.floor((Date.parse(cutoff)-Date.parse(item.last.date))/86400000)),t(({daily:'Diaria',weekly:'Semanal',monthly:'Mensual',annual:'Anual'})[item.cadence] || item.cadence),t(labels[item.quoteStatus] || labels.unconfirmed),item.evidenceOrigin==='catalog' ? null : item.retrievedAt || null,item.source || null,item.url || null]),note:t('La fecha del precio y la de consulta son diferentes. Catálogo de respaldo no significa cotización revalidada en línea; consultado describe el registro del conector. La antigüedad se mide contra la fecha del informe, también en copias históricas. Las fechas de consulta no documentadas se omiten.')};
}

export function proteinDocumentAnnex(references,{t=value=>value}={}){
 const items=references.filter(item=>item.provider==='usda_pdf' && item.publishedAt && item.sourceDocumentHash);
 return items.length ? [{title:t('USDA · documentos y períodos originales de proteínas'),columns:['Referencia','Unidad original','Publicación','Período declarado · inicio','Período declarado · fin','Documento consultado · SHA-256','Enlace'].map(t),rows:items.map(item=>[t(item.label),item.unit,item.publishedAt,item.reportPeriodStart || null,item.reportPeriodEnd || null,item.sourceDocumentHash,item.url]),note:t('En los boletines semanales la observación usa la fecha de publicación, no una fecha futura del período declarado. El índice de huevo conserva su promedio móvil de cinco días; no es un precio spot diario. La huella identifica el documento consultado y no certifica por sí sola las publicaciones anteriores.')}] : [];
}
