import {directionalChange} from './report-market-analysis.mjs';
import {safeProteinFx} from './report-protein-fx.mjs';
const number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:3});
export const isMercolleidaProtein=item=>item.country==='España' && (/^MERCO-ES-/.test(item.symbol || '') || /mercolleida/i.test(item.source+' '+item.label));

// Preserve the same dated comparison contract in every regional table.
export function proteinReferenceComparison(items,{t=value=>value,coverage,prefix,dailyTitle,periodicTitle,required=new Set(),americas=false,fx:inputFx,cutoff}={}){
 const tables=[],annexRows=[],fxRows=[],fx=safeProteinFx(inputFx,cutoff);
 for(const daily of [true,false]){
  const selected=items.filter(item=>(item.cadence==='daily')===daily);if(!selected.length)continue;
  const label=item=>t(item.country)+'\n'+t(item.label);
  const prior=item=>{
   if(daily)return item.periods.day;
   const base=item.previous,last=item.last,tolerance=({weekly:10,monthly:40,annual:370})[item.cadence];
   return base && tolerance && base.value>0 && Date.parse(last.date)>Date.parse(base.date) && Date.parse(last.date)-Date.parse(base.date)<=tolerance*86400000 ? {value:(last.value/base.value-1)*100,base:base.value,baseDate:base.date,last:last.value,lastDate:last.date} : null;
  };
  const horizons=[['prior',daily ? 'Día anterior' : 'Publicación anterior'],['week','Semana'],['month','Mes'],['quarter','Trimestre'],['semester','Semestre'],['year','Año']];
  const changes=item=>horizons.map(([key])=>key==='prior' ? prior(item) : item.periods[key]);
  const currency=item=>item.country==='Estados Unidos' && String(item.unit).match(/^(USD|US¢)\/(.+)$/);
  const converted=Boolean(fx && selected.every(item=>currency(item) && Number.isFinite(item.last.value*fx.rates.MXN)));
  const equivalent=item=>item.last.value/(currency(item)[1]==='US¢' ? 100 : 1)*fx.rates.MXN;
  const methodology=daily ? 'Día anterior: última sesión publicada frente a la sesión previa. Semana: siete días; mes, trimestre, semestre y año: fecha equivalente anterior, dentro de la tolerancia de la serie.' : 'Las referencias semanales y mensuales comparan publicaciones, sin variación diaria inventada. Semana, mes, trimestre, semestre y año conservan la frecuencia de la serie.';
  const note=[t(methodology),t('Cada variación indica su fecha base; la fecha final es la del precio. Monedas y etapas comerciales originales; los precios no se convierten en equivalentes entre mercados.'),converted ? t('Equivalencia informativa en MXN por la misma unidad física; US¢ se divide entre 100. No es una cotización mexicana ni se usa para calcular variaciones históricas.')+' 1 USD = '+number(fx.rates.MXN)+' MXN · '+fx.observedAt.slice(0,10)+'.' : '',selected.some(item=>item.evidenceOrigin==='catalog') ? t('Incluye referencias de catálogo de respaldo; no equivale a una revalidación de cotizaciones en línea.') : ''].filter(Boolean).join(' ');
  tables.push({title:t(daily ? dailyTitle : periodicTitle),proteinAmericas:americas,proteinProtectedCoverage:true,proteinCoverage:coverage,proteinComparisonTable:true,proteinCurrency:converted,printGroup:'protein-reference-comparison',market:coverage,cadence:daily ? 'daily' : 'periodic',proteinRequiredRows:selected.filter(item=>required.has(item.label)).map(label),columns:['País / referencia','Precio publicado','Unidad original','Fecha del dato',...(converted ? ['Equivalente MXN'] : []),...horizons.map(([,name])=>name+' · %')].map(t),rows:selected.map(item=>[label(item),number(item.last.value),item.unit,item.last.date,...(converted ? [number(equivalent(item))] : []),...changes(item).map(change=>change ? directionalChange(change.value)+'\n'+t('Base')+': '+change.baseDate : null)]),note});
  for(const item of selected){
   changes(item).forEach((change,index)=>{if(change)annexRows.push([t(item.country),t(item.label),item.unit,t(horizons[index][1]),change.base,change.baseDate,change.last,change.lastDate,change.value,item.source,item.url]);});
   if(converted)fxRows.push([t(item.label),item.last.value,item.unit,equivalent(item),'MXN/'+currency(item)[2],item.last.date,fx.rates.MXN,fx.observedAt,fx.source,fx.url]);
  }
 }
 const annexTables=annexRows.length ? [{title:t(prefix+' · respaldo numérico de las variaciones de proteínas'),columns:['País','Referencia','Unidad original','Horizonte','Precio base','Fecha base','Último precio','Fecha final','Variación · %','Fuente','Enlace'].map(t),rows:annexRows,note:t('Variación calculada como (último precio / precio base − 1) × 100; cifras originales sin redondear.')}]:[];
 if(fxRows.length)annexTables.push({title:t('Estados Unidos · respaldo de equivalencias en pesos'),columns:['Referencia','Precio original','Unidad original','Equivalente MXN','Unidad MXN','Fecha del precio','MXN por USD','Fecha del tipo de cambio','Fuente cambiaria','Enlace'].map(t),rows:fxRows,note:t('Conversión del último precio con el tipo de cambio fechado; conserva el denominador físico. No es una cotización mexicana ni una rentabilidad en pesos.')});
 return {tables,annexTables};
}

export function proteinMercolleidaComparison(references,{t=value=>value}={}){
 const items=references.filter(isMercolleidaProtein);
 return proteinReferenceComparison(items,{t,coverage:'mercolleida',prefix:'Mercolleida',dailyTitle:'Mercolleida · precios y variaciones',periodicTitle:'Mercolleida · cotizaciones y variaciones',required:new Set(items.map(item=>item.label))});
}
