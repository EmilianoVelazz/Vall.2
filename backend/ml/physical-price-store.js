'use strict';
const crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {journal,priceIdentity}=require('./forecast-journal');
const {sourceDate}=require('../ai/evidence-coverage');
let client;
function database() {
    if(client) return client;
    const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) throw Error('Almacén físico no configurado.');
    client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(2500)]):AbortSignal.timeout(2500)})}});
    return client;
}
function createPhysicalPriceStore({getClient=database,now=Date.now}={}) {
    return {
        backend:'supabase',
        async observe(records) {
            const today=new Date(now()).toISOString().slice(0,10);
            const observations=records.slice(0,128).flatMap(record=>{
                const identity=priceIdentity(record),date=sourceDate(record.date);
                if(!identity||!date||date>today||!Number.isFinite(record.value)||record.value<=0||record.value>=1e12) return [];
                const key=crypto.createHash('sha256').update(JSON.stringify(['physical',identity])).digest('hex');
                return [{key,identity,date,value:record.value}];
            });
            if(!observations.length) return 0;
            const {error}=await getClient().rpc('orion_observe_market_series',{observations});
            if(error) throw error;
            return new Set(observations.map(row=>row.key)).size;
        },
        async series(profile={}) {
            let query=getClient().from('orion_market_series').select('key,identity').limit(24);
            if(profile.products?.length) query=query.in('identity->>productId',profile.products);
            if(profile.countries?.length) query=query.in('identity->>countryCode',profile.countries);
            if(profile.mexicoStates?.length) query=query.in('identity->>stateCode',profile.mexicoStates);
            const {data,error}=await query;
            if(error) throw error;
            const result=[];
            for(let index=0;index<(data||[]).length;index+=4) {
                const batch=await Promise.all(data.slice(index,index+4).map(async row=>{
                    const response=await getClient().from('orion_market_observations').select('date,value,revised').eq('series_key',row.key).order('date',{ascending:false}).limit(740);
                    if(response.error) throw response.error;
                    return {...row,points:(response.data||[]).reverse().map(point=>({...point,value:Number(point.value)}))};
                }));
                result.push(...batch);
            }
            return result;
        },
    };
}
const physicalPriceStore=process.env.VERCEL&&process.env.ORION_FORECAST_STORAGE!=='local'||process.env.ORION_FORECAST_STORAGE==='supabase'?createPhysicalPriceStore():journal;
module.exports={createPhysicalPriceStore,physicalPriceStore};
