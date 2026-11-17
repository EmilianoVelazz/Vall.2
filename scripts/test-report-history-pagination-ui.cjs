'use strict';
/* global document */
process.env.NODE_ENV='test';process.env.JWT_SECRET='history-pagination-isolated-fixture-at-least-32-bytes';
process.env.USER_PASSWORD='';process.env.VALL_AUTH_PASSWORD='';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),express=require('express'),{chromium}=require('playwright');
const {createReportHistoryStore}=require('../backend/services/report-history-store');
const {createReportHistoryRouter}=require('../backend/routes/report-history');
async function main(){
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-history-pagination-ui-'));let server,browser;
    try{
        const store=createReportHistoryStore({directory,mode:'disk'}),owner='pagination@example.invalid';
        const reports=Array.from({length:105},(_,index)=>({key:'proteins',title:'Proteins fixture '+index,generatedAt:new Date(Date.UTC(2026,10,1)+index*3600000).toISOString(),summary:'Published fixture '+index}));
        await store.archive(reports,'markets');
        const app=express(),authenticate=(req,res,next)=>{req.user={email:owner};next();};
        app.use('/api',createReportHistoryRouter({store,authenticate}));
        app.use('/api',(req,res)=>{
            if(req.path==='/verify-token')return res.json({success:true,email:owner});
            if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
            res.json({success:true,data:[],articles:[]});
        });
        const root=path.resolve(__dirname,'..');app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
        server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
        browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
        await page.goto('http://127.0.0.1:'+server.address().port+'/informes?seccion=historial');
        const archive=page.locator('section.reports-archive').filter({has:page.getByRole('heading',{name:'Historial diario',exact:true})});
        await page.waitForFunction(()=>document.querySelectorAll('section.reports-archive > .reports-archive-books > button').length===100);
        const more=archive.locator(':scope > button').filter({hasText:'Cargar más cortes'});await more.click();
        await page.waitForFunction(()=>document.querySelectorAll('section.reports-archive > .reports-archive-books > button').length===105);
        assert.equal(await more.count(),0);
        const cards=await archive.locator(':scope > .reports-archive-books > button').allTextContents();assert.equal(new Set(cards).size,105);
        await archive.getByLabel('Fecha del corte').fill('2026-10-31');
        await page.waitForFunction(()=>document.querySelectorAll('section.reports-archive > .reports-archive-books > button').length===6);
        assert.equal(await more.count(),0);
        await archive.getByLabel('Fecha del corte').fill('');
        await page.waitForFunction(()=>document.querySelectorAll('section.reports-archive > .reports-archive-books > button').length===100);
        await more.click();await page.waitForFunction(()=>document.querySelectorAll('section.reports-archive > .reports-archive-books > button').length===105);
        assert.deepEqual(errors,[]);
        console.log('PASS browser history: 100 + 5 editions, no duplicates, exhausted cursor hidden, filters reset pagination and all editions remain reachable');
    }finally{
        if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
        const target=path.resolve(directory),relative=path.relative(path.resolve(os.tmpdir()),target);assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('vall-history-pagination-ui-'));await fs.rm(target,{recursive:true,force:true});
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
