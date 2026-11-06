'use strict';
// Recompute statistics from inverted original observations, never inverse means.
function conventionalAnnualFx(reference){
 const code=reference.bucket==='fx' && reference.label?.match(/^USD\/(EUR|GBP|AUD|NZD)(?:\b| ·)/)?.[1];
 if(!code)return reference;
 return {...reference,label:reference.label.replace('USD/'+code,code+'/USD'),unit:'USD por 1 '+code,currency:'USD',baseCurrency:code,quoteCurrency:'USD',series:(reference.series || []).filter(point=>Number.isFinite(point.value) && point.value>0).map(point=>({...point,value:1/point.value}))};
}
module.exports={conventionalAnnualFx};
