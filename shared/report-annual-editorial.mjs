import additions from './report-annual-events.json' with {type:'json'};
import catalog from './report-library.json' with {type:'json'};
const countries={'United States':'Estados Unidos','United Kingdom':'Reino Unido','Germany':'Alemania','France':'Francia','Italy':'Italia','Spain':'España','Mexico':'México','Brazil':'Brasil','Canada':'Canadá','Japan':'Japón','South Korea':'Corea del Sur','Korea, Rep.':'Corea del Sur','World':'Mundo','European Union':'Unión Europea','South Africa':'Sudáfrica','Netherlands':'Países Bajos','Switzerland':'Suiza','Russian Federation':'Rusia','Turkiye':'Turquía','Türkiye':'Turquía','Egypt, Arab Rep.':'Egipto'};
export function annualDisplay(value,{fx=false}={}){
 if(typeof value==='number')return Number.isFinite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:fx ? 4 : 2}) : value;
 if(typeof value!=='string' || /^https?:/.test(value))return value;
 let result=value;
 for(const [original,local] of Object.entries(countries))if(result===original || result.endsWith(' · '+original))result=result.slice(0,-original.length)+local;
 return result.replace(/(^|\n)([-+]?\d[\d,]*\.\d{3,})(\s*(?:%|pb))?(?=$|\n)/g,(_,start,raw,unit='')=>start+Number(raw.replaceAll(',','')).toLocaleString('es-MX',{maximumFractionDigits:fx ? 4 : 2})+unit);
}
export function annualEditorial(report,{t=value=>value}={}){
 const area=report.baseReport?.collection || report.collection,key=report.baseReport?.key || report.key,identity=area+':'+key,year=report.reportYear;
 const original=(catalog.events[year] || []).filter(event=>event.source==='Reserva Federal' ? area==='finance' : (area==='markets' && ['overview','market_news','grains'].includes(key) || area==='finance' && ['daily_news','overview','fx'].includes(key))).map(event=>({...event,kind:'Publicación de contexto'}));
 const events=[...original,...additions.events.filter(event=>event.date.startsWith(year+'-') && event.scope.includes(identity))].sort((a,b)=>a.date.localeCompare(b.date)).map(event=>({...event,quarter:Math.ceil(Number(event.date.slice(5,7))/3)}));
 const refs=(report.annualReferences || []).filter(item=>item.status==='comparable' && Number.isFinite(item.change)),ranked=[...refs].sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
 // Rates, indices and commodities remain separate in their source tables;
 // these sentences retain the original units, not a mixed performance ranking.
 const groups=[...new Set(ranked.map(item=>item.kind==='yield' ? 'rates' : 'returns'))],selected=groups.length>1 ? groups.map(group=>ranked.find(item=>(item.kind==='yield' ? 'rates' : 'returns')===group)).slice(0,2) : ranked.slice(0,2),number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:2}),movement=selected.map(item=>annualDisplay(item.label)+': '+(item.change>0 ? '↑ +' : item.change<0 ? '↓ ' : '→ ')+number(item.change)+' '+(item.kind==='yield' ? 'pb' : item.kind==='volatility' ? 'puntos' : '%')+' en '+year+'.').join(' ');
 const news=key.endsWith('news'),production=key==='mx_production',summary=news && events.length ? events.slice(0,3).map(event=>event.date+' · '+event.title+'.').join(' ') : movement || (production && report.annualProduction?.length ? 'La distribución de producción de '+year+' permite revisar concentración regional y alternativas de origen por cultivo. Los volúmenes no equivalen a inventario disponible para venta.' : events.length ? events.slice(0,2).map(event=>event.title+'.').join(' ') : 'Balance de '+year+' con las observaciones del periodo. Las tablas separan niveles, variaciones comparables y cobertura de cada referencia.');
 const table=events.length ? {title:t('Hitos documentados · '+year),annualTimeline:true,columns:['Fecha / trimestre','Acontecimiento','Naturaleza y alcance','Fuente'].map(t),rows:events.map(event=>[event.date+' · T'+event.quarter,t(event.title),t(event.kind)+'. '+t(event.text),event.source]),note:t('Los hitos aportan contexto fechado; no prueban por sí solos la causa del rendimiento anual. Anuncios y pronósticos no se convierten en resultados realizados.')} : null;
 const sources=events.length ? {title:t('Hitos anuales · fuentes primarias'),columns:['Fecha','Publicación','Fuente','Enlace'].map(t),rows:events.map(event=>[event.date,t(event.title),event.source,event.url])} : null;
 return {summary:t(summary),events,table,sources};
}
