'use strict';
const {configureSystemTrust}=require('../../lib/tls-trust');

// The SDK's CountTokensConfig.systemInstruction is Enterprise-only. The
// Developer API accepts the full request in generateContentRequest instead.
// https://ai.google.dev/api/tokens#request-body
async function countRequestTokens({apiKey,model,contents,systemInstruction,tools,signal,fetcher=fetch}){
    configureSystemTrust();
    const name=String(model).replace(/^models\//,'');
    const request={model:'models/'+name,contents,
        ...(systemInstruction ? {systemInstruction:{parts:[{text:systemInstruction}]}} : {}),
        ...(tools?.length ? {tools} : {})};
    const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(name)+':countTokens',{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({generateContentRequest:request}),
        signal:AbortSignal.any([...(signal ? [signal] : []),AbortSignal.timeout(5000)]),
    });
    if(!response.ok)throw Object.assign(Error('No se pudo comprobar el tamaño de la consulta con el proveedor.'),{status:response.status});
    const result=await response.json();
    if(!Number.isSafeInteger(result.totalTokens) || result.totalTokens<0)throw Object.assign(Error('El proveedor no confirmó el número de tokens de la consulta.'),{code:'CHAT_TOKEN_COUNT_UNAVAILABLE',status:503});
    return {totalTokens:result.totalTokens};
}
module.exports={countRequestTokens};
