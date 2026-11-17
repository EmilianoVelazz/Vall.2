'use strict';
const {configureSystemTrust}=require('./tls-trust');

// CME's document server rejects the legacy https client on some networks.
// Keep the native fetch transport, with certificate checks and bounded PDFs.
async function readCmeBulletin(url,{timeoutMs=15000,maxBytes=8*1024*1024,fetchDocument=globalThis.fetch}={}){
    const target=new URL(url);
    const fail=code=>Object.assign(new Error(code),{code});
    if(target.protocol!=='https:' || target.hostname!=='www.cmegroup.com' || target.port || target.username || target.password || target.search || target.hash || !/^\/daily_bulletin\/current\/Section\d+_[A-Za-z_]+\.pdf$/.test(target.pathname))throw fail('CME_URL_INVALID');
    configureSystemTrust();
    const response=await fetchDocument(target.href,{headers:{Accept:'application/pdf'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok){await response.body?.cancel();throw fail('CME_HTTP_'+response.status);}
    if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw fail('CME_PDF_TOO_LARGE');}
    if(!response.body)throw fail('CME_PDF_INVALID');
    const reader=response.body.getReader(),chunks=[];let bytes=0;
    try{
        for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw fail('CME_PDF_TOO_LARGE');}chunks.push(Buffer.from(value));}
    }finally{reader.releaseLock();}
    const buffer=Buffer.concat(chunks);
    if(buffer.subarray(0,5).toString()!=='%PDF-')throw fail('CME_PDF_INVALID');
    return buffer;
}
module.exports={readCmeBulletin};
