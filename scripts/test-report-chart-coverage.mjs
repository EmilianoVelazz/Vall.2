import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportLineSeries} from '../frontend/src/lib/reportVisualData.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-chart-coverage';
const {enrichSectorReport}=require('../backend/lib/report-sector-format');
const collections=require('../shared/report-collections.json');
const reports={};
for(const [collection,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']]) {
  const snapshot=JSON.parse(await fs.readFile(path.resolve('backend/cache',file),'utf8'));
  reports[collection]=snapshot.reports.map(report=>enrichSectorReport({...report,collection},collection));
  for(const report of reports[collection]) {
    if(/news/.test(report.key)) continue;
    const model=weeklyReport(report);
    if(model.panorama){assert(model.panorama.chapters.length,'Panorama retains its specialist chapters');continue;}
    if(model.visuals.length)assert(model.blocks.some(block=>block.key==='charts' || block.key==='fxTreasury'),'Las gráficas disponibles conservan su bloque: '+collection+'/'+report.key);
    for(const visual of model.visuals) {
      if(visual.yieldCurve){assert(visual.curvePoints.length>=2,'La curva soberana mantiene varios vencimientos');continue;}
      if(visual.type==='line') {
        const parsed=reportLineSeries(visual);
        assert(parsed.series.length,'Las series de una sola observación siguen siendo visibles');
        assert(parsed.dates.length>0,'El eje conserva las fechas observadas');
        if(visual.dailyComparison)assert.equal(parsed.dates.length,2,'Una comparación explícitamente diaria conserva sus dos sesiones');
        for(const series of visual.series)for(const point of series.points){assert(Number.isFinite(point.value));assert(Number.isFinite(Date.parse(point.date)));assert(Date.parse(point.date)<=Date.parse(report.generatedAt),'No se muestran observaciones futuras: '+report.key);assert(parsed.dates.includes(Date.parse(point.date)),'Cada observación conserva su fecha en el eje');}
      } else for(const bar of visual.bars) assert(bar.value===null || Number.isFinite(bar.value));
    }
    const historical=(model.references || []).some(reference=>(reference.points || []).length>=3);
    if(historical)assert(model.visuals.some(visual=>visual.type==='line' || visual.yieldCurve || visual.equityYears),'El histórico disponible tiene una representación visual: '+report.key);
    assert.equal(weeklyReport({...report,personalization:{sections:{charts:false}}}).visuals.length,0,'Respetar una exclusión explícita');
    console.log(collection+'/'+report.key+': '+model.visuals.filter(visual=>visual.type==='line').length+' evolución, '+model.visuals.filter(visual=>visual.type==='bar').length+' comparación');
  }
}
// Optional, read-only local preview using the actual cached cuts. No AI or SMTP.
if(process.argv.includes('--serve')) {
  if(process.argv.includes('--fx-demo')) {
    const config=require('../shared/report-fx.json'),cut=new Date().toISOString(),window=weeklyReport({generatedAt:cut}).window;
    const values=[18,150,.85,.75,1.35,5.2,7.1,200,80];
    reports.finance=[{collection:'finance',key:'fx',title:'Divisas · simulación de formato',generatedAt:cut,summary:'Datos de simulación para revisar las dos gráficas; no son cotizaciones actuales.',sections:[],metrics:[],visuals:[],tables:[],dailyReferences:config.currencies.map((currency,index)=>({label:'USD/'+currency.code+' · '+currency.name,unit:currency.code+' por 1 USD',points:[{date:window.yesterday,value:values[index]},{date:window.today,value:values[index]*(1+(index-4)*.005)}]}))}];
  }
  const express=require('express'),app=express();app.use(express.json({limit:'7mb'}));
  app.use('/api',(req,res)=>{
    if(req.method!=='GET') return res.status(405).json({success:false,error:'Vista de prueba: acciones desactivadas.'});
    if(req.path==='/verify-token') return res.json({success:true,email:'chart-review@example.invalid'});
    if(req.path==='/profile') return res.json({success:true,profile:{email:'chart-review@example.invalid',preferences:{}}});
    for(const [collection,definition] of Object.entries(collections)) if(req.path===definition.endpoint?.replace('/api','')) return res.json({success:true,data:reports[collection] || []});
    return res.json({success:true,data:[]});
  });
  app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
  const server=app.listen(0,'127.0.0.1',()=>console.log('PREVIEW_URL=http://127.0.0.1:'+server.address().port+'/informes'));
} else console.log('Cobertura real: gráficas diarias e históricas con fechas, datos finitos, cortes respetados y capítulos de Panorama conservados.');
