'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const esbuild=require(require.resolve('esbuild',{paths:[path.resolve('frontend')]})),outfile=path.resolve('output/granos-global-20261026/reader.cjs');
 const contents=`import React from './frontend/node_modules/react/index.js';
import {renderToStaticMarkup} from './frontend/node_modules/react-dom/server.node.js';
import {ReportReader} from './frontend/src/components/ExecutiveReportsHub.jsx';
import {weeklyReport} from './shared/report-weekly.mjs';
import {reportFilterOptions,filteredReportModel} from './shared/report-view-filters.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const warnings=[],originalError=console.error;console.error=(...args)=>warnings.push(String(args[0]));
const report=JSON.parse(fs.readFileSync('output/granos-global-20261026/report.json','utf8')),model=weeklyReport(report),options=reportFilterOptions(model,report);
for(const country of ['Brasil','Argentina','Sudáfrica','Tailandia','Vietnam','España','Austria','Hungría','Rumanía','Bulgaria','China']){assert(options.countries.includes(country),'Country filter: '+country);const view=filteredReportModel(model,report,{country});assert(view.references.length);assert(view.references.every(item=>item.country===country),'The filter keeps its own country only');}
for(const period of ['daily','weekly']){const html=renderToStaticMarkup(React.createElement(ReportReader,{report:{...report,analysisPeriod:period}}));assert(html.includes('Panorama mundial'));assert(html.includes('Cómo se explica y qué implica'));assert.equal(html.split('<h4>Opciones de commodities · call y put</h4>').length-1,1);assert.equal(html.split('<h4>Interés abierto de futuros · CME</h4>').length-1,1);for(const country of ['Brasil','Argentina','Sudáfrica','Tailandia','Vietnam','China','Francia'])assert(html.includes(country));assert(!html.includes('erh-weekly-kpis'));fs.writeFileSync('output/granos-global-20261026/reader-'+period+'.html',html);}
console.error=originalError;assert.deepEqual(warnings,[],'No React render warnings');console.log('Global grain reader: OK · real React daily/weekly renderer, 11 international country filters and one derivative section without duplicated tables.');`;
 const build=await esbuild.build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',nodePaths:[path.resolve('frontend/node_modules')],loader:{'.css':'empty'},plugins:[{name:'worker-url',setup(build){build.onResolve({filter:/\?url$/},args=>({path:args.path,namespace:'fixture-url'}));build.onLoad({filter:/.*/,namespace:'fixture-url'},()=>({contents:'export default "fixture-worker-url";',loader:'js'}));}}],write:false,logLevel:'silent'});
 await fs.writeFile(outfile,build.outputFiles[0].contents);require(outfile);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
