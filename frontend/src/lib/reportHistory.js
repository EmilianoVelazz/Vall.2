import {reportJsonRequest} from './reportRequest.js';
import collections from '../../../shared/report-collections.json' with {type:'json'};

export async function loadReportHistoryPage({area,key,date,cursor},{signal,owner,fetcher=fetch}={}){
  const query=new URLSearchParams({area,limit:'100',...(key ? {key} : {}),...(date ? {date} : {}),...(cursor ? {cursor} : {})});
  const page=await reportJsonRequest('/api/report-history?'+query,{signal},{expectedOwner:owner,fetcher,errorMessage:'No se pudo consultar el historial.'});
  if(!Array.isArray(page.data) || page.data.some(item=>!item || !/^[a-f0-9]{64}$/.test(item.id) || item.collection!==area || !collections[area]?.reportKeys.includes(item.key) || key && item.key!==key || !Number.isFinite(Date.parse(item.generatedAt))) || page.nextCursor!=null && (typeof page.nextCursor!=='string' || !/^[A-Za-z0-9_-]{1,1200}$/.test(page.nextCursor)))throw Error('El historial devolvió una lista de cortes inválida.');
  return {data:page.data,nextCursor:page.nextCursor || null};
}
