'use strict';
/* global document, window */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
const {fixtureEvidence}=require('./test-puebla-price-coverage.cjs');
const {fixtureGeneralEvidence}=require('./test-protein-general.cjs');
const {fixtureCommercialEvidence}=require('./test-local-commercial-prices.cjs');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
async function main() {
    const general=process.argv.includes('--general');
    const commercial=process.argv.includes('--commercial'),live=commercial && process.argv.includes('--live');
    const root=path.resolve(__dirname,'..'),output=path.join(root,commercial ? 'output/proveedores-publicos' : general ? 'output/revision-proteinas-general' : 'output/diagnostico-proteinas-puebla');fs.mkdirSync(output,{recursive:true});
    const evidence=live ? JSON.parse(fs.readFileSync(path.join(output,'ambas-etapas-real.json'),'utf8')) : await (commercial ? fixtureCommercialEvidence() : general ? fixtureGeneralEvidence() : fixtureEvidence());
    const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
    const chat=new AIOrchestrator({provider:{name:'fixture',isConfigured:()=>true,generate:async()=>({text:'No tengo datos.',model:'fixture'}),stream:async()=>({text:'No tengo datos.',model:'fixture'})},liveDataGrounder:async()=>evidence,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
    const app=express();app.use(express.json());
    app.use('/api',async(req,res)=>{
        if(req.path === '/verify-token') return res.json({success:true,email:'fixture@example.invalid',userId:'fixture'});
        if(req.path === '/ai-insight-stream') {
            const result=await chat.stream(req.body);res.type('text/event-stream');
            return res.end(`data: ${JSON.stringify({done:true,finalText:result.text,response:result.response,model:result.model,modelProfile:req.body.modelProfile})}\n\n`);
        }
        return res.json({success:true,data:[],conversations:[],reports:[],articles:[],market:{},global:{}});
    });
    app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
    const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    let browser;
    try {
        browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1360,height:950}});
        const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/orion`);await page.locator('#vaiInput').waitFor();
        await page.locator('#vaiInput').fill(commercial ? 'Precio de cerdo pollo huevo y res en Puebla México, mayoreo y venta al público' : general ? 'Precio de res cerdo pollo y huevo por estado de México según SNIIM' : 'Precio del cerdo, pollo, huevo y res en Puebla México');await page.locator('#vaiSend').click();
        try { await page.getByText(commercial ? 'Los cortes de pollo y res se identifican' : 'Por qué faltan algunos precios:',{exact:false}).first().waitFor({timeout:20000}); }
        catch(error) { fs.writeFileSync(path.join(output,'error-ui.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error-ui.png'),fullPage:true});throw error; }
        const table=page.locator('.vai-bubble table.vai-data-table').last();
        const rows=commercial ? live ? await table.locator('tbody tr').count() : 7 : general ? 128 : 4;
        if(live) assert(rows>=8,'Se muestran observaciones públicas reales de ambas etapas');
        assert.equal(await table.locator('tbody tr').count(),rows);
        assert.equal(await table.locator('a').count(),rows,'Fuentes de cada fila como enlaces reales');
        for(const link of await table.locator('a').all()) {
            assert.match(await link.getAttribute('href'),/^https:\/\/(?:www\.)?(?:economia-sniim\.gob\.mx|porcicultura\.com|dspc\.mx|qqp\.profeco\.gob\.mx)\//);
            assert.equal(await link.getAttribute('target'),'_blank');
            assert.match(await link.getAttribute('rel'),/noopener/);
        }
        assert.doesNotMatch(await table.innerText(),/https:\/\//,'Los enlaces largos no ocupan las celdas');
        if(commercial) {
            assert.equal(await table.locator('th').count(),6);assert.equal(await table.locator('th').nth(1).innerText(),'ETAPA');
            assert.match(await table.innerText(),/Mayoreo · proveedor/);assert.match(await table.innerText(),/Venta al público/);
            assert.match(await table.innerText(),/desde 15 kg/);assert.match(await table.innerText(),/catálogo/);assert.match(await table.innerText(),/levantamiento/);
            assert.match(await table.innerText(),/paquete de 12 huevos/);assert.match(await table.innerText(),/169\.90/);
        } else if (general) {
            assert.match(await table.innerText(),/113\.00/);assert.match(await table.innerText(),/Quintana Roo/);
            assert.equal((await table.innerText()).match(/No disponible/g).length,63);
        } else {
            assert.match(await table.innerText(),/38\.00/);assert.match(await table.innerText(),/27\.00/);
            assert.doesNotMatch(await table.innerText(),/58\.70|100\.00|110\.00/);
        }
        await table.scrollIntoViewIfNeeded();await table.screenshot({path:path.join(output,'tabla-corregida.png')});
        await page.screenshot({path:path.join(output,'tabla-escritorio-visible.png')});
        await page.setViewportSize({width:390,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1),'Sin desbordar la página móvil');
        assert(await table.evaluate(node=>node.parentElement.scrollWidth > node.parentElement.clientWidth),'La tabla se desplaza horizontalmente en móvil');
        assert(await table.locator('th').first().evaluate(node=>window.getComputedStyle(node).wordBreak === 'normal'),'No cortar palabras por letra');
        await page.screenshot({path:path.join(output,'tabla-movil.png'),fullPage:true});
        assert.deepEqual(errors,[]);
        fs.writeFileSync(path.join(output,'navegador.json'),JSON.stringify({passed:true,rows,links:rows,scope:`Bundle, renderer estructurado y orquestador reales; ${live ? 'evidencia pública de la lectura guardada' : 'fuentes simuladas'}; sesión y modelo simulados. Móvil y escritorio.`},null,2));
        console.log(`Tabla ${commercial ? 'de ambas etapas' : general ? 'de 32 entidades' : 'de Puebla'}: ${rows} fuentes pulsables, sin URLs largas, datos parciales explícitos y móvil OK`);
        await context.close();
    } finally {await browser?.close();await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
