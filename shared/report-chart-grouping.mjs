// Group observations, never aggregate, convert currencies or rebase values.
// A shared unit alone does not establish a shared commercial basis.
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const COMPARISON_LINE_LIMIT=8;
function priceBasis(item){
  const basis=fold(item.basis),source=fold(item.source),symbol=String(item.symbol || '');
  if(/^EIA-.*-SPOT$/.test(symbol) && /^precio fisico de referencia/.test(basis))return ['physical-reference',basis,'Referencia física'];
  if(/serie continua de futuros/.test(basis))return ['futures',basis,'Futuros'];
  if(/^SAFEX-/.test(symbol) && /^futuro safex con vencimiento/.test(basis))return ['dated-futures',basis,'Futuros · mismo vencimiento'];
  if(/comision europea.*dg agri/.test(source) && /^precio fisico mayorista;/.test(basis))return ['physical-grain',JSON.stringify([String(item.label).split(' · ')[0],basis.split(';')[1]]),'Precio físico · '+String(item.basis).split(';')[1].trim()];
  // Do not infer futures from a physical quote's disclaimer mentioning futures.
  if(/=F$/.test(symbol) && !basis)return ['futures',source,'Futuros'];
  if(/cepea/.test(source) && /carne de pollo (?:congelada|refrigerada); promedio/.test(basis))return ['physical-poultry',source,'Precio físico'];
  if(/minorista|mayoreo|mayorista|ponderado de operaciones/.test(basis))return ['physical',basis,'Precio físico'];
  // Without evidence of the pricing basis, retain its own panel.
  return ['unconfirmed',JSON.stringify([item.label,item.market,symbol]),''];
}
export function priceChartGroups(references,{family=item=>item.sector || '',limit=COMPARISON_LINE_LIMIT}={}){
  const groups=new Map(),size=Math.max(1,Math.min(COMPARISON_LINE_LIMIT,Math.floor(limit) || COMPARISON_LINE_LIMIT));
  for(const item of references){
    const [kind,basis,basisLabel]=priceBasis(item),label=family(item),cadence=item.cadence || 'unknown';
    const key=JSON.stringify([label,item.unit,cadence,kind,basis,...(!item.unit || cadence==='unknown' ? [item.label,item.market,item.symbol] : [])]);
    if(!groups.has(key))groups.set(key,{label,unit:item.unit,cadence,basisLabel,items:[]});
    groups.get(key).items.push(item);
  }
  return [...groups.values()].flatMap(group=>Array.from({length:Math.ceil(group.items.length/size)},(_,index)=>({...group,items:group.items.slice(index*size,(index+1)*size),part:index+1,parts:Math.ceil(group.items.length/size)})));
}

// Only annual equity percentage changes are eligible here. Keep volatility,
// monthly trajectories, FX and rates on their own axes and in their own units.
export function unifyAnnualEquityCharts(visuals,references,year,{t=value=>value,source=value=>value}={}){
  const byLabel=new Map(references.map(item=>[item.label,item]));
  const candidates=visuals.filter(visual=>visual.type==='bar' && visual.unit==='%' && source(visual.title).startsWith('Variación anual '+year+' · Precios e índices') && visual.bars?.length && visual.bars.every(bar=>{
    const ref=byLabel.get(source(bar.label));return ref?.kind==='price' && ref.unit==='puntos' && Number.isFinite(ref.change) && Number(ref.change.toFixed(3))===bar.value;
  }));
  if(candidates.length<2 || new Set(candidates.map(item=>item.note || '')).size!==1)return visuals;
  const bars=candidates.flatMap(item=>item.bars),count=Math.ceil(bars.length/18),size=Math.ceil(bars.length/count);
  const combined=Array.from({length:count},(_,index)=>({...candidates[0],title:t('Bolsas globales · variación anual '+year)+(count>1 ? ' · '+(index+1) : ''),bars:bars.slice(index*size,(index+1)*size)}));
  const selected=new Set(candidates),result=[];
  for(const visual of visuals){if(visual===candidates[0])result.push(...combined);if(!selected.has(visual))result.push(visual);}
  return result;
}
