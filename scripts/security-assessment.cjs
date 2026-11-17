'use strict';
// Isolated security checks. No audit fix, deployment, mail or production DB calls.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,process.env.SECURITY_ASSESSMENT_OUTPUT || 'output/vulnerabilidades-20261110');
const env={...process.env,NODE_ENV:'test',VERCEL:'1',JWT_SECRET:'security-assessment-fixture-only-secret',VALL_REPORT_EMAIL_AUTOMATION_ENABLED:'false'};
for(const name of ['GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS','SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','DB_PASSWORD','MYSQL_PASSWORD','USER_EMAIL','USER_PASSWORD','VALL_AUTH_PASSWORD'])env[name]='';
async function run(name,args,cwd=root,timeout=120000){
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false;
  child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
  child.on('error',error=>{clearTimeout(timer);resolve({name,exitCode:null,timedOut,error:error.message,stdout,stderr});});
  child.on('close',exitCode=>{clearTimeout(timer);resolve({name,exitCode,timedOut,stdout,stderr});});
 });
 await fs.writeFile(path.join(output,name+'.log'),result.stdout+result.stderr);return result;
}
async function main(){
 await fs.mkdir(output,{recursive:true});
 if(process.argv.includes('--inventory-only')){
  const rows=[];
  for(const [name,directory]of [['npm-root-all',root],['npm-frontend-all',path.join(root,'frontend')]]){
   const report=JSON.parse(await fs.readFile(path.join(output,name+'.json'),'utf8')),lock=JSON.parse(await fs.readFile(path.join(directory,'package-lock.json'),'utf8'));
   for(const [packageName,item]of Object.entries(report.vulnerabilities || {}))for(const node of item.nodes){let installed=null;try{installed=JSON.parse(await fs.readFile(path.join(directory,node,'package.json'),'utf8')).version;}catch{}rows.push({scope:name,package:packageName,node,severity:item.severity,locked:lock.packages?.[node]?.version,installed,auditedRange:item.range});}
  }
  const vendor=await fs.readFile(path.join(root,'assets/js/vendor/mermaid.min.js'),'utf8'),bundledPurify=vendor.match(/DOMPurify[\s\S]{0,80}?\.version="([\d.]+)"/)?.[1] || null;
  await fs.writeFile(path.join(output,'dependency-inventory.json'),JSON.stringify({rows,vendoredMermaid:{file:'assets/js/vendor/mermaid.min.js',embeddedDomPurify:bundledPurify},note:'npm audit describes the lockfiles; installed versions and vendored browser code are recorded separately.'},null,2));
  await fs.copyFile(path.join(root,'output/auditoria-codigo/secretos/resultados.json'),path.join(output,'secrets-redacted.json'));console.log(JSON.stringify({packages:rows.length,installedLockDifferences:rows.filter(row=>row.locked!==row.installed),embeddedDomPurify:bundledPurify}));return;
 }
 if(process.argv.includes('--dependencies-only')){
  const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),results=[];
  for(const [name,cwd,omit]of [['npm-root-all',root,false],['npm-root-production',root,true],['npm-frontend-all',path.join(root,'frontend'),false],['npm-frontend-production',path.join(root,'frontend'),true]]){
   const result=await run(name,['--use-system-ca',npm,'audit','--json','--ignore-scripts','--registry=https://registry.npmjs.org',...(omit?['--omit=dev']:[])],cwd);let report;try{report=JSON.parse(result.stdout);}catch{report={error:{summary:result.error || 'Registry response was not JSON'}};}
   await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));const summary={name,exitCode:result.exitCode,timedOut:result.timedOut,completed:!report.error && Boolean(report.metadata),counts:report.metadata?.vulnerabilities || null,error:report.error?.summary || null};results.push(summary);console.log(JSON.stringify(summary));
  }
  await fs.writeFile(path.join(output,'dependencies-summary.json'),JSON.stringify({generatedAt:new Date().toISOString(),results,readOnly:true},null,2));if(results.some(item=>!item.completed))process.exitCode=1;return;
 }
 const suites=[
  ['tls-ssrf',['-r','./scripts/lib/security-fixture.cjs','scripts/test-security.cjs']],
  ['http-security',['scripts/test-security-http.cjs']],
  ['chat-credit-policy',['scripts/test-chat-credits.cjs']],
  ['chat-unlimited-http',['scripts/test-chat-credits-http.cjs']],
  ['chat-credit-sdk',['scripts/test-chat-credit-sdk.cjs']],
  ['private-analysis',['scripts/test-private-analysis-security.cjs']],
  ['finance-generation',['scripts/test-finance-generation-security.cjs']],
  ['news-http',['scripts/test-news-editorial-http.cjs']],
  ['xss-renderers',['scripts/test-xss.cjs']],
  ['xss-active',['scripts/test-xss-active.cjs']],
  ['auth-inputs',['scripts/test-auth-validation.cjs']],
  ['auth-server',['scripts/test-auth-server.cjs']],
  ['report-account-binding',['scripts/test-report-session-binding.cjs']],
  ['report-input-abuse',['scripts/test-report-input-abuse.cjs']],
  ['admin-password-deployment',['scripts/test-admin-password-deployment.cjs']],
  ['session-revocations',['scripts/test-session-revocations.cjs']],
  ['session-checks',['scripts/security-session-checks.cjs']],
  ['session-security',['scripts/test-session-security.cjs']],
  ['auth-legacy-migration',['scripts/test-auth-legacy-migration.cjs']],
  ['auth-branch-origin',['scripts/test-auth-branch-origin.cjs']],
  ['extended-security',['scripts/test-security-extended.cjs']],
  ['compressed-inputs',['scripts/security-compressed-check.cjs']],
  ['mermaid-browser',['scripts/test-mermaid-browser.cjs']],
 ];
 const results=[];let index=0;
 await Promise.all(Array.from({length:3},async()=>{while(index<suites.length){const [name,args]=suites[index++],result=await run(name,args);const summary={name,exitCode:result.exitCode,timedOut:result.timedOut,passed:result.exitCode===0&&!result.timedOut};results.push(summary);console.log(JSON.stringify(summary));}}));
 await fs.writeFile(path.join(output,'local-summary.json'),JSON.stringify({generatedAt:new Date().toISOString(),results,isolatedAccounts:true,isolatedProviders:true,readOnlyProduction:true},null,2));if(results.some(item=>!item.passed))process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
