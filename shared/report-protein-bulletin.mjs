const finite=value=>typeof value==='number' && Number.isFinite(value);
const groups=[
  {id:'chicken',label:'Pollo',pattern:/pollo|poulet|chicken/i,factor:'Contrastar sacrificio, inventarios, disponibilidad de cortes, exportaciones y sanidad en las plazas publicadas.',effect:'El cambio del pollo entero no se aplica automáticamente a pechuga o filete: rendimiento, conservación, flete y condiciones de entrega modifican el costo.'},
  {id:'eggs',label:'Huevo',pattern:/huevo|oeuf|egg/i,factor:'Contrastar postura, ponedoras, calibre, empaque y pedidos de la misma plaza; una restricción sanitaria requiere una publicación fechada.',effect:'Una referencia por 100 piezas no equivale a precio por kilogramo ni a huevo líquido. La reposición y el margen dependen del calibre y del contrato.'},
  {id:'pork',label:'Porcino',pattern:/cerdo|porcin|lech[oó]n|hog|pork/i,factor:'Contrastar sacrificio, pesos, oferta de animales, demanda de carne y exportaciones del mercado de origen.',effect:'El movimiento del futuro orienta la exposición financiera; no determina el precio del animal vivo, de la canal o de un corte entregado.'},
  {id:'beef',label:'Vacuno',pattern:/ganado|vacun|bovin|cattle|carne de res/i,factor:'Contrastar entradas a engorda, peso de salida, sacrificio y demanda de carne por calidad y mercado.',effect:'Ganado vivo y ganado de engorda son referencias distintas. El costo de carne incluye conversión a canal, despiece, merma y transporte.'},
  {id:'fish',label:'Pescado y acuicultura',pattern:/pescad|salm[oó]n|saumon|fish/i,factor:'Contrastar cosecha acuícola o capturas, origen, talla, conservación y transporte refrigerado.',effect:'Entero, eviscerado y filete tienen rendimientos diferentes. La comparación de precio exige la misma talla, origen y presentación.'},
  {id:'processed',label:'Procesados y alternativas',pattern:/procesad|surimi|ahumad|l[ií]quido/i,factor:'Contrastar materia prima, rendimiento de transformación, energía, empaque e inventario del producto terminado.',effect:'Contratos e inventarios pueden retrasar el ajuste de precio. Surimi, salmón ahumado y huevo líquido conservan sus propias presentaciones y frecuencias.'},
  {id:'feed',label:'Alimentación animal',pattern:/harina|soya|soja|meal|feed/i,factor:'Contrastar disponibilidad de harina, molienda, comercio y formulación del alimento.',effect:'La harina de soya se presenta como insumo para alimentación animal. Su futuro no equivale al costo de una proteína terminada para consumo humano.'},
  {id:'other',label:'Otras proteínas',pattern:/.*/,factor:'Verificar oferta, demanda, presentación y fecha de la referencia original.',effect:'Confirmar precio entregado y rendimiento antes de estimar un efecto en costos.'},
];
export function isProteinBulletin(report) {
  const origin=report.baseReport || report;
  return report.periodType!=='annual' && origin.key==='proteins' && (!origin.collection || origin.collection==='markets');
}
function family(item,source) {
  const label=source(item.label || ''),category=source(item.category || '');
  if(/procesad/i.test(category) || /surimi|ahumad|l[ií]quido/i.test(label))return groups.find(group=>group.id==='processed');
  return groups.find(group=>group.pattern.test(category+' '+label));
}
export function proteinBulletinReport(model,{t=value=>value,source=value=>value,sourceTables=[],chartsEnabled=true,news=[]}={}) {
  const price=value=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:Math.abs(value)<.01 ? 5 : 3}) : t('Sin dato');
  const signed=value=>(value>0 ? '+' : '')+price(value);
  const pct=value=>(value>0 ? '+' : '')+value.toLocaleString('es-MX',{maximumFractionDigits:2})+' %';
  const sheets=[],visuals=[];
  for(const group of groups) {
    const references=model.references.filter(item=>family(item,source).id===group.id);
    if(!references.length)continue;
    const tables=[],partitions=new Map();
    for(const item of references) {
      const future=/futuro|futures/i.test(source(item.basis || '')) || /CME|CBOT|Dalian/i.test(source(item.label));
      const id=(future ? 'future' : 'physical')+'|'+item.cadence+'|'+(!future && item.cadence!=='daily' ? item.unit : '');
      if(!partitions.has(id))partitions.set(id,{future,cadence:item.cadence,items:[]});
      partitions.get(id).items.push(item);
    }
    for(const {future,cadence,items} of partitions.values()) {
      const daily=cadence==='daily',frequency=t(({daily:'Diaria',weekly:'Semanal',monthly:'Mensual',annual:'Anual',auction:'Subasta'})[cadence] || 'Otra frecuencia');
      const mode=t(future ? 'Futuros de referencia' : 'Mercado físico');
      const cell=item=>t(item.label)+(item.quoteStatus==='preserved' ? '\n'+t('Último dato conservado') : '');
      const current=item=>price(item.last?.value)+'\n'+(item.last?.date || t('Sin fecha'))+(item.stale && item.last ? '\n'+t('Dato antiguo') : '');
      const difference=item=>finite(item.delta) ? signed(item.delta)+(finite(item.percent) ? '\n'+pct(item.percent) : '') : t(item.gap ? 'Fechas separadas' : item.stale && item.last ? 'Dato antiguo' : 'Sin comparación');
      const conditions=[...new Set(items.map(item=>source(item.basis || '')).filter(Boolean))];
      const note=[daily ? t('Anterior y actual son las dos últimas publicaciones comparables de cada referencia; las fechas pueden variar entre plazas.') : t('Última publicación disponible. Esta frecuencia no se convierte en una variación diaria.'),...conditions.map(t)].join(' ');
      tables.push({title:t(group.label)+' · '+mode+' · '+frequency,proteinQuote:true,columns:(daily ? ['Producto / plaza','Unidad','Anterior / fecha','Actual / fecha','Dif. / cambio %'] : ['Producto / plaza','Unidad','Actual / fecha','Frecuencia']).map(t),rows:items.map(item=>daily ? [cell(item),t(item.unit),price(item.previous?.value)+'\n'+(item.previous?.date || t('Sin fecha')),current(item),difference(item)] : [cell(item),t(item.unit),current(item),frequency]),note});
      const comparable=items.filter(item=>finite(item.percent));
      if(daily && comparable.length)visuals.push({type:'bar',proteinFamily:group.id,sessionMovement:true,title:t(group.label)+' · '+mode,unit:'%',bars:comparable.map(item=>({label:t(item.label),value:item.percent})),note:t('Cambio de las dos últimas publicaciones de la misma referencia; fechas y niveles en la tablilla. No se convierten monedas ni se comparan precios físicos con futuros.'),reading:t('Fechas comparadas (anterior / actual)')+': '+[...new Set(comparable.map(item=>item.previous.date+' / '+item.last.date))].join('; ')+'.'});
      const levels=items.filter(item=>item.last && !item.stale);
      if(!daily && levels.length)visuals.push({type:'bar',proteinFamily:group.id,contextPrice:true,title:t(group.label)+' · '+frequency+' · '+t(items[0].unit),unit:t(items[0].unit),bars:levels.map(item=>({label:t(item.label)+' · '+item.last.date,value:item.last.value})),note:t('Último precio publicado, sin cambio diario. Misma unidad; cada producto conserva su presentación y fecha. Los niveles no implican equivalencia nutricional ni costo entregado.'),reading:t('Contexto')+' · '+frequency+'. '+t('Fechas de referencia')+': '+[...new Set(levels.map(item=>item.last.date))].join(' / ')+'.'});
    }
    const comparable=references.filter(item=>finite(item.delta)),up=comparable.filter(item=>item.delta>0).length,down=comparable.filter(item=>item.delta<0).length,flat=comparable.length-up-down,latest=[...new Set(references.filter(item=>item.last).map(item=>item.last.date))].sort();
    const heading=t(!comparable.length ? 'Referencias sin cambio diario calculable' : up && down ? 'Movimientos distintos entre plazas' : up ? 'Alzas en las referencias comparables' : down ? 'Bajas en las referencias comparables' : 'Repetición en las referencias comparables');
    const observation=t(`${references.filter(item=>item.last).length} referencias con dato. ${comparable.length} comparaciones diarias: ${up} al alza, ${down} a la baja y ${flat} sin cambio.`);
    const move=[...comparable].filter(item=>finite(item.percent)).sort((a,b)=>Math.abs(b.percent)-Math.abs(a.percent))[0];
    const observed=move ? `${source(move.label)}: ${pct(move.percent)}, entre ${move.previous.date} y ${move.last.date}.` : 'No hay dos observaciones recientes comparables; no se identifica una variación diaria.';
    const financial=move && (/futuro|futures/i.test(source(move.basis || '')) || /CME|CBOT|Dalian/i.test(source(move.label)));
    const repercussion=financial ? 'El movimiento corresponde a una referencia financiera; modifica la exposición al contrato y no acredita un cambio del costo físico entregado. '+group.effect : move && move.delta!==0 ? (move.delta>0?'En la referencia indicada, el alza puede encarecer la reposición y presionar el margen del comprador.':'En la referencia indicada, la baja puede aliviar la reposición y reducir el valor de inventarios comprados a mayor precio.')+' No se traslada automáticamente ese porcentaje a otras plazas, presentaciones ni contratos. '+group.effect : group.effect;
    const related=news.filter(item=>group.pattern.test(item.title+' '+item.description)).slice(0,2);
    const evidence=related.length ? 'Contexto publicado para contrastar: '+related.map(item=>item.publishedAt.slice(0,10)+' · '+item.title).join('; ')+'. La relación temática no confirma la causa de la variación de esta plaza.' : 'No hay evidencia específica suficiente en el corte para atribuir una causa confirmada a este movimiento.';
    sheets.push({id:group.id,label:t(group.label),references:references.length,tables,visuals:chartsEnabled ? visuals.filter(visual=>visual.proteinFamily===group.id) : [],heading,observation,scope:t('Publicaciones')+': '+(latest.join(' / ') || t('Sin dato')),observed:t(observed),evidence:t(evidence),factor:t(group.factor),effect:t(repercussion)});
  }
  // The dated Mercolleida comments appear in the explanation below the charts.
  // Keep their original table in the report's annexes, without printing it twice.
  const supplementaryTables=sourceTables.filter(table=>source(table.title)!=='Mercolleida · comentarios publicados').map(table=>{
    const indices=table.columns.map((column,index)=>/^(fuente|proveedor|source)$/i.test(source(column)) ? -1 : index).filter(index=>index>=0);
    const mercolleida=/^Mercolleida ·/.test(source(table.title));
    return {...table,title:mercolleida ? t('Tendencias del mercado español') : table.title,columns:indices.map(index=>table.columns[index]),rows:table.rows.map(row=>indices.map(index=>row[index])),note:mercolleida ? t('Tendencias cualitativas de España en las fechas indicadas; no representan precios absolutos ni variaciones diarias calculadas.') : table.note};
  });
  const results=[...sheets.flatMap(sheet=>sheet.tables),...supplementaryTables];
  const opening=model.commentary.slice(0,3).map(item=>({...item,body:t(source(item.body).replace('las gráficas separan cada región y no mezclan niveles de monedas distintas.','las gráficas separan cada especie, presentación y tipo de mercado.'))}));
  const mercolleida=sourceTables.find(table=>source(table.title)==='Mercolleida · comentarios publicados');
  const commentary=[...opening,...(mercolleida ? [{heading:t('Lectura del mercado español'),body:mercolleida.rows.map(row=>row[0]+' ('+row[1]+'): '+row[2]).join('\n\n')+'\n\n'+t('Estas observaciones describen el mercado español en la fecha indicada; no prueban la causa de movimientos de futuros ni de precios de otros países.')}] : []),...sheets.map(sheet=>({heading:sheet.label,body:t('Movimiento observado')+': '+sheet.observed+'\n\n'+t('Factores por contrastar')+': '+sheet.factor+'\n\n'+t('Evidencia del corte')+': '+sheet.evidence+'\n\n'+t('Consecuencias posibles')+': '+sheet.effect}))];
  const sourceCounts=new Map();for(const item of model.references.filter(item=>item.last)){const name=item.source || t('Fuente no declarada');sourceCounts.set(name,(sourceCounts.get(name) || 0)+1);}
  const proteinSources=[...sourceCounts].map(([label,count])=>({label,count})).sort((a,b)=>Number(/Yahoo|Sina/i.test(a.label))-Number(/Yahoo|Sina/i.test(b.label)));
  if(sourceTables.some(table=>/^Mercolleida ·/.test(source(table.title))))proteinSources.unshift({label:'Mercolleida',detail:t('Tendencias y comentarios fechados')});
  const countries=[['Estados Unidos',/Estados Unidos|EE\.\s*UU\./i],['Canadá',/Canad[aá]/i],['México',/M[eé]xico/i],['Chile',/Chile/i],['Argentina',/Argentina/i],['Colombia',/Colombia/i],['Perú',/Per[uú]/i],['Brasil',/Brasil|Brazil/i]];
  const proteinCountries=countries.map(([label,pattern])=>{const items=model.references.filter(item=>pattern.test(source(item.label || '')) && !/futuro|futures/i.test(source(item.basis || '')) && !/CME|CBOT|Dalian/i.test(source(item.label || '')));const priced=items.filter(item=>item.last && !item.stale);return {label:t(label),count:priced.length,dates:[...new Set(priced.map(item=>item.last.date))].sort()};});
  const inlineCharts=model.results.length>0;
  const blocks=model.blocks.filter(block=>block.key!=='charts' || !inlineCharts && chartsEnabled && visuals.length).map(block=>block.key==='comparisons' ? {...block,label:t('Tablillas y gráficas por especie')} : block.key==='sessionContext' && inlineCharts ? {...block,number:'2'} : block.key==='charts' ? {...block,label:t('Gráficas por especie y presentación'),count:visuals.length} : block);
  return {...model,proteinBulletin:true,proteinSheets:sheets,proteinSources,proteinCountries,supplementaryTables,commentary,results:model.results.length ? results : [],visuals:chartsEnabled ? visuals : [],blocks};
}
