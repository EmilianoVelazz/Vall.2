'use strict';
// Read-only rehearsal of saved local schedules. SMTP is disabled before any
// application import; the queue, timestamps and recipients are never modified.
process.env.NODE_ENV='test';
const fs=require('node:fs/promises'),path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
require('../backend/lib/tls-trust').configureSystemTrust();
let smtpAttempts=0;
require('nodemailer').createTransport=()=>{smtpAttempts++;throw Error('SMTP bloqueado durante la revisión');};
const {createScheduledReportDelivery}=require('../backend/services/report-scheduled-delivery');
const collections=require('../shared/report-collections.json');
const {personalizeExecutiveReport}=require('../backend/lib/executive-report-preferences');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const {reportLearning}=require('../backend/services/report-learning');
const renderer=require('../backend/routes/export')._test;
async function main() {
    const root=path.resolve(__dirname,'..'),file=path.join(root,'backend/cache/report-email-schedules.json');
    const saved=(JSON.parse(await fs.readFile(file,'utf8'))).filter(row=>row.active!==false);
    const results=[];
    const agent=new UserReportAgent({timeoutMs:90000});
    for(const schedule of saved) {
        const started=Date.now(),ai=schedule.preferences?.aiCustomization?.enabled===true;
        if(ai&&!process.argv.includes('--live-ai')) {results.push({area:schedule.area,reportKey:schedule.reportKey,status:'ai_not_tested'});continue;}
        let bytes=0,record;
        const run=createScheduledReportDelivery({
            collections,store:{due:async()=>[structuredClone(schedule)],claim:async()=>true,isCurrent:async()=>true,record:async(id,value)=>{record=value;}},
            loadSnapshot:area=>area==='finance'?require('../backend/services/finance-report-store').load():area==='markets'?require('../backend/services/market-report-store').load():require('../backend/services/mexico-executive-reports').get(),
            generate:async(request,{ownerEmail})=>agent.generate(request,{userContext:await reportLearning.load({email:ownerEmail})}),
            personalize:personalizeExecutiveReport,prepare:renderer.executivePayload,
            deliver:async({title,executive,language,owner})=>{
                const localized=await require('../backend/services/report-translation').reportTranslator.localize({report:executive,title,language},{owner});
                const pdf=await renderer.makeExecutivePdf(localized.title,localized.report,localized);
                if(pdf.subarray(0,5).toString()!=='%PDF-') throw Error('No se generó un PDF válido');
                bytes=pdf.length;return {messageId:'rehearsal-no-smtp'};
            },
        });
        const outcome=await run();
        results.push({area:schedule.area,reportKey:schedule.reportKey,ai,status:outcome.sent===1?'pdf_prepared':'preparation_failed',bytes,elapsedMs:Date.now()-started,...(record?.error?{error:'Falló la preparación; consultar el diagnóstico local.'}:{})});
    }
    if(smtpAttempts!==0) throw Error('Se intentó abrir SMTP durante la revisión');
    const report={checkedAt:new Date().toISOString(),scope:'Ensayo con programaciones e informes locales reales. SMTP bloqueado; cola y horarios sin cambios. Sólo IA marcada se consulta con --live-ai.',smtpAttempts,results};
    await fs.mkdir(path.join(root,'output'),{recursive:true});
    await fs.writeFile(path.join(root,'output/revision-programaciones-2026-10-15.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
