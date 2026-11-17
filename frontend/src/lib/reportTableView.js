export const foldTableText=value=>String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const numeric=value=>{
 if(typeof value==='number')return Number.isFinite(value) ? {value,unit:''} : null;
 const match=String(value ?? '').trim().match(/^[↑↓→]?\s*([+−-]?[\d,]+(?:\.\d+)?)\s*(%|pb|p\.\s*p\.)?$/);
 if(!match)return null;const parsed=Number(match[1].replaceAll(',','').replace('−','-'));return Number.isFinite(parsed) ? {value:parsed,unit:match[2] || ''} : null;
};
export function reportTableView(table,{query='',column=-1,direction='asc',locale='es-MX'}={}){
 const needle=foldTableText(query),rows=(table.rows || []).map((row,index)=>({row,index})).filter(item=>!needle || foldTableText(item.row.join(' ')).includes(needle));
 if(column>=0 && column<table.columns.length){
  const collator=new Intl.Collator(locale,{numeric:true,sensitivity:'base'}),sign=direction==='desc' ? -1 : 1;
  rows.sort((a,b)=>{
   const av=a.row[column],bv=b.row[column],missing=value=>value==null || /^(?:\s*|—|sin dato|no disponible)$/i.test(String(value));
   if(missing(av)!==missing(bv))return missing(av) ? 1 : -1;
   const an=numeric(av),bn=numeric(bv),order=an && bn && an.unit===bn.unit ? an.value-bn.value : collator.compare(String(av ?? ''),String(bv ?? ''));
   return order*sign || a.index-b.index;
  });
 }
 return rows.map(item=>item.row);
}
