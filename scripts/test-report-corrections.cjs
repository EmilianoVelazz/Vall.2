'use strict';
process.env.NODE_ENV='test';process.env.JWT_SECRET='report-corrections-isolated-fixture-at-least-32-bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),express=require('express'),JSZip=require('jszip');
const {createReportHistoryStore}=require('../backend/services/report-history-store');
const {createReportHistoryDatabase}=require('../backend/services/report-history-database');
const {createReportHistoryRouter}=require('../backend/routes/report-history');

function sharedFixture(){
    const records=new Map();let closed=0;
    const select=({filters=[],position,limit=1000}={})=>[...records.values()].filter(row=>filters.every(([key,value])=>row[key]===value) && (!position || Date.parse(row.generated_at)<Date.parse(position.generatedAt) || Date.parse(row.generated_at)===Date.parse(position.generatedAt) && row.id>position.id)).sort((a,b)=>Date.parse(b.generated_at)-Date.parse(a.generated_at)||a.id.localeCompare(b.id)).slice(0,limit);
    const connect=async()=>({end:async()=>{closed++;},query:async(sql,values)=>{
        if(sql.startsWith('INSERT')){const [id,collection,report_key,title,generated_at,publication_timestamp,cut_date,json]=values;if(!records.has(id))records.set(id,{id,collection,report_key,title,generated_at,publication_timestamp,cut_date,report:JSON.parse(json)});return {rows:[]};}
        if(sql.includes('WHERE id=$1'))return {rows:records.has(values[0]) ? [records.get(values[0])] : []};
        const filters=[...sql.matchAll(/(collection|report_key|cut_date)=\$(\d+)/g)].map(match=>[match[1],values[Number(match[2])-1]]),cursor=sql.match(/generated_at<\$(\d+)/);
        return {rows:select({filters,limit:values.at(-1),position:cursor ? {generatedAt:values[Number(cursor[1])-1],id:values[Number(cursor[1])]} : null}).map(row=>({...row,cut_date:sql.includes('cut_date::text') ? row.cut_date : new Date(row.cut_date+'T00:00:00Z')}))};
    }});
    const rest=()=>({from(){const filters=[];let position;return {
        async upsert(row){if(!records.has(row.id))records.set(row.id,structuredClone(row));return {error:null};},
        select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},
        or(value){const match=value.match(/^generated_at\.lt\.([^,]+),and\(generated_at\.eq\.[^,]+,id\.gt\.([a-f0-9]{64})\)$/);assert(match);position={generatedAt:match[1],id:match[2]};return this;},
        async maybeSingle(){return {data:select({filters})[0] || null,error:null};},
        async limit(limit){return {data:select({filters,position,limit}),error:null};},
    };}});
    return {records,connect,rest,closed:()=>closed};
}
async function main(){
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-report-corrections-'));let server;
    try{
        const fixture=sharedFixture(),database=createReportHistoryDatabase({connect:fixture.connect,rest:()=>{throw Error('Unexpected REST fallback');}}),first=createReportHistoryStore({mode:'database',database,directory:path.join(directory,'instance-a')}),second=createReportHistoryStore({mode:'database',database,directory:path.join(directory,'instance-b')});
        // Equal timestamps exercise the secondary ID cursor, not just dates.
        const reports=Array.from({length:205},(_,index)=>({key:'fx',title:'Published '+index,generatedAt:new Date(Date.UTC(2026,10,1)+Math.floor(index/3)*3600000).toISOString(),summary:'Original '+index}));
        await first.archive(reports,'finance');await first.archive(reports,'finance');assert.equal(fixture.records.size,205);
        let cursor,all=[];do{const page=await second.listPage({area:'finance',key:'fx',limit:100,cursor});all.push(...page.data);cursor=page.nextCursor;}while(cursor);
        assert.equal(all.length,205);assert.equal(new Set(all.map(item=>item.id)).size,205);assert.deepEqual((await second.get(all[0].id)).report,{...reports.find(report=>report.title===all[0].title),collection:'finance'});
        assert(fixture.closed()>205);assert.equal(await fs.access(path.join(directory,'instance-a')).then(()=>true,()=>false),false,'Shared history does not rely on local files');
        const different=await first.listPage({area:'finance',key:'fx',limit:1});await assert.rejects(second.listPage({area:'markets',cursor:different.nextCursor}),error=>error.status===400);await assert.rejects(second.get('../private'),error=>error.status===400);
        const dated=(await second.listPage({area:'finance',date:'2026-10-31'})).data;assert(dated.length>0);assert(dated.every(item=>item.date==='2026-10-31'));
        console.log('PASS shared SQL history: 205 immutable editions, independent instances, timestamp ties, filtering and bounded pagination');

        const fallback=createReportHistoryStore({mode:'database',database:createReportHistoryDatabase({connect:async()=>{throw Error('SQL unavailable');},rest:fixture.rest})});
        const firstRest=await fallback.listPage({area:'finance',key:'fx',limit:100}),nextRest=await fallback.listPage({area:'finance',key:'fx',limit:100,cursor:firstRest.nextCursor});assert.equal(firstRest.data.length,100);assert.equal(nextRest.data.length,100);assert(!nextRest.data.some(item=>firstRest.data.some(prior=>prior.id===item.id)));assert.deepEqual((await fallback.get(all[0].id)).report,(await first.get(all[0].id)).report);
        await fallback.archive([{key:'fx',title:'REST edition',generatedAt:'2026-11-08T12:00:00Z',summary:'REST original'}],'finance');assert.equal(fixture.records.size,206);
        const outage=createReportHistoryStore({mode:'database',database:createReportHistoryDatabase({connect:async()=>{throw Error('SQL down');},rest:()=>{throw Error('REST down');}})});
        await assert.rejects(outage.list());await assert.rejects(outage.get(all[0].id));await assert.rejects(outage.archive(reports.slice(0,1),'finance'));
        console.log('PASS private REST fallback and storage outages never become empty/successful local histories');

        const app=express();app.use('/api',createReportHistoryRouter({store:second,authenticate:(req,res,next)=>{req.user={email:'history@example.invalid'};next();}}));server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
        const origin='http://127.0.0.1:'+server.address().port,{loadReportHistoryPage}=await import('../frontend/src/lib/reportHistory.js'),fetcher=(url,options)=>fetch(origin+url,options);
        cursor=null;const ids=new Set();do{const page=await loadReportHistoryPage({area:'finance',key:'fx',cursor},{owner:'history@example.invalid',fetcher});page.data.forEach(item=>{assert(!ids.has(item.id));ids.add(item.id);});cursor=page.nextCursor;}while(cursor);assert.equal(ids.size,206);
        await assert.rejects(loadReportHistoryPage({area:'finance',key:'fx'},{owner:'other@example.invalid',fetcher}),error=>error.code==='REPORT_ACCOUNT_CHANGED');
        const malformed=async()=>new Response(JSON.stringify({success:true,data:[{id:'../invalid'}]}),{headers:{'Content-Type':'application/json'}});await assert.rejects(loadReportHistoryPage({area:'finance'},{fetcher:malformed}));
        console.log('PASS real HTTP history + frontend loader: all editions, account binding and malformed page rejection');

        const {createReportDraft}=await import('../frontend/src/lib/reportCreation.js'),{normalizeReport}=require('../backend/services/user-report-store'),{makeReportWorkbook}=require('../backend/lib/report-workbook');
        const snapshot=JSON.parse(await fs.readFile(path.resolve(__dirname,'../backend/cache/finance_executive_reports.json'),'utf8'));
        const manual={title:'Manual fixture',summary:'OWN_SUMMARY',objective:'OWN_OBJECTIVE',closing:'OWN_CLOSING',generatedAt:'2026-11-10T12:00:00Z',userEdition:true};
        const inputs=[manual,...['equities','bonds','fx'].map(key=>{const report=createReportDraft('finance',{...snapshot.reports.find(item=>item.key===key),collection:'finance'}).report;return {...report,key:'edition_fixture',editionId:'fixture',summary:'OWN_SUMMARY',objective:'OWN_OBJECTIVE',closing:'OWN_CLOSING'};})];
        for(const input of inputs){
            const report=normalizeReport({...input,sections:[{heading:'Own analysis',text:'OWN_ANALYSIS'}],metrics:[{label:'OWN_INDICATOR',value:input.baseReport?.key==='equities' ? '100' : '0',change:'0'}],tables:[{title:'OWN_TABLE',columns:['Item','Value'],rows:[['OWN_ROW',0]]}],visuals:[{type:'line',title:'OWN_CHART',unit:'kg',series:[{label:'OWN_SERIES',points:[{date:'2026-11-09',value:0},{date:'2026-11-10',value:5.125}]}]}]}),original=JSON.stringify(report),zip=await JSZip.loadAsync(await makeReportWorkbook(report),{checkCRC32:true}),xml=(await Promise.all(Object.keys(zip.files).filter(name=>/^xl\/worksheets\/.*\.xml$/.test(name)).map(name=>zip.file(name).async('string')))).join('');
            for(const token of ['OWN_SUMMARY','OWN_ANALYSIS','OWN_OBJECTIVE','OWN_CLOSING','OWN_INDICATOR','OWN_TABLE','OWN_ROW','OWN_CHART','OWN_SERIES'])assert(xml.includes(token),(input.baseReport?.key || 'manual')+' lost '+token);
            assert(xml.includes('<v>5.125</v>'));assert.equal(JSON.stringify(report),original);
            const hidden={...report,personalization:{...report.personalization,sections:{tables:false,indicators:false,charts:false}}},hiddenZip=await JSZip.loadAsync(await makeReportWorkbook(hidden)),hiddenXml=(await Promise.all(Object.keys(hiddenZip.files).filter(name=>/^xl\/worksheets\/.*\.xml$/.test(name)).map(name=>hiddenZip.file(name).async('string')))).join('');for(const token of ['OWN_INDICATOR','OWN_ROW','OWN_CHART'])assert(!hiddenXml.includes(token),(input.baseReport?.key || 'manual')+' retained excluded '+token);
        }
        console.log('PASS Excel preserves authored narrative, tables, indicators, chart precision, genuine zeroes and explicit exclusions for four edition types');
    }finally{
        if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
        const target=path.resolve(directory),relative=path.relative(path.resolve(os.tmpdir()),target);assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('vall-report-corrections-'));await fs.rm(target,{recursive:true,force:true});
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
