'use strict';
// Each probe targets a disposable child API, never the live project server.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),{fork}=require('node:child_process');
if(process.argv.includes('--child')){
 require('./lib/security-fixture.cjs').start().then(fixture=>{process.send({ready:true,url:fixture.url});process.on('message',async message=>{if(message==='close'){await fixture.close();process.exit(0);}});}).catch(error=>{console.error(error.message);process.exit(1);});
}else{
 async function probe(encoding,compress){
  const child=fork(__filename,['--child'],{silent:true,windowsHide:true});let stderr='',exitCode=null,exited=false;child.stdout.resume();child.stderr.on('data',chunk=>stderr+=chunk);child.once('exit',code=>{exitCode=code;exited=true;});
  try{
   const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Child startup timeout')),20000);child.on('message',message=>{if(message.ready){clearTimeout(timer);resolve(message.url);}});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(Error('Child exited before readiness'));});});
   let responseStatus=null,requestError=null;
   await new Promise(resolve=>{const timer=setTimeout(resolve,2500),request=http.request(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':encoding,'Transfer-Encoding':'chunked'}},response=>{responseStatus=response.statusCode;response.resume();response.on('end',()=>{clearTimeout(timer);resolve();});});request.on('error',error=>{requestError=error.code;clearTimeout(timer);resolve();});request.write(compress(Buffer.from(JSON.stringify({email:'invalid',password:'fixture'}))));setTimeout(()=>request.end(Buffer.from([0xff,0xff,0xff,0xff])),100);});
   await new Promise(resolve=>setTimeout(resolve,300));let healthStatus=null;try{healthStatus=(await fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)})).status;}catch{}
   return {encoding,responseStatus,requestError,exited,exitCode,healthStatus,crashed:exited && exitCode!==0,diagnostic:stderr.split('\n').filter(line=>/Error|unhandled|ERR_|Z_DATA|brotli|decompress/i.test(line)).slice(0,7)};
  }finally{if(!exited){child.send('close');await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},2000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}}
 }
 async function main(){const results=await Promise.all([['gzip',zlib.gzipSync],['deflate',zlib.deflateSync],['br',zlib.brotliCompressSync]].map(([encoding,compress])=>probe(encoding,compress)));const output=path.resolve(__dirname,'..',process.env.SECURITY_ASSESSMENT_OUTPUT || 'output/vulnerabilidades-20261110');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'compressed-body-checks.json'),JSON.stringify({results,isolatedChildApis:true,liveServerTargeted:false},null,2));console.log(JSON.stringify(results,null,2));if(results.some(item=>item.crashed || item.exited || item.healthStatus!==200))process.exitCode=1;}
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
