'use strict';
const rules=require('../../shared/report-presentation.json');
const headingKey=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/^[\s#*\d.)-]+|[\s:*#]+$/g,'').replace(/\s+/g,' ').toLowerCase();
const hidden=new Set(rules.hiddenSectionHeadings.map(headingKey));
function withoutSourcesText(value) {
    if(typeof value!=='string') return value;
    let hiddenLevel=0;
    return value.split(/\r?\n/).filter(line=>{
        const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
        if(heading) {
            const level=heading[1].length;
            if(hiddenLevel && level<=hiddenLevel) hiddenLevel=0;
            if(!hiddenLevel && hidden.has(headingKey(heading[2]))) hiddenLevel=level;
        }
        return !hiddenLevel;
    }).join('\n');
}
function reportPresentation(report) {
    if(!report) return report;
    const content=withoutSourcesText(report.content);
    const sections=report.sections?.filter(section=>!hidden.has(headingKey(section.heading))).map(section=>{
        const text=withoutSourcesText(section.text);
        return text===section.text ? section : {...section,text};
    });
    if(content===report.content && (!sections || sections.length===report.sections.length && sections.every((section,i)=>section===report.sections[i]))) return report;
    return {...report,...(typeof content==='string' ? {content} : {}),...(sections ? {sections} : {})};
}
module.exports={reportPresentation,withoutSourcesText,REPORT_PRESENTATION_VERSION:rules.version};
