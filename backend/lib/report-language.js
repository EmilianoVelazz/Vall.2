'use strict';
const catalog=require('../../shared/report-languages.json');
const uppercase=new Map(Object.keys(catalog.labels).map(label=>[label.toLocaleUpperCase('es'),label]));
function reportLanguage(value='es') {
    if(typeof value!=='string' || !Object.hasOwn(catalog.languages,value)) throw Object.assign(Error('Selecciona un idioma válido para exportar el informe.'),{status:400,code:'REPORT_LANGUAGE_INVALID'});
    return value;
}
function requestReportLanguage(req, value=req.body?.language) {
    if(value!==undefined) reportLanguage(value);
    const header=req.headers?.['x-vall-report-language'];
    if(header!==undefined) {
        reportLanguage(header);
        if(value!==undefined && value!==header) throw Object.assign(Error('El idioma del informe cambió. Vuelve a generar la edición actual.'),{status:409,code:'REPORT_LANGUAGE_MISMATCH'});
    }
    if(value!==undefined) return value;
    if(header!==undefined) return header;
    // Clientes anteriores no enviaban el idioma en el cuerpo. La cookie del
    // traductor pertenece a esta petición, a diferencia del idioma del sistema.
    const target=/^\/[a-z-]+\/([a-z-]+)$/i.exec(String(req.cookies?.googtrans || ''))?.[1];
    return target && Object.hasOwn(catalog.languages,target) ? target : 'es';
}
function reportLabels(value='es') {
    const language=reportLanguage(value),definition=catalog.languages[language];
    const t=(text,parameters={})=>{
        text=String(text ?? '');
        const key=Object.hasOwn(catalog.labels,text) ? text : uppercase.get(text);
        let translated=language==='es' ? text : catalog.labels[key]?.[definition.index] || text;
        if(language!=='es' && key && text!==key && text===text.toLocaleUpperCase('es')) translated=translated.toLocaleUpperCase(definition.locale);
        return translated.replace(/\{(\w+)\}/g,(match,key)=>String(parameters[key] ?? match));
    };
    return {language,...definition,t};
}
module.exports={reportLanguage,reportLabels,requestReportLanguage};
