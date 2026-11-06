import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import * as chartGeometry from '../shared/report-chart-geometry.mjs';
const require=createRequire(import.meta.url),PDFDocument=require('pdfkit');
const {makeCompanyDashboardPdf}=require('../backend/lib/report-company-dashboard-pdf');
const panels=[],headings=[];
class TracedDocument extends PDFDocument {
 roundedRect(x,y,w,h,r){if(r===6 && w>250)panels.push({page:this._vallPdfPageNumber,x,y,w,h});return super.roundedRect(x,y,w,h,r);}
 rect(x,y,w,h){if(w>250 && w<265 && h>30)panels.push({page:this._vallPdfPageNumber,x,y,w,h});return super.rect(x,y,w,h);}
 text(value,x,y,options){if(typeof value==='string' && /^ESP_/.test(value))headings.push({value,x,y,width:options?.width,page:this._vallPdfPageNumber});return super.text(value,x,y,options);}
}
const card=(heading,lines)=>({heading,body:Array.from({length:lines},(_,i)=>heading+'_PARRAFO_'+i+' Confirmar la fecha y la unidad antes de interpretar el movimiento observado.').join('\n\n')});
const visuals=[1,9,4,2,6].map((count,index)=>({type:'bar',title:'ESP_GRAFICA_'+index,unit:'%',bars:Array.from({length:count},(_,i)=>({label:'Referencia '+i,value:i+1})),reading:'La variación observada describe la referencia, sin confirmar su causa.'}));
const commentary=[card('Resumen',1),card('Cobertura',1),card('ESP_NOTICIAS',1),card('ESP_MOVIMIENTOS',6),card('ESP_CAUSAS',2),card('ESP_EFECTOS',2)];
const weekly={sessionReport:true,blocks:[{key:'charts',label:'Gráficas y lectura de la sesión'}],metrics:[],visuals,results:[],commentary,followup:[],tables:[]};
const report={title:'Simulación de espacios del PDF',generatedAt:'2026-10-21T14:00:00Z',summary:'Prueba de distribución sin cotizaciones reales.',sections:[],tables:[],metrics:[],visuals};
const helpers={weekly,PDFDocument:TracedDocument,layout:{collectionLabel:'Finanzas',label:'Simulación'},chartGeometry,pdfPersonalization:()=>({}),pdfPageHeader:document=>{document.x=36;document.y=65;},pdfExecutiveFooter:()=>{},pdfWatermark:()=>{}};
const before=JSON.stringify({weekly,report});
const bytes=await makeCompanyDashboardPdf(report.title,report,helpers);
const at=value=>headings.find(item=>item.value===value);
const first=at('ESP_GRAFICA_0'),tall=at('ESP_GRAFICA_1'),following=at('ESP_GRAFICA_2');
assert.equal(first.page,tall.page);assert.equal(following.page,first.page);assert.equal(following.x,first.x);assert(following.y<tall.y+200,'Una gráfica no espera a la tarjeta más alta para comenzar');
panels.length=0;headings.length=0;helpers.weekly={...weekly,visuals:[]};
const narrativeBytes=await makeCompanyDashboardPdf(report.title,{...report,visuals:[]},helpers);
const news=at('ESP_NOTICIAS'),moves=at('ESP_MOVIMIENTOS'),causes=at('ESP_CAUSAS');
assert.equal(news.page,moves.page);assert.equal(causes.page,news.page);
for(const x of [...new Set(panels.map(panel=>panel.x))]){
 const stack=panels.filter(panel=>panel.x===x && panel.y>=news.y-4).sort((a,b)=>a.y-b.y);
 for(let i=1;i<stack.length;i++)assert(stack[i].y-stack[i-1].y-stack[i-1].h<=6.1,'Sin huecos entre explicaciones de la misma columna');
}
for(const box of panels){assert(box.y>=65);assert(box.y+box.h<=841.89-78+.1,'Tarjeta dentro del cuerpo de la página');}
for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
 const a=panels[i],b=panels[j];if(a.page!==b.page)continue;
 const overlapX=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),overlapY=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
 assert(overlapX<=.1 || overlapY<=.1,'Las tarjetas no se superponen');
}
assert.equal(JSON.stringify({weekly,report}),before,'La distribución conserva el modelo y sus datos');
assert(bytes.length>1000);
const task=getDocument({data:new Uint8Array(narrativeBytes),useSystemFonts:true}),pdf=await task.promise;let content='';
for(let n=1;n<=pdf.numPages;n++)content+=(await(await pdf.getPage(n)).getTextContent()).items.map(item=>item.str).join(' ')+' ';
for(const item of commentary.slice(2))for(let i=0;i<(item.heading==='ESP_MOVIMIENTOS'?6:item.heading==='ESP_NOTICIAS'?1:2);i++)assert(content.includes(item.heading+'_PARRAFO_'+i),'Conservar todos los párrafos');
await task.destroy();
// Use the remaining full width before giving a short closing its own page.
panels.length=0;headings.length=0;
helpers.weekly={...weekly,visuals:[],commentary:[...commentary.slice(0,2),...Array.from({length:4},(_,i)=>card('ESP_BLOQUE_'+i,4)),card('ESP_ANCHO',13)]};
const wideBytes=await makeCompanyDashboardPdf(report.title,{...report,visuals:[]},helpers);
assert(at('ESP_ANCHO'),'El cierre permanece dentro del documento');
const wideTask=getDocument({data:new Uint8Array(wideBytes),useSystemFonts:true}),widePdf=await wideTask.promise;
assert.equal(widePdf.numPages,1,'Sin una hoja adicional para un cierre que cabe a lo ancho');await wideTask.destroy();
// A card taller than a column must flow before creating a nearly empty sheet.
panels.length=0;headings.length=0;
const long=card('ESP_TEXTO_LARGO',45);helpers.weekly={...weekly,visuals:[],commentary:[...commentary.slice(0,2),long,card('ESP_CIERRE',1)]};
const longBytes=await makeCompanyDashboardPdf(report.title,{...report,visuals:[]},helpers);
const longTask=getDocument({data:new Uint8Array(longBytes),useSystemFonts:true}),longPdf=await longTask.promise;let longText='';
for(let n=1;n<=longPdf.numPages;n++){
 const page=await longPdf.getPage(n),items=(await page.getTextContent()).items;assert(items.length>2,'Sin hojas vacías durante una continuación');longText+=items.map(item=>item.str).join(' ')+' ';
 for(const item of items.filter(item=>item.str.trim()))assert(item.transform[5]>=70,'El texto no invade el pie de página');
}
for(let i=0;i<45;i++)assert(longText.includes('ESP_TEXTO_LARGO_PARRAFO_'+i),'Texto largo completo: '+i);
assert(longText.includes('ESP_CIERRE_PARRAFO_0'));await longTask.destroy();
console.log('Espacios PDF: OK · columnas independientes, contenido completo, tarjetas sin colisiones, márgenes y texto largo sin hojas vacías.');
