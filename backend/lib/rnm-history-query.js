'use strict';
const https=require('node:https');
const {trustedCertificates}=require('./tls-trust');
// A read-only historical search, using the RNM public form's native fields.
function queryRnmHistory(market,id,{timeoutMs=12000}={}) {
    if(!/^\d+$/.test(String(market)) || !/^\d+$/.test(String(id)))return Promise.reject(Error('Serie RNM inválida'));
    const body=new URLSearchParams({H:String(market),C:String(id),DEB:'01-12-21',FIN:'31-12-25'}).toString();
    return new Promise((resolve,reject)=>{
        const request=https.request('https://rnm.franceagrimer.fr/prix',{method:'POST',ca:trustedCertificates(),rejectUnauthorized:true,headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body),'User-Agent':'VALLNews/1.0'}},response=>{
            let raw='',bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){request.destroy(Error('Histórico RNM demasiado grande'));return;}raw+=chunk;});
            response.on('error',reject);response.on('close',()=>{if(!response.complete)reject(Error('Consulta histórica RNM interrumpida'));});response.on('end',()=>response.statusCode===200 ? resolve(raw) : reject(Error('Consulta histórica RNM no disponible')));
        });
        const deadline=setTimeout(()=>request.destroy(Error('Consulta histórica RNM agotó su plazo')),timeoutMs);
        request.on('error',reject);request.on('close',()=>clearTimeout(deadline));request.end(body);
    });
}
module.exports={queryRnmHistory};
