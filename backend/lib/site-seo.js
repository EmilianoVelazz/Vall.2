'use strict';
const path=require('node:path'),fs=require('node:fs');
const {site}=require('../../shared/site-seo.mjs');
const legacy=require('../../shared/legacy-routes.json');
function createSiteSeo({directory,production=true}={}){const routes=new Set([...Object.keys(site.pages),...Object.keys(site.privateRoutes)]),aliases={...legacy,'/vall-ai':'/orion'};return function siteSeo(req,res,next){
 if(req.path==='/api'||req.path.startsWith('/api/')){res.set('X-Robots-Tag','noindex');return next();}
 if(!['GET','HEAD'].includes(req.method))return next();
 const query=req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):'';const clean=req.path==='/'?'/':req.path.replace(/\/+$/,'');
 if(production && String(req.headers.host||'').toLowerCase().split(':')[0]==='www.vallnews.com')return res.redirect(308,site.origin+req.originalUrl);
 const destination=aliases[clean];if(destination)return res.redirect(production?308:302,destination+query);
 if(routes.has(clean.toLowerCase())&&clean!==clean.toLowerCase())return res.redirect(308,clean.toLowerCase()+query);
 const documentRoute=clean.endsWith('/index.html')?clean.slice(0,-11)||'/':clean.endsWith('.html')?clean.slice(0,-5):null;if(documentRoute && routes.has(documentRoute))return res.redirect(308,documentRoute+query);
 if(routes.has(clean)&&req.path!==clean)return res.redirect(308,clean+query);
 if(site.privateRoutes[clean])res.set('X-Robots-Tag','noindex, follow');
 if(!directory)return next();
 if(clean==='/404.html'){res.set('X-Robots-Tag','noindex');return res.status(404).sendFile(path.join(directory,'404.html'));}
 const file=clean==='/robots.txt'?'robots.txt':clean==='/sitemap.xml'?'sitemap.xml':routes.has(clean)?clean==='/'?'index.html':clean.slice(1)+'/index.html':null;
 if(!file)return next();const target=path.join(directory,file);if(!fs.existsSync(target))return next();res.set('Cache-Control','public, max-age=0, must-revalidate');if(file==='robots.txt')res.type('text/plain');if(file==='sitemap.xml')res.type('application/xml');return res.sendFile(target);
 };}
module.exports={createSiteSeo};
