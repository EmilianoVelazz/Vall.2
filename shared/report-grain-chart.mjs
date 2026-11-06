import COLORS from './report-chart-colors.json' with {type:'json'};
import {chartLogScale,chartScale} from './report-chart-geometry.mjs';
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const GRAIN_FAMILIES=[
 ['corn','Maíz',0],['wheat','Trigo',5],['soy','Soya',2],['soymeal','Harina de soya',3],
 ['barley','Cebada',4],['rice','Arroz',6],['sunflower','Girasol',7],['bran','Salvado de trigo',1],['other','Otros productos',3],
];
export function grainFamily(label){const text=fold(label).replace(/^\d+\.\s*/,'').split(' · ')[0];return /harina|pellet|meal/.test(text) && /soy/.test(text) ? 'soymeal' : /\bsalvado\b|\bbran\b/.test(text) ? 'bran' : /maiz|corn/.test(text) ? 'corn' : /trigo|wheat/.test(text) ? 'wheat' : /soya|soja|soy/.test(text) ? 'soy' : /cebada|barley/.test(text) ? 'barley' : /arroz|rice/.test(text) ? 'rice' : /girasol|sunflower/.test(text) ? 'sunflower' : 'other';}
export function grainHistoryColor(series){return COLORS[(GRAIN_FAMILIES.find(([id])=>id===(series.grainFamily || grainFamily(series.label))) || GRAIN_FAMILIES.at(-1))[2]];}
export function grainHistoryGeometry(points,{width=500,height=58,first,last,baseline=100,linear=false}={}){
 const valid=points.filter(point=>Number.isFinite(point.value) && point.value>0 && Number.isFinite(Date.parse(point.date)));
 if(valid.length<2)return null;
 const start=first ?? Date.parse(valid[0].date),end=last ?? Date.parse(valid.at(-1).date),scale=(linear ? chartScale : chartLogScale)([...valid.map(point=>point.value),baseline]);
 const x=value=>(Date.parse(value)-start)/(end-start || 1)*width,y=value=>4+(1-(scale.position ? scale.position(value) : (value-scale.min)/(scale.max-scale.min)))*(height-8);
 const coordinates=valid.map(point=>({x:x(point.date),y:y(point.value)})),path=coordinates.map((point,index)=>(index ? 'L' : 'M')+point.x.toFixed(2)+','+point.y.toFixed(2)).join(' ');
 return {path,area:path+'L'+coordinates.at(-1).x.toFixed(2)+','+height+'L'+coordinates[0].x.toFixed(2)+','+height+'Z',start:coordinates[0],end:coordinates.at(-1),baseline:y(baseline),x,y,scale};
}
