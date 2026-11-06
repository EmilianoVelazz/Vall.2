'use strict';
const layouts=require('../../shared/report-layouts.json');
const collections=require('../../shared/report-collections.json');
function reportLayout(report) {
    const origin=report?.baseReport,key=origin?.key || report?.key;
    if(!origin && report?.userEdition===true && (!report.collection || report.collection==='mine')) return {...layouts.defaults,composition:'company-dashboard',collection:'mine',key:'manual',collectionLabel:collections.mine.label,label:'Informe de la empresa',chartHeading:'Evolución y comparaciones'};
    let collection=origin?.collection || report?.collection;
    if(!collection) {
        const matches=Object.keys(collections).filter(area=>layouts[area]?.[key]);
        if(matches.length===1) collection=matches[0];
    }
    const layout=collections[collection]?.reportKeys?.includes(key) ? layouts[collection]?.[key] : null;
    return layout ? {...layouts.defaults,...layout,collection,key,collectionLabel:collections[collection].label} : null;
}
module.exports={reportLayout};
