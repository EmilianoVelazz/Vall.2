const prefix='vall-report-reading-v1:';
const storage=()=>{try{return window.localStorage;}catch{return null;}};
const ownerKey=email=>prefix+encodeURIComponent(String(email || '').trim().toLowerCase());
function read(email){
 if(!email)return {documents:{}};
 try{const value=JSON.parse(storage()?.getItem(ownerKey(email)) || '{}');return value && typeof value==='object' && !Array.isArray(value) ? {...value,documents:value.documents && typeof value.documents==='object' && !Array.isArray(value.documents) ? value.documents : {}} : {documents:{}};}catch{return {documents:{}};}
}
function write(email,update){if(!email)return;try{storage()?.setItem(ownerKey(email),JSON.stringify(update(read(email))));}catch{ /* Reading remains available with storage disabled or full. */ }}
export function readReportSelection(email){const value=read(email).selection;return value && ['finance','markets','mexico','mine'].includes(value.area) && typeof value.key==='string' && value.key.length<=160 ? value : null;}
export function saveReportSelection(email,selection){if(!selection || !['finance','markets','mexico','mine'].includes(selection.area) || !selection.key)return;write(email,current=>({...current,selection:{area:selection.area,key:String(selection.key).slice(0,160)}}));}
export function reportReadingKey(report,language='es'){
 if(!report)return '';
 return JSON.stringify([report.collection || report.baseReport?.collection,report.editionId || report.key,report.editionVersion || '',report.generatedAt,report.periodType || '',report.reportYear || '',report.analysisPeriod || 'daily',language]);
}
export function readReportPosition(email,key){
 if(!key)return null;const value=read(email).documents[key];
 return value && Number.isInteger(value.page) && value.page>0 && Number.isFinite(value.zoom) && value.zoom>=.75 && value.zoom<=2 ? value : null;
}
export function saveReportPosition(email,key,{page,zoom}){
 if(!key || !Number.isInteger(page) || page<1 || !Number.isFinite(zoom) || zoom<.75 || zoom>2)return;
 write(email,current=>{const documents={...current.documents};delete documents[key];documents[key]={page,zoom};return {...current,documents:Object.fromEntries(Object.entries(documents).slice(-32))};});
}
