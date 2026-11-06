import layouts from '../../../shared/report-layouts.json' with {type:'json'};
import collections from '../../../shared/report-collections.json' with {type:'json'};

// La identidad de la base se conserva aunque el usuario cambie el título.
export function reportLayout(report) {
  const origin = report?.baseReport;
  if(!origin && report?.userEdition===true && (!report.collection || report.collection==='mine')) return {...layouts.defaults,composition:'company-dashboard',collection:'mine',key:'manual',collectionLabel:collections.mine.label,label:'Informe de la empresa',chartHeading:'Evolución y comparaciones'};
  const key=origin?.key || report?.key;
  let collection=origin?.collection || report?.collection;
  if(!collection) {
    const matches=Object.keys(collections).filter(area=>layouts[area]?.[key]);
    if(matches.length===1) collection=matches[0];
  }
  const layout=collections[collection]?.reportKeys?.includes(key) ? layouts[collection]?.[key] : null;
  return layout ? {...layouts.defaults,...layout,collection,key,collectionLabel:collections[collection].label} : null;
}
