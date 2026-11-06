import {chartLogScale,chartScale} from '../../../shared/report-chart-geometry.mjs';
import COLORS from '../../../shared/report-chart-colors.json';
import {useReportText} from '../lib/reportLocale.jsx';
import GrainHistoryVisual from './GrainHistoryVisual.jsx';

function HistoryStrips({visual}){
 const t=useReportText(),series=visual.series || [],width=1100,left=325,right=170,rowHeight=32,top=34,height=top+series.length*rowHeight+35,first=Date.UTC(2020,0,1),last=Math.max(...series.flatMap(item=>item.points.map(point=>Date.parse(point.date)))),plotWidth=width-left-right;
 const x=date=>left+(Date.parse(date)-first)/(last-first || 1)*plotWidth,years=Array.from({length:new Date(last).getUTCFullYear()-2019},(_,index)=>2020+index);
 return <figure className="erh-chart erh-unified-history-chart" aria-label={visual.title}>
  <figcaption><strong>{visual.title}</strong><p>{visual.unit}</p></figcaption>
  <div className="erh-commodity-history-canvas"><svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={visual.title}>
   <text x="8" y="18" fontSize="12" fill="#193758">{t('País / referencia')}</text><text x={width-right+14} y="18" fontSize="12" fill="#193758">{t('Índice final · cambio %')}</text>
   {series.map((item,index)=>{const values=item.points.map(point=>point.value),scale=visual.energyHistoryOverview ? chartScale(values) : chartLogScale(values),position=value=>scale.position ? scale.position(value) : (value-scale.min)/(scale.max-scale.min),y=top+index*rowHeight,color=COLORS[index%COLORS.length],change=values.at(-1)-100,path=item.points.map((point,n)=>(n ? 'L' : 'M')+x(point.date).toFixed(2)+','+(y+5+(1-position(point.value))*(rowHeight-10)).toFixed(2)).join(' ');return <g key={item.label}>
    <rect x="0" y={y} width={width} height={rowHeight} fill={index%2 ? '#f1f5f8' : '#ffffff'} />
    {years.map(year=><line key={year} x1={x(`${year}-01-01`)} x2={x(`${year}-01-01`)} y1={y} y2={y+rowHeight} stroke="#dce4ea" />)}
    <text x="8" y={y+20} fontSize="12" fill="#193758"><title>{item.label+' · '+item.originalUnit+' · '+item.baseDate}</title>{item.shortLabel}</text>
    {visual.energyHistoryOverview && scale.min<0 && scale.max>0 && <line x1={left} x2={width-right} y1={y+5+(1-position(0))*(rowHeight-10)} y2={y+5+(1-position(0))*(rowHeight-10)} stroke="#a3acb4" strokeDasharray="3 3" />}
    <path d={path} fill="none" stroke={color} strokeWidth="1.7"><title>{item.label}</title></path>
    <text x={width-right+14} y={y+20} fontSize="12" fill={change<0 ? '#946c64' : '#657455'}>{values.at(-1).toLocaleString('es-MX',{maximumFractionDigits:1})+' · '+(change>0 ? '+' : '')+change.toLocaleString('es-MX',{maximumFractionDigits:1})+' %'}</text>
   </g>;})}
   {years.map(year=><text key={year} x={x(`${year}-01-01`)} y={height-10} fontSize="12" fill="#586b78">{year}</text>)}
  </svg></div>
  <p>{t('Cada fila utiliza su propia escala vertical. Los códigos enlazan con la tabla maestra; el cambio se mide desde la fecha base real de esa referencia.')}</p>
  <p>{visual.note}</p>
 </figure>;
}
export default function CommodityHistoryVisual({visual}){return visual.grainHistoryOverview ? <GrainHistoryVisual visual={visual} /> : <HistoryStrips visual={visual} />;}
