'use strict';
const feeds=require('../../shared/report-primary-news.json');
const {externalGet}=require('./http');
const {reportDeadline}=require('./report-deadline');
const {textOnly}=require('../services/mercolleida-public');
const cache=new Map(),pending=new Map();
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
const clean=value=>textOnly(String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')).replace(/\s+/g,' ').trim();
function parsePrimaryNews(xml,feed) {
    if(typeof xml!=='string' || xml.length>2000000 || !/<rss\b|<feed\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('RSS primario no válido');
    const articles=[];
    for(const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
        const field=name=>item[1].match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1] || '';
        const title=clean(field('title')).slice(0,500),raw=clean(field('link')),stamp=Date.parse(clean(field('pubDate')));
        let url;try {url=new URL(raw);}catch {continue;}
        if(!title || !Number.isFinite(stamp) || !['https:','http:'].includes(url.protocol) || url.username || url.password || !(url.hostname===feed.host || url.hostname.endsWith('.'+feed.host)))continue;
        // Normalise the legacy http links of official feeds, keeping their origin.
        url.protocol='https:';
        articles.push({title,url:url.href,publishedAt:new Date(stamp).toISOString(),source:feed.source,sourceType:'primary',provider:feed.id,region:feed.region,description:clean(field('description')).slice(0,800)});
    }
    return articles;
}
function publisher(item) {
    // Group syndication by the credited publisher, rather than by API distributor.
    const name=String(item.source || '').toLowerCase();
    for(const [key,match] of [['reuters',/reuters/],['ap',/associated press|^ap news$/],['bloomberg',/bloomberg/],['ecb',/bce|european central bank/],['fao',/fao/],['wto',/omc|wto/],['eia',/^eia/]])if(match.test(name))return key;
    if(name)return name.replace(/^www\./,'').trim();
    try{return new URL(item.url).hostname.replace(/^www\./,'');}catch{return 'unknown';}
}
function selectDiverseNews(items,{limit=12,maxPerSource=2,cutoff=new Date().toISOString(),daily=true}={}) {
    const end=Date.parse(cutoff);if(!Number.isFinite(end))return [];
    const counts=new Map(),urls=new Set(),titles=new Set(),result=[];
    // Preserve the caller's relevance order, while preventing one publisher from dominating.
    for(const item of items) {
        const time=Date.parse(item.publishedAt),title=clean(item.title),key=title.toLowerCase(),source=publisher(item);
        let url;try{url=new URL(item.url);}catch{continue;}
        if(!title || !['http:','https:'].includes(url.protocol) || !Number.isFinite(time) || time>end || daily && day.format(new Date(time))!==day.format(new Date(end)) || urls.has(url.href) || titles.has(key) || (counts.get(source) || 0)>=maxPerSource)continue;
        counts.set(source,(counts.get(source) || 0)+1);urls.add(url.href);titles.add(key);result.push({...item,title,publishedAt:new Date(time).toISOString()});
        if(result.length>=limit)break;
    }
    return result;
}
async function loadPrimaryNews({area,cutoff=new Date().toISOString(),get=externalGet,timeoutMs=4500,useCache=true,daily=true}={}) {
    const results=await Promise.all(feeds.filter(feed=>feed.areas.includes(area)).map(async feed=>{
        const key=feed.id,hit=cache.get(key);
        if(useCache && hit && Date.now()-hit.time<15*60000)return hit.articles;
        if(useCache && pending.has(key))return pending.get(key);
        const request=reportDeadline(async()=>{const response=await get(feed.url,{Accept:'application/rss+xml, application/xml, text/xml'},timeoutMs);if(!response.ok)throw Error('RSS no disponible');const articles=parsePrimaryNews(await response.text(),feed);if(useCache)cache.set(key,{time:Date.now(),articles});return articles;},timeoutMs).catch(()=>[]).finally(()=>{if(useCache)pending.delete(key);});
        if(useCache)pending.set(key,request);return request;
    }));
    // Interleave institutions so a prolific feed cannot displace entire regions.
    const sorted=results.map(items=>items.toSorted((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)));
    const interleaved=Array.from({length:Math.max(0,...sorted.map(items=>items.length))},(_,i)=>sorted.flatMap(items=>items[i] ? [items[i]] : [])).flat();
    return selectDiverseNews(interleaved,{limit:12,maxPerSource:2,cutoff,daily});
}
module.exports={feeds,parsePrimaryNews,loadPrimaryNews,selectDiverseNews};
