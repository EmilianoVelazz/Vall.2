import {useEffect,useId,useRef,useState} from 'react';
import {GRAIN_FAMILIES,grainHistoryColor,grainHistoryGeometry} from '../../../shared/report-grain-chart.mjs';
import {useReportText} from '../lib/reportLocale.jsx';
import './ReportGrainHistory.css';
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const code=series=>series.label.match(/^\d+/)?.[0] || '';
const label=series=>series.label.replace(/^\d+\.\s*/,'');
function Detail({series,onClose}){
 const frame=useRef(null),panel=useRef(null),[width,setWidth]=useState(960),[observation,setObservation]=useState(series.points.length-1),t=useReportText();
 useEffect(()=>{const node=frame.current;if(!node)return;const measure=()=>setWidth(Math.max(220,Math.min(960,node.getBoundingClientRect().width || 960)));measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
 useEffect(()=>{const task=requestAnimationFrame(()=>{panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView({block:'nearest'});});return()=>cancelAnimationFrame(task);},[]);
 const plotWidth=width-96,points=series.points.map(point=>({date:point.date,value:point.originalValue})),geometry=grainHistoryGeometry(points,{width:plotWidth,height:190,linear:true,baseline:series.basePrice}),tone=grainHistoryColor(series),format=value=>value.toLocaleString(t.locale,{maximumFractionDigits:3}),active=points[Math.min(observation,points.length-1)];
 if(!geometry)return null;
 const inspect=event=>{const box=event.currentTarget.getBoundingClientRect(),x=(event.clientX-box.left)*width/box.width-74,time=Date.parse(points[0].date)+Math.max(0,Math.min(1,x/plotWidth))*(Date.parse(points.at(-1).date)-Date.parse(points[0].date));setObservation(points.reduce((best,point,index)=>Math.abs(Date.parse(point.date)-time)<Math.abs(Date.parse(points[best].date)-time) ? index : best,0));};
 return <section ref={panel} tabIndex={-1} className="erh-grain-detail" aria-label={t('Detalle de {reference}',{reference:label(series)})}>
  <header><div><strong>{label(series)}</strong><p>{series.baseDate+' / '+series.lastDate+' · '+series.originalUnit}</p></div><button type="button" onClick={onClose}>{t('Cerrar detalle')}</button></header>
  <output className="erh-grain-observation" aria-live="off"><span><small>{t('Observación publicada')}</small><strong>{active.date}</strong></span><span><strong>{format(active.value)}</strong><small>{series.originalUnit}</small></span></output>
  <svg ref={frame} viewBox={`0 0 ${width} 240`} role="img" aria-label={t('Precio histórico de {reference}',{reference:label(series)})} onPointerMove={inspect} onPointerDown={inspect}>
   <g transform="translate(74,12)">{geometry.scale.ticks.map(value=><g key={value}><line x1="0" x2={plotWidth} y1={geometry.y(value)} y2={geometry.y(value)} stroke="#dce5ec"/><text x="-10" y={geometry.y(value)+4} textAnchor="end">{format(value)}</text></g>)}
    <path d={geometry.area} fill={tone} opacity=".1"/><path className="erh-grain-detail-line" d={geometry.path} stroke={tone} strokeWidth="2.2" fill="none"/>
    <line x1={geometry.x(active.date)} x2={geometry.x(active.date)} y1="0" y2="190" stroke={tone} strokeDasharray="3 4" opacity=".5"/>
    {points.map((point,index)=><circle key={point.date} cx={geometry.x(point.date)} cy={geometry.y(point.value)} r={index===observation ? 4 : 2.3} fill={tone} opacity={index===observation || points.length<=24 ? 1 : .08}><title>{point.date+' · '+format(point.value)+' '+series.originalUnit}</title></circle>)}
    <text x="0" y="214">{series.baseDate}</text><text x={plotWidth} y="214" textAnchor="end">{series.lastDate}</text>
   </g>
  </svg>
  <label className="erh-grain-date-picker"><span>{t('Fecha consultada')}</span><input type="range" min="0" max={points.length-1} step="1" value={observation} aria-label={t('Seleccionar observación histórica')} aria-valuetext={active.date+' · '+format(active.value)+' '+series.originalUnit} onChange={event=>setObservation(Number(event.target.value))} /></label>
  <p>{t('Precios en su moneda y unidad originales; sin conversión ni mezcla de referencias.')}</p>
 </section>;
}
export default function GrainHistoryVisual({visual}){
 const t=useReportText(),id=useId(),trigger=useRef(null),[family,setFamily]=useState('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[groupBy,setGroupBy]=useState('product');
 const series=visual.series || [],last=series.reduce((end,item)=>item.points.reduce((latest,point)=>Math.max(latest,Date.parse(point.date) || latest),end),Date.UTC(2020,0,1)),first=Date.UTC(2020,0,1),years=Array.from({length:Math.max(1,new Date(last).getUTCFullYear()-2019)},(_,index)=>2020+index);
 const shown=series.filter(item=>(family==='all' || item.grainFamily===family) && fold(item.label+' '+item.country+' '+item.originalUnit).includes(fold(query))),detail=shown.find(item=>item.label===selected),format=(value,digits=3)=>value.toLocaleString(t.locale,{maximumFractionDigits:digits});
 const families=GRAIN_FAMILIES.filter(([key])=>series.some(item=>item.grainFamily===key));
 const groups=groupBy==='product' ? families.map(([key,title])=>({key,title:t(title),items:shown.filter(item=>item.grainFamily===key),tone:grainHistoryColor({grainFamily:key})})).filter(group=>group.items.length) : [...new Set(shown.map(item=>item.country))].map(country=>({key:country,title:country,items:shown.filter(item=>item.country===country),tone:'#8b9299'}));
 return <figure className="erh-chart erh-grain-history" aria-label={visual.title}>
  <figcaption><div><strong>{visual.title}</strong><p>{t('Tendencias separadas por referencia · base 100')}</p></div><span>{t('{count} referencias visibles',{count:shown.length})}</span></figcaption>
  <div className="erh-grain-tools"><div className="erh-grain-view-switch" role="group" aria-label={t('Organizar referencias')}>{[['product','Por producto'],['country','Por país']].map(([key,title])=><button type="button" key={key} aria-pressed={groupBy===key} onClick={()=>{setGroupBy(key);setSelected('');}}>{t(title)}</button>)}</div><label htmlFor={id+'-product'}>{t('Filtrar producto')}<select id={id+'-product'} aria-label={t('Filtrar producto')} value={family} onChange={event=>{setFamily(event.target.value);setSelected('');}}><option value="all">{t('Todos los productos')}</option>{families.map(([key,title])=><option key={key} value={key}>{t(title)}</option>)}</select></label><label htmlFor={id+'-query'}>{t('Buscar país o referencia')}<input id={id+'-query'} aria-label={t('Buscar país o referencia')} type="search" value={query} onChange={event=>{setQuery(event.target.value);setSelected('');}} /></label></div>
  <p className="erh-grain-hint">{t('Pulsa una referencia para ampliar sus precios históricos.')}</p>
  {detail && <Detail key={detail.label} series={detail} onClose={()=>{setSelected('');trigger.current?.focus();}} />}
  {!shown.length ? <p role="status">{t('No hay datos publicados para esta selección.')}</p> : <div className="erh-grain-matrix-scroll" tabIndex="0" role="region" aria-label={t('Comparativa histórica de granos')}>
   <table className="erh-grain-matrix"><colgroup><col className="erh-grain-col-reference"/><col className="erh-grain-col-chart"/><col className="erh-grain-col-price"/><col className="erh-grain-col-change"/></colgroup><thead><tr><th scope="col">{t('País / referencia')}</th><th scope="col"><span>{t('Evolución · escala propia por fila')}</span><div className="erh-grain-years">{years.map(year=><span key={year} style={{left:(Date.UTC(year,0,1)-first)/(last-first || 1)*100+'%'}}>{year}</span>)}</div></th><th scope="col">{t('Último precio')}</th><th scope="col">{t('Desde su base')}</th></tr></thead>
    {groups.map(group=><tbody key={group.key}><tr className="erh-grain-group"><th scope="rowgroup" colSpan="4"><span><i style={{backgroundColor:group.tone}} aria-hidden="true"/>{group.title}</span><small>{group.items.length}</small></th></tr>{group.items.map(item=>{const geometry=grainHistoryGeometry(item.points,{first,last}),tone=grainHistoryColor(item),delta=item.points.at(-1).value-100;return <tr key={item.label} data-grain-reference={code(item)} data-grain-selected={detail?.label===item.label}>
     <th scope="row"><button type="button" className="erh-grain-reference" onClick={event=>{trigger.current=event.currentTarget;setSelected(selected===item.label ? '' : item.label);}} aria-expanded={detail?.label===item.label}><span className="erh-grain-code" style={{borderColor:tone}}>{code(item)}</span><span><strong>{label(item)}</strong><small>{t('Base')+' '+item.baseDate}{item.partialHistory ? ' · '+t('Historia parcial') : ''}</small></span></button></th>
     <td className="erh-grain-spark-cell"><svg className="erh-grain-sparkline" viewBox="0 0 500 58" preserveAspectRatio="none" role="img" aria-label={t('Evolución de {reference}',{reference:label(item)})}>
      {years.map(year=><line key={year} x1={geometry.x(year+'-01-01')} x2={geometry.x(year+'-01-01')} y1="0" y2="58" stroke="#e1e8ee"/>)}
      <line x1="0" x2="500" y1={geometry.baseline} y2={geometry.baseline} stroke="#a9b6c0" strokeDasharray="3 4"/>
      <path d={geometry.area} fill={tone} opacity=".09"/><path className="erh-grain-trace" d={geometry.path} fill="none" stroke={tone} strokeWidth="1.8"/>
      <circle cx={geometry.start.x} cy={geometry.start.y} r="2.2" fill="#fff" stroke={tone}/><circle cx={geometry.end.x} cy={geometry.end.y} r="3" fill={tone}/>
      <title>{label(item)+' · '+item.baseDate+' / '+item.lastDate+' · '+t('Índice final')+' '+format(item.points.at(-1).value,1)}</title>
     </svg><span className="erh-grain-mobile-range">{'2020 / '+item.lastDate.slice(0,4)}</span></td>
     <td className="erh-grain-price"><strong>{format(item.lastPrice)}</strong><span>{item.originalUnit}</span><small>{item.lastDate}</small></td>
     <td className="erh-grain-change"><span className={delta>0 ? 'erh-grain-rise' : delta<0 ? 'erh-grain-fall' : 'erh-grain-flat'}>{(delta>0 ? '↑ +' : delta<0 ? '↓ ' : '→ ')+format(delta,1)+' %'}</span></td>
    </tr>;})}</tbody>)}
   </table>
  </div>}
  <p className="erh-grain-method">{visual.note}</p>
 </figure>;
}
