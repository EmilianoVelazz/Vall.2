import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='offline-grouped-chart-export-test';
const {_test}=require('../backend/routes/export');
const report=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')).reports.find(report=>report.key==='energy_metals');
for(const period of ['daily','weekly']){
  const input={...report,analysisPeriod:period},before=JSON.stringify(input);
  const bytes=await _test.makeExecutivePdf(input.title,_test.executivePayload(input));
  assert.equal(JSON.stringify(input),before);
  const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true}),pdf=await task.promise;
  let text='';
  for(let page=1;page<=pdf.numPages;page++){
    const content=await(await pdf.getPage(page)).getTextContent(),words=content.items.filter(item=>item.str?.trim()),body=words.filter(item=>item.transform[5]>78 && item.transform[5]<775);
    const ownText=body.map(item=>item.str).join(' ');text+=ownText+' ';
    assert(body.length>8,'No isolated methodology page after grouping: '+period+'/'+page);
    if(page<pdf.numPages && ownText.includes('Unidad:')){
      const last=Math.min(...body.map(item=>item.transform[5]));
      assert(last<400,'Do not move a group onto another page while leaving most of the current sheet unused');
    }
  }
  assert.equal(text.match(/Se conserva la unidad, presentación y frecuencia de cada fuente\./g)?.length,1,'One copy of the common methodology for published prices');
  assert(text.includes('Petróleo WTI') && text.includes('Petróleo Brent'),'Both benchmark labels remain in the export');
  await task.destroy();
}
console.log('Grouped PDF exports: OK · daily/weekly, all benchmark labels, common methodology once, no isolated note or mostly empty interior chart page.');
