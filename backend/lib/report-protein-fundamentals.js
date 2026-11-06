'use strict';
const {readPublicDocument}=require('./report-public-document');
const {safeProteinFundamentals}=require('../../shared/report-protein-fundamentals.mjs');
const sources=[['Porcino','hogs-pork'],['Vacuno','cattle-beef'],['Avícola','poultry-eggs']].map(([sector,key])=>({sector,url:'https://www.ers.usda.gov/topics/animal-products/'+key+'/market-outlook'}));
function parseProteinFundamental(html,item,cutoff){
 if(typeof html!=='string' || html.length>1500000)throw Error('Documento USDA no válido.');
 const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' '),date=plain.match(/Updated:\s*(\d{2})\/(\d{2})\/(\d{4})/),summary=plain.split('Report Summary')[1]?.split('Return to top')[0] || '';
 const publishedAt=date ? date[3]+'-'+date[1]+'-'+date[2] : '';let text='';
 if(item.sector==='Porcino'){
  const volume=summary.match(/Pork production in (20\d{2}) is forecast at ([\d.]+) billion pounds, up ([\d.]+) percent over (20\d{2})/i);
  if(volume && /lower expected farrowings/i.test(summary))text='USDA proyecta '+volume[2]+' mil millones de libras de carne porcina para '+volume[1]+' (+'+volume[3]+' % frente a '+volume[4]+'), tras reducir la previsión por menores partos esperados. La oferta prevista sigue creciendo: revisar demanda y exportaciones antes de atribuir toda caída del precio a China.';
 }else if(item.sector==='Vacuno'){
  const year=summary.match(/slow slaughter pace is anticipated to continue through (20\d{2})/i);
  if(year && /production forecasts.*lower than projected last month/i.test(summary))text='USDA prevé un ritmo de sacrificio lento hasta '+year[1]+' y revisa a la baja la producción de carne de res. Es un factor de restricción de oferta para reposición; no demuestra que toda el alza del futuro sea causada por sequía ni mide el margen del engordador.';
 }else{
  const year=summary.match(/Projected egg prices for (20\d{2}) are adjusted lower/i);
  if(year && /growing layer inventory/i.test(summary))text='USDA eleva la producción prevista de huevo por crecimiento del inventario de ponedoras y reduce la previsión de precios para '+year[1]+'. Contrastar la capacidad de reposición y los brotes fechados de APHIS: un alza puntual no acredita por sí sola una interrupción sanitaria.';
 }
 const result=safeProteinFundamentals([{...item,publishedAt,text}],cutoff);if(!result.length)throw Error('Sin una perspectiva USDA reconocida y fechada.');return result[0];
}
async function loadProteinFundamentals({read=readPublicDocument,cutoff=new Date().toISOString(),previous=[]}={}){
 const prior=safeProteinFundamentals(previous,cutoff);
 return (await Promise.all(sources.map(async item=>{try{return parseProteinFundamental(await read(item.url,{timeoutMs:8000,maxBytes:1500000}),item,cutoff);}catch{return prior.find(record=>record.sector===item.sector);}}))).filter(Boolean);
}
module.exports={sources,parseProteinFundamental,loadProteinFundamentals};
