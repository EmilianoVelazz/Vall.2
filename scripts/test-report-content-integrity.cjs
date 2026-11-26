'use strict';
process.env.NODE_ENV='test';process.env.RUN_BACKGROUND_JOBS='false';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {reportHealth}=require('../shared/report-health.mjs');
const {structuralEvidence}=require('../shared/report-structural-evidence.mjs');
const {buildMexicoReports}=require('../backend/services/mexico-executive-reports');
const {normalizeReport}=require('../backend/services/user-report-store');
const {compactPanoramaPart}=require('../shared/report-panorama.mjs');
const {createExecutiveReportStore}=require('../backend/services/executive-report-store');
const {withPreviousDailyEvidence}=require('../backend/lib/report-daily-evidence');
async function main(){
 const now=Date.parse('2026-11-26T18:00:00Z'),cutoff=new Date(now).toISOString();
 const production=buildMexicoReports({},new Date(now)).find(report=>report.key==='mx_production');
 const original=JSON.stringify(production),health=reportHealth(production,now);
 assert.equal(health.state,'historical');assert.equal(health.asOf,'2025');assert.equal(health.periodLabel,'2024 · 2025');
 assert.equal(health.coverage.missing,0);assert.equal(health.coverage.historical,5);
 assert(health.references.every(item=>/^\d{4}$/.test(item.date)),'No fabricar un día de publicación para una cifra anual');
 for(const copy of [normalizeReport(production),compactPanoramaPart(production,'mexico',cutoff)])assert.deepEqual(copy.structuralReferences,production.structuralReferences,'Periodo, unidad, valor y fuente sobreviven a guardado e integración');
 const forged={...production,structuralReferences:[{...production.structuralReferences[0],period:'2027'},{...production.structuralReferences[0],url:'javascript:alert(1)'}]};
 assert.deepEqual(structuralEvidence(forged),{});
 assert.equal(JSON.stringify(production),original,'Evaluar cobertura no altera la evidencia');
 const bond={key:'bonds',collection:'finance',generatedAt:cutoff,sourceSnapshot:{bonds:[{label:'Bono mensual',market:'País de prueba',cadence:'monthly',series:[{date:'2026-10',value:3.5}]}]},dailyReferences:[{label:'Bono mensual',unit:'%',points:[]}]};
 const monthly=reportHealth(bond,now);assert.equal(monthly.state,'updated');assert.equal(monthly.coverage.total,1);assert.equal(monthly.coverage.missing,0);assert.equal(monthly.asOf,'2026-10');
 const old=reportHealth({...bond,sourceSnapshot:{bonds:[{...bond.sourceSnapshot.bonds[0],series:[{date:'2026-06',value:3.5}]}]}},now);
 assert.equal(old.state,'stale','Reconocer series no rejuvenece un periodo antiguo');
 const missing=reportHealth({...bond,sourceSnapshot:{bonds:[{...bond.sourceSnapshot.bonds[0],series:[]}]}},now);
 assert.equal(missing.coverage.missing,1,'Un faltante real sigue siendo visible');
 const separate=reportHealth({...bond,sourceSnapshot:{bonds:[bond.sourceSnapshot.bonds[0],{...bond.sourceSnapshot.bonds[0],market:'Otro país'}]}},now);
 assert.equal(separate.coverage.total,2,'No mezclar referencias de mercados distintos');
 const merged=withPreviousDailyEvidence({key:'bonds',collection:'finance',generatedAt:cutoff,dailyReferences:[{label:'Actual',unit:'%',points:[{date:'2026-11-26',value:3}]}]},
  {key:'bonds',collection:'finance',generatedAt:cutoff,dailyReferences:[{label:'Alias vacío anterior',unit:'%',points:[]},{label:'Histórico real',unit:'%',points:[{date:'2026-11-25',value:2}]}]});
 assert.equal(merged.dailyReferences.length,2);assert(!merged.dailyReferences.some(item=>item.label==='Alias vacío anterior'));
 assert(merged.dailyReferences.some(item=>item.label==='Histórico real'),'Mantener evidencia histórica, sin acumular marcadores vacíos antiguos');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vall-local-reports-')),file=path.join(folder,'snapshot.json');
 let remoteCalls=0;const options={table:'market_executive_reports',keys:['market_news'],file,localOnly:true,clientFactory(){remoteCalls++;throw Error('No usar REST');},async connect(){remoteCalls++;throw Error('No usar PostgreSQL');}};
 try{const store=createExecutiveReportStore(options);assert.equal(await store.load(),null);await store.save([{key:'market_news',title:'Prueba',sections:[]}],cutoff);assert.equal((await createExecutiveReportStore(options).load()).reports.length,1);assert.equal(remoteCalls,0);}finally{for(const name of await fs.readdir(folder))await fs.unlink(path.join(folder,name));await fs.rmdir(folder);}
 console.log('Contenido: periodos oficiales sin fechas inventadas, referencias mensuales, faltantes reales, mercados separados, guardado íntegro y cero accesos remotos en modo local OK.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
