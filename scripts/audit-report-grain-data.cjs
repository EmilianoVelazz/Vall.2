'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {externalGet}=require('../backend/lib/http'),{readPublicDocument}=require('../backend/lib/report-public-document');
const {loadGlobalGrainPrices}=require('../backend/lib/report-global-grain-prices'),{config,parseCommodity}=require('../backend/lib/report-global-commodities');
const {weeklyReport}=require('../shared/report-weekly.mjs');
const equal=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-8,Math.abs(b)*1e-10);
(async()=>{
 const folder=path.resolve('output/auditoria-granos-20261105');await fs.mkdir(folder,{recursive:true});
 const replay=process.argv.includes('--replay'),previousAudit=replay ? JSON.parse(await fs.readFile(path.join(folder,'resultado.json'),'utf8')) : null;
 const requestKey=value=>{const url=new URL(value);url.searchParams.delete('period2');if(url.searchParams.has('uuid__in'))url.searchParams.set('uuid__in',url.searchParams.get('uuid__in').split(',').sort().join(','));url.searchParams.sort();return url.href;};
 const snapshot=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')),report=snapshot.reports.find(item=>item.key==='grains'),model=weeklyReport(report),cutoff=report.generatedAt,requests=[],bodies=new Map();
 await fs.writeFile(path.join(folder,'informe-auditado.json'),JSON.stringify(report));
 const record=async(url,body,status)=>{const file=crypto.createHash('sha256').update(url).digest('hex').slice(0,20)+(Buffer.isBuffer(body)?'.bin':'.txt');await fs.writeFile(path.join(folder,file),body);requests.push({url,status,file,checkedAt:new Date().toISOString()});if(typeof body==='string')bodies.set(url,body);};
 const get=async(url,headers,timeout)=>{try{
  if(replay){const prior=previousAudit.requests.find(item=>item.file&&requestKey(item.url)===requestKey(url)),file=prior?.file || (url.endsWith('symbol=C0') ? 'sina-maiz-reintento.json' : null);if(!file)throw Error('Sin respuesta conservada para esta consulta.');const body=await fs.readFile(path.join(folder,file),'utf8');requests.push({url,status:200,file,replayed:true});bodies.set(url,body);return {ok:true,status:200,text:async()=>body,json:async()=>JSON.parse(body)};}
  const response=await externalGet(url,headers,timeout),body=await response.text();await record(url,body,response.status);return {...response,text:async()=>body,json:async()=>JSON.parse(body)};
 }catch(error){requests.push({url,error:error.message});throw error;}};
 const read=async(url,options)=>{try{if(replay){const prior=previousAudit.requests.find(item=>item.file&&requestKey(item.url)===requestKey(url));if(!prior)throw Error('Fuente sin documento recuperado.');requests.push({...prior,replayed:true});return fs.readFile(path.join(folder,prior.file),options.encoding===null ? undefined : 'utf8');}const body=await readPublicDocument(url,options);await record(url,body,200);return body;}catch(error){requests.push({url,error:error.message});throw error;}};
 const freshTask=loadGlobalGrainPrices({get,read,cutoff,previous:[],cacheFile:null,timeoutMs:25000});
 const futures=await Promise.all(config.markets.filter(item=>item.bucket==='grains').map(async item=>{try{
  const url=item.provider==='sina' ? 'https://stock2.finance.sina.com.cn/futures/api/json.php/InnerFuturesNewService.getDailyKLine?symbol='+item.ticker : 'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(item.ticker)+'?interval=1d&period1=1577836800&period2='+Math.floor((Date.parse(cutoff)+86400000)/1000);
  const response=await get(url,{Accept:'application/json',...(item.provider==='sina' ? {Referer:'https://finance.sina.com.cn/'} : {})},15000);if(!response.ok)return null;return parseCommodity(await response.json(),item,cutoff);
 }catch{return null;}}));
 const fresh=[...futures.filter(Boolean),...await freshTask],checks=[],issues=[];
 let observations=0,calculations=0;
 for(const reference of model.references){
  const raw=report.sourceSnapshot.grains.find(item=>item.label===reference.label && item.unit===reference.unit),live=fresh.find(item=>item.ticker===(raw?.ticker || raw?.symbol) && item.provider===raw?.provider && item.unit===reference.unit);
  if(!raw){issues.push({label:reference.label,issue:'missing-original'});continue;}
  const original=new Map(raw.series.filter(point=>point.value>0 && point.date>='2020-01-01' && Date.parse(point.date)<=Date.parse(cutoff)).map(point=>[point.date,point.value]));
  for(const point of reference.points){observations++;if(!equal(original.get(point.date),point.value))issues.push({label:reference.label,date:point.date,issue:'observation-not-in-original'});}
  const earliest=[...original.keys()].sort()[0];if(reference.points[0].date!==earliest)issues.push({label:reference.label,issue:'historical-base-omitted',expected:earliest,actual:reference.points[0].date});
  for(const [period,change] of Object.entries(reference.periods)){if(!change)continue;calculations++;if(!equal(original.get(change.baseDate),change.base)||!equal(original.get(change.lastDate),change.last)||!equal((change.last/change.base-1)*100,change.value))issues.push({label:reference.label,period,issue:'incorrect-change'});if(period==='since2020'&&!change.baseDate.startsWith('2020-'))issues.push({label:reference.label,period,issue:'partial-history-named-2020',base:change.baseDate});}
  if(reference.cadence!=='daily'&&reference.periods.day)issues.push({label:reference.label,issue:'non-daily-presented-as-daily'});
  const checkedPoints=live ? reference.points.filter(point=>live.series.some(source=>source.date===point.date)) : [],differences=checkedPoints.flatMap(point=>{const value=live.series.find(source=>source.date===point.date).value;return equal(value,point.value)?[]:[{date:point.date,published:point.value,live:value}];});
  const liveAtReportDate=live?.series.find(point=>point.date===reference.last.date),currentMatches=Boolean(liveAtReportDate&&equal(liveAtReportDate.value,reference.last.value));
  checks.push({label:reference.label,unit:reference.unit,cadence:reference.cadence,base:reference.points[0],last:reference.last,source:raw.source,url:raw.url,live:Boolean(live),currentMatches,checkedPoints:checkedPoints.length,differences,latestLive:live?.series.at(-1)});
 }
 const result={checkedAt:new Date().toISOString(),cutoff,replayed:replay,references:model.references.length,observations,calculations,liveMatches:checks.filter(item=>item.currentMatches).length,liveUnavailable:checks.filter(item=>!item.live).map(item=>item.label),liveDifferences:checks.filter(item=>item.live&&!item.currentMatches),issues,checks,requests};
 await fs.writeFile(path.join(folder,'resultado.json'),JSON.stringify(result,null,2));await fs.writeFile(path.join(folder,'cotizaciones-en-vivo.json'),JSON.stringify(fresh));
 console.log(JSON.stringify({...result,checks:undefined,requests:undefined},null,2));
 if(issues.length || result.liveDifferences.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
