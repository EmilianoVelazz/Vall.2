import {createContext,useContext} from 'react';
import catalog from '../../../shared/report-languages.json';
const originalLabels=new Map();

export function reportText(language='es') {
  const definition=catalog.languages[language] || catalog.languages.es;
  if(!originalLabels.has(language))originalLabels.set(language,new Map(language==='es' ? [] : Object.entries(catalog.labels).flatMap(([original,values])=>values[definition.index] ? [[values[definition.index],original]] : [])));
  const originals=originalLabels.get(language);
  const t=(value,parameters={})=>{
    const text=String(value ?? '');
    const translated=language==='es' ? text : catalog.labels[text]?.[definition.index] || text;
    return translated.replace(/\{(\w+)\}/g,(match,key)=>String(parameters[key] ?? match));
  };
  t.locale=definition.locale;
  t.language=Object.hasOwn(catalog.languages,language) ? language : 'es';
  t.has=value=>language==='es' || Boolean(catalog.labels[String(value)]?.[definition.index]);
  t.source=value=>originals.get(value) || value;
  return t;
}
export const ReportLocaleContext=createContext(reportText());
export const useReportText=()=>useContext(ReportLocaleContext);
