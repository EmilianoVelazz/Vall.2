'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {CACHE_DIR}=require('../lib/config');
const collections=require('../../shared/report-collections.json');
function createReportHistoryStore({directory=process.env.VALL_REPORT_HISTORY_DIR || path.join(CACHE_DIR,'report-history')}={}){
    const root=path.resolve(directory),idPattern=/^[a-f0-9]{64}$/;
    const valid=(report,area)=>collections[area]?.reportKeys.includes(report?.key) && !report.userEdition && report.periodType!=='annual' && typeof report.title==='string' && Number.isFinite(Date.parse(report.generatedAt));
    const summary=item=>({id:item.id,collection:item.collection,key:item.key,title:item.title,generatedAt:item.generatedAt,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.generatedAt))});
    async function index(item){
        const metadata=summary(item),folder=path.join(root,'index'),target=path.join(folder,item.id+'.json'),temporary=target+'.'+crypto.randomUUID()+'.tmp';
        await fs.mkdir(folder,{recursive:true});
        try{
            await fs.writeFile(temporary,JSON.stringify(metadata),{flag:'wx',mode:0o600});
            try{await fs.rename(temporary,target);}catch(error){
                // Windows may reject replacement while another writer has just
                // published the same immutable index. Accept only exact metadata.
                if(!['EEXIST','EPERM','EACCES'].includes(error.code))throw error;
                const current=await fs.readFile(target,'utf8').then(JSON.parse).catch(()=>null);
                if(!current || Object.entries(metadata).some(([key,value])=>current[key]!==value))throw error;
            }
        }finally{await fs.unlink(temporary).catch(()=>{});}
        return metadata;
    }
    async function archive(reports,area){
        if(!collections[area] || area==='mine')throw Error('Colección histórica no válida.');
        await fs.mkdir(root,{recursive:true});
        for(const item of reports || []){
            if(!valid(item,area))continue;
            const report=structuredClone({...item,collection:area});delete report.sourceInputs;delete report.causeText;
            if(report.dataStatus)delete report.dataStatus.attemptedAt;
            const data=JSON.stringify(report);if(Buffer.byteLength(data)>3*1024*1024)continue;
            const id=crypto.createHash('sha256').update(area+'\0'+report.key+'\0'+report.generatedAt+'\0'+data).digest('hex');
            // Exclusive creation makes an edition immutable across processes.
            const target=path.join(root,id+'.json'),temporary=target+'.'+crypto.randomUUID()+'.tmp';
            try{await fs.writeFile(temporary,JSON.stringify({id,collection:area,key:report.key,title:report.title,generatedAt:report.generatedAt,report}),{flag:'wx',mode:0o600});try{await fs.link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;}}finally{await fs.unlink(temporary).catch(()=>{});}
            await index({id,collection:area,key:report.key,title:report.title,generatedAt:report.generatedAt});
        }
    }
    async function get(id){
        if(!idPattern.test(id || ''))throw Object.assign(Error('Edición no válida.'),{status:400});
        const file=path.join(root,id+'.json');
        try{if((await fs.stat(file)).size>4*1024*1024)return null;const item=JSON.parse(await fs.readFile(file,'utf8'));return item.id===id && valid(item.report,item.collection) ? item : null;}catch(error){if(error.code==='ENOENT')return null;throw error;}
    }
    async function entries({area,key,date}={}){
        let files;try{files=await fs.readdir(root);}catch(error){if(error.code==='ENOENT')return [];throw error;}
        const result=[];
        for(const file of files.filter(file=>idPattern.test(file.replace(/\.json$/,'')) && file.endsWith('.json'))){
            const id=file.slice(0,-5);let item;
            try{const target=path.join(root,'index',file);if((await fs.stat(target)).size>8192)throw Error('Invalid index');item=JSON.parse(await fs.readFile(target,'utf8'));if(item.id!==id || !valid(item,item.collection) || summary(item).date!==item.date)throw Error('Invalid index');}catch{const original=await get(id).catch(()=>null);if(original)item=await index(original);else continue;}
            if(area && item.collection!==area || key && item.key!==key || date && item.date!==date)continue;
            result.push(summary(item));
        }
        return result.sort((a,b)=>Date.parse(b.generatedAt)-Date.parse(a.generatedAt)||a.id.localeCompare(b.id));
    }
    async function list(options={}){return (await entries(options)).slice(0,Math.min(200,Math.max(1,Number(options.limit)||100)));}
    async function listPage({area,key,date,limit=50,cursor}={}){
        const filters=JSON.stringify([area || '',key || '',date || '']);let position;
        if(cursor){try{if(typeof cursor!=='string' || cursor.length>1200 || !/^[A-Za-z0-9_-]+$/.test(cursor))throw Error();position=JSON.parse(Buffer.from(cursor,'base64url').toString());if(position.filters!==filters || !idPattern.test(position.id) || !Number.isFinite(Date.parse(position.generatedAt)))throw Error();}catch{throw Object.assign(Error('Cursor histórico no válido.'),{status:400});}}
        const all=await entries({area,key,date}),remaining=position ? all.filter(item=>Date.parse(item.generatedAt)<Date.parse(position.generatedAt) || Date.parse(item.generatedAt)===Date.parse(position.generatedAt) && item.id>position.id) : all,count=Math.min(200,Math.max(1,Math.trunc(Number(limit)||50))),data=remaining.slice(0,count),last=data.at(-1);
        return {data,nextCursor:remaining.length>count ? Buffer.from(JSON.stringify({filters,id:last.id,generatedAt:last.generatedAt})).toString('base64url') : null};
    }
    return {archive,get,list,listPage};
}
const reportHistory=createReportHistoryStore();
reportHistory.seedCurrent=async()=>{for(const [area,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']]){try{const snapshot=JSON.parse(await fs.readFile(path.join(CACHE_DIR,file),'utf8'));await reportHistory.archive(snapshot.reports,area);}catch{ /* A missing cut is not fabricated. */ }}};
module.exports={createReportHistoryStore,reportHistory};
