const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function annualProduct(reference) {
  const text=fold(reference.label);
  return [['Pollo',/pollo|pechuga|poultry/],['Huevo',/huevo|egg/],['Cerdo',/cerdo|porcino|chuleta|pork|hog/],['Bovino',/bovino|ganado|toro|carne molida|beef|cattle/],['Pescado',/salmon|pescado|tilapia|fish/],['Procesados',/procesad|embutido|salchicha/],['Maíz',/maiz|corn/],['Trigo',/trigo|wheat/],['Soya',/soya|soybean/],['Sorgo',/sorgo/]].find(([,pattern])=>pattern.test(text))?.[0] || 'Otras referencias';
}
export function annualReferenceMatches(item,filters,identify) {
  return (!filters.country || identify(item.label)===filters.country)
    && (!filters.region || item.region===filters.region)
    && (!filters.entity || item.market===filters.entity)
    && (!filters.product || annualProduct(item)===filters.product)
    && (!filters.query || fold(item.label+' '+item.market).includes(fold(filters.query)));
}
export function annualEvolutionVisuals(references,year) {
  const groups=new Map();
  for(const reference of references.filter(item=>item.points?.length>=2)) {
    const key=reference.kind+'|'+reference.unit;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(reference);
  }
  return [...groups.values()].map(items=>{
    const selected=items.slice(0,4),indexed=selected[0].unit==='puntos' && selected[0].kind==='price',unit=indexed ? 'Índice base 100 (primera muestra del año)' : selected[0].unit;
    return {type:'line',monthly:true,title:'Evolución mensual '+year+' · '+unit,unit,series:selected.map(item=>({label:item.label,points:indexed ? item.points.map(point=>({...point,value:point.value/item.points[0].value*100})) : item.points})),note:`${selected.length} de ${items.length} referencias de esta selección. Muestra mensual: último dato disponible de cada mes; las fuentes mensuales conservan su valor publicado. Los meses ausentes interrumpen la línea. El cambio del tramo mostrado no sustituye el cambio anual entre cierres de diciembre.`,reading:'Selecciona otras referencias para explorar sus trayectorias. Moneda, unidad y periodo permanecen separados.'};
  });
}
