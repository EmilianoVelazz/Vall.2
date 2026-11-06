'use strict';
const collections=require('../../shared/report-collections.json');
function normalizeScheduleSelection(input) {
    if(!Array.isArray(input)||!input.length||input.length>24) throw Object.assign(Error('Selecciona entre 1 y 24 informes de Finanzas, Mercados o México.'),{status:400});
    const seen=new Set();
    return input.map(item=>{
        const area=item?.area,reportKey=item?.reportKey;
        if(!['finance','markets','mexico'].includes(area)||!collections[area].reportKeys.includes(reportKey)) throw Object.assign(Error('La selección contiene una categoría o informe no disponible.'),{status:400});
        const key=area+':'+reportKey;
        if(seen.has(key)) throw Object.assign(Error('No repitas un informe dentro de la selección.'),{status:400});
        seen.add(key);
        return {area,reportKey,preferences:item.preferences,ai:item.ai};
    });
}
module.exports={normalizeScheduleSelection};
