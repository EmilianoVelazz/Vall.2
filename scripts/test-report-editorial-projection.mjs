import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.GEMINI_API_KEY='';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
process.env.JWT_SECRET='editorial-projection-isolated-fixture-32-bytes';
const {ExecutiveReportAgent}=require('../backend/ai/executive-report-agent');
const {withDailyEvidence}=require('../backend/lib/report-daily-evidence');
const {editorialFacts,editorialFingerprint}=require('../backend/lib/report-editorial-evidence');
const {_test}=require('../backend/routes/export');
const cutoff='2026-11-12T16:00:00Z',points=[{date:'2026-11-11',value:40},{date:'2026-11-12',value:41}];
const marker='La lectura editorial validada debe llegar al documento.';
const question='¿Qué exposición real debe contrastarse antes de decidir?';
const common={generatedAt:cutoff,summary:'Material de simulación.',sections:[],tables:[],metrics:[],sourceLinks:[]};
const samples=[
 {...common,key:'grains',collection:'markets',title:'Granos de simulación',sessionNews:[{title:'Ganaderos reportan falta de pastos por sequía',description:'La nota de prueba describe la solicitud de ayudas para alimentación.',source:'Fuente de prueba',url:'https://example.invalid/noticia',publishedAt:'2026-11-12T12:00:00Z'}],dailyReferences:[{label:'Maíz blanco físico de prueba',country:'México',market:'México',unit:'MXN/kg',source:'Fuente de prueba',url:'https://example.invalid/prueba',cadence:'daily',points}]},
 {...common,key:'fx',collection:'finance',title:'Divisas de simulación',dailyReferences:[{label:'USD/MXN · Peso mexicano',unit:'MXN por 1 USD',points}],sourceSnapshot:{fxHistories:[{symbol:'MXN=X',baseCurrency:'USD',quoteCurrency:'MXN',series:points}]}},
 {...common,key:'equities',collection:'finance',title:'Bolsa de simulación',sourceSnapshot:{equities:[{label:'S&P/BMV IPC',symbol:'^MXX',country:'México',region:'América',value:41,price:41,series:points,recentSeries:points,source:'Fuente de prueba',url:'https://example.invalid/prueba'}]}},
];
const folder=path.resolve('tmp/pdfs/report-verification');await fs.mkdir(folder,{recursive:true});
for(const sample of samples){
 const before=JSON.stringify(sample),agent=new ExecutiveReportAgent({provider:{isConfigured:()=>true,generate:async()=>({model:'gemini-4-argon',text:JSON.stringify({reports:[{key:sample.key,headline:'Lectura de simulación',context:'El corte conserva las referencias proporcionadas.',thesis:marker,drivers:['Confirmar los datos internos antes de decidir.'],risks:['El dato no es una cotización ejecutable.'],committeeQuestion:question}]})})}});
 const [enriched]=await agent.enrich([sample],{area:sample.collection==='markets'?'Mercados':'Finanzas'});
 assert.equal(enriched.executiveBrief.mode,'ai');assert.equal(enriched.executiveBrief.evidenceHash,editorialFingerprint(editorialFacts(enriched)));assert.equal(JSON.stringify(sample),before);
 const canonical=withDailyEvidence(enriched);assert.equal(canonical.executiveBrief?.thesis,marker,'Dated projections retain the verified analysis');
 const payload=_test.executivePayload(canonical),projection=withDailyEvidence(payload);
 if(sample.key==='grains')assert.equal(projection.sessionNews[0].title,sample.sessionNews[0].title,'Published news context survives export normalization');
 assert.equal(projection.executiveBrief?.model,'gemini-4-argon','Export normalization retains the actual model');
 const view=weeklyReport(projection),withoutAi=weeklyReport({...projection,executiveBrief:undefined});
 assert.equal(view.summaryPanels.find(panel=>panel.summaryKind==='session').body,marker);
 assert.equal(view.summaryPanels.find(panel=>panel.summaryKind==='watch').body,question);
 assert.equal(view.summaryPanels.find(panel=>panel.summaryKind==='implications').body,withoutAi.summaryPanels.find(panel=>panel.summaryKind==='implications').body,'The calculated business impact is unchanged');
 assert(reportCsv(projection).includes('41'),'CSV retains the observed numeric values');
 assert.equal(reportCsv(projection),reportCsv({...projection,executiveBrief:undefined}),'Editorial changes do not change the structured CSV data');
 const pdf=await _test.makeExecutivePdf(projection.title,projection);await fs.writeFile(path.join(folder,'editorial-'+sample.key+'.pdf'),pdf);
 const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:true,disableFontFace:true});const document=await task.promise;let content='';
 try{for(let page=1;page<=document.numPages;page++)content+=(await (await document.getPage(page)).getTextContent()).items.map(item=>item.str).join(' ')+' ';}finally{await task.destroy();}
 assert(content.replace(/\s+/g,' ').includes(marker),'The final PDF contains the full analysis');
 if(sample.key==='grains'){
  const correct=reference=>({...reference,points:reference.points.map((point,index)=>index===reference.points.length-1?{...point,value:45}:point)});
  const corrected={...canonical,dailyReferences:canonical.dailyReferences.map(correct),marketHistory:canonical.marketHistory.map(correct)};
  assert.equal(withDailyEvidence(corrected).executiveBrief,undefined,'Changed evidence invalidates the old analysis even with the same edition date');
 }
 console.log('Editorial projection: '+sample.key+' · data, reading, CSV, PDF and model identity verified.');
}
