// Editorial scope: market protein reports integrate international Mercolleida,
// European, Americas, Asian and US protein references while excluding grains/meals.
// If report.proteinScope === 'US' is explicitly requested, filter to US only.
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const list=value=>Array.isArray(value) ? value : [];
const usa=/\bestados unidos\b|\bunited states\b|\busa\b|\bu\.?s\.?a?\.?\b|\bee\.?\s*uu\.?\b/;
const foreign=/mexico|canada|brasil|brazil|chile|argentina|colombia|\bperu\b|francia|france|espana|spain|alemania|germany|dinamarca|denmark|paises bajos|netherlands|polonia|poland|italia|italy|belgica|belgium|portugal|reino unido|united kingdom|\buk\b|irlanda|ireland|union europea|\bue\b|eu-27|noruega|norway|escocia|scotland|ucrania|ukraine|china|dalian|japon|japan|australia|nueva zelanda|new zealand|rusia|russia/;
const knownProviders=/mercolleida|cepea|franceagrimer|\brnm\b|dg agri|sniim|odepa|canuelas|sipsa|dane|midagri|quebec|vezg|danish crown|bord bia|ahdb|mara\b/;
export function isUsProteinReport(report){const key=report?.baseReport?.key || report?.key,area=report?.baseReport?.collection || report?.collection;return key==='proteins' && (!area || area==='markets') && report?.periodType!=='annual';}
export function usProteinReference(item){
  if(!item || typeof item!=='object')return false;
  const label=fold(item.label || item.name),market=fold(item.market || item.country);
  if(/harina|soya|soja|soybean|\bmeal\b|\bmaiz\b|\bcorn\b|\bwheat\b|\btrigo\b/.test(label))return false;
  if(usa.test(market))return true;
  if(foreign.test(market))return false;
  if(usa.test(label))return true;
  if(foreign.test(label))return false;
  return ['HE=F','LE=F','GF=F'].includes(item.symbol || item.ticker) || /\bCME\b/i.test(item.exchange || '') || /\bCME\b/i.test(item.label || '') || /\bUSDA\b/i.test(item.source || '');
}
export function proteinReportReference(item){
  if(!item || typeof item!=='object')return false;
  const label=fold(item.label || item.name),market=fold(item.market || item.country),source=fold(item.source || item.provider || item.exchange),category=fold(item.category || '');
  if(/harina|soya|soja|soybean|\bmeal\b|\bmaiz\b|\bcorn\b|\bwheat\b|\btrigo\b/.test(label))return false;
  if(item.provider==='usda_pdf' && (item.symbol || item.ticker)==='USDA-EGG-LIQUID-WHOLE' && item.url==='https://www.ams.usda.gov/mnreports/ams_2842.pdf' && usa.test(market))return true;
  if(/conejo|cordero|ovino|cunicol|salmon|saumon|surimi|pescad|fish|acuicult|liquido|fum[eé]|ahumad/.test(label+' '+category))return false;
  if(usProteinReference(item))return true;
  if(foreign.test(market) || foreign.test(label) || knownProviders.test(source))return true;
  return ['DCE-LH','DCE-JD'].includes(item.symbol || item.ticker) || ['cepea','rnm','dgagri','americas','mercolleida'].includes(item.provider);
}
export function scopeUsProteinReport(report){
  if(!isUsProteinReport(report))return report;
  const onlyUs=report?.proteinScope==='US_ONLY';
  const filterFn=onlyUs ? usProteinReference : proteinReportReference;
  const result={...report,proteinScope:onlyUs ? 'US_ONLY' : 'GLOBAL'};
  for(const key of ['marketHistory','sessionObservations','dailyReferences','proteinObservations'])if(Array.isArray(report[key]))result[key]=report[key].filter(filterFn);
  if(report.sourceSnapshot){result.sourceSnapshot={...report.sourceSnapshot};for(const key of ['grains','energy','proteins','quotes','equities','bonds','fxHistories'])if(Array.isArray(report.sourceSnapshot[key]))result.sourceSnapshot[key]=report.sourceSnapshot[key].filter(filterFn);}
  if(report.marketDerivatives)result.marketDerivatives={...report.marketDerivatives,options:list(report.marketDerivatives.options).filter(item=>['HE=F','LE=F','GF=F'].includes(item?.symbol)),futures:list(report.marketDerivatives.futures).filter(item=>['HE=F','LE=F','GF=F'].includes(item?.symbol))};
  if(Array.isArray(report.marketOpenInterest))result.marketOpenInterest=report.marketOpenInterest.filter(item=>['HE=F','LE=F','GF=F'].includes(item?.symbol));
  return result;
}
