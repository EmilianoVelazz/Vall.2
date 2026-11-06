// Print composition only: preserve the reader model and the original evidence.
// Explicit groups prevent unrelated indicators from being merged by unit alone.
const mergeNotes=(...notes)=>[...new Set(notes.flatMap(note=>String(note || '').split(/\n{2,}/)).filter(Boolean))].join('\n\n');
export function splitPrintDateTables(table){
  if(!table.printDateColumns || table.rows.length<8)return [table];
  const groups=new Map();
  for(const row of table.rows){const dates=table.columns.slice(1).map((column,index)=>{const parts=String(row[index+1] ?? '').split('\n');return /^20\d{2}$/.test(column) && parts.length===2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && parts[1].startsWith(column+'-') ? parts[1] : '';});const key=JSON.stringify(dates);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  const eligible=[...groups.values()].filter(rows=>rows.length>=4 && rows.every(row=>row.slice(1).every(cell=>/^.+\n\d{4}-\d{2}-\d{2}$/.test(String(cell)))));
  if(eligible.length<2 || eligible.length>4 || eligible.reduce((sum,rows)=>sum+rows.length,0)<table.rows.length*2/3)return [table];
  const kept=new Set(eligible.flat()),remaining=table.rows.filter(row=>!kept.has(row)),parts=[...eligible,...(remaining.length ? [remaining] : [])];
  return parts.map((rows,index)=>({...table,title:table.title+' · '+(index+1)+'/'+parts.length,rows,note:index ? '' : table.note,printDateNote:index ? '' : table.printDateNote}));
}
function joinBriefChanges(tables){
  const levels=tables.find(table=>table.printGroup==='market-levels');
  const changes=tables.find(table=>table.printGroup==='market-returns' && table.columns.length>1 && table.columns.length<=3);
  if(!levels || !changes)return tables;
  const prices=new Map(),moves=new Map();
  for(const row of levels.rows)prices.set(row[0],prices.has(row[0]) ? null : row);
  for(const row of changes.rows)moves.set(row[0],moves.has(row[0]) ? null : row);
  const labels=new Set([...moves].filter(([label,row])=>row && prices.get(label)).map(([label])=>label));
  if(!labels.size)return tables;
  const title=(levels.printTitle || levels.title)+' · '+(changes.printTitle || changes.title),joined={...levels,title,printTitle:title,printGroup:'market-quote-changes',columns:[...levels.columns,...changes.columns.slice(1)],rows:levels.rows.filter(row=>labels.has(row[0])).map(row=>[...row,...moves.get(row[0]).slice(1)]),note:mergeNotes(levels.note,changes.note)};
  return tables.flatMap(table=>table===levels ? [joined,{...levels,rows:levels.rows.filter(row=>!labels.has(row[0])),note:''}].filter(table=>table.rows.length) : table===changes ? [{...changes,rows:changes.rows.filter(row=>!labels.has(row[0])),note:''}].filter(table=>table.rows.length) : [table]);
}
export function compactPrintTables(tables,{source=value=>value,foldDates=true,compactUnits=true,inlineLabels=false,columnDates=false,joinShortChanges=false,foldCurrencies=false}={}){
  const output=[],groups=new Map();
  for(const table of tables){
    const key=table.printGroup ? JSON.stringify([table.printGroup,table.columns,table.unit,table.period,table.source,table.cadence,table.market]) : null;
    const prior=key && groups.get(key);
    if(prior){prior.rows.push(...table.rows);prior.note=mergeNotes(prior.note,table.note);continue;}
    const item={...table,rows:[...table.rows],title:table.printTitle || table.title};output.push(item);if(key)groups.set(key,item);
  }
  return (joinShortChanges ? joinBriefChanges(output) : output).map(table=>{
    const names=table.columns.map(source),pairs=new Map(),hidden=new Set();
    const dateCells=index=>table.rows.every(row=>/^(?:\d{4}-\d{2}(?:-\d{2})?|—|No aplica|Sin dato)$/.test(String(row[index] ?? '')));
    for(const [datePattern,valuePattern] of (foldDates ? [
      [/^Fecha anterior$/i,/^(?:Cierre anterior|Base semanal|Anterior(?: \(%\))?)$/i],
      [/^(?:Fecha del dato|Fecha del cierre|Mes publicado)$/i,/^(?:Último(?: publicado| \(%\))?|Unidades por 1 USD)$/i],
    ] : [])){
      const date=names.findIndex(name=>datePattern.test(name)),value=names.findIndex(name=>valuePattern.test(name));
      if(date>=0 && value>=0 && dateCells(date) && table.rows.every(row=>!String(row[value] ?? '').includes('\n'))){pairs.set(value,date);hidden.add(date);}
    }
    if(foldCurrencies && ['market-levels','market-quote-changes'].includes(table.printGroup)){
      const usd=names.indexOf('USD'),mxn=names.indexOf('MXN');
      if(usd>=0 && mxn>=0 && table.rows.every(row=>!String(row[usd] ?? '').includes('\n') && !String(row[mxn] ?? '').includes('\n'))){pairs.set(usd,mxn);hidden.add(mxn);}
    }
    const unit=names.findIndex(name=>/^Unidad(?: original)?$/i.test(name)),units=new Set(table.rows.map(row=>row[unit]));
    const commonUnit=compactUnits && unit>=0 && table.rows.length && units.size===1 && String(table.rows[0][unit] ?? '').trim();
    if(commonUnit)hidden.add(unit);
    const dates=new Map();
    if(columnDates && table.printDateColumns)for(let index=1;index<table.columns.length;index++){
      const year=String(table.columns[index]),counts=new Map();if(!/^20\d{2}$/.test(year))continue;
      for(const row of table.rows){const parts=String(row[index] ?? '').split('\n');if(parts.length===2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && parts[1].startsWith(year+'-'))counts.set(parts[1],(counts.get(parts[1]) || 0)+1);}
      const most=[...counts].sort((a,b)=>b[1]-a[1])[0];if(most && most[1]>table.rows.length/2)dates.set(index,most[0]);
    }
    const indices=table.columns.map((_,index)=>index).filter(index=>!hidden.has(index));
    return {...table,title:table.title+(commonUnit ? ' · '+table.rows[0][unit] : ''),note:dates.size ? mergeNotes(table.note,table.printDateNote) : table.note,columns:indices.map(index=>table.columns[index]+(pairs.has(index) ? '\n'+table.columns[pairs.get(index)] : dates.has(index) ? '\n'+dates.get(index) : '')),rows:table.rows.map(row=>indices.map(index=>{
      if(pairs.has(index))return String(row[index] ?? '')+'\n'+String(row[pairs.get(index)] ?? '');
      if(index===0 && inlineLabels)return String(row[index] ?? '').replace(/\r?\n/g,' · ');
      if(dates.has(index)){const parts=String(row[index] ?? '').split('\n');if(parts.length===2 && parts[1]===dates.get(index))return parts[0];}
      return row[index];
    }))};
  });
}
