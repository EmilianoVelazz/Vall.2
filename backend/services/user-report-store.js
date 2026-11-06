'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {IS_VERCEL}=require('../lib/config');
const {normalizePreferences}=require('../lib/executive-report-preferences');
const {normalizePreferenceOverrides}=require('../lib/report-preference-overrides');
const REPORT_COLLECTIONS=require('../../shared/report-collections.json');
const {normalizeProfileUse}=require('../lib/report-interests');
const {normalizeEquityEvidence}=require('../lib/report-equity-quality');
const {reportVisualLimit}=require('../lib/report-fx');
const {dailyEvidence}=require('../lib/report-daily-evidence');
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function failure(message,status=400) {return Object.assign(new Error(message),{status});}
function text(value,max=8000) {
    if(value==null) return '';
    if(!['string','number'].includes(typeof value)) throw failure('El contenido debe ser texto.');
    const result=String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
    if(result.length>max) throw failure(`Un campo excede el límite de ${max} caracteres.`);
    return result;
}
function array(value,max,convert) {
    if(value==null) return [];
    if(!Array.isArray(value) || value.length>max) throw failure('El informe contiene demasiados elementos o una estructura inválida.');
    return value.map(convert);
}
function url(value) {
    if(!value) return '';
    let link;try {link=new URL(text(value,1800));} catch {throw failure('Revisa el enlace de la fuente.');}
    if(!['http:','https:'].includes(link.protocol) || link.username || link.password) throw failure('La fuente debe usar un enlace HTTP o HTTPS público.');
    return link.href;
}
function number(value) { const result=typeof value==='number' || typeof value==='string' && value.trim() ? Number(value) : NaN; if (!Number.isFinite(result)) throw failure('Revisa los valores numéricos de la gráfica.'); return result; }
const reportSizeLimit=value=>require('../../shared/report-panorama.mjs').isPanorama(value) ? require('../../shared/report-panorama.mjs').PANORAMA_MAX_BYTES : (value.baseReport?.collection || value.collection)==='finance' && (value.baseReport?.key || value.key)==='equities' ? 768*1024 : 384*1024;
function creationDigest(report,input) {
    const value={...report};
    if(!input.generatedAt) delete value.generatedAt;
    if(value.aiEdition && !input.aiEdition?.generatedAt) {value.aiEdition={...value.aiEdition};delete value.aiEdition.generatedAt;}
    const canonical=item=>Array.isArray(item) ? item.map(canonical) : item && typeof item==='object' ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,canonical(item[key])])) : item;
    return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function normalizeBaseReport(value) {
    if(!value) return undefined;
    if(typeof value!=='object' || !REPORT_COLLECTIONS[value.collection]?.reportKeys?.includes(value.key)) throw failure('La referencia del reporte base no es válida.');
    return {collection:value.collection,key:value.key,title:text(value.title,140),generatedAt:Number.isFinite(Date.parse(value.generatedAt)) ? new Date(value.generatedAt).toISOString() : ''};
}
function normalizeReport(input) {
    if(!input || typeof input!=='object' || Array.isArray(input)) throw failure('El informe no tiene una estructura válida.');
    const panorama=require('../../shared/report-panorama.mjs').isPanorama(input),sourceLimit=require('../lib/report-source-limits').reportSourceLimit(input);
    const dailyInput=input.dailyReferences==null ? undefined : array(input.dailyReferences,192,item=>({label:text(item?.label,140),unit:text(item?.unit,80),points:array(item?.points,150,point=>({date:text(point?.date,40),value:number(point?.value)}))}));
    const dailyReferences=dailyEvidence({...input,...(dailyInput ? {dailyReferences:dailyInput} : {})});
    const evidence=require('../lib/report-daily-evidence').withDailyEvidence(input);
    const title=text(input.title,140).trim();
    if(!title) throw failure('Escribe un título para guardar el informe.');
    const report={title,eyebrow:text(input.eyebrow||'Informe del usuario',160),summary:text(input.summary,4000),objective:text(input.objective,2000),closing:text(input.closing,4000),
        ...(panorama ? {panoramaVersion:require('../../shared/report-panorama.mjs').PANORAMA_VERSION,panoramaParts:require('../../shared/report-panorama.mjs').safePanoramaParts(input.panoramaParts,input.generatedAt),panoramaMissing:Array.isArray(input.panoramaMissing) ? input.panoramaMissing.slice(0,3).map(item=>text(item,20)) : []} : {}),
        generatedAt:Number.isFinite(Date.parse(input.generatedAt)) ? new Date(input.generatedAt).toISOString() : new Date().toISOString(),
        ...require('../../shared/report-annual-evidence.mjs').annualEvidence(input),
        ...require('../../shared/report-market-analysis.mjs').focusedEvidence(evidence,{saved:true}),
        ...(require('../../shared/report-market-news.mjs').isMarketNews(input) ? {marketNewsVersion:1,marketNews:require('../../shared/report-market-news.mjs').marketNewsEvidence(input)} : {}),
        ...(require('../../shared/report-financial-news.mjs').isFinancialNews(input) ? {newsVersion:1,newsStatus:['current','empty','unavailable'].includes(input.newsStatus) ? input.newsStatus : 'current',financialNews:require('../../shared/report-financial-news.mjs').financialNewsEvidence(input)} : {}),
        ...(input.periodType==='annual' && [2022,2023,2024,2025].includes(input.reportYear) ? {periodType:'annual',reportYear:input.reportYear} : {}),
        ...(dailyReferences ? {dailyReferences} : {}),
        ...(evidence.sessionObservations ? {sessionObservations:array(evidence.sessionObservations,192,item=>({label:text(item?.label,140),unit:text(item?.unit,80),region:text(item?.region,40),market:text(item?.market,100),exchange:text(item?.exchange,80),source:text(item?.source,240),url:url(item?.url),cadence:['weekly','monthly','annual','auction'].includes(item?.cadence) ? item.cadence : 'daily',category:text(item?.category,80),basis:text(item?.basis,400),quoteStatus:['verified','preserved','unavailable'].includes(item?.quoteStatus) ? item.quoteStatus : '',points:array(item?.points,65,point=>({date:text(point?.date,40),value:number(point?.value)}))}))} : {}),
        ...(evidence.sessionNews ? {sessionNews:array(evidence.sessionNews,12,item=>({title:text(item?.title,500),description:text(item?.description,800),source:text(item?.source,240),publishedAt:text(item?.publishedAt,80),url:url(item?.url),categoryLabel:text(item?.categoryLabel,140)}))} : {}),
        ...(input.equityObservations ? {equityObservations:array(input.equityObservations,80,item=>({label:text(item?.label,140),region:text(item?.region,40),symbol:text(item?.symbol,30),market:text(item?.market,80),exchange:text(item?.exchange,80),kind:['equity','volatility','informational'].includes(item?.kind) ? item.kind : 'equity',points:array(item?.points,150,point=>({date:text(point?.date,40),value:number(point?.value)}))}))} : {}),
        ...(input.equityCatalogVersion ? {equityCatalogVersion:1} : {}),
        ...(input.bondObservations ? {bondObservations:array(input.bondObservations,96,item=>({id:text(item?.id,40),label:text(item?.label,140),symbol:text(item?.symbol,30),market:text(item?.market,80),currency:text(item?.currency,8),maturity:text(item?.maturity,12),tenorYears:item?.tenorYears==null ? undefined : number(item.tenorYears),cadence:['auction','monthly'].includes(item?.cadence) ? item.cadence : 'daily',basis:text(item?.basis,40),region:text(item?.region,40),code:text(item?.code,3),source:text(item?.source,240),url:url(item?.url),points:array(item?.points,256,point=>({date:text(point?.date,40),value:typeof point?.value==='number' && Number.isFinite(point.value) ? point.value : undefined}))}))} : {}),
        ...(input.bondSchemaVersion ? {bondSchemaVersion:require('../../shared/report-bond-markets.json').version} : {}),
        ...(input.bondNews ? {bondNews:array(input.bondNews,12,item=>({title:text(item?.title,500),description:text(item?.description,800),source:text(item?.source,240),publishedAt:text(item?.publishedAt,80),url:url(item?.url)}))} : {}),
        ...(input.equityNews ? {equityNews:array(input.equityNews,12,item=>({title:text(item?.title,500),description:text(item?.description,800),source:text(item?.source,240),publishedAt:text(item?.publishedAt,80),url:url(item?.url)}))} : {}),
        sections:array(Array.isArray(input.sections) && input.sections.some(section=>typeof section?.text==='string' && section.text.trim()) ? input.sections : input.content && (!input.sections || Array.isArray(input.sections)) ? [{heading:'Contenido del informe',text:input.content}] : input.sections,20,item=>({heading:text(item?.heading,140),text:text(item?.text,8000)})),
        metrics:array(input.metrics,30,item=>({label:text(item?.label,140),value:text(item?.value,140),change:text(item?.change,140)})),
        tables:array(input.tables,6,item=>({... (item?.kind==='guide' ? {kind:'guide'} : {}),title:text(item?.title,140),note:text(item?.note,800),columns:array(item?.columns,12,column=>text(column,140)),rows:array(item?.rows,100,row=>array(row,12,cell=>text(cell,500)))})),
        visuals:array(input.visuals,reportVisualLimit(input),item=>({type:item?.type==='bar' ? 'bar' : 'line',title:text(item?.title,140),unit:text(item?.unit,80),note:text(item?.note,800),
            bars:array(item?.bars,30,bar=>({label:text(bar?.label,140),value:number(bar?.value)})),
            series:array(item?.series,8,series=>({label:text(series?.label,140),points:array(series?.points,150,point=>({date:text(point?.date,40),value:number(point?.value)}))}))})),
        takeaways:array(input.takeaways,20,item=>text(item,1500)),watchlist:array(input.watchlist,20,item=>text(item,1500)),
        sources:array(input.sources,sourceLimit,item=>text(item,240)),sourceLinks:array(input.sourceLinks,sourceLimit,item=>({label:text(item?.label,240),url:url(item?.url)})),
        personalization:input.personalization && typeof input.personalization==='object' ? normalizePreferences({...input.personalization,audience:input.personalization.audienceKey || input.personalization.audience}) : {},
        ...(input.aiEdition && typeof input.aiEdition==='object' ? {aiEdition:{model:text(input.aiEdition.model,160),generatedAt:Number.isFinite(Date.parse(input.aiEdition.generatedAt)) ? new Date(input.aiEdition.generatedAt).toISOString() : new Date().toISOString(),instructions:text(input.aiEdition.instructions,4000),...(input.aiEdition.preferences ? {preferences:normalizePreferences(input.aiEdition.preferences)} : {}),...(input.aiEdition.mode==='instructions' ? {mode:'instructions'} : {}),...(input.aiEdition.preferenceOverrides?.length ? {preferenceOverrides:normalizePreferenceOverrides(input.aiEdition.preferenceOverrides)} : {}),tone:['professional','simple','technical'].includes(input.aiEdition.tone) ? input.aiEdition.tone : 'professional',...(input.aiEdition.profileUse && typeof input.aiEdition.profileUse==='object' ? {profileUse:normalizeProfileUse({...input.aiEdition.profileUse,providerEnabled:input.aiEdition.profileUse.enabled===true})}:{})}} : {}),
        ...(input.baseReport ? {baseReport:normalizeBaseReport(input.baseReport)} : {}),
        userEdition:true};
    if(!report.summary.trim() && !report.sections.some(section=>section.text.trim()) && !report.metrics.length && !report.tables.length) throw failure('Agrega contenido al informe antes de guardarlo.');
    // The full calculation evidence lives in marketHistory. This legacy daily
    // projection need not duplicate months of the same observations in saved
    // equity editions; keep enough recent closes for older readers.
    if(report.baseReport?.key==='equities' && report.marketHistory?.length && report.equityObservations)report.equityObservations=report.equityObservations.map(item=>({...item,points:item.points.slice(-12)}));
    if(report.baseReport?.key==='bonds' && report.bondObservations?.length)delete report.dailyReferences;
    if(Buffer.byteLength(JSON.stringify(report))>reportSizeLimit(input)) throw failure('El informe excede el tamaño permitido.',413);
    return normalizeEquityEvidence(report);
}
function createUserReportStore({directory=process.env.VALL_REPORT_EDITIONS_DIR || (IS_VERCEL ? '/tmp/vall-private-editions' : path.join(__dirname,'../generated-reports/editions')),maxReports=50}={}) {
    const root=path.resolve(directory),pending=new Map();
    const folder=owner=>{if(!owner) throw failure('Inicia sesión para consultar tus informes.',401);return path.join(root,crypto.createHash('sha256').update(String(owner).trim().toLowerCase()).digest('hex'));};
    const file=(owner,id)=>{if(!ID.test(String(id))) throw failure('Informe no válido.',400);return path.join(folder(owner),id+'.json');};
    async function get(owner,id) {
        const target=file(owner,id);
        try {const size=(await fs.stat(target)).size;if(size>require('../../shared/report-panorama.mjs').PANORAMA_MAX_BYTES+64*1024)throw failure('El archivo del informe no es válido.',500);const value=JSON.parse(await fs.readFile(target,'utf8'));if(size>(reportSizeLimit(value)===384*1024 ? 420*1024 : reportSizeLimit(value)+64*1024))throw failure('El archivo del informe no es válido.',500);return normalizeEquityEvidence(value);}
        catch(error) {if(error.code==='ENOENT') return null;throw error;}
    }
    async function list(owner) {
        let names;try {names=await fs.readdir(folder(owner));} catch(error) {if(error.code==='ENOENT') return [];throw error;}
        const reports=await Promise.all(names.filter(name=>ID.test(name.slice(0,-5)) && name.endsWith('.json')).slice(0,maxReports).map(name=>get(owner,name.slice(0,-5))));
        return reports.filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(report=>({key:report.key,editionId:report.editionId,editionVersion:report.editionVersion,title:report.title,eyebrow:'Tu informe guardado',updatedAt:report.updatedAt,userEdition:true}));
    }
    async function save(owner,{id,version,report,creationId}) {
        if(creationId!=null && (!ID.test(String(creationId)) || typeof creationId!=='string' || id)) throw failure('La identidad del nuevo borrador no es válida.');
        const key=folder(owner),previous=pending.get(key)||Promise.resolve();
        const work=previous.catch(()=>{}).then(async()=>{
            const normalized=normalizeReport(report),existing=id || creationId ? await get(owner,id || creationId) : null;
            const digest=creationId ? creationDigest(normalized,report) : undefined;
            if(creationId && existing) {
                if(existing.creationDigest===digest) return existing;
                throw Object.assign(failure('Este borrador ya se guardó con otro contenido. Conservamos ambos textos; guarda el actual como un informe nuevo.',409),{code:'REPORT_CREATION_CONFLICT'});
            }
            if(creationId) {
                try {await fs.access(path.join(key,creationId+'.deleted.json'));throw Object.assign(failure('El informe de este borrador ya fue eliminado. Un reintento no lo recreará.',410),{code:'REPORT_CREATION_REMOVED'});}
                catch(error) {if(error.code!=='ENOENT') throw error;}
            }
            if(id && !existing) throw failure('No se encontró tu informe.',404);
            if(existing && Number(version)!==existing.editionVersion) throw failure('El informe cambió en otra pestaña. Abre la versión guardada o guarda tu edición como un informe nuevo.',409);
            if(!id && (await list(owner)).length>=maxReports) throw failure('Llegaste al límite de informes. Conserva el borrador y elimina un informe guardado antes de crear otro.',409);
            const editionId=id || creationId || crypto.randomUUID(),stamp=new Date().toISOString();
            const saved={...normalized,key:'edition_'+editionId,editionId,editionVersion:(existing?.editionVersion||0)+1,createdAt:existing?.createdAt||stamp,updatedAt:stamp,...(digest || existing?.creationDigest ? {creationDigest:digest || existing.creationDigest} : {})};
            await fs.mkdir(key,{recursive:true,mode:0o700});
            const target=file(owner,editionId),temporary=target+'.'+crypto.randomUUID()+'.tmp';
            try {await fs.writeFile(temporary,JSON.stringify(saved),{flag:'wx',mode:0o600});await fs.rename(temporary,target);} finally {await fs.unlink(temporary).catch(()=>{});}
            return saved;
        });
        pending.set(key,work);
        try {return await work;} finally {if(pending.get(key)===work) pending.delete(key);}
    }
    async function remove(owner,{id,version}) {
        const key=folder(owner),target=file(owner,id);
        if(!Number.isInteger(version) || version<1) throw failure('Abre o actualiza el informe antes de eliminarlo.');
        // Guardar y eliminar comparten la cola de la cuenta: una edición en
        // proceso no puede recrear silenciosamente un documento eliminado.
        const previous=pending.get(key)||Promise.resolve();
        const work=previous.catch(()=>{}).then(async()=>{
            const existing=await get(owner,id);
            if(!existing) throw failure('No se encontró tu informe.',404);
            if(version!==existing.editionVersion) throw failure('El informe cambió en otra pestaña. Actualiza Mis informes y revisa la versión antes de eliminarla.',409);
            if(existing.creationDigest) {
                try {await fs.writeFile(path.join(key,id+'.deleted.json'),JSON.stringify({deletedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});}
                catch(error) {if(error.code!=='EEXIST') throw error;}
            }
            await fs.unlink(target);
            return {editionId:id};
        });
        pending.set(key,work);
        try {return await work;} finally {if(pending.get(key)===work) pending.delete(key);}
    }
    return {list,get,save,remove,storage:IS_VERCEL && root.startsWith('/tmp') ? 'temporary_runtime' : 'persistent_disk'};
}
module.exports={createUserReportStore,normalizeReport,userReportStore:createUserReportStore()};
