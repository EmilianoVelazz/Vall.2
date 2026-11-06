'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const esbuild=require(require.resolve('esbuild',{paths:[path.resolve('frontend')]})),{parse}=await import('parse5'),{missingReportValue}=await import('../shared/report-available-data.mjs');
 const directory=path.resolve('output/report-availability');await fs.mkdir(directory,{recursive:true});
 const code=`import React from './frontend/node_modules/react/index.js';import {renderToStaticMarkup} from './frontend/node_modules/react-dom/server.node.js';import {ReportReader} from './frontend/src/components/ExecutiveReportsHub.jsx';import fs from 'node:fs';
 const reports=[];for(const [collection,name]of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])reports.push(...JSON.parse(fs.readFileSync('backend/cache/'+name+'.json')).reports.map(report=>({...report,collection})));
 reports.push(...Object.values(JSON.parse(fs.readFileSync('backend/cache/annual-report-library.json')).years).flat());
 reports.push(...reports.filter(report=>!report.reportYear && report.key!=='overview' && !report.key.endsWith('news')).map(report=>({...report,analysisPeriod:'weekly'})));
 const fx=reports.find(report=>report.key==='fx'&&!report.reportYear);reports.push({...fx,key:'fx',id:'fx-no-optional',fxTreasury:null});
 module.exports=reports.map(report=>{const before=JSON.stringify(report),html=renderToStaticMarkup(React.createElement(ReportReader,{report}));if(JSON.stringify(report)!==before)throw Error('Reader mutated original report');return {key:[report.collection,report.key,report.reportYear||'day',report.analysisPeriod||'day',report.id||''].join('-'),html};});`;
 const result=await esbuild.build({stdin:{contents:code,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',nodePaths:[path.resolve('frontend/node_modules')],loader:{'.css':'empty'},plugins:[{name:'worker-url',setup(build){build.onResolve({filter:/\?url$/},args=>({path:args.path,namespace:'fixture-url'}));build.onLoad({filter:/.*/,namespace:'fixture-url'},()=>({contents:'export default "fixture-worker-url";',loader:'js'}));}}],write:false,logLevel:'silent'});
 const filename=path.join(directory,'readers.cjs');await fs.writeFile(filename,result.outputFiles[0].text);const readers=require(filename);let cells=0;const layouts=[];
 const text=node=>(node.nodeName==='#text' ? node.value : (node.childNodes||[]).map(text).join('')).trim();
 for(const reader of readers){const tree=parse(reader.html),visit=node=>{
  if(node.tagName==='td' || node.tagName==='th'){const value=text(node);assert(!missingReportValue(value),reader.key+': missing table cell '+value);cells++;}
  if(node.tagName==='table')assert(text(node).length>0,reader.key+': empty table');
  for(const child of node.childNodes||[])visit(child);
 };visit(tree);assert(!/NaN|undefined|Infinity/.test(reader.html),reader.key+': invalid display value');
 const chapter=reader.html.indexOf('class="erh-panorama-chapter"'),content=reader.html.slice(chapter>=0 ? chapter : 0),firstTable=content.indexOf('<table'),firstChart=content.indexOf('<svg'),tables=(reader.html.match(/<table/g)||[]).length;
 if(firstTable>=0 && firstChart>=0)assert(firstTable<firstChart,reader.key+': published data tables must precede line-chart explorers');
 layouts.push({key:reader.key,tables,firstTable,firstChart});}
 const noOptional=readers.at(-1).html;assert(!noOptional.includes('erh-fx-thermometer'),'No empty DXY card');assert(!noOptional.includes('Sin tasas comparables'),'No unavailable forwards panel');
 await fs.writeFile(path.join(directory,'reader-validation.json'),JSON.stringify({readers:readers.length,cells,layouts},null,2));
 console.log('Report readers: '+readers.length+' daily/weekly/annual variants, '+cells+' populated table cells; no missing DXY/forward cards or invalid numbers.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
