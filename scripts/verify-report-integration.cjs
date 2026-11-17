'use strict';
// Bounded, isolated verification. No live mail, production accounts or providers.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'output/report-verification-20261112');
const scripts=[
 'test-report-argon.cjs','test-report-editorial-repair.cjs','test-report-editorial-projection.mjs','test-report-decision-quality.mjs','test-report-daily.mjs','test-report-ai.cjs','test-report-ai-http.cjs','test-report-ai-delivery.cjs',
 'test-report-observations.mjs','test-report-sector-formats.mjs','test-mexico-reports.mjs','test-report-equity-americas.mjs',
 'test-report-pdf-cache.cjs','test-report-preview-cache.mjs','test-report-pdf-cache-http.cjs','test-finance-library-read-latency.cjs',
 'test-report-preference-loading.mjs','test-report-draft-session.mjs','test-report-session-binding.cjs','test-report-input-abuse.cjs',
 'test-report-email-state.mjs','test-report-mail-config.cjs','test-report-email-schedule.cjs','test-report-schedule.cjs',
 'test-report-delivery-reliability.cjs','test-report-scheduling-edge-cases.cjs','test-report-weekly-refresh-api.cjs',
 'test-report-translation-repair.cjs','test-report-corrections.cjs','test-report-history-capacity.cjs',
 'test-ai-response.cjs','test-gemini-reliability.cjs','test-chat-credits.cjs','test-security-extended.cjs','test-session-revocations.cjs',
];
const results=[];
async function run(script,args=[]){
 const env={...process.env,NODE_ENV:'test',VALL_REPORT_EMAIL_AUTOMATION_ENABLED:'false',RUN_BACKGROUND_JOBS:'false',REPORT_EXPORT_OUTPUT:path.join(output,'exports')};
 const isolated=path.join(output,'isolated',script);
 Object.assign(env,{VALL_REPORT_EDITIONS_DIR:path.join(isolated,'editions'),VALL_REPORT_STORAGE_DIR:path.join(isolated,'files'),VALL_REPORT_HISTORY_DIR:path.join(isolated,'history'),VALL_SESSION_STORAGE_DIR:path.join(isolated,'sessions')});
 for(const key of ['GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS','SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','USER_PASSWORD','VALL_AUTH_PASSWORD','FINNHUB_TOKEN','NEWSAPI_KEY','CRON_SECRET','REFRESH_SECRET'])env[key]='';
 delete env.VERCEL;
 const started=Date.now(),child=spawn(process.execPath,['--use-system-ca',path.join(root,'scripts',script),...args],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});let log='',timedOut=false;
 child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
 const timer=setTimeout(()=>{timedOut=true;child.kill();},240000);
 const code=await new Promise(resolve=>{child.once('error',error=>{log+=error.message;resolve(-1);});child.once('close',resolve);});clearTimeout(timer);
 const result={script,args,status:code===0 && !timedOut?'passed':'failed',exitCode:code,timedOut,ms:Date.now()-started};
 await fs.writeFile(path.join(output,script+'.log'),log);results.push(result);await fs.writeFile(path.join(output,'suite.json'),JSON.stringify({checkedAt:new Date().toISOString(),productionChanged:false,emailsSent:0,results},null,2));
 console.log(JSON.stringify({...result,...(result.status==='failed'?{tail:log.slice(-2000)}:{})}));return result;
}
async function main(){
 await fs.mkdir(output,{recursive:true});let index=0;
 const worker=async()=>{while(index<scripts.length){const script=scripts[index++];await run(script);}};
 await Promise.all([worker(),worker()]);
 await run('test-report-export-matrix.mjs',['--current-only']);
 console.log(JSON.stringify({complete:true,passed:results.filter(row=>row.status==='passed').length,failed:results.filter(row=>row.status==='failed').length,output}));
 if(results.some(row=>row.status!=='passed'))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
