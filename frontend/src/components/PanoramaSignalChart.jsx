import {useEffect,useRef,useState} from 'react';
import {panoramaChart,panoramaNumber} from '../../../shared/report-panorama-chart.mjs';

export function PanoramaSignalChart({item,t,range='all',expanded=false,active=0,onInspect}){
 const frame=useRef(null),[width,setWidth]=useState(360);
 useEffect(()=>{const node=frame.current;if(!node)return;const observer=new ResizeObserver(()=>setWidth(Math.max(220,node.getBoundingClientRect().width)));observer.observe(node);return()=>observer.disconnect();},[]);
 const left=55,right=16,top=10,height=expanded ? 190 : 77,chart=panoramaChart(item,{range,width:width-left-right,height});
 if(!chart)return null;
 const selected=chart.nodes[Math.min(active,chart.nodes.length-1)],inspect=event=>{if(!onInspect)return;const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)*width/rect.width-left;onInspect(chart.nodes.reduce((best,point,index)=>Math.abs(point.x-x)<Math.abs(chart.nodes[best].x-x) ? index : best,0));};
 return <svg ref={frame} className={'erh-panorama-chart'+(expanded ? ' is-expanded' : '')} viewBox={`0 0 ${width} ${height+36}`} role="img" aria-label={t('Evolución de ')+item.label+' · '+item.unit} onPointerMove={inspect}>
  <g transform={`translate(${left},${top})`}>
   {chart.ticks.map(value=><g key={value}><line x1="0" x2={chart.width} y1={chart.y(value)} y2={chart.y(value)} stroke="#dce3e8"/><text x="-7" y={chart.y(value)+3} textAnchor="end">{panoramaNumber(value,t.locale)}</text></g>)}
   {chart.annual ? <><line x1="0" x2={chart.width} y1={chart.zero} y2={chart.zero} stroke="#9aabb8"/>{chart.nodes.map(point=><rect key={point.date} x={point.x-chart.barWidth/2} y={Math.min(point.y,chart.zero)} width={chart.barWidth} height={Math.max(.8,Math.abs(point.y-chart.zero))} fill={chart.tone}><title>{point.date+' · '+panoramaNumber(point.value,t.locale)+' '+item.unit}</title></rect>)}</> : <><path d={chart.path} fill="none" stroke={chart.tone} strokeWidth={expanded ? 2.3 : 1.9}/>{chart.nodes.filter((_,i)=>expanded || i===0 || i===chart.nodes.length-1).map(point=><circle key={point.date} cx={point.x} cy={point.y} r={expanded ? 2.3 : 2.7} fill={chart.tone} opacity={expanded && chart.nodes.length>30 ? .3 : 1}><title>{point.date+' · '+panoramaNumber(point.value,t.locale)+' '+item.unit}</title></circle>)}</>}
   {expanded && selected && <><line x1={selected.x} x2={selected.x} y1="0" y2={height} stroke={chart.tone} strokeDasharray="3 4"/><circle cx={selected.x} cy={selected.y} r="4" fill={chart.tone}/></>}
   {chart.annual ? chart.nodes.map(point=><text key={point.date} x={point.x} y={height+18} textAnchor="middle">{point.date}</text>) : <><text x="0" y={height+18}>{chart.first}</text>{chart.timeTicks.map(tick=><text key={tick.label} x={tick.x} y={height+18} textAnchor="middle">{tick.label}</text>)}<text x={chart.width} y={height+18} textAnchor="end">{chart.last}</text></>}
  </g>
 </svg>;
}

export function PanoramaSignalDetail({item,t,onClose}){
 const [range,setRange]=useState('all'),[active,setActive]=useState(Math.max(0,(item.points?.length || 1)-1)),panel=useRef(null),chart=panoramaChart(item,{range});
 useEffect(()=>{panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView({block:'nearest'});},[]);
 const observation=chart?.points[Math.min(active,chart.points.length-1)];
 return <section ref={panel} tabIndex={-1} className="erh-panorama-detail" aria-label={t('Evolución de ')+item.label}>
  <header><div><h4>{item.label}</h4><p>{item.unit+' · '+t(item.kind==='structural' ? 'Periodo anual' : 'Observación publicada')}</p></div><button type="button" onClick={onClose}>{t('Cerrar detalle')}</button></header>
  {item.kind!=='structural' && <div className="erh-panorama-ranges">{[['half','6 meses'],['year','1 año'],['all','Historial disponible']].map(([key,label])=><button key={key} type="button" aria-pressed={range===key} onClick={()=>{setRange(key);setActive(Number.MAX_SAFE_INTEGER);}}>{t(label)}</button>)}</div>}
  {observation ? <><output className="erh-panorama-observation"><span>{observation.date}</span><b>{panoramaNumber(observation.value,t.locale)+' '+item.unit}</b></output><PanoramaSignalChart item={item} t={t} range={range} expanded active={active} onInspect={setActive}/><label className="erh-panorama-picker">{t('Fecha consultada')}<input type="range" min="0" max={chart.points.length-1} value={Math.min(active,chart.points.length-1)} aria-label={t('Seleccionar observación histórica')} aria-valuetext={observation.date+' · '+panoramaNumber(observation.value,t.locale)+' '+item.unit} onChange={event=>setActive(Number(event.target.value))}/></label></> : <p>{t('No hay suficientes observaciones para este intervalo.')}</p>}
  <p>{t('Cada gráfica conserva su unidad y escala propia; las alturas no son comparables entre tarjetas.')}</p>
 </section>;
}
