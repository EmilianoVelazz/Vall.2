'use strict';
/* global document, window */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
const {buildForecastAnalysis}=require('../backend/ai/forecast-analysis');
const {normalizeBusinessProfile}=require('../backend/lib/business-profile');
async function main() {
    const root=path.resolve(__dirname,'..'),output=path.join(root,'output/analisis-inteligencia-orion');
    fs.mkdirSync(output,{recursive:true});
    const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
    const now=Date.parse('2026-10-15T18:00:00Z');
    const points=Array.from({length:520},(_,i)=>({timestamp:(now-(520-i)*86_400_000)/1000,value:100+i*.4+[0,2,1,-1,3,2,-2,-1][i%8]}));
    const evidence={...empty,available:true,newsAvailable:true,context:'Referencias de prueba fechadas, sin inferencia sobre noticias reales.',citations:[
        {source:'Fuente de prueba',title:'Publicación del periodo',url:'https://example.org/current',date:'2026-10-01',type:'live_news'},
        {source:'Fuente de prueba',title:'Antecedente',url:'https://example.org/background',date:'2025-10-01',type:'live_news'},
        {source:'Fuente de prueba',title:'Publicación sin fecha',url:'https://example.org/undated',type:'google_search_grounding'},
    ]};
    const answer='La lectura depende del siguiente cierre y de los costos. Las referencias conservan su fecha y las limitaciones del periodo consultado.';
    const chat=new AIOrchestrator({provider:{name:'fixture',isConfigured:()=>true,generate:async()=>({text:answer,model:'fixture'}),stream:async()=>({text:answer,model:'fixture'})},liveDataGrounder:async()=>evidence,
        forecastBuilder:plan=>buildForecastAnalysis(plan,{now,get:async()=>({ok:true,json:async()=>({chart:{result:[{timestamp:points.map(point=>point.timestamp),meta:{currency:'USD'},indicators:{quote:[{close:points.map(point=>point.value)}],adjclose:[{adjclose:points.map(point=>point.value)}]}}]}})})}),
        retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
    let profile={email:'fixture@example.invalid',displayName:'Pruebas',preferences:{},trainingOptIn:false};
    const payloads=[],responses=[];
    const app=express();app.use(express.json());
    app.use('/api',async(req,res)=>{
        if(req.path === '/verify-token') return res.json({success:true,email:profile.email,userId:'fixture'});
        if(req.path === '/profile') {
            if(req.method === 'POST') profile={...profile,preferences:{...profile.preferences,businessProfile:normalizeBusinessProfile(req.body.preferences?.businessProfile)}};
            return res.json({success:true,profile});
        }
        if(req.path === '/ai-insight-stream') {
            payloads.push(req.body);
            const result=await chat.stream({...req.body,businessProfile:profile.preferences.businessProfile});
            responses.push(result.response);
            res.type('text/event-stream');
            return res.end(`data: ${JSON.stringify({done:true,finalText:result.text,response:result.response,model:result.model,modelProfile:req.body.modelProfile})}\n\n`);
        }
        return res.json({success:true,data:[],conversations:[],reports:[],articles:[],market:{},global:{}});
    });
    app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
    const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    let browser;
    try {
        browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1360,height:920}});
        const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
        const origin=`http://127.0.0.1:${server.address().port}`;
        await page.goto(origin+'/configuracion?seccion=negocio');
        await page.getByRole('heading',{name:'Perfil comercial de ORION'}).waitFor();
        await page.getByLabel('Res',{exact:true}).check();await page.getByLabel('Cerdo',{exact:true}).check();
        await page.getByLabel('Países o mercados habituales').fill('México, mundial');
        await page.getByLabel('Moneda preferida').selectOption('MXN');
        await page.getByRole('button',{name:'Guardar negocio'}).click();
        await page.getByText('ORION usará estas preferencias en tus próximas consultas.').waitFor();
        assert.deepEqual(profile.preferences.businessProfile.products,['beef','pork']);
        await page.reload();await page.getByRole('heading',{name:'Perfil comercial de ORION'}).waitFor();
        await page.waitForFunction(()=>[...document.querySelectorAll('label')].some(label=>label.textContent.trim()==='Cerdo'&&label.querySelector('input')?.checked));
        assert(await page.getByLabel('Cerdo',{exact:true}).isChecked());
        await page.screenshot({path:path.join(output,'perfil-comercial.png'),fullPage:true});
        await page.setViewportSize({width:390,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1),'El perfil comercial no desborda en móvil');
        await page.screenshot({path:path.join(output,'perfil-comercial-movil.png'),fullPage:true});
        await page.setViewportSize({width:1360,height:920});
        let releaseScript;
        const scriptGate=new Promise(resolve=>{releaseScript=resolve;});
        let gated=false;
        await page.route('**/assets/js/vall-ai-page-v4.js*',async route=>{if(!gated){gated=true;await scriptGate;}await route.continue();});
        await page.goto(origin+'/orion',{waitUntil:'domcontentloaded'});await page.locator('#vaiInput').waitFor();
        assert(await page.locator('#vaiInput').isDisabled(),'El compositor espera a que la lógica del chat esté lista');
        assert(await page.locator('#vaiSend').isDisabled());
        releaseScript();
        await page.locator('#vaiInput:not([disabled])').waitFor();
        async function send(message,expected) {
            await page.locator('#vaiInput').fill(message);await page.locator('#vaiSend').click();
            try { await page.getByText(expected,{exact:false}).first().waitFor({timeout:20000}); }
            catch(error) {
                console.error(JSON.stringify({message,payloads:payloads.length,responses:responses.map(item=>({text:item.text,meta:item.meta})),errors,visible:await page.locator('body').innerText()},null,2));
                await page.screenshot({path:path.join(output,'fallo-chat.png'),fullPage:true});
                throw error;
            }
            await page.locator('#vaiInput:not([disabled])').waitFor();
        }
        await send('Compro 1000 kg de cerdo a 80 MXN/kg, vendo a 110 MXN/kg, merma 8%, flete 5000 MXN. Calcula mi margen.','16.01%');
        await send('Y recalcula con venta a 120 MXN/kg','23.01%');
        assert.equal(payloads[1].conversationMemory.inputs.buyPricePerKg,80);
        assert.equal(payloads[1].conversationMemory.inputs.freight,5000);
        await page.reload();await page.locator('#vaiInput').waitFor();
        await send('Y recalcula con flete 2000 MXN','25.72%');
        assert.equal(payloads[2].conversationMemory.inputs.sellPricePerKg,120);
        await page.screenshot({path:path.join(output,'margen-con-memoria.png'),fullPage:true});
        await send('Pronóstico TSN para 5 sesiones','Pronóstico cuantitativo evaluado');
        await page.getByText('Control adicional de TSN:',{exact:false}).waitFor();
        assert.equal(responses.at(-1).meta.toolExecution.protocolVersion,'2026-07-28');
        assert(responses.at(-1).meta.forecastAnalysis.records[0].evaluation.nonOverlapping.evaluationPoints>=8);
        await page.getByText('Control adicional de TSN:',{exact:false}).scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,'pronostico-evaluado-mcp.png'),fullPage:true});
        await send('Ahora cambia de tema: noticias económicas de México en los últimos tres meses',answer);
        assert.equal(responses.at(-1).meta.forecastAnalysis,undefined,'El cambio de tema no añade el pronóstico anterior a las noticias');
        const decision=page.locator('.vai-decision-brief').last();
        await decision.locator('summary').click();
        await decision.getByText('Cómo puede afectarte',{exact:true}).waitFor();
        assert.match(await decision.innerText(),/Antes de decidir/);
        await decision.scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,'decision-contextual.png'),fullPage:true});
        const sources=page.locator('.vai-answer-sources').last();
        await sources.locator('summary').click();
        await sources.getByText(/Periodo revisado:/).waitFor();
        assert.match(await sources.innerText(),/1 dentro del periodo; 1 antecedentes/);
        assert.match(await sources.innerText(),/1 sin fecha/);
        await sources.locator('.vai-evidence-coverage').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,'fuentes-con-periodo.png'),fullPage:true});
        await page.setViewportSize({width:390,height:844});
        await decision.scrollIntoViewIfNeeded();
        assert(await decision.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'La ficha de decisión se ajusta en móvil');
        await page.screenshot({path:path.join(output,'decision-contextual-movil.png'),fullPage:true});
        await sources.locator('.vai-evidence-coverage').scrollIntoViewIfNeeded();
        assert(await page.evaluate(()=>['.vai-shell','.vai-workspace','.vai-messages','.vai-message.assistant:last-child .vai-bubble','.vai-message.assistant:last-child .vai-answer-content','.vai-message.assistant:last-child .vai-evidence-coverage'].every(selector=>{const el=document.querySelector(selector);const rect=el?.getBoundingClientRect();return rect&&rect.x>=0&&rect.right<=window.innerWidth+1&&el.scrollWidth<=el.clientWidth+1;})),'El contenido interno del chat se ajusta al ancho móvil');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1),'El panel de cobertura no desborda en móvil');
        await page.screenshot({path:path.join(output,'fuentes-con-periodo-movil.png'),fullPage:true});
        assert.deepEqual(errors,[]);
        await context.close();
        const result={generatedAt:new Date().toISOString(),passed:true,turns:payloads.length,scope:'Bundle real e interfaz completa; autenticación, perfil y SSE aislados, calculadora real; sin llamadas externas.'};
        fs.writeFileSync(path.join(output,'navegador-inteligencia.json'),JSON.stringify(result,null,2));
        console.log('ORION UI: perfil, recarga, 3 cálculos con memoria, MCP real, ficha de pronóstico y cobertura de fuentes escritorio/móvil OK');
    } finally {await browser?.close();await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
