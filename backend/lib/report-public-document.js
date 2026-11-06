'use strict';
const https=require('node:https');
const {trustedCertificates}=require('./tls-trust');
// Public documents and read-only report forms. No credentials or session cookies.
function readPublicDocument(url,{method='GET',body='',encoding='utf8',timeoutMs=9000,maxBytes=8*1024*1024}={}){
    return new Promise((resolve,reject)=>{
        const target=new URL(url);if(target.protocol!=='https:')return reject(Error('Se requiere HTTPS.'));
        const agent=new https.Agent({ca:trustedCertificates(),rejectUnauthorized:true});let timer,done=false;
        const finish=(callback,value)=>{if(done)return;done=true;clearTimeout(timer);agent.destroy();callback(value);};
        const request=https.request(target,{method,agent,headers:{'User-Agent':'VALLNews/2.0',...(method==='POST' ? {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)} : {})}},response=>{
            const chunks=[];let bytes=0;
            response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)request.destroy(Error('Documento demasiado grande.'));else chunks.push(chunk);});
            response.on('error',error=>finish(reject,error));response.on('close',()=>{if(!response.complete)finish(reject,Error('Documento incompleto.'));});
            response.on('end',()=>{if(response.statusCode!==200)return finish(reject,Error('Documento HTTP '+response.statusCode));const buffer=Buffer.concat(chunks);finish(resolve,encoding===null ? buffer : buffer.toString(encoding));});
        });
        request.on('error',error=>finish(reject,error));timer=setTimeout(()=>request.destroy(Error('Tiempo de consulta agotado.')),timeoutMs);request.end(body);
    });
}
async function proteinPdfPages(buffer,{maxPages=90}={}){
    if(!Buffer.isBuffer(buffer) || buffer.length>8*1024*1024 || buffer.subarray(0,5).toString()!=='%PDF-')throw Error('Documento PDF no válido.');
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});
    try{
        const pdf=await task.promise;if(pdf.numPages>Math.min(200,Math.max(1,maxPages)))throw Error('Boletín demasiado extenso.');const pages=[];
        for(let n=1;n<=pdf.numPages;n++){
            const page=await pdf.getPage(n),items=(await page.getTextContent()).items.filter(item=>typeof item.str==='string'),width=page.getViewport({scale:1}).width;
            const lines=part=>{const rows=[];for(const item of part){let row=rows.find(row=>Math.abs(row.y-item.transform[5])<2);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push(item);}return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);};
            pages.push({text:items.map(item=>item.str).join(' '),lines:lines(items),columns:[lines(items.filter(item=>item.transform[4]<width/2)),lines(items.filter(item=>item.transform[4]>=width/2))]});page.cleanup();
        }
        return pages;
    }finally{await task.destroy();}
}
module.exports={readPublicDocument,proteinPdfPages};
