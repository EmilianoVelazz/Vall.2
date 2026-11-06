import {proteinReferenceComparison} from './report-protein-reference-comparison.mjs';
const countries=['México','Estados Unidos','Canadá','Brasil','Argentina','Chile','Colombia','Perú','Uruguay','Paraguay','Ecuador','Bolivia','Costa Rica','Guatemala','Panamá','República Dominicana'];
const species=['Porcino','Vacuno','Pollo','Huevo'];
export const isAmericanProtein=item=>countries.includes(item.country);
export function orderProteinAmericas(references){
 return references.toSorted((a,b)=>{
  const rank=item=>countries.includes(item.country) ? countries.indexOf(item.country) : 100;
  return rank(a)-rank(b) || (species.indexOf(a.sector)+1 || 99)-(species.indexOf(b.sector)+1 || 99) || Number(/^MERCO-/.test(a.symbol))-Number(/^MERCO-/.test(b.symbol)) || a.label.localeCompare(b.label,'es');
 });
}
export function proteinAmericasComparison(references,{t=value=>value,fx,cutoff}={}){
 const items=orderProteinAmericas(references.filter(isAmericanProtein)),present=countries.filter(country=>items.some(item=>item.country===country));
 const required=new Set(),score=item=>Number(!/^MERCO-/.test(item.symbol))*8+Number(Boolean(item.periods.day))*4+Number(Boolean(item.periods.semester))*3+Number(Boolean(item.periods.year))*2;
 for(const country of present){
  const local=items.filter(item=>item.country===country).toSorted((a,b)=>score(b)-score(a)),chosen=country==='Estados Unidos' ? local : country==='México' ? species.flatMap(sector=>local.filter(item=>item.sector===sector).slice(0,1)) : local.slice(0,1);
  chosen.forEach(item=>required.add(item.label));
  if(!chosen.some(item=>item.periods.semester)){const historical=local.find(item=>item.periods.semester);if(historical)required.add(historical.label);}
 }
 const us=proteinReferenceComparison(items.filter(item=>item.country==='Estados Unidos'),{t,coverage:'united-states',prefix:'Estados Unidos',dailyTitle:'Estados Unidos · USDA y CME · comparación por horizonte',periodicTitle:'Estados Unidos · precios físicos publicados y variaciones',required,americas:true,fx,cutoff});
 const other=proteinReferenceComparison(items.filter(item=>item.country!=='Estados Unidos'),{t,coverage:'americas',prefix:'América',dailyTitle:'América · comparación por horizonte',periodicTitle:'América · publicaciones periódicas y variaciones',required,americas:true,fx,cutoff});
 return {tables:[...us.tables,...other.tables],countries:present,annexTables:[...us.annexTables,...other.annexTables]};
}
