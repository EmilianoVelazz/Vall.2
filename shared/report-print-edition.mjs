// The PDF is an executive edition. Reading, annexes and spreadsheet exports
// continue to use the complete model. Never scale text or cut rendered pages.
import {compactPrintTables} from './report-print-tables.mjs';
import {availablePresentationModel,availableReportTables} from './report-available-data.mjs';

export const REPORT_PDF_MAX_PAGES=3;
export const PROTEIN_PDF_MAX_PAGES=6;
export const THREE_PAGE_BUDGETS=[
  {rows:84,charts:3}, {rows:56,charts:2}, {rows:32,charts:2},
  {rows:32,charts:2,selectPrices:true}, {rows:24,charts:2,selectPrices:true},
  {rows:16,charts:1,selectPrices:true}, {rows:8,charts:1,selectPrices:true},
];
export const PRINT_EDITION_BUDGETS=[
  {rows:120,charts:8}, {rows:84,charts:6}, {rows:56,charts:4},
  {rows:32,charts:3}, {rows:16,charts:2},
];

const rowGroup=row=>{
  const label=String(row[0] || ''),lines=label.split('\n');
  return lines[1] || label.split(' · ')[0];
};

// Round-robin groups retain their original ordering. No comparison is computed
// from this selection, and no selected chart loses a point or a series.
export function distributedSelection(items,limit,group) {
  if(items.length<=limit)return items.slice();
  const groups=new Map();
  items.forEach((item,index)=>{
    const key=group(item);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(index);
  });
  const selected=new Set();
  while(selected.size<limit){
    let added=false;
    for(const indices of groups.values()){
      if(selected.size>=limit)break;
      if(indices.length){selected.add(indices.shift());added=true;}
    }
    if(!added)break;
  }
  return items.filter((_,index)=>selected.has(index));
}

function tableQuotas(tables,budget) {
  const quotas=tables.map(()=>0);
  for(let remaining=budget;remaining>0;remaining--){
    let best=-1,score=Infinity;
    tables.forEach((table,index)=>{
      if(quotas[index]>=table.rows.length)return;
      const candidate=quotas[index]/Math.sqrt(table.rows.length);
      if(candidate<score){score=candidate;best=index;}
    });
    if(best<0)break;
    quotas[best]++;
  }
  return quotas;
}

