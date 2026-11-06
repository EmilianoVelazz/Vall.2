import catalog from './report-library.json' with {type:'json'};
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
const slug=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'');
const labels={
 es:{finance:'Finanzas',markets:'Mercados',mexico:'México',mine:'Mis informes',daily:'Diario',weekly:'Semanal',annual:'Anual',data:'Datos'},
 en:{finance:'Finance',markets:'Markets',mexico:'Mexico',mine:'My reports',daily:'Daily',weekly:'Weekly',annual:'Annual',data:'Data'},
 fr:{finance:'Finances',markets:'Marchés',mexico:'Mexique',mine:'Mes rapports',daily:'Quotidien',weekly:'Hebdomadaire',annual:'Annuel',data:'Données'},
 it:{finance:'Finanza',markets:'Mercati',mexico:'Messico',mine:'I miei rapporti',daily:'Giornaliero',weekly:'Settimanale',annual:'Annuale',data:'Dati'},
 de:{finance:'Finanzen',markets:'Märkte',mexico:'Mexiko',mine:'Meine Berichte',daily:'Täglich',weekly:'Wöchentlich',annual:'Jährlich',data:'Daten'},
 ja:{finance:'金融',markets:'市場',mexico:'メキシコ',mine:'マイレポート',daily:'日次',weekly:'週次',annual:'年次',data:'データ'},
};
const text=value=>String(value || '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
function reportDay(value){
 if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value)))return '';
 if(new Date(value.slice(0,10)).toISOString().slice(0,10)!==value.slice(0,10))return '';
 if(value.length===10)return value;
 return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? dayFormat.format(new Date(value)) : '';
}
export function reportExportIdentity(report={}, {language='es',title}={}){
 const words=labels[String(language).toLowerCase().split('-')[0]] || labels.es;
 const area=report.baseReport?.collection || report.collection,key=report.baseReport?.key || report.key;
 const fallback=catalog.reports[area]?.[key] || 'Informe';
 const custom=report.userEdition || report.aiEdition || report.editionId || text(report.personalization?.customTitle);
 // Los informes base usan el catálogo: evita nombres genéricos de Panorama,
 // identificadores internos y años repetidos. Las ediciones propias conservan
 // el título elegido por el usuario; las traducciones, el título localizado.
 const preferredTitle=words===labels.es ? report.personalization?.customTitle || title || report.title : title || report.personalization?.customTitle || report.title;
 const name=text(custom || !catalog.reports[area]?.[key] || words!==labels.es ? preferredTitle || fallback : fallback).replace(/^vallnews\s*[-·:|]?\s*/i,'') || fallback;
 const annual=report.periodType==='annual',period=annual ? words.annual : report.analysisPeriod==='weekly' ? words.weekly : words.daily;
 const stamp=annual ? Number.isInteger(report.reportYear) && report.reportYear>=1900 && report.reportYear<=9999 ? String(report.reportYear) : '' : reportDay(report.generatedAt);
 return {name,area,category:words[area] || words.mine,period,stamp,fallback,data:words.data};
}
export function reportDocumentTitle(report={},options={}){
 const {name,category,period,stamp}=reportExportIdentity(report,options);
 return [name,category,period,stamp,'VALLNews'].filter(Boolean).join(' · ');
}
export function reportDownloadName(report={},format='pdf',options={}){
 const {language='es'}=options;
 const extension=['pdf','csv','xlsx','docx','html','md','txt','json'].includes(format) ? format : 'pdf';
 const identity=reportExportIdentity(report,options),{fallback,stamp}=identity;
 let name=slug(identity.name).replace(/^vallnews-?/i,'');
 if(!/[a-z]{2}/i.test(name))name=slug(fallback);
 name=name.slice(0,85).replace(/-+$/g,'');
 const category=slug(identity.category) || labels.en[identity.area] || 'Reports',period=slug(identity.period) || (report.periodType==='annual' ? 'Annual' : report.analysisPeriod==='weekly' ? 'Weekly' : 'Daily');
 const parts=['VALLNews',category.replace(/\s+/g,'-'),name];
 if(!name.toLowerCase().split('-').includes(period.toLowerCase()))parts.push(period);
 if(stamp && !name.includes(stamp))parts.push(stamp);
 if(['csv','xlsx'].includes(extension))parts.push(slug(identity.data) || 'Data');
 if(language!=='es' && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(language))parts.push(language.toLowerCase());
 return parts.join('-')+'.'+extension;
}
