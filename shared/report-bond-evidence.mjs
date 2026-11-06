export const BOND_CONTEXT=[
  {id:'SOFR',label:'SOFR',role:'funding',provider:'nyfed',path:'secured/sofr',unit:'%',currency:'USD'},
  {id:'EFFR',label:'Fed Funds efectiva',role:'funding',provider:'nyfed',path:'unsecured/effr',unit:'%',currency:'USD'},
  {id:'DFEDTARL',label:'Fed · límite inferior',role:'policy',provider:'fred',unit:'%',currency:'USD'},
  {id:'DFEDTARU',label:'Fed · límite superior',role:'policy',provider:'fred',unit:'%',currency:'USD'},
  {id:'DFII10',label:'TIPS 10 años · tasa real',role:'real',provider:'fred',unit:'%',currency:'USD'},
  {id:'T10YIE',label:'Breakeven de inflación · 10 años',role:'inflation',provider:'fred',unit:'%',currency:'USD'},
  {id:'BAMLC0A0CM',label:'Crédito grado de inversión · OAS',role:'credit',provider:'fred',unit:'pb',currency:'USD',multiplier:100},
  {id:'BAMLH0A0HYM2',label:'Crédito alto rendimiento · OAS',role:'credit',provider:'fred',unit:'pb',currency:'USD',multiplier:100},
  {id:'SF331451',label:'TIIE de fondeo',role:'funding',provider:'banxico',unit:'%',currency:'MXN',match:'fondeo'},
  {id:'SF60648',label:'TIIE 28 días',role:'funding',provider:'banxico',unit:'%',currency:'MXN',match:'28'},
  {id:'PD43667XD',label:'Riesgo país · EMBIG México',role:'country-risk',provider:'bcrp',unit:'pb',currency:'USD',market:'México'},
];
export const BOND_DAY=86400000;
export function bondPoints(input,cutoff){
  const values=new Map(),conflicts=new Set(),end=Date.parse(cutoff);
  for(const point of input || []){const date=String(point?.date || ''),time=Date.parse(date);if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==date || time>end || !Number.isFinite(point.value))continue;if(values.has(date) && values.get(date)!==point.value)conflicts.add(date);values.set(date,point.value);}
  return [...values].filter(([date])=>!conflicts.has(date)).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));
}
export function bondMonthBefore(date,months){const value=new Date(date+'T00:00:00Z'),day=value.getUTCDate();value.setUTCDate(1);value.setUTCMonth(value.getUTCMonth()-months);value.setUTCDate(Math.min(day,new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate()));return value.toISOString().slice(0,10);}
export function bondAt(points,target,tolerance=7){return [...points].reverse().find(point=>point.date<=target && Date.parse(target)-Date.parse(point.date)<=tolerance*BOND_DAY);}
export function compactBondPoints(input,cutoff){
  const points=bondPoints(input,cutoff),last=points.at(-1);if(!last)return [];
  const keep=new Set(points.slice(-90).map(point=>point.date)),months=new Map();for(const point of points)months.set(point.date.slice(0,7),point.date);for(const date of months.values())keep.add(date);
  for(const target of [bondMonthBefore(last.date,1),bondMonthBefore(last.date,12),'2020-12-31'])for(const point of points)if(point.date<=target && Date.parse(target)-Date.parse(point.date)<=7*BOND_DAY)keep.add(point.date);
  return points.filter(point=>keep.has(point.date)).slice(-256);
}
