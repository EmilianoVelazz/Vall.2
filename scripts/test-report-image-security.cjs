'use strict';
const assert=require('node:assert/strict');
const {deflateSync}=require('node:zlib');
const {reportChartImages}=require('../backend/lib/report-chart-images');
const {start}=require('./lib/security-fixture.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=','base64');
const data=(buffer,type='png')=>`data:image/${type};base64,${buffer.toString('base64')}`;
const pngSize=(width,height)=>{const result=Buffer.from(png);result.writeUInt32BE(width,16);result.writeUInt32BE(height,20);return result;};
const jpeg=(marker,width,height)=>Buffer.from([0xff,0xd8,0xff,marker,0,11,8,height>>8,height&255,width>>8,width&255,1,1,0x11,0,0xff,0xd9]);
const pngStream=raw=>{
 const packed=deflateSync(raw),chunk=Buffer.alloc(12+packed.length);chunk.writeUInt32BE(packed.length);chunk.write('IDAT',4);packed.copy(chunk,8);
 return Buffer.concat([png.subarray(0,33),chunk,Buffer.from([0,0,0,0,73,69,78,68,0,0,0,0])]);
};
const rejects=(value,status)=>assert.throws(()=>reportChartImages(value),error=>error.status===status && error.code.startsWith('REPORT_IMAGE_'));
async function main(){
 assert.deepEqual(reportChartImages([data(png)]),[png]);
 for(const marker of [0xc0,0xc2])assert.equal(reportChartImages([data(jpeg(marker,320,240),'jpeg')]).length,1,'Baseline and progressive JPEG metadata');
 rejects([data(pngSize(0,1))],400);rejects([data(Buffer.from('invalid'))],400);rejects([data(png,'jpeg')],400);
 rejects([data(pngSize(0xffffffff,0xffffffff))],413);rejects([data(pngSize(8193,1))],413);rejects([data(pngSize(3000,3000))],413);
 rejects([data(jpeg(0xc0,65535,65535),'jpeg')],413);rejects([data(jpeg(0xc0,10,10).subarray(0,9),'jpeg')],400);
 rejects(Array(4).fill(data(jpeg(0xc0,3000,2500),'jpeg')),413);
 rejects([data(pngStream(Buffer.alloc(1_000_000)))],413); // Tiny header, oversized actual expansion.
 rejects([data(pngStream(Buffer.from([5,0,0])))],400); // Invalid scanline filter before asynchronous decoding.
 rejects([data(png.subarray(0,33))],400);
 rejects([data(Buffer.alloc(2_500_001))],413);
 assert.equal(reportChartImages(Array(10).fill(data(png))).length,8,'Keep the existing eight-chart limit');
 assert.deepEqual(reportChartImages([{},'https://example.invalid/image.png','data:image/svg+xml;base64,PHN2Zz4=']),[],'No remote URLs or active SVG');
 const fixture=await start();
 try{
  for(const [image,status] of [[data(pngSize(0xffffffff,0xffffffff)),413],[data(Buffer.from('invalid')),400]]){
   const response=await fetch(fixture.url+'/api/report-export',{method:'POST',headers:{Authorization:fixture.authorization(),'Content-Type':'application/json'},body:JSON.stringify({title:'Prueba de seguridad',content:'Contenido de prueba',format:'pdf',response:'file',chartImages:[image]}),signal:AbortSignal.timeout(5000)});
   assert.equal(response.status,status);const body=await response.json();assert(body.code.startsWith('REPORT_IMAGE_'));assert(!body.error.includes('RangeError'));
  }
  const valid=await fetch(fixture.url+'/api/report-export',{method:'POST',headers:{Authorization:fixture.authorization(),'Content-Type':'application/json'},body:JSON.stringify({title:'Prueba de seguridad',content:'Contenido de prueba',format:'pdf',response:'file',chartImages:[data(png)]}),signal:AbortSignal.timeout(5000)});
  assert.equal(valid.status,200);assert.equal(Buffer.from(await valid.arrayBuffer()).subarray(0,5).toString(),'%PDF-','A real valid PNG still exports to PDF');
  console.log('Report image security: OK · metadata, dimensions, aggregate pixels, size limits and HTTP rejection before decoding.');
 }finally{await fixture.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
