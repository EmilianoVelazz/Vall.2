'use strict';

const escape=value=>String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const singleLine=value=>typeof value==='string' || typeof value==='number' && Number.isFinite(value)
    ? String(value).replace(/[\r\n\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,160)
    : '';
const statuses={missing:'sin dato',stale:'Desactualizado',preserved:'Conservado'};

function reportHealthEmailDetails(health,t) {
    if(!health)return {summary:'',referencesText:'',referencesHtml:''};
    const coverage=health.coverage || {};
    const summaryDetails=[
        Number.isFinite(coverage.available)&&coverage.total>0 ? `${coverage.available}/${coverage.total} ${t('referencias con dato')}` : '',
        coverage.missing>0 ? `${coverage.missing} ${t('sin dato')}` : '',
        coverage.stale>0 ? `${coverage.stale} ${t('rezagadas')}` : '',
        coverage.preserved>0 ? `${coverage.preserved} ${t('conservadas')}` : '',
    ].filter(Boolean);
    const summary=`${t('Calidad de datos')}: ${t(health.label)}${summaryDetails.length ? ` · ${summaryDetails.join(' · ')}` : ''}`;
    const references=Array.isArray(health.references)
        ? health.references.filter(item=>item&&Object.hasOwn(statuses,item.status)).slice(0,8)
        : [];
    const issueLines=references.map(item=>{
        const label=singleLine(item.label)||t('Referencia');
        const status=t(statuses[item.status]);
        const details=[
            item.source&&`${t('Fuente')}: ${singleLine(item.source)}`,
            item.date?`${t('Fecha del dato')}: ${singleLine(item.date)}`:t('Sin fecha'),
            singleLine(item.unit),
        ].filter(Boolean).join(' · ');
        return {label,status,details};
    });
    const omitted=Number.isFinite(health.issueCount)&&health.issueCount>references.length
        ? t('Se muestran {shown} de {total} referencias.',{shown:references.length,total:health.issueCount})
        : '';
    const heading=issueLines.length ? t('Referencias para revisar') : '';
    return {
        summary,
        referencesText:issueLines.length
            ? `${heading}:\n${issueLines.map(item=>`• ${item.label} — ${item.status} · ${item.details}`).join('\n')}${omitted?`\n${omitted}`:''}`
            : '',
        referencesHtml:issueLines.length
            ? `<div class="email-data-health-references" style="margin:8px 0 0;padding:10px 12px;background:#fffaf0;border-left:3px solid #dcae55;color:#795b20;font-size:11px;line-height:1.7"><strong>${escape(heading)}</strong><ul style="margin:5px 0 0;padding-left:18px">${issueLines.map(item=>`<li><b>${escape(item.label)}</b> — ${escape(item.status)}${item.details?`<br>${escape(item.details)}`:''}</li>`).join('')}${omitted?`<li>${escape(omitted)}</li>`:''}</ul></div>`
            : '',
    };
}

module.exports={reportHealthEmailDetails};
