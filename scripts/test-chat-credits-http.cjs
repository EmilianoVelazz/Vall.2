'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const {start}=require('./lib/security-fixture.cjs');
const {chatCreditStore}=require('../backend/services/chat-credit-store');
const {chatMeter}=require('../backend/lib/chat-credit-context');
const {orchestrator}=require('../backend/ai/orchestrator');
const {userReportAgent}=require('../backend/ai/user-report-agent');
const {reportLearning}=require('../backend/services/report-learning');
const profiles=require('../backend/services/user-profile-store');
const findProfile=profiles.findById;
profiles.findById=async id=>id==='fixture-admin'?{id,email:'admin@vall.com',role:'admin',active:true,credentialVersion:0}:findProfile(id);
(async()=>{
    const fixture=await start();let modelCalls=0,ledgerCalls=0;
    const headers={Authorization:fixture.authorization(),'Content-Type':'application/json',Origin:'https://app.example.test'};
    try{
        assert.equal((await fetch(fixture.url+'/api/chat-usage')).status,401);
        for(const operation of ['state','reserve','settle'])chatCreditStore[operation]=async()=>{ledgerCalls++;throw Error('El chat no debe acceder a créditos');};
        const original=orchestrator.generateStructured;
        orchestrator.generateStructured=async input=>{assert.equal(chatMeter(),undefined);modelCalls++;return original(input);};
        orchestrator.stream=async input=>{assert.equal(chatMeter(),undefined);modelCalls++;const result=await original(input);input.onText?.(result.text,result.text);return result;};
        const admin=`Bearer ${jwt.sign({sub:'fixture-admin',email:'admin@vall.com',role:'admin'},process.env.JWT_SECRET,{expiresIn:'5m'})}`;
        for(const authorization of [headers.Authorization,admin]){
            const accountHeaders={...headers,Authorization:authorization};
            const status=await fetch(fixture.url+'/api/chat-usage',{headers:accountHeaders});assert.equal(status.status,200);
            const {usage}=await status.json();assert.equal(usage.enabled,false);assert.equal(usage.exempt,true);assert.equal(usage.blocked,false);assert.deepEqual(usage.windows,[]);assert.equal(usage.realtimeVoice,true);
            for(const route of ['/chat','/ai-rich','/ai-insight','/ai-insight-stream']){
                const response=await fetch(fixture.url+'/api'+route,{method:'POST',headers:accountHeaders,body:JSON.stringify({message:'Explica un bono',structured:true})});
                const body=await response.text();assert.equal(response.status,200,route);assert(!body.includes('CHAT_CREDITS_'));
            }
        }
        assert.equal(modelCalls,8);
        // La exención general conserva el orquestador para cuentas normales,
        // incluso si solicitan el formato heredado con instrucciones propias.
        let response=await fetch(fixture.url+'/api/ai-insight-stream',{method:'POST',headers,body:JSON.stringify({prompt:'Explica un bono',systemPrompt:'Prueba de compatibilidad',structured:false})});
        assert.equal(response.status,200);assert.match(await response.text(),/"done":true/);assert.equal(modelCalls,9);
        for(const route of ['/chat','/ai-rich','/ai-insight','/ai-insight-stream']){
            response=await fetch(fixture.url+'/api'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{malformed'});
            assert.equal(response.status,401,route);await response.text();
        }
        assert.equal(modelCalls,9,'Las solicitudes sin sesión no llegan al modelo');
        response=await fetch(fixture.url+'/api/ai-live-token',{method:'POST',headers,body:'{}'});
        assert.equal(response.status,503,'La voz sólo depende de su configuración: el proveedor está desactivado en este fixture');await response.text();
        // Los informes siguen separados del antiguo registro de créditos.
        userReportAgent.generate=async()=>{assert.equal(chatMeter(),undefined);return {title:'Informe de prueba'};};
        reportLearning.load=async()=>({});
        response=await fetch(fixture.url+'/api/user-reports/generate',{method:'POST',headers,body:JSON.stringify({accountEmail:'fixture-user@example.invalid',prompt:'Informe'})});
        assert.equal(response.status,200);await response.text();
        let limited=false;
        for(let index=0;index<35;index++){
            response=await fetch(fixture.url+'/api/chat',{method:'POST',headers,body:JSON.stringify({message:'Explica un bono'})});await response.text();
            if(response.status===429){assert(Number(response.headers.get('retry-after'))>0);limited=true;break;}
            assert.equal(response.status,200);
        }
        assert(limited,'Se conserva la protección por frecuencia de solicitudes');
        response=await fetch(fixture.url+'/api/chat',{method:'POST',headers:{...headers,Authorization:admin},body:JSON.stringify({message:'Explica un bono'})});assert.equal(response.status,200);await response.text();
        assert.equal(ledgerCalls,0,'Ni usuarios ni administrador consultan, reservan o descuentan créditos');
        console.log('Unlimited chat HTTP: all accounts, four chat routes, zero ledger calls, storage outage independence, authentication, reports, voice configuration and per-account rate protection passed.');
    }finally{await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
