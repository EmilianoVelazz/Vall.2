'use strict';
const { learningRepository, learningStore } = require('./forecast-learning-store');
const { physicalPriceStore } = require('./physical-price-store');
const { loadForecast } = require('../ai/forecast-analysis');
const { buildPhysicalForecast } = require('../ai/physical-forecast');
const { INSTRUMENTS } = require('../ai/statistical-analysis');
const { externalGet } = require('../lib/http');

let running;
async function reviewForecastResults({repository=learningRepository,store=learningStore,archive=physicalPriceStore,get=externalGet,now=Date.now(),limit=24,signal=AbortSignal.timeout(30_000)}={}) {
    const pending=await repository.pending(Math.min(24,limit));
    const results=[],downloads=new Map();
    let physical;
    const cachedGet=(url,headers,timeout,options)=>{
        if(!downloads.has(url)) downloads.set(url,Promise.resolve(get(url,headers,timeout,options)));
        return downloads.get(url);
    };
    for(let index=0;index<pending.length;index+=3) {
        await Promise.all(pending.slice(index,index+3).map(async row=>{
            try {
                signal.throwIfAborted();
                if(row.symbol.startsWith('P:')) {
                    physical ||= archive.series();
                    const series=(await physical).find(series=>'P:'+series.key.slice(0,16)===row.symbol);
                    if(!series) throw Error('Serie física pendiente no disponible.');
                    const identity=series.identity;
                    const weekly=identity.frequency==='weekly';
                    const plan={proteinProfile:{products:[identity.productId],countries:[identity.countryCode],mexicoStates:identity.stateCode?[identity.stateCode]:[],priceBasis:identity.priceBasis},
                        forecast:{horizon:weekly?row.horizon*5:row.horizon,label:weekly?`${row.horizon} semanas`:`${row.horizon} sesiones`,assumption:weekly}};
                    const result=await buildPhysicalForecast(plan,{archive:{series:async()=>[series]},learningStore:store,now,reviewOnly:true,signal});
                    const record=result.records?.[0];
                    results.push({...row,status:record?.learning?.storageStatus==='connected'?'reviewed':'unavailable',realEvaluations:record?.learning?.realEvaluations || 0});
                } else {
                    if(!/^(?:\^?[A-Z0-9]{1,12}(?:\.[A-Z0-9]{1,5})?|[A-Z0-9]{1,12}=[FX]|[A-Z0-9]{2,12}-[A-Z]{3})$/.test(row.symbol)) throw Error('Símbolo no permitido.');
                    const instrument=INSTRUMENTS.find(instrument=>instrument.ticker===row.symbol)||{ticker:row.symbol,name:row.symbol};
                    const result=await loadForecast(instrument,row.horizon,{get:cachedGet,now,learningStore:store,reviewOnly:true,signal});
                    results.push({...row,status:result.learning?.storageStatus==='connected'?'reviewed':'unavailable',realEvaluations:result.learning?.realEvaluations || 0});
                }
            } catch { results.push({...row,status:signal.aborted?'timeout':'unavailable'}); }
        }));
    }
    return { checked:results.filter(row=>row.status==='reviewed').length,failed:results.filter(row=>row.status!=='reviewed').length,results,reviewedAt:new Date(now).toISOString() };
}
function runForecastReview() {
    if(!running) running=reviewForecastResults().finally(()=>{running=null;});
    return running;
}
module.exports={reviewForecastResults,runForecastReview};
