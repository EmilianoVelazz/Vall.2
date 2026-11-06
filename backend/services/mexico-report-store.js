'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {CACHE_DIR}=require('../lib/config');
// El formato anterior omitía gráficas en panorama y bolsa. Reconstruir sólo
// el catálogo base; las ediciones guardadas por el usuario no se modifican.
const SCHEMA_VERSION=3;
function createMexicoReportStore({file=path.join(CACHE_DIR,'mexico-executive-reports.json')}={}) {
    let memory;
    async function load() {
        if(memory) return memory;
        try {
            if((await fs.stat(file)).size>3*1024*1024) return null;
            const value=JSON.parse(await fs.readFile(file,'utf8'));
            if(value.schemaVersion!==SCHEMA_VERSION || !Array.isArray(value.reports) || value.reports.length!==4 || !Number.isFinite(Date.parse(value.generatedAt))) return null;
            memory=value;return memory;
        } catch {return null;}
    }
    async function save(snapshot) {
        if(process.env.NODE_ENV!=='test' && path.resolve(file)===path.resolve(CACHE_DIR,'mexico-executive-reports.json'))await require('./report-history-store').reportHistory.archive(snapshot.reports,'mexico').catch(()=>console.warn('[report-history] No se confirmó el archivo de México.'));
        memory={...snapshot,schemaVersion:SCHEMA_VERSION,persistence:'memory'};
        const temporary=file+'.'+crypto.randomUUID()+'.tmp';
        try {
            await fs.mkdir(path.dirname(file),{recursive:true});
            const value={...memory,persistence:'disk'};
            await fs.writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});
            await fs.rename(temporary,file);memory=value;
        } catch {console.warn('[mexico-reports] Corte disponible en memoria; no se confirmó el caché en disco.');}
        finally {await fs.unlink(temporary).catch(()=>{});}
        return memory;
    }
    return {load,save};
}
module.exports={createMexicoReportStore,...createMexicoReportStore()};
