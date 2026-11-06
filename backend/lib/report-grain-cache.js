'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {dailyPoints} = require('./report-observations');
const units = {'dgagri-grains':'EUR/t','cepea-grains':'BRL/saco 60 kg','dgagri-world':'USD/t','worldbank-grains':'USD/t','applied-derivatives':'ZAR/t','sagyp-grains':'USD/t'};
const DEFAULT_GRAIN_CACHE = path.join(__dirname, '..', 'cache', 'global_grain_prices.json');
const grainIdentity = item => JSON.stringify([item.provider,item.ticker,item.unit,item.basis]);
const validGrainUnit=item=>item.provider==='fpma-grains' ? /^[A-Z]{3}$/.test(item.currency || '') && item.unit.startsWith(item.currency+'/') && /\/(?:kg|t|100 kg|quintal 46 kg|100 lb)$/.test(item.unit) && /^FPMA-GRAIN-[a-f0-9-]{36}$/.test(item.ticker || '') : Object.hasOwn(units,item.provider) && item.unit===units[item.provider];

// Cache only the same published series. A later retrieval may revise its own
// overlapping dates; neither the observation nor retrieval date is fabricated.
function mergeGrainQuotes(input, cutoff) {
    const quotes = new Map();
    for (const item of [...input].filter(item => item && typeof item.unit==='string' && validGrainUnit(item) && ['daily','weekly','monthly'].includes(item.cadence) && item.bucket==='grains' && typeof item.ticker==='string' && item.ticker.length<=200 && typeof item.basis==='string').sort((a,b) => (Date.parse(a.retrievedAt)||0)-(Date.parse(b.retrievedAt)||0))) {
        if (/^(?:AR-FOB-|SAFEX-)/.test(item.ticker) && item.ticker.slice(-7)<cutoff.slice(0,7)) continue;
        const id = grainIdentity(item), prior = quotes.get(id), points = new Map((prior?.series || []).map(point => [point.date,point]));
        for (const point of dailyPoints(item.series,cutoff)) if (point.value>0 && point.date>='2020-01-01') points.set(point.date,point);
        const series = [...points.values()].sort((a,b) => a.date.localeCompare(b.date)).slice(-2500);
        if (series.length) {
            const last=series.at(-1),before=series.at(-2),daily=item.cadence==='daily';
            const change=daily && before?.value>0 ? (last.value/before.value-1)*100 : null;
            quotes.set(id,{...item,series,value:last.value,observedAt:last.date,previous:daily ? before?.value ?? null : null,change,performance:{day:change}});
        }
    }
    return [...quotes.values()].sort((a,b) => b.series.at(-1).date.localeCompare(a.series.at(-1).date)).slice(0,96);
}
async function readGrainCache(file, cutoff) {
    if (!file) return [];
    try {
        if ((await fs.stat(file)).size>15*1024*1024) return [];
        const stored = JSON.parse(await fs.readFile(file,'utf8'));
        return stored.version===1 && Array.isArray(stored.quotes) && stored.quotes.length<=96 ? mergeGrainQuotes(stored.quotes,cutoff) : [];
    } catch { return []; }
}
let writing = Promise.resolve();
function saveGrainCache(file, quotes, cutoff) {
    if (!file || !quotes.length) return Promise.resolve();
    writing = writing.catch(() => {}).then(async () => {
        const storageCutoff=new Date(Math.max(Date.now(),Date.parse(cutoff))).toISOString();
        const merged = mergeGrainQuotes([...await readGrainCache(file,storageCutoff),...quotes],storageCutoff);
        if (!merged.length) return;
        const content = JSON.stringify({version:1,quotes:merged});
        if (Buffer.byteLength(content)>15*1024*1024) return;
        await fs.mkdir(path.dirname(file),{recursive:true});
        const temporary = file+'.'+process.pid+'.tmp';
        try { await fs.writeFile(temporary,content); await fs.rename(temporary,file); }
        finally { await fs.rm(temporary,{force:true}).catch(() => {}); }
    });
    return writing.catch(() => {});
}
module.exports = {DEFAULT_GRAIN_CACHE,grainIdentity,mergeGrainQuotes,readGrainCache,saveGrainCache};
