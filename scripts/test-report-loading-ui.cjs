'use strict';
/* global document */
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const PDFDocument = require('pdfkit');

async function main() {
    const app = express(), root = path.resolve(__dirname, '..');
    const make = (id, title) => ({key:'edition_'+id,editionId:id,editionVersion:1,userEdition:true,title,summary:'Resumen completo',generatedAt:'2026-10-09T12:00:00Z',personalization:{},sections:Array.from({length:20},(_,i)=>({heading:'Apartado '+i,text:'Contenido íntegro '+i+' '+('Evidencia disponible. '.repeat(80))})),metrics:[],visuals:[],tables:[],sources:[],sourceLinks:[],watchlist:[]});
    const reports = [make('first','Edición completa'),make('second','Segunda edición')];
    const baseReport = {key:'overview',title:'Informe base',summary:'Resumen base',sections:[{heading:'Lectura base',text:'Contenido del informe base'}]};
    let marketRequests = 0, openFails = true, saves = 0, libraryFails = false, pdfHangs = true, saveHangs = false;
    let coldStart=false;
    const delayedLibraries=[];
    const pdf=await new Promise(resolve=>{const doc=new PDFDocument(),chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.text('Primera pagina completa');doc.addPage();doc.text('Ultima pagina completa');doc.end();});
    app.use(express.json({limit:'512kb'}));
    app.use('/api',(req,res)=>{
        if(req.path==='/verify-token') return res.json({success:true,email:'loading@example.invalid',userId:'fixture'});
        if(req.path==='/profile') return coldStart ? res.status(503).json({success:false}) : res.json({success:true,profile:{email:'loading@example.invalid',preferences:{}}});
        if(req.path==='/finance-executive-reports') {if(coldStart) {delayedLibraries.push(res);return;}return res.json({success:true,data:[baseReport,{key:'legacy',title:'Edición anterior',content:'## Antecedentes\nTexto heredado completo\n\n## Cierre anterior\nÚltimo párrafo heredado'}]});}
        if(req.path==='/market-executive-reports') {marketRequests++;return;}
        if(req.path==='/user-reports' && req.method==='GET') return libraryFails ? res.status(503).json({success:false,error:'Biblioteca temporalmente no disponible'}) : res.json({success:true,data:reports.map(({key,editionId,title})=>({key,editionId,title,userEdition:true}))});
        if(req.path==='/user-reports' && req.method==='POST') {
            if(saveHangs) return;saves++;
            const id=req.body.creationId || req.body.id || 'new-'+saves,saved={...req.body.report,editionId:id,key:'edition_'+id,editionVersion:2};
            const index=reports.findIndex(report=>report.editionId===id);
            if(index>=0) reports[index]=saved;else reports.push(saved);
            return res.json({success:true,data:saved,storage:'persistent_disk'});
        }
        if(req.path==='/user-reports/first') return res.json({success:true,data:reports[0]});
        if(req.path==='/user-reports/second') return openFails ? res.status(503).json({success:false,error:'No se pudo recuperar la edición'}) : res.json({success:true,data:reports[1]});
        if(req.method==='GET' && req.path.startsWith('/user-reports/')) return res.json({success:true,data:reports.find(report=>report.editionId===req.path.split('/').at(-1))});
        if(req.path==='/report-export') return pdfHangs ? undefined : res.type('application/pdf').send(pdf);
        if(req.path==='/user-reports/generate') return;
        if(req.path==='/report-email') throw Error('No enviar correos en pruebas');
        return res.json({success:true,data:[],articles:[]});
    });
    app.use(express.static(path.join(root,'dist')));
    app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
    const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    let browser;
    try {
        browser=await chromium.launch({headless:true});
        // La preparación inicial puede superar los 20 s aunque la sesión sea
        // válida y falle el perfil. Eso no significa una biblioteca vacía.
        coldStart=true;
        const coldPage=await browser.newPage();await coldPage.route('https://**/*',route=>route.abort());await coldPage.clock.install();
        await coldPage.goto(`http://127.0.0.1:${server.address().port}/informes`);
        await coldPage.waitForFunction(()=>document.querySelector('.erh-books')?.getAttribute('aria-busy')==='true');
        await coldPage.clock.fastForward(25000);
        assert.equal(await coldPage.locator('.erh-books').getAttribute('aria-busy'),'true','El arranque en frío no vence a los 20 segundos');
        assert.equal(await coldPage.getByRole('heading',{name:'No hay informes disponibles',exact:true}).count(),0);
        coldStart=false;
        for(const response of delayedLibraries) if(!response.destroyed) response.json({success:true,data:[baseReport]});
        await coldPage.locator('.erh-book').filter({hasText:'Informe base'}).waitFor();await coldPage.locator('.erh-document').getByText('Contenido del informe base',{exact:true}).waitFor();await coldPage.close();
        const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
        const startCreation=async()=>{await page.getByRole('button',{name:'Nuevo informe',exact:true}).click();await page.getByRole('dialog',{name:'Elige tu reporte base'}).getByRole('button',{name:'Finanzas',exact:true}).click();await page.getByRole('button',{name:'Crear con esta base',exact:true}).click();await page.getByRole('heading',{name:'Crear informe',exact:true}).waitFor();};
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/informes`);
        await page.locator('.erh-book').filter({hasText:'Informe base'}).waitFor();
        await page.getByRole('tab',{name:/Mercados/}).click();
        await page.waitForFunction(()=>document.querySelector('.erh-books')?.getAttribute('aria-busy')==='true');
        assert.equal(marketRequests,1);
        await page.getByRole('tab',{name:/Finanzas/}).click();
        assert.equal(await page.locator('.erh-books').getAttribute('aria-busy'),'false','Volver a una colección cargada no conserva el spinner de otra');
        await page.locator('.erh-book').filter({hasText:'Edición anterior'}).click();
        await page.locator('.erh-document').getByText(/Último párrafo heredado/).waitFor();
        await page.getByRole('tab',{name:/Mis informes/}).click();
        await page.locator('.erh-document').getByText(/^Contenido íntegro 19 /).waitFor();
        assert.equal(await page.locator('.erh-reader-chapter').count(),20,'Se carga el documento completo, no sólo su ficha');
        await page.locator('.erh-book').filter({hasText:'Segunda edición'}).click();
        await page.getByRole('alert').filter({hasText:'No se pudo recuperar la edición'}).waitFor();
        assert.equal(await page.locator('.erh-document').count(),0,'No presenta la edición anterior como si fuera la seleccionada');
        openFails=false;
        await page.getByRole('button',{name:'Reintentar apertura',exact:true}).click();
        await page.locator('.erh-document h2').filter({hasText:'Segunda edición'}).waitFor();
        assert.equal(await page.locator('.erh-edition').count(),0);assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);await startCreation();
        libraryFails=true;
        await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();
        await page.locator('.erh-creation-composer').waitFor({state:'detached'});
        await page.locator('.erh-document').getByText('Contenido del informe base',{exact:true}).waitFor();
        assert.equal(saves,1);
        assert.equal(await page.locator('.erh-books').getAttribute('aria-busy'),'false','Guardar deja el informe disponible aunque otra consulta falle');
        await page.clock.install();
        saveHangs=true;
        await startCreation();
        await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();
        await page.clock.fastForward(31000);
        await page.locator('.erh-creation-composer').getByText(/El guardado tardó demasiado/).waitFor();
        assert.match(await page.locator('.erh-document').innerText(),/Contenido del informe base/,'Un guardado atascado conserva el borrador');
        assert.equal(await page.getByRole('button',{name:'Reintentar guardado',exact:true}).isEnabled(),true);
        await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();
        const stalledPdf=page.waitForRequest(request=>request.url().endsWith('/api/report-export'));
        await page.getByRole('button',{name:'Ver PDF',exact:true}).click();
        await stalledPdf;
        await page.clock.fastForward(46000);
        await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('La exportación tardó demasiado'));
        assert.equal(await page.getByRole('button',{name:'Ver PDF',exact:true}).isEnabled(),true);
        pdfHangs=false;
        await page.getByRole('button',{name:'Ver PDF',exact:true}).click();
        await page.locator('.erh-pdf-page-text').getByText('Primera pagina completa',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Página siguiente del PDF',exact:true}).click();
        await page.locator('.erh-pdf-page-text').getByText('Ultima pagina completa',{exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Página siguiente del PDF',exact:true}).isDisabled(),true);
        await page.getByRole('button',{name:'Lectura',exact:true}).click();
        await startCreation();await page.getByLabel('¿Cómo quieres este informe?',{exact:true}).fill('Conserva toda la evidencia del corte.');
        await page.getByRole('button',{name:'Generar con IA',exact:true}).click();
        await page.getByRole('button',{name:'Cancelar generación',exact:true}).click();
        await page.getByRole('button',{name:'Generar con IA',exact:true}).waitFor();
        assert.match(await page.locator('.erh-document').innerText(),/Contenido del informe base/,'Cancelar una IA colgada conserva el borrador');
        await page.getByRole('button',{name:'Generar con IA',exact:true}).click();
        await page.clock.fastForward(101000);
        await page.getByRole('alert').filter({hasText:'La generación tardó demasiado'}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Generar con IA',exact:true}).isEnabled(),true);
        await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();
        await page.getByRole('tab',{name:/Mercados/}).click();
        await page.clock.fastForward(61000);
        await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('La biblioteca tardó demasiado'));
        await page.getByRole('heading',{name:'No pudimos cargar la biblioteca',exact:true}).waitFor();
        assert.equal(await page.locator('.erh-books').getAttribute('aria-busy'),'false');
        await page.reload();saveHangs=false;
        await startCreation();
        await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();
        await page.locator('.erh-creation-composer').waitFor({state:'detached'});
        await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).waitFor();
        assert.match(await page.locator('.erh-document').innerText(),/Contenido del informe base/,'Una biblioteca incompleta no oculta el documento recién guardado');
        libraryFails=false;
        await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();
        await page.waitForFunction(count=>document.querySelectorAll('.erh-book').length===count,reports.length);
        assert.equal(await page.locator('.erh-book').count(),reports.length,'Recupera también los informes que aún no se habían cargado');
        assert.equal(await page.locator('.erh-edition').count(),0);assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);
        assert.deepEqual(errors,[]);
        console.log('Report loading UI: OK · cambio durante carga, contenido anterior, 20 secciones, apertura automática, error y reintento, guardado, plazos de biblioteca/PDF/IA, última página de PDF y cancelación');
    } finally {
        if(browser) await browser.close();
        server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
