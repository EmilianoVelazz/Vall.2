// Conditional transmission channels, never an attribution inferred from prices.
// This annex is derived from the very same two dated observations as the tables.
const finite=value=>typeof value==='number' && Number.isFinite(value);
const profiles={
  fx:{label:'Divisas',origin:'Mercado cambiario: unidades de moneda local por 1 USD.',factors:'Contrastar decisiones de bancos centrales, diferenciales de tasas y flujos de divisas del periodo.',up:'Se requieren más unidades de la moneda cotizada para pagar 1 USD. Puede encarecer compras y deuda en USD; los cobros en USD rinden más en esa moneda.',down:'Se requieren menos unidades de la moneda cotizada para pagar 1 USD. Puede abaratar compras y deuda en USD; los cobros en USD rinden menos en esa moneda.',check:'Revisar moneda de pago, monto pendiente, fecha de liquidación y cobertura.',link:['Banxico · tipo de cambio','https://educa.banxico.org.mx/recursos/pdf/%7BC6F6D9FF-A032-F743-C08B-D2924C3947BE%7D.pdf']},
  rates:{label:'Tasas y bonos',origin:'Rendimiento de deuda: un aumento de tasa no significa un aumento del precio del bono.',factors:'Contrastar anuncios monetarios, inflación y condiciones del emisor con su fecha de publicación.',up:'Una tasa mayor puede elevar el costo de deuda nueva o revisable y reducir el precio de bonos existentes a tasa fija.',down:'Una tasa menor puede reducir el costo de deuda nueva o revisable y elevar el precio de bonos existentes a tasa fija.',check:'Revisar plazo, tasa fija o variable y próxima revisión del crédito; no modifica automáticamente un cupón fijo.',link:['SEC · riesgo de tasas','https://www.investor.gov/introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/bonds']},
  equities:{label:'Bolsa',origin:'Mercado bursátil: el cambio corresponde a la acción o índice indicado.',factors:'Contrastar resultados y anuncios de las emisoras, tasas y noticias de la plaza en las fechas comparadas.',up:'Puede aumentar el valor de posiciones compradas en esa referencia. No demuestra una mejora de ingresos o márgenes de la empresa.',down:'Puede reducir el valor de posiciones compradas en esa referencia. El efecto realizado depende de vender y de la exposición mantenida.',check:'Revisar posición, moneda y composición del índice; el cambio del índice no es el rendimiento de cada acción.',link:['SEC · precios de acciones','https://www.investor.gov/introduction-investing']},
  grains:{label:'Granos',origin:'Cadena de granos: distinguir la referencia bursátil del precio físico puesto en destino.',factors:'Contrastar cosecha, clima, inventarios, consumo y comercio del producto y región correspondientes.',up:'Puede elevar el costo de grano y alimento balanceado y presionar el margen de quien compra; el vendedor puede recibir un precio mayor.',down:'Puede reducir el costo de grano y alimento balanceado; el productor o vendedor puede recibir un precio menor.',check:'Revisar contrato, calidad, base local, flete y tipo de cambio antes de calcular el costo de compra.',link:['USDA · oferta y demanda de granos','https://www.ers.usda.gov/topics/farm-economy/commodity-outlook/ers-outlook-reports-and-data']},
  proteins:{label:'Proteínas',origin:'Cadena pecuaria: conservar especie, entidad, presentación y etapa comercial de la referencia.',factors:'Contrastar oferta, sacrificio, consumo, comercio y sanidad de la misma especie y mercado.',up:'Puede encarecer la compra de esa proteína y presionar el margen del comprador; puede elevar el ingreso unitario del vendedor.',down:'Puede abaratar la compra de esa proteína; puede reducir el ingreso unitario del productor o vendedor.',check:'Revisar especie, peso, rendimiento, etapa, inventario y contratos; el futuro no equivale al precio físico local.',link:['USDA · mercados pecuarios','https://www.ers.usda.gov/topics/farm-economy/commodity-outlook/ers-outlook-reports-and-data']},
  energy:{label:'Energía',origin:'Cadena energética: la referencia mayorista no equivale al precio final de combustible o electricidad.',factors:'Contrastar producción, inventarios, demanda e interrupciones de suministro del energético correspondiente.',up:'Puede elevar costos de combustible, transporte o proceso; el traslado depende del insumo y del contrato.',down:'Puede aliviar costos de combustible, transporte o proceso; el traslado depende del insumo y del contrato.',check:'Revisar consumo, fórmula de precio, impuestos y fecha de ajuste; no trasladar el cambio del crudo directamente a la gasolina.',link:['EIA · precios de la energía','https://www.eia.gov/energyexplained/oil-and-petroleum-products/prices-and-outlook.php']},
  other:{label:'Otras referencias',origin:'La procedencia y el alcance deben confirmarse en la ficha de la referencia.',factors:'Contrastar oferta, demanda y eventos fechados del mismo producto, plaza y unidad; las cotizaciones no identifican una causa.',up:'Si es un insumo comprado, puede elevar el costo; si es un producto vendido, puede elevar el ingreso unitario.',down:'Si es un insumo comprado, puede reducir el costo; si es un producto vendido, puede reducir el ingreso unitario.',check:'Confirmar qué mide la referencia y la exposición real antes de estimar el efecto en el negocio.'},
};
function profileFor(report,reference,source) {
  const label=source(reference.label || ''),unit=source(reference.unit || '').trim(),key=report.baseReport?.key || report.key,collection=report.baseReport?.collection || report.collection;
  const pair=label.match(/^USD\/([A-Z]{3})(?: ·|$)/);
  if(pair && unit.startsWith(pair[1]) && /^[A-Z]{3}.*1 USD$/.test(unit) || unit==='MXN por 1 USD') return 'fx';
  if(/\bVIX\b|volatil/i.test(label) || collection==='mexico' && key==='mx_production') return null;
  if(unit==='%' && (key==='bonds' || /treasury|cetes|bono|bond|tasa|yield/i.test(label))) return 'rates';
  if((key==='equities' || key==='mx_bolsa' || unit==='puntos' && /S&P|Nasdaq|IPC|Dow|FTSE|DAX/i.test(label)) && !/\bVIX\b|volatil/i.test(label)) return 'equities';
  if(!/\b(?:USD|MXN|EUR|GBP|CAD|BRL|CNY|JPY)\b|US¢/.test(unit)) return null;
  if(key==='grains' || /\b(ma[ií]z|corn|trigo|wheat|soya|soybean|sorgo|sorghum)\b/i.test(label)) return 'grains';
  if(['proteins','mx_proteins'].includes(key) || /\b(cerdo|porcino|pollo|bovino|res|cattle|hogs|poultry|beef|pork)\b/i.test(label)) return 'proteins';
  if(/\b(WTI|Brent|crudo|petr[oó]leo|gas natural|natural gas|crude oil)\b/i.test(label)) return 'energy';
  // A metal, a volatility index or a production volume is not a purchase price.
  if(unit==='puntos' || /\bVIX\b|volatil/i.test(label) || collection==='mexico' && key==='mx_production') return null;
  return 'other';
}
export function reportCauseAnnex(report,references,window,{t=value=>value,source=value=>value,number=value=>String(value)}={}) {
  const labels=t;
  t=value=>report.causeText?.[value] || labels(value);
  let unavailable=0,unchanged=0;
  const moves=[];
  for(const reference of references) {
    const {previous,current}=reference,profile=profileFor(report,reference,source);
    if(!reference.unit?.trim() || !finite(previous) || !finite(current) || profile==='fx' && (previous<=0 || current<=0)) {unavailable++;continue;}
    const delta=current-previous;
    if(!finite(delta)) {unavailable++;continue;}
    if(delta===0) {unchanged++;continue;}
    const percent=previous>0 ? delta/previous*100 : null;
    const change=source(reference.unit).trim()==='%' ? number(delta)+' '+t('p. p.') : (delta>0 ? '+' : '')+number(delta)+' '+reference.unit+(finite(percent) ? ' ('+(percent>0 ? '+' : '')+number(percent)+' %)' : '');
    moves.push({profile,reference:reference.label,movement:t(delta>0 ? 'Alza' : 'Baja')+' · '+change,values:number(previous)+' → '+number(current)+' '+reference.unit,impact:profile ? t(profiles[profile][delta>0 ? 'up' : 'down']) : t('El efecto depende de lo que mide esta serie y de la exposición mantenida; no se infiere un costo de compra a partir de este indicador.')});
  }
  const selected=moves.slice(0,9),groups=new Map();
  for(const move of selected) {
    const key=move.profile || 'indicator';
    if(!groups.has(key)) {
      const profile=profiles[move.profile];
      groups.set(key,{label:t(profile?.label || 'Indicadores'),origin:t(profile?.origin || 'Indicador de mercado o volumen: no es un precio de compra.'),factors:t(profile?.factors || 'Confirmar la definición de la serie y contrastar sus componentes y eventos fechados.'),check:t(profile?.check || 'Revisar definición, unidad y exposición real.'),link:profile?.link && report.personalization?.sections?.sources!==false ? {label:t(profile.link[0]),url:profile.link[1]} : null,rows:[]});
    }
    groups.get(key).rows.push(move);
  }
  const status=moves.length ? 'Causa específica no confirmada: los factores siguientes son hipótesis por contrastar, no hechos atribuidos a este corte.' : unchanged ? 'Las referencias comparables no presentan cambio; no se atribuye una causa de alza o baja.' : 'Sin variaciones diarias verificables para atribuir una causa. Se requieren dos observaciones comparables, con fecha y unidad.';
  return {title:t('Causas y consecuencias'),period:[window.yesterday,window.today].filter(Boolean).join(' / '),status:t(status),conditions:moves.length ? t('Efectos posibles con el mismo volumen y condiciones de contrato; las coberturas, el inventario y el tipo de cambio pueden modificarlos.') : '',coverage:[`${t('Movimientos incluidos')}: ${selected.length} / ${moves.length}`,`${t('Sin cambio')}: ${unchanged}`,`${t('Sin comparación válida')}: ${unavailable}`].join(' · '),groups:[...groups.values()]};
}
