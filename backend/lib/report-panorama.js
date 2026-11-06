'use strict';
const crypto=require('node:crypto');
const {compactPanoramaPart,PANORAMA_VERSION,PANORAMA_MAX_BYTES}=require('../../shared/report-panorama.mjs');
async function composePanorama(snapshot,{marketsSnapshot,mexicoSnapshot}={}){
 if(!snapshot?.reports?.some(item=>item.key==='overview'))return snapshot;
 const sources=[['finance',snapshot],['markets',marketsSnapshot],['mexico',mexicoSnapshot]],candidates=sources.flatMap(([area,value])=>(value?.reports || []).filter(item=>item.key!=='overview').map(report=>({area,report:area==='mexico' && report.key==='mx_overview' && report.panoramaParts ? report.panoramaParts.find(part=>part.key==='mx_overview') : report}))),valid=candidates.filter(({report})=>report && Number.isFinite(Date.parse(report.generatedAt)) && Date.parse(report.generatedAt)<=Date.now());
 if(!valid.length)return snapshot;
 const cutoff=new Date(Math.max(...valid.map(({report})=>Date.parse(report.generatedAt)))).toISOString();
 const parts=valid.map(({area,report})=>compactPanoramaPart(report,area,cutoff)),fingerprint=crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex'),prior=snapshot.reports.find(item=>item.key==='overview');
 if(prior.panoramaVersion===PANORAMA_VERSION && prior.panoramaFingerprint===fingerprint)return snapshot;
 const links=[...new Map(parts.flatMap(item=>item.sourceLinks || []).map(item=>[item.url,item])).values()],report={...prior,collection:'finance',title:'Panorama general',eyebrow:'Informe integrado · Finanzas, Mercados y México',objective:'Reunir el detalle de los informes especializados en una lectura ejecutiva con fechas, unidades, contexto y repercusiones para el negocio.',generatedAt:cutoff,panoramaVersion:PANORAMA_VERSION,panoramaFingerprint:fingerprint,panoramaParts:parts,panoramaMissing:sources.filter(([,value])=>!value?.reports?.length).map(([area])=>area),summary:'Panorama integrado de Finanzas, Mercados y México. Cada capítulo conserva el corte y la frecuencia de sus datos.',closing:'Contrastar los mercados con obligaciones, moneda funcional y abastecimiento. El contexto mensual y anual permanece separado de las sesiones diarias.',sourceSnapshot:null,dailyReferences:undefined,marketHistory:undefined,sessionObservations:undefined,metrics:[],tables:[],visuals:[],sections:[],content:'',takeaways:[],watchlist:[],sources:[...new Set(parts.flatMap(item=>item.sources || []))],sourceLinks:links.slice(0,192)};
 if(Buffer.byteLength(JSON.stringify(report))>PANORAMA_MAX_BYTES)throw Error('La composición integrada supera el límite de evidencia de Panorama.');
 return {...snapshot,reports:snapshot.reports.map(item=>item.key==='overview' ? report : item)};
}
const composedSnapshots=new WeakMap();
async function withPanorama(snapshot,options){
 const [marketsSnapshot,mexicoSnapshot]=await Promise.all([require('../services/market-report-store').load().catch(()=>null),require('../services/mexico-report-store').load().catch(()=>null)]);
 const dependencies={marketsSnapshot,mexicoSnapshot,...options};
 if(!snapshot || typeof snapshot!=='object')return snapshot;
 const previous=composedSnapshots.get(snapshot);
 if(previous?.markets===dependencies.marketsSnapshot && previous?.mexico===dependencies.mexicoSnapshot)return previous.work;
 const work=composePanorama(snapshot,dependencies),entry={markets:dependencies.marketsSnapshot,mexico:dependencies.mexicoSnapshot,work};composedSnapshots.set(snapshot,entry);
 try{return await work;}catch(error){if(composedSnapshots.get(snapshot)===entry)composedSnapshots.delete(snapshot);throw error;}
}
function composeMexicoPanorama(snapshot){
 const prior=snapshot?.reports?.find(item=>item.key==='mx_overview');if(!prior)return snapshot;
 const original=prior.panoramaParts ? prior.panoramaParts.find(item=>item.key==='mx_overview') : prior;
 const candidates=[original,...snapshot.reports.filter(item=>['mx_bolsa','mx_proteins','mx_production'].includes(item.key))].filter(item=>item && Number.isFinite(Date.parse(item.generatedAt)) && Date.parse(item.generatedAt)<=Date.now());
 if(!candidates.length)return snapshot;
 const cutoff=new Date(Math.max(...candidates.map(item=>Date.parse(item.generatedAt)))).toISOString(),parts=candidates.map(item=>compactPanoramaPart(item,'mexico',cutoff)),fingerprint=crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
 if(prior.panoramaVersion===PANORAMA_VERSION && prior.panoramaFingerprint===fingerprint)return snapshot;
 const report={...prior,collection:'mexico',generatedAt:cutoff,panoramaVersion:PANORAMA_VERSION,panoramaFingerprint:fingerprint,panoramaParts:parts,summary:'Panorama nacional con economía, exposición cambiaria, proteínas y producción regional. Cada capítulo conserva su fecha y frecuencia.',tables:[],visuals:[],metrics:[],sections:[],sourceLinks:[...new Map(parts.flatMap(item=>item.sourceLinks || []).map(item=>[item.url,item])).values()],sources:[...new Set(parts.flatMap(item=>item.sources || []))]};
 if(Buffer.byteLength(JSON.stringify(report))>PANORAMA_MAX_BYTES)throw Error('El panorama de México supera el límite de evidencia.');
 return {...snapshot,reports:snapshot.reports.map(item=>item.key==='mx_overview' ? report : item)};
}
module.exports={composePanorama,withPanorama,composeMexicoPanorama};
