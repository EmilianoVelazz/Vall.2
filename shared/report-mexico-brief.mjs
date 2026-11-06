// Lectura empresarial derivada exclusivamente del corte; no atribuye causas
// macroeconómicas ni recomienda operaciones sin evidencia adicional.
const finite=Number.isFinite;
const number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:4});
const numeric=value=>{const text=String(value ?? '').replace(/,/g,'').trim();return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;};
export const heterogeneousProteinBasis=value=>/mezcla de tipos|tipos mezclados|presentaciones distintas|no comparables/i.test(String(value || ''));
function fxImpact(references,period){
 const reference=references.find(item=>item.unit==='MXN por 1 USD'),change=reference?.periods[period];
 if(!change)return '';
 const delta=change.last-change.base;
 return delta===0 ? 'USD/MXN no cambió entre '+change.baseDate+' y '+change.lastDate+'; no se observa cambio del contravalor por dólar en esas dos referencias.' : 'USD/MXN '+(delta>0 ? 'aumentó ' : 'disminuyó ')+number(Math.abs(delta))+' MXN por USD ('+change.baseDate+' / '+change.lastDate+'). '+(delta>0 ? 'Encarece el contravalor de pagos en USD y eleva los cobros convertidos a MXN.' : 'Reduce el contravalor de pagos en USD y los cobros convertidos a MXN.')+' El efecto neto depende de vencimientos y cobertura.';
}
export function mexicoExecutiveBrief(key,{results=[],references=[],signals=[],weekly=false,timing='',profile,risks=true,fallback=''}){
 const period=weekly ? 'week' : 'day';let fact='',impact=profile.effect,watch=profile.watch;
 if(key==='mx_overview'){
  const rows=results.find(table=>table.title.includes('Economía nacional'))?.rows || [],years=[...new Set(rows.map(row=>row[3]))].sort();
  const gdp=rows.find(row=>/PIB|crecimiento real/i.test(row[0]) && row[2]==='%'),inflation=rows.find(row=>/inflaci[oó]n/i.test(row[0]));
  fact=years.length ? 'Lectura estructural de '+years.join(' y ')+'. Los indicadores conservan su año de observación; no describen la sesión de hoy. ' : '';
  if(gdp){const value=numeric(gdp[1]),previous=numeric(String(gdp[4]).replace(/\s*\(\d{4}\)$/,'')),priorYear=String(gdp[4]).match(/\((\d{4})\)$/)?.[1];if(finite(value))fact+='El PIB registró '+(value>0 ? 'crecimiento' : value<0 ? 'contracción' : 'crecimiento nulo')+' en '+gdp[3]+(value>0 && previous>0 && value!==previous && priorYear ? ', a un ritmo '+(value<previous ? 'menor' : 'mayor')+' que en '+priorYear : '')+'. ';}
  if(inflation){const value=numeric(inflation[1]),previous=numeric(String(inflation[4]).replace(/\s*\(\d{4}\)$/,''));if(finite(value) && finite(previous))impact='La inflación de '+inflation[3]+' es '+(value>previous ? 'mayor' : value<previous ? 'menor' : 'igual')+' al registro previo. '+(value>0 ? 'Una tasa menor no implica precios más bajos: el nivel de precios sigue aumentando mientras la inflación sea positiva. ' : value<0 ? 'La variación negativa corresponde a ese periodo observado. ' : '')+'Revisar costos y márgenes con los precios realmente contratados.';}
  const currency=fxImpact(references,period);if(currency)impact=(inflation ? impact+' ' : '')+currency;
  watch='Separar el presupuesto actual del contexto anual. Contrastar pedidos, costos y caja con las siguientes publicaciones oficiales de actividad e inflación; actualizar por separado los vencimientos en USD. No trasladar un dato anual a una variación diaria.';
 }else if(key==='mx_bolsa'){
  const comparable=signals.find(item=>item.label==='Balance de emisoras comparables');
  fact=comparable ? 'La muestra tiene '+comparable.value+' entre '+comparable.period+'. Es un balance de emisoras, no el rendimiento de un índice ni una ponderación por capitalización. ' : 'Las referencias se presentan con su propia fecha; sólo se calculan cambios con una base observada de la misma emisora. ';
  if(timing)fact+=timing;
  impact=fxImpact(references,period) || profile.effect;
  const movers=signals.filter(item=>['Mayor avance','Mayor retroceso'].includes(item.label)).map(item=>item.detail);
  watch=(movers.length ? 'Contrastar los movimientos de '+movers.join(' y ')+' con comunicados y resultados fechados de esas emisoras. ' : '')+'Conciliar posiciones con el cierre definitivo y separar la valuación bursátil del flujo de caja y la exposición cambiaria.';
 }else if(key==='mx_proteins'){
  const species=[...new Set(references.map(item=>item.category))],changed=species.filter(category=>references.some(item=>item.category===category && item.periods[period]));
  const slower=species.filter(category=>references.some(item=>item.category===category && item.cadence!=='daily'));
  fact=changed.length ? 'Cambios de '+(weekly ? 'siete días' : 'sesión')+' verificables en '+changed.join(', ')+'. ' : 'Los precios conservan la fecha y la presentación de cada referencia; no se publica una variación sin base comparable. ';
  if(slower.length)fact+=slower.join(', ')+': también hay publicaciones semanales o mensuales; su frecuencia no se convierte en un cambio diario. ';
  const mixed=[...new Set(references.filter(item=>heterogeneousProteinBasis(item.basis)).map(item=>item.category))];
  impact=(mixed.length ? mixed.join(', ')+': algunas referencias mezclan tipos o presentaciones. Su rango es descriptivo y no permite elegir un origen por precio sin igualar el producto. ' : '')+'Separar peso vivo, canal y mayoreo. Comparar el costo entregado con calidad, rendimiento y flete; la diferencia entre estados no es un ahorro garantizado.';
  const dated=references.filter(item=>item.last?.date).toSorted((a,b)=>a.last.date.localeCompare(b.last.date))[0];
  watch=(dated ? 'Validar vigencia de '+dated.category+' en '+dated.state+' ('+(dated.periodLabel || dated.last.date)+'). ' : '')+'Solicitar ofertas de la misma presentación, plaza, volumen y fecha de entrega. Los precios agregados no sustituyen una oferta ejecutable del proveedor.';
 }else if(key==='mx_production'){
  const table=results.find(table=>table.title.includes('Concentración agrícola'));
  const ranked=(table?.rows || []).map(row=>({crop:row[0],states:row[3],share:numeric(String(row[5]).replace(/\s*%$/,''))})).filter(item=>finite(item.share)).sort((a,b)=>b.share-a.share),top=ranked.slice(0,2);
  const years=[...new Set(results.flatMap(table=>table.title.match(/20\d{2}/g) || []))].sort();
  fact=top.map(item=>item.crop+': las tres mayores entidades reúnen '+number(item.share)+' % del volumen registrado ('+item.states+').').join(' ');
  if(years.length)fact+=' Periodos productivos: '+years.join(' y ')+'.';
  impact=top.length ? 'Si el abastecimiento depende de '+top[0].crop+', revisar continuidad y rutas de '+top[0].states+'. La concentración mide dependencia regional; no demuestra desabasto, inventario disponible ni una interrupción de transporte.' : profile.effect;
  watch='Contrastar la producción histórica con existencias y contratos vigentes antes de programar compras. '+(top.length ? 'Evaluar orígenes alternos para '+top.map(item=>item.crop).join(' y ')+'. ' : '')+'En minería, separar el valor en MXN del volumen físico y del precio de cada mineral.';
 }
 const summary=fact.trim() || fallback || 'No hay observaciones suficientes para una lectura cuantitativa de este corte.';
 const panels=[{heading:key==='mx_overview' ? 'Lectura del contexto anual' : key==='mx_production' ? 'Concentración y periodo observado' : weekly ? 'Lectura de la semana' : 'Lectura del corte',body:summary},{heading:'Impacto para la empresa',body:impact},...(risks ? [{heading:'Qué verificar antes de decidir',body:watch}] : [])];
 return {summary,panels};
}
