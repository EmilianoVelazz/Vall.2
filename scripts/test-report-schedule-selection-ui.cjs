'use strict';
/* global window */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const express=require('express');
const {chromium}=require('playwright');
async function main() {
    const app=express(),email='selection@example.invalid',requests=[],errors=[];
    let schedules=[];
    const base={generatedAt:'2026-10-15T20:00:10Z',summary:'Documento de prueba',sections:[{heading:'Lectura',text:'Contenido sintético de prueba.'}],metrics:[],tables:[],visuals:[]};
    const reports={finance:[{...base,key:'equities',title:'Bolsa'},{...base,key:'fx',title:'Divisas'}],markets:[{...base,key:'grains',title:'Granos'},{...base,key:'proteins',title:'Proteínas'}],mexico:[{...base,key:'mx_proteins',title:'Proteínas México'}]};
    app.use(express.json());
    app.use('/api',(req,res)=>{
        if(req.path==='/verify-token') return res.json({success:true,email});
        if(req.path==='/profile') return res.json({success:true,profile:{email,preferences:{}}});
        if(req.path==='/report-email/status') return res.json({success:true,accountEmail:email,mail:{configured:true,environment:'local',automaticEnabled:true,scheduler:{mode:'local',active:true,lastCheckedAt:'2026-10-15T23:23:00Z'}}});
        for(const area of Object.keys(reports)) if(req.path===`/${area==='finance'?'finance':area==='markets'?'market':'mexico'}-executive-reports`) return res.json({success:true,data:reports[area]});
        if(req.path==='/report-email-schedules' && req.method==='GET') return res.json({success:true,accountEmail:email,data:schedules});
        if(req.path==='/report-email-schedules/batch' && req.method==='POST') {
            requests.push(req.body);
            schedules=req.body.reports.map(row=>({...row,id:row.area+':'+row.reportKey,delivery:{...req.body.delivery,timeZone:'America/Mexico_City'},recipientEmail:email,nextRunAt:'2026-10-16T23:23:00Z'}));
            return res.json({success:true,accountEmail:email,schedules});
        }
        return res.json({success:true,data:[]});
    });
    app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
    const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
    let browser;
    try {
        browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
        page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}/informes`);await page.getByRole('button',{name:'Lectura',exact:true}).click();await page.locator('.erh-document').waitFor();
        await page.locator('.erh-program-button').click();const dialog=page.locator('.erh-send-dialog');
        await dialog.getByText('Programador activo',{exact:false}).waitFor();
        assert(await dialog.getByLabel('Bolsa',{exact:true}).isChecked());
        await dialog.getByLabel('Envíos automáticos',{exact:true}).check();
        assert.equal(await dialog.getByLabel('Personalizar cada envío con IA',{exact:true}).isChecked(),false);
        await dialog.getByLabel('Hora · Ciudad de México',{exact:true}).fill('17:23');
        await dialog.getByLabel('Categoría de informes',{exact:true}).selectOption('markets');
        await dialog.getByLabel('Granos',{exact:true}).check();
        await dialog.getByLabel('Categoría de informes',{exact:true}).selectOption('mexico');
        await dialog.getByLabel('Proteínas México',{exact:true}).check();
        await dialog.getByText('Informes seleccionados: 3',{exact:true}).waitFor();
        await dialog.getByRole('button',{name:'Guardar entrega automática',exact:true}).click();
        await dialog.locator('.erh-send-feedback').filter({hasText:'Entrega activada'}).waitFor();
        assert.equal(requests.length,1);assert.equal(requests[0].expectedOwner,email);assert.equal(requests[0].delivery.time,'17:23');
        assert.deepEqual(requests[0].reports.map(row=>row.area),['finance','markets','mexico']);assert(requests[0].reports.every(row=>row.ai.enabled===false));
        assert.equal(await dialog.locator('.erh-send-document strong').innerText(),'Bolsa','Elegir entregas no cambia el informe abierto');
        await dialog.getByLabel('Hora · Ciudad de México',{exact:true}).fill('17:41');
        schedules=schedules.map((row,index)=>index===0?{...row,lastSentAt:'2026-10-15T23:23:45Z',preferences:{...row.preferences,_lastDelivery:{scheduledFor:'2026-10-15T23:23:00Z',acceptedAt:'2026-10-15T23:23:45Z'}}}:row);
        await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
        await dialog.getByText('Aceptado por el servidor de correo:',{exact:false}).waitFor();
        assert.equal(await dialog.getByLabel('Hora · Ciudad de México',{exact:true}).inputValue(),'17:41','La actualización de estados no borra una hora en edición');
        assert.match(await dialog.locator('.erh-send-schedules').innerText(),/17:23:45|5:23:45/);
        await page.setViewportSize({width:390,height:844});
        assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'El selector de categorías no desborda en móvil');
        const output=path.resolve('output/programar-reportes');await fs.mkdir(output,{recursive:true});
        await page.screenshot({path:path.join(output,'seleccion-categorias-movil.png'),animations:'disabled'});
        assert.deepEqual(errors,[]);
        console.log('Report selection UI: tres categorías, minutos, IA opcional, guardado conjunto, estados actualizados sin perder cambios y móvil OK; sin correos reales');
        await context.close();
    } finally {await browser?.close();await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
