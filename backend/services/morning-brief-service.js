'use strict';
const {composeMorningBrief}=require('../lib/morning-brief-model');
const {createSingleFlight}=require('../lib/bounded-cache');
const {reportDeadline}=require('../lib/report-deadline');

function createMorningBriefService({
    loadFinance=()=>require('./finance-report-store').load(),
    loadMarkets=()=>require('./market-report-store').load(),
    loadMexico=()=>require('./mexico-executive-reports').mexicoReports.get(),
    now=Date.now,ttlMs=30000,timeoutMs=12000,
}={}) {
    const sourceFlight=createSingleFlight(3),briefFlight=createSingleFlight(1),lastSources=new Map();
    let cached=null,expiresAt=0;
    return function buildMorningBrief(){
        if(cached && now()<expiresAt)return Promise.resolve(cached);
        return briefFlight('brief',async()=>{
            const snapshots={},sourceErrors=[];
            await Promise.all([['finance',loadFinance],['markets',loadMarkets],['mexico',loadMexico]].map(async([area,load])=>{
                try {
                    // An unresponsive provider retains one pending operation,
                    // even if it ignores the deadline's cancellation signal.
                    const snapshot=await reportDeadline(signal=>sourceFlight(area,()=>load(signal)),timeoutMs);
                    if(!snapshot?.reports?.length)throw Error('Sin corte publicado.');
                    lastSources.set(area,snapshot);snapshots[area]=snapshot;
                } catch {sourceErrors.push(area);snapshots[area]=lastSources.get(area) || null;}
            }));
            const brief={...composeMorningBrief(snapshots,{now:now()}),stale:sourceErrors.length>0,sourceErrors};
            cached=brief;expiresAt=now()+ttlMs;
            return brief;
        });
    };
}

const buildMorningBrief=createMorningBriefService();
module.exports={buildMorningBrief,createMorningBriefService};
