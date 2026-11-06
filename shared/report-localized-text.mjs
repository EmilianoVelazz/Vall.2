// Translate display text only. Evidence identities and machine fields retain
// their original values, so localization cannot change grouping or calculation.
const machine=new Set(['key','id','type','kind','icon','symbol','ticker','provider','language','cadence','proteinFamily','quoteStatus','date','generatedAt','publishedAt','url','source','periodType','reportYear','causeText','annualReferences','annualProduction','annualCoverage','marketHistory','marketFx','marketOpenInterest','marketDerivatives','proteinScope','derivatives','analysisPeriod','analysisBenchmark','printGroup','indexBaseDate','indexEndDate','baseDate','rangeStart','rangeEnd','globalComparison','equityComparison','financePalette','dataInTables','requiredInPrint']);
export function reportSourceText(report,source=value=>value){
  const originals=new Map(Object.entries(report.causeText || {}).map(([original,localized])=>[localized,original]));
  const lookup=value=>originals.get(value) ?? source(value);
  return value=>{const original=lookup(value);return original!==value || typeof value!=='string' ? original : value.split(/(\r?\n)/).map(lookup).join('');};
}
export function mapReportText(value,translate,key='') {
  if(['role','tone','currency','countryCode','baseCurrency','quoteCurrency','lastDate','currentDate','previousDate','fxBase','fxLast','equityContext','returnBasis','sector','cutoff','targetDate','historyKey'].includes(key) || ['period','main'].includes(key) && ['day','week'].includes(value))return value;
  if(machine.has(key) || ['grainFamily','marketNews','proteinMarketContext','proteinFeed','proteinFundamentals','proteinSpecies','proteinPriceReference','commodityWindow','proteinHistoryReference','proteinCoverage','summaryKind','quoteStatus','evidenceOrigin','retrievedAt','provider','reportPeriodStart','reportPeriodEnd','sourceDocumentHash','mexicoWindow','state','states','rowStates','financialNews','panoramaParts','componentReport','panoramaFingerprint','fxGroup','rowCodes','costTones','paymentCurrency','costCurrency'].includes(key))return value;
  if(typeof value==='string')return translate(value);
  if(Array.isArray(value))return value.map(item=>mapReportText(item,translate));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,mapReportText(item,translate,field)]));
  return value;
}
export function reportDisplayTexts(model) {
  const texts=[];
  mapReportText(model,text=>{if(text.trim())texts.push(text);return text;});
  return texts;
}
