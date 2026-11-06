import assert from 'node:assert/strict';
import fs from 'node:fs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {availablePresentationModel} from '../shared/report-available-data.mjs';
import {compactPrintTables} from '../shared/report-print-tables.mjs';
import {executivePrintEdition,distributedSelection,PRINT_EDITION_BUDGETS} from '../shared/report-print-edition.mjs';

assert.deepEqual(distributedSelection(['A1','A2','B1','B2','C1'],3,item=>item[0]),['A1','B1','C1']);
assert.deepEqual(distributedSelection(['A1'],0,item=>item),[]);
const reports=[];
for(const [collection,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']]){
  reports.push(...JSON.parse(fs.readFileSync('backend/cache/'+file)).reports.map(report=>({...report,collection})));
}
reports.push(...Object.values(JSON.parse(fs.readFileSync('backend/cache/annual-report-library.json')).years).flat());
reports.push(...reports.filter(report=>!report.reportYear && ['equities','fx','grains','energy_metals','proteins'].includes(report.key)).map(report=>({...report,analysisPeriod:'weekly'})));
const normalizedCell=cell=>String(cell).replace(/ · ref\. [a-f0-9]{16,64}\b/gu,'').replace(/\s*[·-]?\s*https?:\/\/\S+/gu,'').trim();
for(const report of reports){
  const model=weeklyReport(report),snapshot=JSON.stringify(model),available=availablePresentationModel(model),tables=compactPrintTables(available.results,{foldDates:Boolean(model.focusedMarket),columnDates:Boolean(model.focusedMarket),compactUnits:false});
  const originals=new Set(tables.flatMap(table=>table.rows.map(row=>JSON.stringify(row.map(normalizedCell)))));
  for(const budget of PRINT_EDITION_BUDGETS){
    const edition=executivePrintEdition(model,budget);
    const essential=tables.filter(table=>model.focusedMarket && (table.printGroup==='market-levels' || table.derivatives)),requiredRows=essential.reduce((sum,table)=>sum+table.rows.length,0);
    assert(edition.printSelection.rows<=Math.max(budget.rows,requiredRows+tables.length-essential.length),'Required funding and price rows may exceed a small optional-row budget');
    assert(edition.visuals.length<=Math.max(budget.charts,available.visuals.filter(visual=>visual.requiredInPrint || visual.executiveLead).length),'Mandatory context charts remain complete even in a small optional budget');
    assert.equal(edition.printSelection.totalRows,tables.reduce((sum,table)=>sum+table.rows.length,0));
    for(const table of edition.results){
      for(const row of table.rows)assert(originals.has(JSON.stringify(row.map(normalizedCell))),'Whole observed rows keep their own values, dates, units and commercial context');
      assert(tables.some(original=>JSON.stringify(table.columns)===JSON.stringify(original.columns)),'Every selected comparison keeps all horizons');
    }
    for(const visual of edition.visuals)assert(available.visuals.some(original=>JSON.stringify(original)===JSON.stringify(visual)),'A chart keeps every available series, date and observed point');
    assert.deepEqual(edition.summaryPanels,model.summaryPanels || [...(model.commentary || []).filter(item=>item.body),...(model.followup?.length ? [{heading:model.followupHeading,body:model.followup.join('\n\n')}] : [])],'Summary, causal qualifications, coverage and risks remain complete');
    assert.equal(JSON.stringify(model),snapshot,'Reader, annex and spreadsheet input is immutable');
  }
}
const annual={annualReport:true,results:[{title:'Annual',columns:['Referencia','Último del año','Cobertura'],rows:[['No price','Sin dato de 2025','0/12 meses'],['Observed','21.25\n2025-12-01','12/12 meses']]}],visuals:[],commentary:[]};
assert.deepEqual(executivePrintEdition(annual,{rows:1,charts:1}).results[0].rows,[annual.results[0].rows[1]],'Missing-price rows cannot displace a published annual price');
const translations=JSON.parse(fs.readFileSync('shared/report-languages.json')).labels;
for(const label of ['Referencia','Valor','Unidad'])assert.equal(translations[label].length,5);
console.log('Executive PDF selection: OK · '+reports.length+' daily/weekly/annual models, whole rows, complete summaries, unchanged charts and full immutable backups.');
