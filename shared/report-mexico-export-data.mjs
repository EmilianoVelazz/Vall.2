// Annual production observations keep their year, without inventing a daily date.
export function mexicoProductionObservations(report){
 if((report.baseReport?.collection || report.collection)!=='mexico' || (report.baseReport?.key || report.key)!=='mx_production')return [];
 const number=value=>{const text=String(value ?? '').trim();return /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(text) ? Number(text.replaceAll(',','')) : null;};
 const observations=[];
 for(const table of report.tables || []){
  const mining=/^Valor minero por entidad/.test(table.title),grains=/^Granos por entidad/.test(table.title);
  if(!mining && !grains)continue;
  const year=Number(table.title.match(/20\d{2}/)?.[0]);if(!year || year>Number(report.generatedAt?.slice(0,4)))continue;
  const url=(report.sourceLinks || []).find(item=>(mining ? /sgm\.gob/ : /agricultura|siap/).test(item.url))?.url || '';
  for(const row of table.rows || [])for(let column=1;column<(mining ? 2 : table.columns.length);column++){
   const value=number(row[column]);if(value===null || !Number.isFinite(value))continue;
   observations.push({label:mining ? 'Minería · valor de producción' : table.columns[column].replace(/\s*\(t\)$/,''),market:'México · '+row[0],unit:mining ? 'MXN' : 't',year,value,cadence:'annual',source:mining ? 'SGM' : 'DGSIAP',url});
  }
 }
 return observations;
}
