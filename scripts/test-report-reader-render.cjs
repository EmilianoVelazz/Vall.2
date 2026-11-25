'use strict';
// Exercise the actual React reader without a browser, remote account or network.
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const esbuild=require(require.resolve('esbuild',{paths:[path.resolve('frontend')]}));
 const outfile=path.resolve('output/report-reader-render-fixture.cjs');
 const contents=`import React from './frontend/node_modules/react/index.js';
import {renderToStaticMarkup} from './frontend/node_modules/react-dom/server.node.js';
import {ReportReader} from './frontend/src/components/ExecutiveReportsHub.jsx';
import AnnualReportsLibrary from './frontend/src/components/AnnualReportsLibrary.jsx';
import fs from 'node:fs';import assert from 'node:assert/strict';
const original=console.error,warnings=[];console.error=(...args)=>{if(!String(args[0]).includes('useLayoutEffect does nothing on the server'))warnings.push(String(args[0]));};
let count=0;for(const [collection,file]of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])for(const report of JSON.parse(fs.readFileSync('backend/cache/'+file+'.json','utf8')).reports){const html=renderToStaticMarkup(React.createElement(ReportReader,{report:{...report,collection}}));assert(html.includes('erh-reader') || html.includes('erh-panorama') || html.includes('erh-news-brief') || html.includes('erh-history-method'));if(report.key==='fx' && html.includes('erh-reader')){assert(html.includes('erh-fx-treasury'));assert(!html.includes('erh-market-chart-table'),'Currency results are shown once in the main tables');}if(report.key==='equities' && html.includes('erh-reader')){assert(html.includes('erh-equity-desk'),'Equities renders executive desk');assert(!html.includes('erh-market-chart-table'),'Do not repeat result tables below equity chart');}count++;if(['equities','fx','grains','energy_metals','proteins'].includes(report.key)){const weekly=renderToStaticMarkup(React.createElement(ReportReader,{report:{...report,collection,analysisPeriod:'weekly'}}));assert(weekly.includes('erh-reader'));count++;}}
const derivatives=JSON.parse(fs.readFileSync('backend/data/commodity-derivatives-public-2026-10-23.json','utf8'));
for(const source of JSON.parse(fs.readFileSync('backend/cache/market_executive_reports.json','utf8')).reports.filter(report=>['grains','energy_metals','proteins'].includes(report.key))){const report={...source,collection:'markets',generatedAt:derivatives.checkedAt,marketDerivatives:derivatives};const html=renderToStaticMarkup(React.createElement(ReportReader,{report}));assert(html.includes('erh-reader'));count++;}
assert(renderToStaticMarkup(React.createElement(AnnualReportsLibrary,{accountEmail:'fixture@example.invalid'})).includes('Librería anual'));
console.error=original;assert.deepEqual(warnings,[]);console.log('React reader: OK · '+count+' daily/weekly readers, annual library, no render errors or initial KPI cards.');`;
 const result=await esbuild.build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',nodePaths:[path.resolve('frontend/node_modules')],loader:{'.css':'empty'},plugins:[{name:'vite-url-for-server-render',setup(build){build.onResolve({filter:/\?url$/},args=>({path:args.path,namespace:'fixture-url'}));build.onLoad({filter:/.*/,namespace:'fixture-url'},()=>({contents:'export default "fixture-worker-url";',loader:'js'}));}}],write:false,logLevel:'silent'});
 await fs.writeFile(outfile,result.outputFiles[0].contents);require(outfile);
})().catch(error=>{process.stderr.write(String(error.stack || error)+'\n');process.exitCode=1;});
