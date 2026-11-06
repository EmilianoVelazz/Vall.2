'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const {GoogleGenAI}=require('@google/genai');
const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');
const {countRequestTokens}=require('../backend/ai/providers/gemini-token-counter');
const {withChatCredits}=require('../backend/lib/chat-credit-context');
const requests=[],charges=[];
let rateLimited=false;
const server=http.createServer(async(req,res)=>{
    try{
        let raw='';for await(const chunk of req)raw+=chunk;
        const body=JSON.parse(raw);requests.push({url:req.url,body});
        assert.equal(req.headers['x-goog-api-key'],'fixture-only');
        if(req.url.includes(':countTokens')){
            assert.equal(body.contents,undefined);assert.equal(body.generateContentRequest.systemInstruction.parts[0].text,'Instrucciones del sistema');
            assert.deepEqual(body.generateContentRequest.tools,[{googleSearch:{}}]);
            res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({totalTokens:500}));
        }
        assert.equal(body.systemInstruction.parts[0].text,'Instrucciones del sistema');
        assert.equal(body.generationConfig.maxOutputTokens,300);
        if(rateLimited){res.statusCode=429;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error:{code:429,message:'Fixture quota',status:'RESOURCE_EXHAUSTED'}}));}
        const data={candidates:[{content:{parts:[{text:'Respuesta SDK'}],role:'model'},finishReason:'STOP'}],usageMetadata:{promptTokenCount:500,candidatesTokenCount:20,thoughtsTokenCount:10}};
        if(req.url.includes(':streamGenerateContent')){res.setHeader('Content-Type','text/event-stream');res.end('data: '+JSON.stringify(data)+'\n\n');}
        else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:{message:error.message}}));}
});
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    const provider=new GeminiProvider('fixture-only');provider.client=new GoogleGenAI({apiKey:'fixture-only',httpOptions:{baseUrl:base}});provider.modelsForTier=()=>['gemini-2.5-flash'];
    provider.countRequestTokens=request=>countRequestTokens({...request,apiKey:'fixture-only',fetcher:(_url,options)=>fetch(base+'/v1beta/models/gemini-2.5-flash:countTokens',options)});
    const meter={reserve:async(_model,options)=>{assert.equal((await options.countTokens()).totalTokens,500);return {maxOutputTokens:300,finish:async usage=>charges.push(usage),fail:async()=>{throw Error('SDK request failed');}};}};
    for(const method of ['generate','stream']){
        const result=await withChatCredits(meter,()=>provider[method]({prompt:'Pregunta',systemInstruction:'Instrucciones del sistema',tools:[{googleSearch:{}}],maxOutputTokens:300,timeoutMs:3000}));
        assert.equal(result.text,'Respuesta SDK');
    }
    assert.equal(requests.length,4);assert.equal(charges.length,2);assert(charges.every(usage=>usage.promptTokenCount===500 && usage.candidatesTokenCount===20 && usage.thoughtsTokenCount===10));
    rateLimited=true;let released=0;
    const denied={reserve:async(_model,options)=>{await options.countTokens();return {maxOutputTokens:300,finish:async()=>assert.fail('No successful usage on HTTP 429'),fail:async error=>{assert.equal(error.code,'AI_RATE_LIMIT');released++;}};}};
    await assert.rejects(withChatCredits(denied,()=>provider.generate({prompt:'Pregunta',systemInstruction:'Instrucciones del sistema',tools:[{googleSearch:{}}],maxOutputTokens:300,timeoutMs:3000})),{code:'AI_RATE_LIMIT'});
    assert.equal(requests.length,6,'Exactly one token-count request and one provider attempt: hidden SDK retries cannot bypass reservations');assert.equal(released,1);
    console.log('SDK real: OK · serialización de generación y streaming, conteo Developer API completo, instrucciones, herramientas y metadatos; sin solicitudes externas.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.closeAllConnections();server.close();});
