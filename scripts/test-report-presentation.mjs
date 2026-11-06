import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {reportPresentation,withoutSourcesText} from '../frontend/src/lib/reportPresentation.js';
const require=createRequire(import.meta.url),backend=require('../backend/lib/report-presentation');
process.env.JWT_SECRET='report-presentation-fixture';delete process.env.USER_PASSWORD;
const {_test}=require('../backend/routes/export');
const rules=require('../shared/report-presentation.json');
for(const heading of rules.hiddenSectionHeadings) {
    const content=`## Análisis\n38 MXN/kg\n## ${heading}\nENLACEANTIGUO\n### Referencia\nOTROENLACE\n## Conclusiones\nCONSERVARCIERRE`;
    const report={title:'Informe anterior',content,summary:'Referencia: 38 MXN/kg.',sections:[{heading,text:'FUENTEANTIGUA'},{heading:'Fuentes de financiamiento',text:'CONSERVARCREDITO'},{heading:'Análisis',text:content}],sourceLinks:[{label:'Evidencia original',url:'https://example.invalid/original'}],sources:['Evidencia original']};
    const original=JSON.stringify(report),visible=reportPresentation(report);
    assert.deepEqual(visible,backend.reportPresentation(report),'Misma presentación en servidor y navegador');
    assert.equal(withoutSourcesText(content),backend.withoutSourcesText(content));
    assert(!JSON.stringify(visible).includes('ENLACEANTIGUO'));assert(!JSON.stringify(visible).includes('FUENTEANTIGUA'));
    assert(visible.content.includes('CONSERVARCIERRE'));assert(visible.sections.some(section=>section.text==='CONSERVARCREDITO'));
    assert.deepEqual(visible.sourceLinks,report.sourceLinks);assert.deepEqual(visible.sources,report.sources);
    assert.equal(JSON.stringify(report),original,'Leer no sobrescribe la edición guardada');
    assert.strictEqual(reportPresentation(visible),visible,'La presentación es estable');
    const payload=_test.executivePayload({...report,userEdition:true});
    assert(!payload.sections.some(section=>section.heading===heading),'La exportación filtra apartados guardados');
}
const archived={title:'Informe guardado con apartado anterior',summary:'RESUMENCONSERVADO',userEdition:true,sections:[{heading:'FUENTES Y TRAZABILIDAD',text:'FUENTEQUEDEBEDESAPARECER'},{heading:'Conclusiones propias',text:'CIERRECONSERVADO'}],tables:[{title:'Tabla preservada',columns:['Producto','Precio'],rows:[['Pollo','38 MXN/kg']]}],sourceLinks:[{label:'Evidencia original',url:'https://example.invalid/original'}]};
for(const variant of [archived,{...archived,userEdition:false,collection:'mexico',key:'mx_overview'},{...archived,userEdition:false,collection:'finance',key:'overview'}]) {
    const bytes=await _test.makeExecutivePdf(variant.title,_test.executivePayload(variant)),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true}),pdf=await task.promise;let text='';
    for(let page=1;page<=pdf.numPages;page++)text+=(await(await pdf.getPage(page)).getTextContent()).items.map(item=>item.str).join(' ');
    assert(!text.includes('FUENTES Y TRAZABILIDAD'));assert(!text.includes('FUENTEQUEDEBEDESAPARECER'));
    assert(text.includes('38 MXN/kg'),'Conservar el dato');
    for(const value of ['RESUMENCONSERVADO','CIERRECONSERVADO']) assert(!text.includes(value),'La vista de datos omite '+value);
    await task.destroy();
}
console.log('Presentación: OK · texto legado, secciones guardadas, idiomas, caché, idempotencia, evidencia intacta y PDF');
