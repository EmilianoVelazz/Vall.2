'use strict';
const {REPORT_PDF_MAX_PAGES,PROTEIN_PDF_MAX_PAGES,THREE_PAGE_BUDGETS,executivePrintEdition,distributedSelection}=require('../../shared/report-print-edition.mjs');
const {availablePresentationModel,hasPublishedReportData}=require('../../shared/report-available-data.mjs');

// Select complete evidence before rendering; never crop pages or shrink fonts.
// Panorama keeps every chapter; its executive print mode reuses each specialist
// edition rather than repeating every exploratory chart from the reader.
async function renderIndividualReportPdf({report,model,render,renderCompact=render,completeFirst=false,t=value=>value,source=value=>value}){
 if(!hasPublishedReportData(model))throw Object.assign(Error(t('No hay datos publicados para generar este informe.')),{status:422,code:'REPORT_DATA_UNAVAILABLE'});
 model=availablePresentationModel(model,{t,source});
 if(report.panoramaMember && report.panoramaPrint!=='executive')return render(model);
 const isGlobalProtein=Boolean(model.commodityExecutive?.key==='proteins' && report?.proteinScope!=='US_ONLY');
 const isProtein=model.commodityExecutive?.key==='proteins';
 const maxBudgetPages=isProtein ? PROTEIN_PDF_MAX_PAGES : model.bondExecutive ? 5 : REPORT_PDF_MAX_PAGES;
 if(completeFirst){const pdf=await render(model);if(pdf.reportPageCount<=maxBudgetPages)return pdf;}
 // Keep the sovereign curve and all core funding rates. International countries
 // share a compact board instead of separate global and European appendices.
 if(model.bondExecutive?.international?.references.length){
  const edition={...model,bondExecutive:{...model.bondExecutive,compactInternational:true}};
  const pdf=await render(edition);if(pdf.reportPageCount<=maxBudgetPages)return pdf;
 }
 if(model.newsExecutive){
  for(let count=model.newsExecutive.stories.length-1;count>=1;count--){
   const stories=distributedSelection(model.newsExecutive.stories,count,item=>item.topic),ids=new Set(stories.map(item=>item.id)),groups=model.newsExecutive.groups.flatMap(group=>{const selected=group.stories.filter(item=>ids.has(item.id));return selected.length ? [{...group,stories:selected}] : [];}),edition={...model,newsExecutive:{...model.newsExecutive,stories,groups,sourceCount:new Set(stories.map(item=>item.source)).size}};
   const pdf=await render(edition);if(pdf.reportPageCount<=REPORT_PDF_MAX_PAGES)return pdf;
  }
 }else{
  const budgets=model.proteinPurchasing ? [{rows:64,charts:6,selectPrices:true},{rows:56,charts:6,selectPrices:true},{rows:48,charts:6,selectPrices:true},{rows:40,charts:6,selectPrices:true},{rows:32,charts:5,selectPrices:true},{rows:24,charts:4,selectPrices:true}] : isProtein ? [{rows:120,charts:4,selectPrices:true},{rows:96,charts:4,selectPrices:true},{rows:80,charts:4,selectPrices:true},{rows:64,charts:3,selectPrices:true},{rows:48,charts:3,selectPrices:true},{rows:32,charts:3,selectPrices:true},{rows:16,charts:2,selectPrices:true},...THREE_PAGE_BUDGETS] : model.mexicoExecutive ? [{rows:1000,charts:2},...THREE_PAGE_BUDGETS] : THREE_PAGE_BUDGETS;
  for(const budget of budgets){
   const edition=executivePrintEdition(model,budget,{source,t});
   if(model.mexicoExecutive)edition.mexicoAdditionalVisuals=model.visuals.filter(visual=>!edition.visuals.some(selected=>selected.title===visual.title));
   const pdf=await renderCompact(edition);
   if(pdf.reportPageCount<=maxBudgetPages){
    if(!model.proteinPurchasing && !isGlobalProtein && model.commodityExecutive?.key==='proteins' && pdf.reportPageCount>1){
     for(const charts of [3,2].filter(count=>count<edition.visuals.length)){
      const balanced=executivePrintEdition(model,{...budget,charts,selectPrices:true},{source,t});
      if(JSON.stringify(balanced.results)!==JSON.stringify(edition.results))continue;
      const shorter=await renderCompact(balanced);if(shorter.reportPageCount<pdf.reportPageCount)return shorter;
     }
    }
    if(model.annualReport && (report.baseReport?.key || report.key)==='fx' && pdf.reportPageCount>1){
     for(const charts of [2,1].filter(count=>count<edition.visuals.length)){
      const balanced=executivePrintEdition(model,{...budget,charts},{source,t});
      if(JSON.stringify(balanced.results)!==JSON.stringify(edition.results))continue;
      const shorter=await renderCompact(balanced);if(shorter.reportPageCount<pdf.reportPageCount)return shorter;
     }
    }
    if(model.mexicoExecutive && pdf.reportPageCount>1 && edition.visuals.length>2){
     const balanced=executivePrintEdition(model,{...budget,charts:2},{source,t});
     if(balanced.visuals.length<edition.visuals.length && JSON.stringify(balanced.results)===JSON.stringify(edition.results)){
      const shorter=await renderCompact(balanced);if(shorter.reportPageCount<pdf.reportPageCount)return shorter;
     }
    }
    return pdf;
   }
  }
 }
 throw Error(t(isProtein ? 'No se pudo componer un informe de proteínas legible de hasta seis páginas.' : 'No se pudo componer un PDF legible de hasta tres páginas.'));
}
module.exports={renderIndividualReportPdf};
