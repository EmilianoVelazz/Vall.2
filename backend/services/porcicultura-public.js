'use strict';

const { fetchPublicPage } = require('./mercolleida-public');
const { STATES, requestedMexicoStates } = require('./mexico-price-scope');
const { normalizeForIntent } = require('../ai/conversation-context');
const API = 'https://api-economia.pecuarios.com/precio_cerdo/getDay';
const PAGE = 'https://www.porcicultura.com/economia/precios-del-cerdo-en-pie-en-mexico';
function parsePorciculturaPrices(payload, period, today) {
    const latest = new Map();
    const conflicts = new Set();
    for (const day of Array.isArray(payload?.data) ? payload.data : []) {
        const date = day?.fecha;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
            || new Date(date).toISOString().slice(0,10) !== date || date > today || date < period.start || date > period.end
            || !Array.isArray(day.estados)) continue;
        for (const item of day.estados) {
            const state = STATES.find(state=>state.normalized === normalizeForIntent(item?.nombre));
            const price = item?.precio;
            if (!state || !['number','string'].includes(typeof price) || !/^\d+(?:\.\d+)?$/.test(String(price))
                || !Number.isFinite(Number(price)) || Number(price) <= 0) continue;
            const value = Number(price);
            const prior = latest.get(state.code);
            if (prior?.date === date && prior.value !== value) conflicts.add(`${state.code}:${date}`);
            if (!prior || prior.date < date) latest.set(state.code, {
                product:'Cerdo',productId:'pork',country:'México',countryCode:'MX',stateCode:state.code,
                market:state.name,category:'Cerdo en pie · referencia estatal',priceBasis:'live',value,
                priceType:'reported_price',currency:'MXN',unit:'MXN/kg vivo',date,frequency:'daily_report',
                basis:'Referencia estatal de cerdo en pie; no carne en canal, cortes ni oferta de un proveedor',
                source:'Porcicultura.com · Pecuarios',sourceCode:'porcicultura_live_pork_prices',url:PAGE,dataUrl:API,verified:true,
            });
        }
    }
    return [...latest.values()].filter(record=>!conflicts.has(`${record.stateCode}:${record.date}`));
}
function createPorciculturaClient({fetchPage=fetchPublicPage,now=Date.now}={}) {
    let cache = null; let pending = null;
    return {async getDetailed(profile,period) {
        const states = profile.mexicoStates || requestedMexicoStates(profile.query);
        const report = {productId:'pork',source:'Porcicultura.com',url:PAGE,period};
        try {
            const records = await this.get(profile,period);
            if (!profile.products.includes('pork') || !profile.countries.includes('MX') || profile.futures
                || profile.priceSource === 'sniim' || profile.specificPrice && profile.priceBasis !== 'live'
                || profile.priceBasis && profile.priceBasis !== 'live') return {records,coverage:[]};
            const national = parsePorciculturaPrices(cache?.payload,period,new Date(now()).toISOString().slice(0,10));
            return {records,coverage:(states.length ? states : [null]).map(stateCode=>({...report,stateCode,
                status:records.some(record=>!stateCode || record.stateCode===stateCode) ? 'available' : national.length ? 'no_state_records' : 'no_usable_records'}))};
        } catch {
            return {records:[],coverage:(states.length ? states : [null]).map(stateCode=>({...report,stateCode,status:'source_error'}))};
        }
    },async get(profile,period) {
        if (!profile.products.includes('pork') || !profile.countries.includes('MX') || profile.futures
            || profile.priceSource === 'sniim' || profile.specificPrice && profile.priceBasis !== 'live'
            || profile.priceBasis && profile.priceBasis !== 'live') return [];
        if (!cache || cache.expires <= now()) {
            if (!pending) pending = (async()=>{
                const response = await fetchPage(API,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)});
                if (!response.ok) throw new Error(`Porcicultura HTTP ${response.status}`);
                const text = await response.text();
                if (Buffer.byteLength(text)>1024*1024) throw new Error('Porcicultura: respuesta demasiado grande');
                cache = {payload:JSON.parse(text),expires:now()+5*60_000};
            })().finally(()=>{pending=null;});
            await pending;
        }
        const records = parsePorciculturaPrices(cache.payload,period,new Date(now()).toISOString().slice(0,10));
        const states = profile.mexicoStates || requestedMexicoStates(profile.query);
        return states.length ? records.filter(record=>states.includes(record.stateCode)) : records;
    }};
}
module.exports = { API, PAGE, parsePorciculturaPrices, createPorciculturaClient };
