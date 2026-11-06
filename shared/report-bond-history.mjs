import {BOND_DAY,bondPoints} from './report-bond-evidence.mjs';

// Published month-end observations, never monthly averages or synthetic levels.
export function bondMonthlyHistory(points,cutoff){
  const months=new Map();
  for(const point of bondPoints(points,cutoff))if(point.date>='2020-01-01')months.set(point.date.slice(0,7),point);
  return [...months.values()];
}
export function bondHistoryVisuals(references,cutoff){
  const specs=[
    ['sovereign','Treasury · evolución desde 2020','%',[
      ['UST-2Y','Treasury 2A'],['UST-10Y','Treasury 10A'],['UST-30Y','Treasury 30A']]],
    ['funding','Fondeo · dólares y pesos desde 2020','%',[
      ['SOFR','SOFR · USD'],['SF331451','TIIE fondeo · MXN']]],
    ['inflation','Tasa nominal, real e inflación implícita','%',[
      ['UST-10Y','Treasury 10A'],['DFII10','TIPS real 10A'],['T10YIE','Breakeven 10A']]],
    ['risk','Primas de crédito y riesgo país','pb',[
      ['BAMLC0A0CM','Grado de inversión · OAS'],['BAMLH0A0HYM2','Alto rendimiento · OAS'],['PD43667XD','EMBIG México']]],
    ['mexico','CETES · evolución desde 2020','%',[
      ['SF43936','CETES 28D'],['SF43939','CETES 91D'],['SF43945','CETES 364D']]],
  ];
  const visuals=specs.flatMap(([key,title,unit,ids])=>{
    const series=ids.flatMap(([id,shortLabel])=>{
      const reference=references.find(item=>item.id===id && item.unit===unit && (key!=='sovereign' || item.basis==='treasury-par') && (key!=='mexico' || item.basis==='cetes-auction'));
      if(!reference)return [];
      const points=bondMonthlyHistory(reference.points,cutoff);
      if(points.length<12 || Date.parse(points.at(-1).date)-Date.parse(points[0].date)<365*BOND_DAY)return [];
      return [{id,label:reference.label,shortLabel,country:reference.country,currency:reference.currency,source:reference.source,url:reference.url,points}];
    });
    if(!series.length)return [];
    const coverage=series.map(item=>item.shortLabel+': '+item.points[0].date+' / '+item.points.at(-1).date).join('; ');
    return [{type:'line',bondHistory:true,historyKey:key,title,unit,rangeStart:'2020-01-01',rangeEnd:String(cutoff).slice(0,10),series,
      note:'Última observación publicada de cada mes; el mes en curso llega al último dato disponible. Los huecos de más de 62 días se interrumpen. '+coverage+'. '+(key==='funding' ? 'Tasas anuales de referencias distintas, en sus monedas originales; no son rendimientos equivalentes ni cubiertos.' : key==='risk' ? 'OAS corporativos y EMBIG soberano son indicadores distintos; se comparan sus niveles en puntos base, no calificaciones equivalentes.' : key==='inflation' ? 'El breakeven incorpora primas de inflación y liquidez; las fechas de publicación pueden diferir.' : key==='mexico' ? 'Rendimientos de subastas en MXN. Cada plazo conserva la fecha real de su última publicación mensual; no se convierten en tasas diarias.' : 'Rendimientos par de Estados Unidos; no son precios ni retornos de un bono.') }];
  });
  const short=references.find(item=>item.id==='UST-3M' && item.basis==='treasury-par' && item.unit==='%'),long=references.find(item=>item.id==='UST-10Y' && item.basis==='treasury-par' && item.unit==='%');
  if(short && long){
    const shortByDate=new Map(short.points.map(point=>[point.date,point.value])),points=bondMonthlyHistory(long.points.filter(point=>shortByDate.has(point.date)).map(point=>({date:point.date,value:(point.value-shortByDate.get(point.date))*100})),cutoff);
    if(points.length>=12 && Date.parse(points.at(-1).date)-Date.parse(points[0].date)>=365*BOND_DAY)visuals.push({type:'line',bondHistory:true,historyKey:'slope',title:'Pendiente de la curva · 10 años menos 3 meses',unit:'pb',rangeStart:'2020-01-01',rangeEnd:String(cutoff).slice(0,10),series:[{id:'UST-10Y-3M',label:'Treasury 10A–3M · Estados Unidos',shortLabel:'Pendiente 10A–3M',country:'Estados Unidos',currency:'USD',source:long.source,url:long.url,points}],note:'Diferencia entre rendimientos par de 10 años y 3 meses, calculada únicamente cuando ambos tienen observación en la misma fecha. Último par observado de cada mes. Sobre cero: el largo rinde más; bajo cero: curva invertida. La pendiente por sí sola no confirma una recesión. Fechas: '+points[0].date+' / '+points.at(-1).date+'.'});
  }
  return visuals;
}
