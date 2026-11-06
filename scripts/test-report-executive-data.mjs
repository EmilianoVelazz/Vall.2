import assert from 'node:assert/strict';
import {safeProteinFx,proteinPriceTable} from '../shared/report-protein-fx.mjs';
import {scopeUsProteinReport} from '../shared/report-protein-scope.mjs';
import {safeReportOpenInterest,reportOpenInterestTable} from '../shared/report-open-interest.mjs';

const cutoff='2026-10-26T18:00:00Z',fx={base:'USD',rates:{USD:1,MXN:20},observedAt:'2026-10-26T00:00:00Z',source:'Dated FX fixture',url:'https://example.invalid/fx'};
const future={symbol:'HE=F',label:'Cerdo magro CME · EE. UU.',market:'Estados Unidos',unit:'US¢/lb',cadence:'daily',last:{date:'2026-10-23',value:102.5},previous:{date:'2026-10-22',value:100}};
const physical={symbol:'AMS-PORK-CUTOUT',label:'Canal porcina · Estados Unidos',market:'Estados Unidos',unit:'USD/100 lb',cadence:'daily',last:{date:'2026-10-23',value:105},previous:{date:'2026-10-22',value:101}};
const original=JSON.stringify({fx,future,physical});
const table=proteinPriceTable([future,physical],fx,{cutoff});
assert.deepEqual(table.rows[0],[future.label,'USD/lb','1','2026-10-22','1.025','2026-10-23','20.5'],'Cents convert to dollars before applying FX, preserving pounds');
assert.deepEqual(table.rows[1],[physical.label,'USD/100 lb','101','2026-10-22','105','2026-10-23','2,100'],'Hundred pounds remain hundred pounds, without hidden weight conversion');
assert.equal(table.columns.length,7);assert(table.note.includes('2026-10-26') && table.note.includes('Dated FX fixture'));
assert(table.note.includes('No se aplica esta tasa a los precios anteriores'));
for(const value of [{...fx,observedAt:'2026-10-27T00:00:00Z'},{...fx,observedAt:'2026-10-20T00:00:00Z'},{...fx,rates:{USD:1,MXN:0}},{...fx,rates:{USD:1,MXN:Infinity}},{...fx,base:'EUR'},{...fx,url:'javascript:alert(1)'},{...fx,source:''}]){
 assert.equal(safeProteinFx(value,cutoff),undefined);assert.equal(proteinPriceTable([future],value,{cutoff}).columns.length,6,'Invalid FX never creates a peso column');
}
assert.equal(proteinPriceTable([{...physical,unit:'MXN/kg'}],fx,{cutoff}),null,'Never relabel a foreign currency as dollars');
assert.equal(proteinPriceTable([{...physical,market:'México'}],fx,{cutoff}),null,'Foreign quotes remain outside the US report');
assert.equal(proteinPriceTable([{...future,last:{date:'2026-10-27',value:1}}],fx,{cutoff}),null,'Future observations cannot enter the report');
const weekly=proteinPriceTable([{...physical,cadence:'weekly'}],fx,{cutoff});assert.equal(weekly.rows[0][2],'—','A weekly observation never gains an invented previous daily price');
const scoped=scopeUsProteinReport({key:'proteins',collection:'markets',generatedAt:cutoff,marketFx:fx,sourceSnapshot:{proteins:[future,{...physical,market:'México'}]}}),scopedUs=scopeUsProteinReport({key:'proteins',collection:'markets',proteinScope:'US_ONLY',generatedAt:cutoff,marketFx:fx,sourceSnapshot:{proteins:[future,{...physical,market:'México'}]}});
assert.equal(scoped.marketFx,fx);assert.equal(scoped.sourceSnapshot.proteins.length,2,'Global protein scope retains international protein references');assert.equal(scopedUs.sourceSnapshot.proteins.length,1,'Explicit US scope restricts to US references');
assert.equal(JSON.stringify({fx,future,physical}),original,'Currency presentation never mutates price evidence');

const interest={symbol:'HE=F',label:'Cerdo magro CME',date:'2026-10-20',previousDate:'2026-10-13',value:121,change:10,source:'CFTC · Legacy Futures Only',url:'https://publicreporting.cftc.gov/resource/6dca-aqww.json',cadence:'weekly'};
const oi=reportOpenInterestTable([interest],[future],{cutoff});
assert.deepEqual(oi.rows[0],[interest.label,'121','↑ +10 %','2026-10-13','2026-10-20']);assert(oi.columns.includes('Cambio semanal · %'));
assert.equal(safeReportOpenInterest([{...interest,value:0,change:-100}],cutoff)[0].value,0,'Verified zero interest is not missing data');
for(const value of [{...interest,date:'2026-10-27'},{...interest,date:'2026-10-01'},{...interest,value:1.5},{...interest,value:-1},{...interest,url:'https://example.invalid/cftc'},{...interest,date:'2026-02-30'}])assert.equal(safeReportOpenInterest([value],cutoff).length,0,'Invalid, stale, untrusted or future counts are omitted');
for(const previousDate of ['2026-10-20','2026-10-21','2026-09-20','invalid'])assert.equal(safeReportOpenInterest([{...interest,previousDate}],cutoff)[0].change,null,'A percentage requires a valid weekly base');
assert.equal(safeReportOpenInterest([interest,{...interest,value:122}],cutoff).length,0,'Conflicting same-date counts are excluded');
assert.equal(reportOpenInterestTable([interest],[{symbol:'LE=F'}],{cutoff}),null,'OI belongs only to products shown by this report');
assert.equal(safeReportOpenInterest([interest,interest],cutoff).length,1,'Identical observations do not create duplicated rows');
console.log('Executive data: OK · dated USD/MXN equivalents, cents/physical units, US-only scope, no historical FX returns; CFTC contracts vs percentage, both dates, freshness, conflicts and immutability.');