export function executivePrintEdition(model,budget,{source=value=>value,t=value=>value}={}) {
  model=availablePresentationModel(model,{source,t});
  const allGrainRows=model.commodityExecutive?.key==='grains' ? model.results.reduce((sum,table)=>sum+table.rows.length,0) : null;
  if(model.energyExecutive)model={...model,visuals:model.visuals.filter(visual=>visual.energyHistoryOverview || visual.energyFeature)};
  if(model.grainGlobalHistory)model={...model,results:model.results.filter(table=>table.printGroup==='market-levels' || table.derivatives),visuals:model.visuals.filter(visual=>visual.grainHistoryOverview || visual.grainRecentFeatured)};
  if(model.commodityExecutive?.key==='grains'){
    // Keep every current price. For each historical matrix, select the two
    // largest compatible grids instead of turning sparse cells into prose.
    // Complete matrices and their original dates remain in the reader/data.
    const groups=new Map();
    for(const table of model.results)if(table.preserveNumericGrid && table.printGroup!=='market-levels' && !table.derivatives){const key=table.numericGridTitle || table.title;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(table);}
    const selected=new Set([...groups.values()].flatMap(tables=>tables.toSorted((a,b)=>b.rows.length-a.rows.length || b.columns.length-a.columns.length).slice(0,2)));
    model={...model,results:model.results.filter(table=>!table.preserveNumericGrid || table.printGroup==='market-levels' || table.derivatives || selected.has(table))};
  }
  const compactProteinPrint=Boolean(budget.selectPrices && model.commodityExecutive?.key==='proteins');
  const prioritizeAmericas=compactProteinPrint && model.results.some(table=>table.proteinProtectedCoverage || table.proteinAmericas);
  const grainPrint=model.commodityExecutive?.key==='grains';
  const rawTables=(model.results || []).filter(table=>!(compactProteinPrint && table.mercolleidaTable) && (!prioritizeAmericas || table.proteinProtectedCoverage || table.proteinAmericas || table.proteinHistoryTable || table.derivatives)).map(table=>{
    if(grainPrint && table.printGroup==='market-levels'){
      if(table.grainMaster){
        const indices=[0,1,2,3,4,5,6],columns=indices.map(index=>table.columns[index]);
        return {...table,printTitle:t('Tabla maestra · 2020 a la fecha e historias parciales'),columns,rows:table.rows.map(row=>indices.map(index=>row[index])),printColumnFractions:[.31,.14,.1,.12,.1,.12,.11],note:t('Fecha base real por referencia; las historias parciales no se extienden a 2020. Precios nominales en su unidad y moneda originales. Los códigos coinciden con la gráfica histórica. Variaciones de sesión y otros horizontes en las tablas completas y Excel.')};
      }
      const indices=table.columns.flatMap((column,index)=>/^(?:Cierre anterior|Fecha anterior)$/.test(source(column)) ? [] : [index]);
      return {...table,printTitle:t('Precios publicados · unidad y fecha originales'),note:table.note ? t('Cada referencia conserva moneda, unidad y frecuencia. La variación diaria compara sesiones publicadas; las bases y sus fechas completas están en anexos y Excel.') : '',columns:indices.map(index=>table.columns[index]),rows:table.rows.map(row=>indices.map(index=>row[index]))};
    }
    return compactProteinPrint && table.printGroup==='market-levels' ? {...table,market:undefined,printTitle:t('Cierres y precios publicados'),columns:table.columns.slice(0,7),rows:table.rows.map(row=>row.slice(0,7))} : table;
  });
  const complete=compactPrintTables(rawTables,{source,foldDates:Boolean(model.focusedMarket) && !grainPrint,compactUnits:false,columnDates:Boolean(model.focusedMarket)});
  const tables=complete.map(table=>{
    if(grainPrint && table.grainMaster)return {...table,rows:table.rows.toSorted((a,b)=>Number.parseInt(a[0],10)-Number.parseInt(b[0],10))};
    const closing=table.columns.findIndex(column=>source(column)==='Último del año');
    return !model.annualReport || closing<0 ? table : {...table,rows:table.rows.filter(row=>!/^Sin dato(?: de \d{4})?$/.test(source(String(row[closing]))))};
  });
  const essential=table=>model.focusedMarket && (table.energyPrices || table.energyHorizons || table.printGroup==='market-levels' && (grainPrint || !budget.selectPrices) || table.derivatives || table.proteinHistoryTable && table.rows.length<=12);
  const fixedRows=new Map(tables.map(table=>{const names=new Set(table.proteinRequiredRows || []);return [table,table.proteinProtectedCoverage || table.proteinAmericas ? table.rows.filter(row=>names.has(row[0])) : []];})),fixed=table=>fixedRows.get(table) || [];
  const essentials=tables.reduce((sum,table)=>sum+(essential(table) ? table.rows.length : fixed(table).length),0),optional=tables.filter(table=>!essential(table)).map(table=>({...table,rows:table.rows.filter(row=>!fixed(table).includes(row))})),optionalQuotas=tableQuotas(optional,Math.max(prioritizeAmericas ? 0 : optional.length,budget.rows-essentials));
  let optionalIndex=0;const quotas=tables.map(table=>essential(table) ? table.rows.length : fixed(table).length+optionalQuotas[optionalIndex++]);
  const results=tables.flatMap((table,index)=>{
    const group=budget.selectPrices && model.commodityExecutive ? row=>{const label=String(row[0]).split('\n')[0],reference=model.references.find(item=>label===item.label || label.startsWith(item.label+' · '));return model.commodityExecutive.key==='proteins' && reference?.sector ? reference.sector : reference?.country || rowGroup(row);} : rowGroup;
    const requiredRows=fixed(table),chosen=new Set([...requiredRows,...distributedSelection(table.rows.filter(row=>!requiredRows.includes(row)),Math.max(0,quotas[index]-requiredRows.length),table.proteinAmericas ? row=>String(row[0]).split('\n')[0] : table.availabilityProduction ? row=>row[1] : group)]),rows=table.rows.filter(row=>chosen.has(row));
    if(!rows.length)return [];
    const indices=rows.map(row=>table.rows.indexOf(row));
    const sourceColumn=table.columns.findIndex(column=>source(column)==='Fuente');
    const displayed=rows.map(row=>row.map((cell,column)=>{
      // Repeated raw URLs and internal reference hashes are backup metadata,
      // not price context. Keep the publisher and every commercial qualifier.
      if(column===sourceColumn)return String(cell).replace(/\s*[·-]?\s*https?:\/\/\S+/gu,'').trim() || cell;
      if(column===0)return String(cell).replace(/ · ref\. [a-f0-9]{16,64}\b/gu,'');
      return cell;
    }));
    return [{...table,rows:displayed,...(table.rowStates ? {rowStates:indices.map(index=>table.rowStates[index])} : {}),...(table.rowCodes ? {rowCodes:indices.map(index=>table.rowCodes[index])} : {}),...(table.costTones ? {costTones:indices.map(index=>table.costTones[index])} : {}),note:table.note || ''}];
  });
  const required=(model.visuals || []).filter(visual=>visual.requiredInPrint || visual.executiveLead),others=(model.visuals || []).filter(visual=>!visual.requiredInPrint && !visual.executiveLead).toSorted((a,b)=>Number(Boolean(b.proteinRegionalFeatured))-Number(Boolean(a.proteinRegionalFeatured)));
  const mandatory=budget.selectPrices || grainPrint ? required.toSorted((a,b)=>(model.proteinPurchasing ? Number(Boolean(b.proteinSpecies))-Number(Boolean(a.proteinSpecies)) : 0) || Number(b.commodityWindow==='history')-Number(a.commodityWindow==='history') || Number(b.commodityWindow==='relative')-Number(a.commodityWindow==='relative')).slice(0,budget.charts) : required;
  const visuals=[...mandatory,...distributedSelection(others,Math.max(0,budget.charts-mandatory.length),visual=>visual.proteinFamily || String(visual.title || visual.unit || visual.type).replace(/(?: · |\s+)[0-9]+$/u,''))];
  if(model.commodityExecutive){const rank=visual=>visual.executiveLead ? 0 : visual.commodityWindow==='relative' ? 1 : visual.commodityWindow==='history' ? 2 : 3;visuals.sort((a,b)=>rank(a)-rank(b));}
  // Summary and caveats remain complete. Only the bulk evidence is selected;
  // incomplete sentences, excerpts without qualifications and invented prose
  // would weaken the analysis even if they occupied less space.
  const baseSummaryPanels=model.summaryPanels || [
    ...(model.commentary || []).filter(item=>item.body),
    ...(model.followup?.length ? [{heading:model.followupHeading,body:model.followup.join('\n\n')}] : []),
  ];
  const priorityPanels=['session','history','implications','context','watch'].flatMap(kind=>baseSummaryPanels.filter(panel=>panel.summaryKind===kind));
  const selectedSummaryPanels=compactProteinPrint && baseSummaryPanels.length>4 ? priorityPanels.length>=3 ? priorityPanels.slice(0,4) : [baseSummaryPanels[0],baseSummaryPanels[1],baseSummaryPanels[2],baseSummaryPanels.at(-1)] : baseSummaryPanels;
  const summaryPanels=compactProteinPrint ? selectedSummaryPanels.map(panel=>panel.printBody ? {...panel,body:panel.printBody} : panel) : selectedSummaryPanels;
  return {...model,focusedMarket:true,proteinBulletin:false,summaryPanels,
    results:availableReportTables(results,{source,t}),visuals,metrics:[],printEdition:true,
    printSelection:{rows:results.reduce((sum,table)=>sum+table.rows.length,0),totalRows:allGrainRows ?? complete.reduce((sum,table)=>sum+table.rows.length,0),charts:visuals.length,totalCharts:(model.visuals || []).length},
  };
}
