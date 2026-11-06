'use strict';
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const {start}=require('./lib/security-fixture.cjs');
const {chatCreditStore}=require('../backend/services/chat-credit-store');
const {chatMeter}=require('../backend/lib/chat-credit-context');
const {orchestrator}=require('../backend/ai/orchestrator');
const {userReportAgent}=require('../backend/ai/user-report-agent');
const {reportLearning}=require('../backend/services/report-learning');
const baseline=chatCreditStore.state;
(async()=>{
    const fixture=await start();let modelCalls=0,reads=0;
    const headers={Authorization:fixture.authorization(),'Content-Type':'application/json',Origin:'https://app.example.test'};
    try{
        assert.equal((await fetch(fixture.url+'/api/chat-usage')).status,401);
        const original=orchestrator.generateStructured;
        orchestrator.generateStructured=async input=>{assert(chatMeter());modelCalls++;return original(input);};
        let response=await fetch(fixture.url+'/api/chat',{method:'POST',headers,body:JSON.stringify({message:'Explica un bono'})});assert.equal(response.status,200);assert.equal(modelCalls,1);
        chatCreditStore.state=async()=>{reads++;const state=await baseline();state.windows.forEach(window=>{window.remainingMicros=0;window.usedMicros=window.limitMicros;window.resetsAt='2026-11-01T06:00:00Z';});return state;};
        for(const route of ['/chat','/ai-rich','/ai-insight','/ai-insight-stream']){
            response=await fetch(fixture.url+'/api'+route,{method:'POST',headers,body:JSON.stringify({message:'Explica un bono',structured:false,purpose:'report',exempt:true})});
            assert.equal(response.status,429,route);const body=await response.json();assert.equal(body.code,'CHAT_CREDITS_EXHAUSTED');assert(body.resetsAt);assert.match(body.error,/informes siguen disponibles/);
        }
        assert.equal(modelCalls,1,'Blocked callers never reach any chat model');
        response=await fetch(fixture.url+'/api/ai-live-token',{method:'POST',headers,body:'{}'});assert.equal(response.status,403,'Ephemeral native voice cannot bypass accounting');
        response=await fetch(fixture.url+'/api/chat-usage',{headers});const state=await response.json();assert(state.usage.blocked);assert.equal(state.usage.realtimeVoice,false);
        // The canonical administrator is exempt even during a quota-store outage.
        const before=reads;const admin=`Bearer ${jwt.sign({sub:'fixture-admin',email:'admin@vall.com',role:'admin'},process.env.JWT_SECRET,{expiresIn:'5m'})}`;
        response=await fetch(fixture.url+'/api/chat-usage',{headers:{Authorization:admin}});assert.equal((await response.json()).usage.exempt,true);assert.equal(reads,before);
        // The report generation endpoint stays available with an exhausted chat.
        userReportAgent.generate=async()=>{assert.equal(chatMeter(),undefined);return {title:'Informe de prueba'};};
        reportLearning.load=async()=>({});
        response=await fetch(fixture.url+'/api/user-reports/generate',{method:'POST',headers,body:JSON.stringify({accountEmail:'fixture-user@example.invalid',prompt:'Informe'})});
        assert.equal(response.status,200);assert.equal(reads,before,'Reports do not consult or consume chat quota');
        chatCreditStore.state=async()=>{throw Object.assign(Error('No pudimos comprobar tu saldo de chat.'),{code:'CHAT_CREDITS_UNAVAILABLE',status:503});};
        response=await fetch(fixture.url+'/api/chat',{method:'POST',headers,body:JSON.stringify({message:'Explica un bono'})});assert.equal(response.status,503,'Quota outages fail closed');
        console.log('HTTP credits: OK · authentication, all chat routes, blocking, next refill, voice, admin and report isolation');
    }finally{await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
