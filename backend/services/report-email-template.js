'use strict';
const {reportLabels}=require('../lib/report-language');
const {reportLayout}=require('../lib/report-layout');

const escape=value=>String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const scalar=value=>typeof value==='string' || typeof value==='number' && Number.isFinite(value) ? String(value) : '';
const singleLine=value=>scalar(value).replace(/[\r\n\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim();
const classifications={internal:'Uso interno',confidential:'Confidencial',shareable:'Compartible'};
const sentences=new Intl.Segmenter('es',{granularity:'sentence'});

// Conserva frases consecutivas completas, con sus cifras y condiciones.
// El PDF mantiene todo el contenido; el correo sólo presenta su síntesis.
function brief(value,max) {
    const paragraph=singleLine(scalar(value).split(/\n\s*\n/).find(part=>part.trim()));
    if(paragraph.length<=max) return paragraph;
    const selected=[];
    for(const {segment} of sentences.segment(paragraph)) {
        const line=segment.trim();
        if([...selected,line].join(' ').length>max) break;
        selected.push(line);
    }
    return selected.join(' ');
}

function buildReportEmail({title,executive,attachmentName,language='es'}) {
    const {t,locale}=reportLabels(language);
    const report=executive && typeof executive==='object' ? executive : {};
    const reportTitle=singleLine(report.title || title) || t('Informe ejecutivo');
    const file=singleLine(attachmentName) || 'informe.pdf';
    const settings=report.personalization || {};
    const cut=Number.isFinite(Date.parse(report.generatedAt))
        ? new Date(report.generatedAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'})+(language==='es' ? ' · Ciudad de México' : ' · America/Mexico_City')
        : language==='es' ? 'Fecha de corte no disponible' : t('Fecha no disponible');
    const classification=t(classifications[settings.confidentiality] || singleLine(settings.confidentialityLabel) || 'Uso interno');
    const identity=[settings.recipientName,settings.organization].map(singleLine).filter(Boolean).join(' · ');
    const summary=reportLayout(report)?.composition==='weekly-sheet' ? '' : brief(report.summary || report.objective,260) || t('El contenido completo se presenta en el PDF adjunto.');
    const introduction=t('Se adjunta el informe para su revisión.');
    const signature=t('Atentamente,')+'\nVALLNews\n'+t('Inteligencia económica');
    const html=`<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(reportTitle)}</title>
<style>@media only screen and (max-width:480px){.email-pad{padding-left:18px!important;padding-right:18px!important}.email-title{font-size:21px!important}.email-shell{border:0!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f4f7;font-family:Arial,Helvetica,sans-serif;color:#334155">
<div aria-hidden="true" style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all">${escape(t('PDF adjunto'))} · VALLNews</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f4f7"><tr><td align="center" style="padding:20px 10px">
<!--[if mso]><table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;background:#ffffff;border:1px solid #dbe3eb;border-top:3px solid #183449">
<tr><td class="email-pad" style="padding:22px 26px 16px;border-bottom:1px solid #e2e8ef">
<p style="margin:0;font-size:10px;font-weight:bold;letter-spacing:1px;color:#64748b">${escape(t('Entrega de informe').toUpperCase())}</p>
<h1 class="email-title" style="margin:9px 0;font-size:23px;line-height:1.35;color:#183449;word-wrap:break-word;overflow-wrap:anywhere">${escape(reportTitle)}</h1>
<p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;word-wrap:break-word;overflow-wrap:anywhere"><b>${escape(t('Corte'))}:</b> ${escape(cut)}<br>${escape(classification)}</p>
${identity ? `<p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:#526175;word-wrap:break-word;overflow-wrap:anywhere"><b>${escape(t('Preparado para'))}:</b> ${escape(identity)}</p>` : ''}
</td></tr>
<tr><td class="email-pad" style="padding:18px 26px 16px">
<p style="margin:0 0 10px;font-size:14px;line-height:1.6">${introduction}</p>
${summary ? `<p class="email-summary" style="margin:0;font-size:14px;line-height:1.65;word-wrap:break-word;overflow-wrap:anywhere">${escape(summary)}</p>` : ''}
</td></tr>
<tr><td class="email-pad" style="padding:0 26px 18px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;background:#f4f7fa"><tr><td style="padding:10px 12px;font-size:12px;line-height:1.6;color:#526175;word-wrap:break-word;overflow-wrap:anywhere"><b style="color:#183449">${escape(t('PDF adjunto'))}</b><br>${escape(file)}</td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:0 26px 22px">
<p style="margin:0 0 9px;font-size:13px;line-height:1.6;color:#526175">${escape(t('Atentamente,'))}</p>
<table role="presentation" class="email-signature" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed"><tr><td style="padding:2px 0 2px 12px;border-left:3px solid #397982">
<p style="margin:0;font-size:17px;line-height:1.4;font-weight:bold;letter-spacing:.3px;color:#183449">VALL<span style="color:#397982">News</span></p>
<p style="margin:2px 0 0;font-size:12px;line-height:1.5;color:#64748b">${escape(t('Inteligencia económica'))}</p>
</td></tr></table>
</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
    const text=[reportTitle,`${t('Corte')}: ${cut}`,classification,identity && `${t('Preparado para')}: ${identity}`,introduction,summary,`${t('PDF adjunto')}: ${file}`,signature].filter(Boolean).join('\n\n');
    return {subject:`VALLNEWS · ${reportTitle}`.slice(0,180),html,text};
}

module.exports={buildReportEmail};
