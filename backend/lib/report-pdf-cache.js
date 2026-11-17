'use strict';
const {createHash}=require('node:crypto');

// Process-local and account-scoped. Store only completed bytes, never links or
// authorization decisions; the route authenticates every request before use.
function createReportPdfCache({maxEntries=12,maxBytes=32*1024*1024,ttlMs=5*60*1000,now=Date.now}={}) {
    const entries=new Map(),pending=new Map();let bytes=0;
    function remove(key){const entry=entries.get(key);if(entry){bytes-=entry.bytes.length;entries.delete(key);}}
    async function getOrCreate({owner,language='es',title='',report=null,images=[]},load) {
        if(!owner)return load();
        const key=createHash('sha256').update(JSON.stringify([String(owner).trim().toLowerCase(),language,title,report,images])).digest('hex');
        const hit=entries.get(key);
        if(hit && hit.expires>now()){entries.delete(key);entries.set(key,hit);return hit.bytes;}
        if(hit)remove(key);
        if(pending.has(key))return pending.get(key);
        const request=Promise.resolve().then(load).then(buffer=>{
            if(!Buffer.isBuffer(buffer))throw new TypeError('El generador PDF debe devolver bytes.');
            if(buffer.length<=maxBytes && maxEntries>0){
                for(const [saved,entry]of entries)if(entry.expires<=now())remove(saved);
                while(entries.size>=maxEntries || bytes+buffer.length>maxBytes)remove(entries.keys().next().value);
                entries.set(key,{bytes:buffer,expires:now()+ttlMs});bytes+=buffer.length;
            }
            return buffer;
        }).finally(()=>pending.delete(key));
        pending.set(key,request);return request;
    }
    return {getOrCreate,snapshot:()=>({entries:entries.size,bytes,pending:pending.size})};
}
module.exports={createReportPdfCache,reportPdfCache:createReportPdfCache()};
