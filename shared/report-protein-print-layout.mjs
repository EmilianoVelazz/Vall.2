// Presentation only. A shared country, unit or observation date is printed
// once above its table; prices, comparison bases and row order stay intact.
export function proteinPrintTables(tables,{t=value=>value,source=value=>value}={}) {
 const notes=new Set();
 return tables.map(table=>{
  if(!table.proteinComparisonTable && !table.proteinHistoryTable)return table;
  const noteKey=String(table.note || '').replace(/\s+/g,' ').trim();
  let note=noteKey && !notes.has(noteKey) ? table.note : '';
  if(noteKey)notes.add(noteKey);
  if(!table.proteinComparisonTable || !table.rows.length)return {...table,note};
  let title=table.title;
  const labels=table.rows.map(row=>String(row[0]).split('\n'));
  const commonCountry=labels.every(parts=>parts.length>1 && parts[0]===labels[0][0]) ? labels[0][0] : '';
  if(commonCountry && !title.includes(commonCountry))title+=' · '+commonCountry;
  const hidden=new Set(),facts=[];
  for(const [index,column] of table.columns.entries()){
   const name=source(column),values=table.rows.map(row=>row[index]);
   if(table.rows.length<2 || !values[0] || !values.every(value=>value===values[0]))continue;
   if(/^Unidad(?: original)?$/i.test(name) || /^Fecha del dato$/i.test(name) && /^\d{4}-\d{2}-\d{2}$/.test(values[0])){
    hidden.add(index);facts.push(column+': '+values[0]);
   }
  }
  const bases=new Map();
  for(const [index,column] of table.columns.entries()){
   if(!/· %$/.test(column) || table.rows.length<2)continue;
   const values=table.rows.map(row=>String(row[index]).match(/^([^\n]+)\n([^\n]+): (\d{4}-\d{2}-\d{2})$/));
   if(values.every(value=>value && value[3]===values[0][3]))bases.set(index,{date:values[0][3],label:values[0][2]});
  }
  const indices=table.columns.map((_,index)=>index).filter(index=>!hidden.has(index));
  const rows=table.rows.map((row,index)=>indices.map(column=>{
   if(bases.has(column))return String(row[column]).split('\n')[0];
   if(column!==0)return row[column];
   const [country,...parts]=labels[index];
   if(!parts.length)return row[column];
   let reference=parts.join('\n');
   for(const separator of [' · ', ', '])if(reference.endsWith(separator+country)){
    reference=reference.slice(0,-separator.length-country.length);break;
   }
   return (commonCountry ? '' : country+'\n')+reference;
  }));
  note=[facts.join(' · '),note].filter(Boolean).join('\n');
  return {...table,title,note,printContinuationContext:facts.join(' · '),columns:indices.map(index=>index===0 && commonCountry ? t('Referencia') : table.columns[index]+(bases.has(index) ? '\n'+bases.get(index).label+': '+bases.get(index).date : '')),rows};
 });
}
