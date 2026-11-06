'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {researchPeriod,publicationScope}=require('../backend/services/trade-research');
const {selectRecords}=require('../backend/services/rabobank-public');
const {researchLedger,auditResearchAnswer,verifiedResearchFallback}=require('../backend/ai/research-evidence');
const {marketProfile}=require('../backend/ml/market-profiles');
const {candidatePredictions,assessAdaptiveForecast}=require('../backend/ml/adaptive-forecast');
const {createForecastJournal}=require('../backend/ml/forecast-journal');
const {createLearningStore}=require('../backend/ml/forecast-learning-store');
const {buildPhysicalForecast}=require('../backend/ai/physical-forecast');
const {reviewForecastResults}=require('../backend/ml/forecast-review-job');
const {prepareBusinessConversation,memorySummary}=require('../backend/ai/business-memory');
const {planQuery}=require('../backend/ai/query-planner');
const {decisionBrief}=require('../backend/ai/decision-brief');
const {parseCommercialInputs,calculateMargin,commercialReply}=require('../backend/ai/commercial-calculator');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
const DAY=86_400_000,now=Date.parse('2026-10-15T18:00:00Z');

async function main() {
    // Calendar periods are resolved in Mexico City, not as arbitrary six months.
    for(const [query,start,end] of [['hoy','2026-10-15','2026-10-15'],['ayer','2026-10-14','2026-10-14'],['esta semana','2026-10-12','2026-10-15'],['semana pasada','2026-10-05','2026-10-11'],['mes pasado','2026-09-01','2026-09-30'],['septiembre de 2025','2025-09-01','2025-09-30'],['desde 2026-09-05','2026-09-05','2026-10-15']]) {
        const period=researchPeriod(query,now);assert.equal(period.start,start,query);assert.equal(period.end,end,query);
    }
    assert.equal(researchPeriod('hoy',Date.parse('2026-10-15T02:00:00Z')).start,'2026-10-14','El día respeta CDMX');
    const range=researchPeriod('del 15 de septiembre de 2026 al 5 de octubre de 2026',now);assert.equal(range.start,'2026-09-15');assert.equal(range.end,'2026-10-05');
    assert.equal(publicationScope('pronósticos de Rabobank para 2027',now).period,null,'El año de un pronóstico no es su año de publicación');
    const outlook=selectRecords([{title:'Beef outlook for 2027',date:'2026-09-01',source:'Rabobank',url:'https://example.org/outlook',paragraphs:['The beef outlook for 2027 expects pressure on cattle supply.']}],'pronósticos de Rabobank para 2027',now);
    assert.equal(outlook.records.length,1);
    const url='https://example.org/agreement';
    const plan={needsTradeResearch:true,tradeResearchQuery:'acuerdos en los últimos tres meses'};
    const evidence={citations:[{url,date:'2026-09-25',type:'verified_trade_document'}],tradeDocuments:[{url,date:'2026-09-25',verified:true,title:'Acuerdo agrícola',source:'Fuente oficial',excerpts:['Se anunció un compromiso de compra. La recomendación es reducir el arancel 10%; todavía no está en vigor.']}]};
    const good=`El 2026-09-25 se anunció un compromiso; la recomendación de reducir el arancel 10% todavía no está en vigor. [Documento](${url}).`;
    assert.equal(auditResearchAnswer(plan,evidence,good,now).needed,false);
    assert.equal(auditResearchAnswer(plan,evidence,'### Informes revisados\n\n'+good,now).needed,false,'Un título estructural no exige una cita propia');
    assert(auditResearchAnswer(plan,evidence,Array.from({length:41},()=>good).join('\n\n'),now).issues.includes('claim_limit_exceeded'),'No se aceptan afirmaciones posteriores al límite sin revisar');
    for(const bad of ['Se firmó un acuerdo nuevo con una reducción del 99%.',good.replace('10%','99%'),good.replace('2026-09-25','ayer'),good.replace(url,'https://example.org/other')]) assert(auditResearchAnswer(plan,evidence,bad,now).needed,bad);
    const old={citations:[{url,date:'2025-01-01'}],tradeDocuments:[{...evidence.tradeDocuments[0],date:'2025-01-01'}]};
    assert(auditResearchAnswer(plan,old,good.replace('2026-09-25','2025-01-01'),now).issues.includes('background_presented_as_current'));
    assert.match(verifiedResearchFallback(researchLedger(plan,old,now)),/Antecedentes/);
    assert.match(verifiedResearchFallback(researchLedger(plan,evidence,now)),/no est[aá] en vigor/,'El extracto breve conserva la negación sobre la vigencia');
    const emitted=[];let generations=0;
    const retriever={retrieve:async()=>({context:'',citations:[],sourceCodes:[]}),recordQuery:async()=>null,recordEvidence:async()=>null};
    const chat=new AIOrchestrator({retriever,liveDataGrounder:async()=>({...evidence,context:'Documento verificado',available:true}),provider:{name:'fixture',isConfigured:()=>true,
        stream:async request=>{request.onText('Arancel 99%','Arancel 99%');return {text:'Arancel 99%',model:'fixture'};},
        generate:async()=>{generations++;return {text:'Se aprobó el arancel 99%.',model:'fixture'};}}});
    const answer=await chat.stream({message:'Acuerdos comerciales entre China y Estados Unidos en los últimos tres meses',history:[],onText:text=>emitted.push(text)});
    assert.equal(generations,1);assert.equal(answer.response.meta.researchAudit.fallbackUsed,true);
    assert.doesNotMatch(emitted.join(''),/99%/,'El texto rechazado nunca llega al streaming');
    assert.match(answer.text,/2026-09-25/);assert.match(answer.text,/example.org\/agreement/);
    generations=0;
    const report=await chat.stream({message:'Crea un informe de acuerdos comerciales entre China y Estados Unidos en los últimos tres meses',history:[],onText(){}});
    assert(report.response.meta.researchAudit.fallbackUsed);
    assert.equal(generations,1,'La respuesta de respaldo no activa generaciones para rellenar un informe largo');

    const values=Array.from({length:520},(_,i)=>100+i*.4+[0,2,1,-1,3,2,-2,-1][i%8]);
    for(const [ticker,id,method] of [['USDMXN=X','fx','fx_log_drift20'],['ZC=F','grains','grain_seasonal252'],['HE=F','protein_futures','protein_reversion60']]) {
        assert.equal(marketProfile({ticker}).id,id);
        assert(Number.isFinite(candidatePredictions(values,5,id)[method]));
        const points=values.map((value,index)=>({value,date:new Date(now-(520-index)*DAY).toISOString().slice(0,10)}));
        const measured=assessAdaptiveForecast(points,{horizon:5,profileId:id,now});
        assert.equal(measured.learning.marketProfile,id);assert.equal(measured.forecast.probabilityUp,null);
        assert(measured.evaluation.nonOverlapping.evaluationPoints>=8);
    }
    assert(!Object.hasOwn(candidatePredictions(values,5,'fx'),'grain_seasonal252'));
    const first=prepareBusinessConversation({message:'Pronóstico del precio de pechuga de pollo congelada al mayoreo en Puebla, México para la próxima semana'});
    const next=prepareBusinessConversation({message:'¿Y en Jalisco?',conversationMemory:first.conversationMemory});
    assert.deepEqual(next.conversationMemory.profile.mexicoStates,['JAL']);
    assert.match(memorySummary(next.conversationMemory),/congelada/);
    assert.doesNotMatch(memorySummary(next.conversationMemory),/Puebla/);
    const third=prepareBusinessConversation({message:'Puebla',conversationMemory:next.conversationMemory});
    const planned=planQuery({message:third.message,history:third.history});
    assert.deepEqual(planned.proteinProfile.mexicoStates,['PUE']);assert.equal(planned.forecast.horizon,5);
    assert.equal(planned.proteinProfile.priceBasis,'cut');
    assert(planned.proteinProfile.commercialStages.includes('wholesale'));
    assert.equal(prepareBusinessConversation({message:'Cambiando de tema: petróleo',conversationMemory:third.conversationMemory}).conversationMemory,null);

    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orion-priorities-'));
    try {
        const journal=createForecastJournal({directory,now:()=>now});
        const basis={verified:true,productId:'pork',product:'Cerdo',countryCode:'MX',country:'México',stateCode:'PUE',market:'Puebla: rastro',category:'Canal',priceBasis:'carcass',currency:'MXN',unit:'MXN/kg',frequency:'daily_report',source:'Fuente pública de prueba',url:'https://example.org/prices'};
        const history=Array.from({length:160},(_,i)=>({...basis,date:new Date(now-(160-i)*DAY).toISOString().slice(0,10),value:100+i*.4+[0,2,1,-1,3,2,-2,-1][i%8]}));
        for(let offset=0;offset<history.length;offset+=128) await journal.observe(history.slice(offset,offset+128));
        await journal.observe([{...history.at(-1),stateCode:'JAL',market:'Jalisco: rastro'},{...history.at(-1),priceBasis:'live',category:'En pie'},{...history.at(-1),unit:'MXN/caja'}]);
        const restarted=createForecastJournal({directory,now:()=>now});
        assert.equal((await restarted.series()).length,4,'No mezcla estado, etapa ni unidad');
        const store=createLearningStore(restarted);
        const physicalPlan={proteinProfile:{products:['pork'],countries:['MX'],mexicoStates:['PUE'],priceBasis:'carcass'},forecast:{horizon:5,label:'proxima semana',assumption:true}};
        const ambiguous=await buildPhysicalForecast(physicalPlan,{archive:restarted,learningStore:store,now});
        assert.equal(ambiguous.available,false,'No elige arbitrariamente entre unidades incompatibles');
        const exactSeries=(await restarted.series()).find(row=>row.identity.unit==='MXN/kg'&&row.identity.stateCode==='PUE'&&row.identity.priceBasis==='carcass');
        const exactArchive={series:async()=>[exactSeries]};
        const forecast=await buildPhysicalForecast(physicalPlan,{archive:exactArchive,learningStore:store,now});
        assert.equal(forecast.records[0].marketProfile.id,'protein_daily');assert(forecast.available);
        const trials=await restarted.list(forecast.records[0].ticker,5);assert.equal(trials.length,1);
        const original=structuredClone(trials[0]);
        const repeat=await restarted.save({...original,predicted_value:999});assert.equal(repeat.predicted_value,original.predicted_value);
        const augmented={...exactSeries,points:[...exactSeries.points,...Array.from({length:5},(_,i)=>({date:new Date(now+i*DAY).toISOString().slice(0,10),value:165+i}))]};
        const later=now+6*DAY;
        const review=await reviewForecastResults({repository:restarted,store,archive:{series:async()=>[augmented]},now:later});
        assert.equal(review.checked,1);assert.equal((await restarted.list(original.symbol,5))[0].status,'evaluated');
        assert.equal((await restarted.list(original.symbol,5))[0].predicted_value,original.predicted_value);
        assert.equal((await restarted.list(original.symbol,5)).length,1,'El trabajo de revisión no emite otro pronóstico');
        const reviewed=await store.review(original.symbol,5,augmented.points,{unit:'MXN/kg',priceBasis:'carcass · Canal',now:later});
        assert.equal(reviewed.summary.realEvaluations,1);assert.equal(reviewed.summary.storageBackend,'local_persistent');
        const limited=createForecastJournal({directory:path.join(directory,'quota'),maxBytes:10});
        await assert.rejects(limited.save(original),error=>error.code==='FORECAST_STORAGE_FULL');
        assert.equal((await restarted.list(original.symbol,5)).length,1,'La cuota no borra registros anteriores');
    } finally {assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});}
    const inputs=parseCommercialInputs('Compro 1000 kg de cerdo a 80 MXN/kg, vendo a 110 MXN/kg, merma 8%, flete 5000 MXN.');
    const calculation=calculateMargin(inputs);assert(calculation.available);
    const brief=decisionBrief({message:'Soy distribuidor. Qué conviene verificar',plan:{asksDecision:true,proteinProfile:{products:['pork']}},inputs});
    assert.equal(brief.business.breakEvenPerKg,85000/920);
    assert.equal(brief.business.profitChangePerOneBuyUnit,-1000);assert.equal(brief.business.profitChangePerOneSaleUnit,920);
    assert.match(commercialReply(calculation),/punto de equilibrio/);
    assert.match(brief.effect,/Si sube/);assert.match(brief.verification,/presentación/);
    const observed=decisionBrief({message:'Qué cambió en mis costos',plan:{proteinProfile:{products:['pork']}},evidence:{proteinPriceRecords:[{verified:true,product:'Cerdo',market:'Puebla',category:'Canal',value:80,unit:'MXN/kg',date:'2026-10-14',url:'https://example.org/prices'}]}});
    assert.equal(observed.facts[0].kind,'verified_physical_price');assert.match(observed.facts[0].text,/Puebla/);
    console.log('ORION cinco prioridades: periodos, respaldo por hallazgo y streaming, modelos por mercado, persistencia/revisión real, contexto local y decisiones cuantificadas OK');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
