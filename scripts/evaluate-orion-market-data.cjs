'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
require('../backend/lib/tls-trust').configureSystemTrust();
const {planQuery}=require('../backend/ai/query-planner');
const {buildForecastAnalysis}=require('../backend/ai/forecast-analysis');
const {createOrionMcpSession}=require('../backend/ai/mcp-tools');
async function main() {
    if(!process.argv.includes('--live')) throw Error('Requiere --live para consultar las series públicas.');
    const results=[];
    for(const message of ['Pronóstico de USD/MXN para 5 sesiones','Pronóstico de futuros de maíz ZC=F para 5 sesiones','Pronóstico de futuros de cerdo HE=F para 5 sesiones']) {
        let session;
        try {
            const plan=planQuery({message,history:[]});
            session=await createOrionMcpSession({forecast_analysis:()=>buildForecastAnalysis(plan,{learningStore:null,persist:false,now:Date.now(),get:url=>fetch(url,{signal:AbortSignal.timeout(10000)})})},{timeoutMs:20000});
            const answer=await session.call('forecast_analysis');
            results.push({message,available:answer.available,reason:answer.reason,records:answer.records,protocolVersion:session.protocolVersion});
        } catch(error) {results.push({message,status:'unavailable',code:error.code || error.name});}
        finally {await session?.close();}
    }
    const directory=path.resolve(__dirname,'../output/analisis-inteligencia-orion');await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'series-publicas-reales.json'),JSON.stringify({generatedAt:new Date().toISOString(),scope:'Series públicas por MCP, sin LLM, sin guardar ensayos de pronóstico ni modificar datos de usuarios.',results},null,2));
    console.log(JSON.stringify(results.map(row=>({message:row.message,available:row.available,status:row.status,records:row.records?.map(item=>({ticker:item.ticker,cutoff:item.cutoff,profile:item.marketProfile,available:item.available,reason:item.reason,checks:item.evaluation?.nonOverlapping}))})),null,2));
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
