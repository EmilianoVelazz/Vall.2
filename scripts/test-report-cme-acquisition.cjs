'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {readCmeBulletin}=require('../backend/lib/report-cme-document');
const {createReportDerivativesLoader,attachReportDerivatives}=require('../backend/lib/report-commodity-derivatives');
const {commodityDerivativesTables}=require('../shared/report-commodity-derivatives.mjs');
const url='https://www.cmegroup.com/daily_bulletin/current/Section56_Corn_Oat_RoughRice_Options.pdf';
async function main(){
    let request;
    const fetchDocument=async(target,options)=>{request={target,options};return new Response('%PDF-test');};
    assert.equal((await readCmeBulletin(url,{fetchDocument})).toString(),'%PDF-test');
    assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Accept,'application/pdf');
    for(const target of ['http://www.cmegroup.com/daily_bulletin/current/Section56_Test.pdf',url.replace('www.cmegroup.com','example.invalid'),url+'?redirect=x'])await assert.rejects(readCmeBulletin(target,{fetchDocument}),{code:'CME_URL_INVALID'});
    await assert.rejects(readCmeBulletin(url,{fetchDocument:async()=>new Response('Forbidden',{status:403})}),{code:'CME_HTTP_403'});
    await assert.rejects(readCmeBulletin(url,{maxBytes:6,fetchDocument}),{code:'CME_PDF_TOO_LARGE'});
    await assert.rejects(readCmeBulletin(url,{maxBytes:6,fetchDocument:async()=>new Response('%PDF-test',{headers:{'Content-Length':'99'}})}),{code:'CME_PDF_TOO_LARGE'});
    await assert.rejects(readCmeBulletin(url,{fetchDocument:async()=>new Response('<html>Access denied</html>')}),{code:'CME_PDF_INVALID'});
    const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vallnews-cme-test-'));
    try{
        let clock=Date.parse('2026-11-17T15:00:00Z'),reads=0,fail=false;
        const start=new Date(clock).toISOString(),filePath=path.join(folder,'cache.json');
        const load=createReportDerivativesLoader({filePath,initialSeed:{options:[],futures:[]},documentNames:['Section56_Corn_Oat_RoughRice_Options'],now:()=>clock});
        const read=async()=>{reads++;clock+=1000;if(fail)throw Object.assign(new Error('Rejected'),{code:'CME_HTTP_403'});return Buffer.from('%PDF-test');};
        const lines=['Mon, Nov 16, 2026 FINAL','CORN FUT','TOTAL CORN FUT 1 2 1993852 - 15958 3 4','CORN CALL','DEC26','TOTAL 1 641911 - 852','CORN PUT','DEC26','TOTAL 1 391028 - 122'];
        const pdfPages=async()=>[{lines,text:lines.join(' ')}];
        const [data,coalesced]=await Promise.all([load({read,pdfPages}),load({read,pdfPages})]);
        assert.equal(reads,1,'Concurrent reports share one provider request');assert.deepEqual(data,coalesced);
        assert.equal(data.options.length,2,'Rows retrieved after report start remain in a completed current cut');
        assert(Date.parse(data.options[0].retrievedAt)>Date.parse(start));
        const original={generatedAt:start,reports:[{key:'grains',generatedAt:start,sourceSnapshot:{grains:[{symbol:'ZC=F',label:'Maíz',unit:'USc/bu',series:[{date:'2026-11-16',value:400}]}]}}]};
        const snapshot=attachReportDerivatives({...original,generatedAt:data.checkedAt},data,{generatedAt:data.checkedAt});
        assert.equal(commodityDerivativesTables(snapshot.reports[0],[{symbol:'ZC=F',label:'Maíz'}])[0].rows[0][2],'641,911');
        assert.deepEqual(snapshot.reports[0].sourceSnapshot,original.reports[0].sourceSnapshot,'Adding CME evidence preserves price dates and values');
        assert.equal((await load({cutoff:start,refresh:false})).options.length,0,'Historical cutoffs still reject later retrievals');
        await load({read,pdfPages});assert.equal(reads,1,'Healthy reads reuse the cache');
        clock+=3600001;fail=true;const fallback=await load({read,pdfPages});assert.equal(fallback.options.length,2,'A failed provider preserves still-valid evidence');
        let stored=JSON.parse(await fs.readFile(filePath));assert.equal(stored.failures[0].code,'CME_HTTP_403');
        const failedReads=reads;clock+=299000;await load({read,pdfPages});assert.equal(reads,failedReads);
        clock+=1001;fail=false;await load({read,pdfPages});assert.equal(reads,failedReads+1,'Failures retry after five minutes, not one hour');
        stored=JSON.parse(await fs.readFile(filePath));assert.deepEqual(stored.unavailable,[]);
        const fromDisk=createReportDerivativesLoader({filePath,initialSeed:{options:[],futures:[]},now:()=>clock});assert.equal((await fromDisk({refresh:false})).options.length,2);
        for(const malformed of ['null','{"options":{}}','{broken']){await fs.writeFile(filePath,malformed);const recovered=createReportDerivativesLoader({filePath,initialSeed:{options:[],futures:[]},now:()=>clock});assert.equal((await recovered({refresh:false})).options.length,0,'An invalid disk cache never prevents opening a report');}
        clock+=8*86400000;assert.equal((await fromDisk({refresh:false})).options.length,0,'Old observations expire without inventing current dates');
        console.log('CME acquisition: OK · native HTTPS transport, PDF limits, current/historical cutoffs, concurrent cache, persistence, recovery and exact displayed OI.');
    }finally{await fs.rm(folder,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
