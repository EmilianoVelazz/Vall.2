'use strict';
const crypto=require('node:crypto');
const prices=require('../../shared/chat-credit-pricing.json');
const {chatCreditStore}=require('./chat-credit-store');
const {withChatCredits}=require('../lib/chat-credit-context');
const count=value=>Number.isSafeInteger(value) && value>=0 ? value : 0;
const exempt=user=>user?.role==='admin' && String(user.email || '').trim().toLowerCase()==='admin@vall.com';
function pricing(model,inputTokens=0,now=Date.now()) {
    const name=String(model).replace(/^models\//,''),key=Object.keys(prices.models).find(key=>name===key || name.startsWith(key+'-20'));
    if(!key)throw Object.assign(Error('Este modelo todavía no tiene una tarifa de créditos configurada.'),{code:'CHAT_MODEL_PRICE_MISSING',status:503});
    const entry=prices.models[key];return {...entry,...(inputTokens>200000 ? entry.long || {} : {}),...(now>=Date.parse('2027-01-01T00:00:00Z') ? entry.from2027 || {} : {})};
}
function tokenUsage(metadata) {
    if(!metadata || !Number.isSafeInteger(metadata.promptTokenCount) || metadata.promptTokenCount<0)return null;
    for(const key of ['toolUsePromptTokenCount','candidatesTokenCount','thoughtsTokenCount','cachedContentTokenCount'])if(metadata[key]!=null && (!Number.isSafeInteger(metadata[key]) || metadata[key]<0))return null;
    const prompt=count(metadata.promptTokenCount),tool=count(metadata.toolUsePromptTokenCount),output=count(metadata.candidatesTokenCount),thinking=count(metadata.thoughtsTokenCount);
    return {inputTokens:prompt+tool,promptTokens:prompt,toolTokens:tool,outputTokens:output,thinkingTokens:thinking,cachedTokens:Math.min(prompt,count(metadata.cachedContentTokenCount)),audioInputTokens:Math.min(prompt,(metadata.promptTokensDetails || []).filter(item=>String(item.modality).toUpperCase()==='AUDIO').reduce((sum,item)=>sum+count(item.tokenCount),0)),audioCachedTokens:(metadata.cacheTokensDetails || []).filter(item=>String(item.modality).toUpperCase()==='AUDIO').reduce((sum,item)=>sum+count(item.tokenCount),0),pricingVersion:prices.version};
}
function tokenCost(usage,rate,fx) {
    const audio=Math.min(usage.audioInputTokens || 0,usage.inputTokens),cached=Math.min(usage.cachedTokens || 0,usage.inputTokens),audioCached=Math.min(audio,cached,usage.audioCachedTokens || 0),audioUncached=Math.min(audio-audioCached,usage.inputTokens-cached),uncached=Math.max(0,usage.inputTokens-cached-audioUncached);
    // Micro-MXN: 1M tokens at USD/1M * MXN/USD * 1M micro-MXN/MXN.
    return Math.ceil((uncached*rate.input+audioUncached*(rate.audioInput || rate.input)+(cached-audioCached)*rate.cached+audioCached*(rate.audioCached || rate.cached)+(usage.outputTokens+usage.thinkingTokens)*rate.output)*fx);
}
function publicState(state) {
    const windows=state.windows.map(window=>({...window,limitMxn:window.limitMicros/1e6,usedMxn:window.usedMicros/1e6,reservedMxn:window.reservedMicros/1e6,remainingMxn:window.remainingMicros/1e6}));
    const blocked=windows.filter(window=>window.remainingMicros<=0),reset=blocked.map(window=>window.resetsAt).filter(Boolean).sort().at(-1) || null;
    return {...state,windows,blocked:blocked.length>0,resetsAt:reset,pricingVersion:prices.version,realtimeVoice:false};
}
function quotaError(state,code='CHAT_CREDITS_EXHAUSTED') {
    const current=publicState(state),pending=current.windows.some(window=>window.remainingMicros<=0 && window.reservedMicros>0 && window.usedMicros<window.limitMicros);
    const reset=current.resetsAt || current.windows.filter(window=>window.resetsAt).sort((a,b)=>a.remainingMicros-b.remainingMicros)[0]?.resetsAt;
    const date=reset ? new Date(reset).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}) : '';
    return Object.assign(Error(pending ? 'Tienes una consulta en curso con saldo reservado. Espera a que termine para volver a enviar.' : `No tienes créditos de chat disponibles para esta consulta.${date ? ' Tu cupo se recarga el '+date+' (hora de Ciudad de México).' : ''} Los informes siguen disponibles.`),{code:pending ? 'CHAT_CREDITS_RESERVED' : code,status:pending ? 409 : 429,usage:current,resetsAt:reset});
}
function createChatCredits({store=chatCreditStore,now=Date.now,onDiagnostic=code=>console.warn('[chat-credits]',code)}={}) {
    async function status(user){if(exempt(user))return {exempt:true,blocked:false,currency:'MXN',windows:[],realtimeVoice:true};return publicState(await store.state(user.sub));}
    function meter(user){
        return {async reserve(model,{countTokens,maxOutputTokens=4096,hasTools=false,audio=false}){
            let state=await store.state(user.sub),rate=pricing(model,0,now());
            const counted=await countTokens(),input=count(counted?.totalTokens);
            if(!Number.isSafeInteger(counted?.totalTokens) || counted.totalTokens<0 || input>1000000)throw Object.assign(Error('No se pudo comprobar el tamaño de la consulta.'),{code:'CHAT_TOKEN_COUNT_UNAVAILABLE',status:503});
            const toolAllowance=hasTools ? 16384 : 0;
            rate=pricing(model,input+toolAllowance,now());
            const available=Math.min(...state.windows.map(window=>window.remainingMicros)),fx=Number(state.mxnPerUsd);
            const inputCost=tokenCost({inputTokens:input+toolAllowance,outputTokens:0,thinkingTokens:0,audioInputTokens:audio ? input : 0},rate,fx);
            const outputLimit=Math.min(maxOutputTokens,Math.floor((available-inputCost)/(rate.output*fx)));
            if(outputLimit<128)throw quotaError(state,'CHAT_CREDITS_INSUFFICIENT');
            const amount=inputCost+Math.ceil(outputLimit*rate.output*fx),id=crypto.randomUUID();
            const reserved=await store.reserve(user.sub,id,amount,model);
            if(!reserved.allowed)throw quotaError(reserved.state);
            let settled=false;
            async function finish(metadata,{release=false}={}) {
                if(settled)return;settled=true;
                const usage=tokenUsage(metadata),estimated=!usage && !release;
                const cost=release ? 0 : usage ? tokenCost(usage,pricing(model,usage.inputTokens,now()),fx) : amount;
                try{await store.settle(user.sub,id,cost,usage || {pricingVersion:prices.version,estimated},estimated);}catch(error){onDiagnostic(error.code || 'SETTLEMENT_PENDING');}
            }
            return {maxOutputTokens:outputLimit,finish,fail:error=>finish(null,{release:['AI_AUTH','AI_NOT_CONFIGURED','AI_RATE_LIMIT','CHAT_MODEL_PRICE_MISSING'].includes(error.code) || [400,401,403,404,429].includes(error.providerStatus)})};
        }};
    }
    async function admission(req,res,next){
        try {
            if(exempt(req.user))return next();
            const state=await store.state(req.user.sub);
            if(state.windows.some(window=>window.remainingMicros<=0))throw quotaError(state);
            return withChatCredits(meter(req.user),()=>next());
        }catch(error){const known=error.code?.startsWith('CHAT_');res.status(known ? error.status || 503 : 503).json({success:false,error:known ? error.message : 'No pudimos comprobar tu saldo de chat. Intenta nuevamente en unos momentos.',code:known ? error.code : 'CHAT_CREDITS_UNAVAILABLE',usage:error.usage,resetsAt:error.resetsAt});}
    }
    return {status,admission,meter};
}
module.exports={createChatCredits,chatCredits:createChatCredits(),exempt,pricing,tokenUsage,tokenCost,publicState};
