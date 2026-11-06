// A year-average repeated on several dates is not a dated market observation.
// Keep the original archive, but exclude that interval from session comparisons.
export function comparableProteinPoints(item,points){
 const basis=String(item.basis || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!/promedio anual|media anual|annual average|annual reference/.test(basis))return points;
 const interval=basis.match(/(20\d{2})\s*[–−-]\s*(20\d{2})\s*:/);
 if(!interval)return item.cadence==='annual' ? points : [];
 const first=Number(interval[1]),last=Number(interval[2]);
 return points.filter(point=>{const year=Number(point.date.slice(0,4));return year<first || year>last;});
}
