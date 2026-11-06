'use strict';
const assert=require('node:assert/strict');
const {createChatCredits,exempt,pricing,tokenUsage,tokenCost,publicState}=require('../backend/services/chat-credits');
const {withChatCredits,chatMeter}=require('../backend/lib/chat-credit-context');
const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');
const {createChatCreditStore}=require('../backend/services/chat-credit-store');
const user={sub:'fixture-user',email:'user@example.invalid',role:'user'};
function snapshot(limit=2000000){return {exempt:false,currency:'MXN',mxnPerUsd:20,windows:['month','week','five_hours'].map(kind=>({kind,limitMicros:limit,usedMicros:0,reservedMicros:0,remainingMicros:limit,startsAt:'2026-10-22T00:00:00Z',resetsAt:kind==='month' ? '2026-11-01T06:00:00Z' : '2026-10-23T00:00:00Z'}))};}
function memoryStore(limit){
    const state=snapshot(limit),reservations=new Map(),settlements=[];
    return {state:async()=>structuredClone(state),reservations,settlements,
        reserve:async(_id,id,amount,model)=>{
            if(state.windows.some(window=>window.remainingMicros<amount))return {allowed:false,state:structuredClone(state)};
            reservations.set(id,{amount,model});
            state.windows.forEach(window=>{window.reservedMicros+=amount;window.remainingMicros-=amount;});
            return {allowed:true,state:structuredClone(state)};
        },settle:async(_id,id,cost,usage,estimated)=>{
            const entry=reservations.get(id),bill=Math.min(entry.amount,cost);settlements.push({cost,usage,estimated,bill});
            state.windows.forEach(window=>{window.reservedMicros-=entry.amount;window.usedMicros+=bill;window.remainingMicros=window.limitMicros-window.usedMicros-window.reservedMicros;});
            return structuredClone(state);
        }};
}
const counted=async()=>({totalTokens:1000});
(async()=>{
    assert(exempt({role:'admin',email:'admin@vall.com'}));
    for(const account of [user,{role:'user',email:'admin@vall.com'},{role:'admin',email:'other@vall.com'},{role:'admin',email:'admin@vall.com.evil'}])assert(!exempt(account));
    assert.equal(pricing('gemini-3.8-flash',0,Date.parse('2026-10-22')).input,.75);
    assert.equal(pricing('gemini-3.8-flash',0,Date.parse('2027-01-01')).input,1.5);
    assert.equal(pricing('gemini-2.5-pro',200001).output,15);
    assert.throws(()=>pricing('unknown-model'),{code:'CHAT_MODEL_PRICE_MISSING'});
    assert.equal(tokenUsage({promptTokenCount:-1}),null);
    assert.equal(tokenUsage({promptTokenCount:1,candidatesTokenCount:'4'}),null);
    const rate=pricing('gemini-2.5-flash');
    const usage=tokenUsage({promptTokenCount:1000,toolUsePromptTokenCount:100,candidatesTokenCount:200,thoughtsTokenCount:300,cachedContentTokenCount:200,promptTokensDetails:[{modality:'AUDIO',tokenCount:400}],cacheTokensDetails:[{modality:'AUDIO',tokenCount:100}]});
    assert.equal(usage.inputTokens,1100);
    assert.equal(tokenCost(usage,rate,20),Math.ceil((600*.3+300*1+100*.03+100*.1+500*2.5)*20));
    const store=memoryStore(),credits=createChatCredits({store,now:()=>Date.parse('2026-10-22')});
    const ticket=await credits.meter(user).reserve('gemini-2.5-flash',{countTokens:counted,maxOutputTokens:500});
    assert.equal(ticket.maxOutputTokens,500);
    await ticket.finish({promptTokenCount:1000,candidatesTokenCount:100,thoughtsTokenCount:50});
    await ticket.fail({code:'AI_TIMEOUT'});
    assert.equal(store.settlements.length,1,'A completed attempt cannot be charged twice');
    assert.equal(store.settlements[0].cost,Math.ceil((1000*.3+150*2.5)*20));
    assert.equal(store.settlements[0].estimated,false);
    const second=await credits.meter(user).reserve('gemini-2.5-flash',{countTokens:counted});
    await second.fail({code:'AI_RATE_LIMIT'});assert.equal(store.settlements.at(-1).cost,0);
    const third=await credits.meter(user).reserve('gemini-2.5-flash',{countTokens:counted});
    await third.fail({code:'AI_TIMEOUT'});assert(store.settlements.at(-1).estimated);
    const tiny=createChatCredits({store:memoryStore(5000)});
    await assert.rejects(tiny.meter(user).reserve('gemini-3.8-flash',{countTokens:counted}),error=>error.status===429 && error.resetsAt && /recarga/.test(error.message));
    await assert.rejects(credits.meter(user).reserve('gemini-2.5-flash',{countTokens:async()=>({totalTokens:-2})}),{code:'CHAT_TOKEN_COUNT_UNAVAILABLE'});
    const concurrent=memoryStore(50000),concurrentCredits=createChatCredits({store:concurrent});
    const pair=await Promise.allSettled([1,2].map(()=>concurrentCredits.meter(user).reserve('gemini-2.5-flash',{countTokens:counted,maxOutputTokens:4000})));
    assert.equal(pair.filter(result=>result.status==='fulfilled').length,1,'Atomic reservation prevents concurrent overspend');
    assert((await concurrent.state()).windows.every(window=>window.remainingMicros>=0));
    const denied=snapshot();denied.windows[0].remainingMicros=0;denied.windows[2].remainingMicros=0;
    assert.equal(publicState(denied).resetsAt,'2026-11-01T06:00:00Z','Wait until all blocked windows are replenished');
    let reads=0;const unavailable=createChatCredits({store:{state:async()=>{reads++;throw Object.assign(Error('Unavailable'),{code:'CHAT_CREDITS_UNAVAILABLE',status:503});}}});
    assert.equal((await unavailable.status({role:'admin',email:'admin@vall.com'})).exempt,true);assert.equal(reads,0);
    await assert.rejects(unavailable.status(user),{status:503});
    assert.equal(chatMeter(),undefined);
    await withChatCredits(credits.meter(user),async()=>{await Promise.resolve();assert(chatMeter());});
    assert.equal(chatMeter(),undefined,'Report work outside chat context remains unmetered');

    // Real provider integration, fake SDK only: each fallback has its own debit,
    // and cumulative streaming metadata is settled once using its last value.
    const provider=new GeminiProvider('fixture-only'),providerStore=memoryStore(2000000),providerCredits=createChatCredits({store:providerStore});
    provider.modelsForTier=()=>['gemini-2.5-flash','gemini-2.5-pro'];
    let calls=0;
    provider.countRequestTokens=async()=>({totalTokens:100});
    provider.client={models:{generateContent:async request=>{
        assert.equal(request.config.httpOptions.retryOptions.attempts,1);calls++;
        return {text:calls===1 ? '' : 'Respuesta completa',usageMetadata:{promptTokenCount:100,candidatesTokenCount:50},candidates:[{finishReason:'STOP'}]};
    },generateContentStream:async()=>({[Symbol.asyncIterator]:async function*(){yield {text:'A',usageMetadata:{promptTokenCount:100,candidatesTokenCount:2}};yield {text:'B',usageMetadata:{promptTokenCount:100,candidatesTokenCount:4}};}})}};
    await withChatCredits(providerCredits.meter(user),()=>provider.generate({prompt:'Pregunta'}));
    assert.equal(providerStore.settlements.length,2,'Paid incomplete answer and fallback both count');
    await withChatCredits(providerCredits.meter(user),()=>provider.stream({prompt:'Pregunta'}));
    assert.equal(providerStore.settlements.at(-1).usage.outputTokens,4,'Cumulative stream counts are never added twice');
    assert.equal(providerStore.settlements.at(-1).usage.inputTokens,100);
    provider.modelsForTier=()=>['gemini-2.5-flash'];
    provider.client.models.generateContentStream=async()=>({[Symbol.asyncIterator]:async function*(){yield {text:'Parcial',usageMetadata:{promptTokenCount:100,candidatesTokenCount:1}};throw Object.assign(Error('Stream interrupted'),{name:'AbortError'});}});
    await assert.rejects(withChatCredits(providerCredits.meter(user),()=>provider.stream({prompt:'Pregunta'})),{code:'AI_TIMEOUT'});
    assert(providerStore.settlements.at(-1).estimated,'Partial stream metadata cannot refund an uncertain server generation');
    provider.client.models.generateContent=async request=>{assert.equal(request.config.httpOptions.retryOptions,undefined);return {text:'Informe sin cuota',candidates:[{finishReason:'STOP'}]};};
    const before=providerStore.reservations.size;await provider.generate({prompt:'Informe'});assert.equal(providerStore.reservations.size,before);

    let released=0,rpcCalls=0;
    const fallbackStore=createChatCreditStore({connect:async()=>({query:async()=>{throw Error('NETWORK');},end:async()=>{released++;}}),rest:()=>({rpc:()=>({abortSignal:async()=>{rpcCalls++;return {data:snapshot()};}})}),onDiagnostic:()=>{}});
    assert.equal((await fallbackStore.state(user.sub)).windows.length,3);assert.equal(released,1);assert.equal(rpcCalls,1);
    const broken=createChatCreditStore({connect:async()=>null,rest:()=>{throw Error('PRIVATE SECRET SHOULD NEVER LEAK');},onDiagnostic:()=>{}});
    await assert.rejects(broken.state(user.sub),error=>error.code==='CHAT_CREDITS_UNAVAILABLE' && !error.message.includes('SECRET'));
    console.log('Chat credits: OK · pricing, tokens, reservations, concurrency, fallback, stream, admin, reports and private connection');
})().catch(error=>{console.error(error);process.exitCode=1;});
