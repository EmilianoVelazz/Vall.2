// Presentation only: observations, histories and commercial bases stay intact.
export function formatFinanceReport(report,model,{t=value=>value,commentary=model.commentary || [],change=value=>String(value)}={}){
  const key=report.baseReport?.key || report.key;
  if(report.periodType==='annual' || !['bonds','fx'].includes(key))return model;
  const references=model.references || [],period=report.analysisPeriod==='weekly' ? 'week' : 'day';
  let panels=model.summaryPanels || [],results=model.results;
  if(key==='bonds'){
    const daily=references.filter(ref=>Number.isFinite(ref.changeBp));
    const up=daily.some(ref=>ref.changeBp>0),down=daily.some(ref=>ref.changeBp<0);
    const why=commentary.find(panel=>panel.heading===t('Por qué pudo pasar'));
    const impacts=[up ? t('Un mayor rendimiento exigido puede reducir el precio de bonos existentes de tasa fija y elevar el costo de deuda nueva o a tasa variable.') : '',down ? t('Un menor rendimiento exigido puede apoyar el precio de bonos existentes y reducir la tasa disponible al reinvertir vencimientos.') : '',up || down ? t('El cupón de una deuda fija ya contratada no cambia automáticamente; el efecto depende de duración, moneda y condiciones del contrato.') : ''].filter(Boolean).join(' ');
    panels=[{heading:t('Qué pasó'),body:model.summary.split(t('Además,'))[0].trim()},
      ...(why ? [{heading:t('Cómo se explica'),body:why.body}] : []),
      ...(model.curve ? [{heading:t('Claves por plazo'),body:commentary.find(panel=>panel.heading===t('Qué explica la curva'))?.body}] : []),
      ...(impacts ? [{heading:t('Repercusiones posibles'),body:impacts}] : [])].filter(panel=>panel.body);
    const auctions=new Set(references.filter(ref=>ref.cadence==='auction').map(ref=>t(ref.label)));
    results=results.flatMap(table=>{
      if(table.columns.length!==7 || table.columns.at(-1)!==t('Cambio (pb)'))return [table];
      const dailyRows=table.rows.filter(row=>!auctions.has(row[0])),auctionRows=table.rows.filter(row=>auctions.has(row[0]));
      return [...(dailyRows.length ? [{...table,title:t('Bonos · sesiones comparables'),rows:dailyRows.map(row=>row.map((cell,index)=>index===6 && /^[+-]?\d/.test(cell) ? (cell.startsWith('-') ? '↓ ' : parseFloat(cell)===0 ? '→ ' : '↑ ')+cell : cell))}] : []),
        ...(auctionRows.length ? [{title:t('Subastas · último rendimiento publicado'),columns:['Referencia','Mercado / moneda','Último (%)','Fecha del dato'].map(t),rows:auctionRows.map(row=>[row[0],row[1],row[4],row[5]]),note:t('Resultados de subastas con su fecha de publicación; no son cierres diarios ni se les asigna una variación de sesión.')}] : [])];
    });
  }else{
    const ranked=references.filter(ref=>Number.isFinite(ref.periods?.[period]?.value)).sort((a,b)=>Math.abs(b.periods[period].value)-Math.abs(a.periods[period].value)),leader=ranked[0];
    const explanation=t('Las cotizaciones no identifican una causa confirmada. Para explicar el movimiento hay que contrastar tasas, inflación y flujos con anuncios fechados del mismo periodo.');
    const impact=leader ? t(leader.periods[period].value>0 ? 'En {pair}, la subida aumenta la equivalencia en moneda local de pagos y cobros fijos en USD.' : leader.periods[period].value<0 ? 'En {pair}, la baja reduce la equivalencia en moneda local de pagos y cobros fijos en USD.' : 'En {pair}, el valor publicado no cambió entre las observaciones comparadas.').replace('{pair}',t(leader.label))+' '+t('El costo de una operación depende también de la cotización ejecutable, comisiones y coberturas.') : '';
    panels=[...panels.filter((panel,index)=>index===0 || panel.heading===t('Claves por horizonte')),
      {heading:t('Cómo se explica'),body:explanation},...(impact ? [{heading:t('Repercusiones posibles'),body:impact}] : [])];
    if(panels[0]){
      let body=panels[0].body;
      if(leader){
        const observed=leader.periods[period];
        const fact=t('{pair}: {change} ({start} / {end}).').replace('{pair}',t(leader.label)).replace('{change}',change(observed.value)).replace('{start}',observed.baseDate).replace('{end}',observed.lastDate);
        const breadth=t('Dólar frente a monedas locales: {up} al alza, {down} a la baja y {flat} sin cambio; cada par conserva sus fechas.').replace('{up}',ranked.filter(ref=>ref.periods[period].value>0).length).replace('{down}',ranked.filter(ref=>ref.periods[period].value<0).length).replace('{flat}',ranked.filter(ref=>ref.periods[period].value===0).length);
        body=fact+' '+breadth;
      }
      panels[0]={...panels[0],heading:t('Qué pasó'),body};
    }
  }
  return {...model,results,summaryPanels:panels,commentary:panels,visuals:model.visuals.map(visual=>({...visual,financePalette:true,dataInTables:results.length>0}))};
}
