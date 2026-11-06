'use strict';
/* global document, window */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const jwt=require('jsonwebtoken');
const {chromium}=require('playwright');
process.env.JWT_SECRET='mexico-report-ui-secret';delete process.env.USER_PASSWORD;
const {input,time}=require('./lib/mexico-report-fixture.cjs');
const {buildMexicoReports}=require('../backend/services/mexico-executive-reports');
const {createMexicoReportsRouter}=require('../backend/routes/mexico-reports');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const scheduleStore=require('../backend/services/report-email-schedule-store');
const schedules=[],pdfExports=[];
scheduleStore.due=async()=>[];scheduleStore.list=async()=>schedules;
scheduleStore.upsert=async options=>{const schedule={...options,id:'fixture',active:true,nextRunAt:'2026-10-13T14:00:00.000Z'};schedules.push(schedule);return schedule;};
scheduleStore.remove=async()=>{schedules.length=0;};
const exportRouter=require('../backend/routes/export');

async function main() {
    const root=path.resolve(__dirname,'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-mexico-ui-')),output=path.join(root,'output/informes-mexico');
    const store=createUserReportStore({directory}),email='fixture@example.invalid',reports=buildMexicoReports(input,time);
    let server,browser,page;
    await fs.mkdir(output,{recursive:true});
    try {
        const agent=new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>({model:'fixture',text:JSON.stringify({title:'Mi informe de México',summary:'Resumen de abastecimiento nacional para compras.',sections:[{heading:'Decisiones por estado',text:'Confirmar presentación, plaza, fecha y condiciones antes de comprar proteínas.'}],dataSelection:{metrics:[0,1,2,3],tables:[0,1,2,3],visuals:[]},preferences:{audience:'purchasing',depth:'standard',decisionHorizon:'current',customTitle:'Mi informe de México',confidentiality:'internal',sections:{indicators:true,charts:false,tables:true,risks:true,sources:true}},tone:'professional'})})}});
        const app=express();app.use(express.json({limit:'512kb'}));
        app.use('/api',createMexicoReportsRouter({service:{get:async()=>({reports,generatedAt:time.toISOString(),persistence:'fixture'})}}));
        app.use('/api',createUserReportsRouter({store,agent,learning:{load:async()=>({status:'empty',historyEnabled:true,interests:[]})}}));
        app.use('/api',(req,res,next)=>{
            if(req.path==='/report-export') {pdfExports.push(req.body);return next();}
            if(req.path==='/report-email') throw Error('No enviar correos en pruebas');
            if(req.path.startsWith('/report-email-schedules')) return next();
            if(req.path==='/verify-token') return res.json({success:true,email,userId:'fixture'});
            if(req.path==='/profile') return res.json({success:true,profile:{email,preferences:{}}});
            if(req.path.includes('executive-reports')) return res.json({success:true,data:[{key:'base',title:'Informe de prueba',summary:'Resumen',sections:[{heading:'Lectura',text:'Datos base'}]}]});
            return res.json({success:true,data:[],articles:[]});
        });
        app.use('/api',exportRouter);app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
        server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
        browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
        await page.setExtraHTTPHeaders({Authorization:'Bearer '+jwt.sign({sub:'fixture',email},process.env.JWT_SECRET)});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/informes`);
        await page.getByRole('tab',{name:/México/}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.erh-book').length===4);
        for(const report of reports) {
            await page.locator('.erh-book').filter({hasText:report.title}).click();
            assert.equal(await page.locator('.erh-market-visual-grid>figure').count(),report.visuals.length,'Todas las gráficas visibles en '+report.key);
            assert.deepEqual(await page.locator('.erh-document table').evaluateAll(tables=>tables.map(table=>table.querySelectorAll('tbody tr').length)),report.tables.map(table=>table.rows.length),'Tablas y filas completas en '+report.key);
        }
        await page.locator('.erh-book').filter({hasText:'Proteínas en México por estado'}).click();
        assert.equal(await page.locator('.erh-document table').count(),6);
        assert.deepEqual(await page.locator('.erh-document .erh-block-heading h3').allTextContents(),['Lectura del periodo','Indicadores del corte','Precios por entidad y etapa','Detalle de referencias','Análisis para el destinatario','Conclusiones']);
        assert.equal(await page.locator('.erh-market-conclusions>section').first().locator('li').count(),5,'Las conclusiones conservan las cinco señales del corte');
        assert.deepEqual(await page.locator('.erh-document table').evaluateAll(tables=>tables.map(table=>table.querySelectorAll('tbody tr').length)),[32,32,32,32,4,6]);
        assert.match(await page.locator('.erh-document').innerText(),/Cobertura de referencias estatales por proteína/);
        assert.match(await page.locator('.erh-document').innerText(),/MXN\/kg canal/);
        assert.equal(await page.locator('.erh-secondary-actions').count(),0,'Sin el bloque También puedes en la vista previa');
        assert.equal(await page.getByRole('button',{name:'Exportar datos CSV',exact:true}).count(),0);
        assert.equal(await page.getByRole('button',{name:'Escuchar con ORION',exact:true}).count(),0);
        await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('PDF listo para descargar'));
        assert.equal(pdfExports[0].executiveReport.collection,'mexico');assert(pdfExports[0].executiveReport.tables.slice(0,4).every(table=>table.rows.length===32));
        await page.getByRole('button',{name:'Programar reportes',exact:true}).click();
        await page.getByLabel('Envíos automáticos',{exact:true}).check();
        await page.getByRole('button',{name:'Guardar entrega automática',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('Entrega activada'));
        assert.equal(schedules[0].area,'mexico');assert.equal(schedules[0].reportKey,'mx_proteins');
        assert.equal(schedules[0].preferences.aiCustomization.enabled,true,'La programación usa IA');
        await page.getByRole('button',{name:'Volver a informes',exact:true}).click();
        await page.getByRole('button',{name:'Nuevo informe',exact:true}).click();
        await page.getByRole('button',{name:'Crear con esta base',exact:true}).click();
        const mexicoRequest='Titúlalo Mi informe de México. Adáptalo a compras estatales, conservando la evidencia y las tablas. Omite las gráficas.';
        await page.getByLabel('¿Cómo quieres este informe?',{exact:true}).fill(mexicoRequest);
        await page.getByRole('button',{name:'Generar con IA',exact:true}).click();
        await page.locator('.erh-document').getByText('Confirmar presentación, plaza, fecha y condiciones antes de comprar proteínas.',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Programar reportes',exact:true}).click();
        await page.getByRole('button',{name:'Guardar entrega automática',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('Entrega activada'));
        assert.equal(schedules.at(-1).preferences.customTitle,'Mi informe de México');assert.equal(schedules.at(-1).preferences.audience,'purchasing');
        assert.equal(schedules.at(-1).preferences.aiCustomization.instructions,mexicoRequest,'La entrega conserva el pedido de la edición');
        await page.getByRole('button',{name:'Volver a informes',exact:true}).click();
        await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.locator('.erh-content-editor').waitFor({state:'detached'});
        assert.equal((await store.list(email))[0].title,'Mi informe de México');
        await page.reload();await page.getByRole('tab',{name:/Mis informes/}).click();
        await page.locator('.erh-document').getByText('Confirmar presentación, plaza, fecha y condiciones antes de comprar proteínas.',{exact:true}).waitFor();
        assert.equal(await page.locator('.erh-document table tbody tr').count(),128);
        await page.getByRole('tab',{name:/México/}).click();await page.locator('.erh-book').filter({hasText:'Producción estatal'}).click();
        await page.locator('.erh-document').getByText(/series históricas/).waitFor();
        await page.locator('.erh-switch').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'mexico-reportes-escritorio.png')});
        for(const width of [360,390,768]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sin desbordamiento con cuatro colecciones a '+width+'px');}
        await page.setViewportSize({width:390,height:844});await page.locator('.erh-switch').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'mexico-reportes-movil.png')});
        await page.locator('.erh-book').filter({hasText:'Panorama nacional'}).click();
        if(await page.getByRole('button',{name:'Ocultar edición',exact:true}).isVisible()) await page.getByRole('button',{name:'Ocultar edición',exact:true}).click();
        await page.setViewportSize({width:1440,height:1000});await page.locator('.erh-document-header').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,'lectura-ejecutiva-escritorio.png')});
        await page.getByRole('button',{name:'Ver PDF',exact:true}).click();
        await page.locator('.erh-pdf-page-text').filter({hasText:/Resumen ejecutivo/i}).waitFor();
        const canvas=page.locator('.erh-pdf-viewport canvas');await canvas.screenshot({path:path.join(output,'lectura-ejecutiva-pdf.png')});
        await page.getByRole('button',{name:'Lectura',exact:true}).click();
        for(const width of [360,390,768]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'La lectura ejecutiva no desborda a '+width+'px');assert((await page.locator('.erh-library-entry').first().boundingBox()).width>=215,'Las fichas no se comprimen a '+width+'px');}
        await page.setViewportSize({width:390,height:844});await page.locator('.erh-document-header').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,'lectura-ejecutiva-movil.png')});
        await page.locator('#erh-document-summary').screenshot({path:path.join(output,'resumen-ejecutivo-movil.png')});
        assert.deepEqual(errors,[]);
        console.log('México report UI: OK · colección, cuatro informes, estados, CSV, PDF, programación sin envío, IA, guardado, recarga y móvil');
    } catch(error) {if(page) {await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error.png')});}throw error;}
    finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
