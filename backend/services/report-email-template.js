'use strict';
const {reportLabels}=require('../lib/report-language');
const {reportHealthEmailDetails}=require('../lib/report-email-health');
const {reportLayout}=require('../lib/report-layout');
const fs=require('node:fs'),path=require('node:path');
const LOGO_CID='vallnews-signature';
let logoContent;

const escape=value=>String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const scalar=value=>typeof value==='string' || typeof value==='number' && Number.isFinite(value) ? String(value) : '';
const singleLine=value=>scalar(value).replace(/[\r\n\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim();
const classifications={internal:'Uso interno',confidential:'Confidencial',shareable:'Compartible'};
const sentences=new Intl.Segmenter('es',{granularity:'sentence'});

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

function reportEmailAttachments(){
    logoContent ||= fs.readFileSync(path.join(__dirname,'../../assets/img/brand/logo.png'));
    return [{filename:'vallnews-logo.png',content:logoContent,contentType:'image/png',contentDisposition:'inline',cid:LOGO_CID}];
}

function buildReportSignature({language='es'}={}){
    const {t}=reportLabels(language);
    return {
        text:'VALLNEWS\n'+t('Inteligencia económica')+'\n'+t('Informes ejecutivos'),
        html:`<table role="presentation" class="email-signature" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;font-family:Arial,Helvetica,sans-serif"><tr>
<td width="120" valign="middle" style="width:120px;padding:0 16px 0 0"><table role="presentation" width="104" cellspacing="0" cellpadding="0" border="0" bgcolor="#082b4c" style="background:#082b4c;border-radius:6px"><tr><td align="center" style="padding:10px 8px"><img src="cid:${LOGO_CID}" width="88" height="47" alt="VALLNEWS" border="0" style="display:block;width:88px;height:47px;color:#ffffff;font-size:12px;font-weight:bold"></td></tr></table></td>
<td valign="middle" style="padding:2px 0 2px 16px;border-left:2px solid #168780;word-wrap:break-word;overflow-wrap:anywhere">
<p style="margin:0;font-size:16px;line-height:1.5;font-weight:bold;letter-spacing:.6px;color:#082b4c">VALLNEWS</p>
<p style="margin:2px 0 0;font-size:12px;line-height:1.6;color:#168780">${escape(t('Inteligencia económica'))}</p>
<p style="margin:1px 0 0;font-size:11px;line-height:1.6;color:#6b7c8c">${escape(t('Informes ejecutivos'))}</p>
</td></tr></table>`,
    };
}

function buildReportEmail({title,executive,attachmentName,language='es',health}) {
    const {t,locale}=reportLabels(language);
    const report=executive && typeof executive==='object' ? executive : {};
    const reportTitle=singleLine(report.title || title) || t('Informe ejecutivo');
    const file=singleLine(attachmentName) || 'informe.pdf';
    const settings=report.personalization || {};
    const isMorningBrief = report.key === 'morning_brief' || reportLayout(report)?.composition === 'morning-brief';
    const cut=Number.isFinite(Date.parse(report.generatedAt))
        ? new Date(report.generatedAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'})+(language==='es' ? ' · Ciudad de México' : ' · America/Mexico_City')
        : language==='es' ? 'Fecha de corte no disponible' : t('Fecha no disponible');
    const classification=t(classifications[settings.confidentiality] || singleLine(settings.confidentialityLabel) || 'Uso interno');
    const identity=[settings.recipientName,settings.organization].map(singleLine).filter(Boolean).join(' · ');
    const summary=reportLayout(report)?.composition==='weekly-sheet' ? '' : brief(report.summary || report.objective,260);
    const healthDetails=reportHealthEmailDetails(health,t);
    const healthText=healthDetails.summary;
    const introduction=t('Le compartimos su informe de VALLNEWS para apoyar su análisis y toma de decisiones.');
    const attachmentGuide=t('Consulte la edición completa en el PDF adjunto.');
    const closing=t('Gracias por confiar en VALLNEWS.');
    const signature=buildReportSignature({language});
    const recipientName=singleLine(settings.recipientName);
    const greeting=recipientName ? t('Hola, {name}:',{name:recipientName}) : t('Buen día:');
    const confidential=settings.confidentiality==='confidential';

    // Bloque de Acciones / Qué hacer hoy (exclusivo para Briefing Matutino)
    const actions = isMorningBrief && Array.isArray(report.actions) ? report.actions : [];
    const actionsHtml = actions.length ? `
    <div style="margin: 16px 0 20px;">
        <h3 style="margin: 0 0 10px; font-size: 13px; font-weight: bold; color: #183449; text-transform: uppercase; letter-spacing: 0.5px;">${escape(t('Qué hacer hoy · Decisiones clave'))}</h3>
        ${actions.map(act => `
        <div style="margin-bottom: 10px; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 4px;">
            <div style="margin-bottom: 4px;">
                <span style="font-size: 11px; font-weight: bold; color: #64748b;">${escape(act.pillar || '')}</span>
                <span style="font-size: 10px; font-weight: bold; margin-left: 8px; padding: 2px 6px; background: #e2e8f0; border-radius: 3px; color: #334155;">${escape(act.badge || '')}</span>
            </div>
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: bold; color: #1e293b;">${escape(act.headline || '')}</p>
            <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #475569;">${escape(act.recommendation || '')}</p>
        </div>
        `).join('')}
    </div>` : '';

    // Tablero de métricas destacadas (exclusivo para Briefing Matutino)
    const metrics = isMorningBrief && Array.isArray(report.metrics) ? report.metrics.slice(0, 10) : [];
    const metricsHtml = metrics.length ? `
    <div style="margin: 16px 0 20px;">
        <h3 style="margin: 0 0 10px; font-size: 13px; font-weight: bold; color: #183449; text-transform: uppercase; letter-spacing: 0.5px;">${escape(t('Tablero de indicadores del corte'))}</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="6" border="0" style="table-layout: fixed; border-collapse: collapse; font-size: 12px;">
            <tbody>
                ${metrics.map((m, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding: 6px 8px; color: #334155; font-weight: 500;">${escape(m.label || '')}</td>
                    <td align="right" style="padding: 6px 8px; font-weight: bold; color: #0f172a;">${escape(m.value || '')}</td>
                    <td align="right" width="80" style="padding: 6px 8px; font-weight: bold; color: ${m.tone === 'up' ? '#16a34a' : m.tone === 'down' ? '#dc2626' : '#64748b'};">
                        ${escape(m.change || '')}
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>` : '';

    const html=`<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(reportTitle)}</title>
<style>@media only screen and (max-width:480px){.email-pad{padding-left:20px!important;padding-right:20px!important}.email-title{font-size:23px!important}.email-brand{font-size:22px!important;letter-spacing:1px!important}.email-top-label{font-size:9px!important;letter-spacing:.4px!important}.email-outer{padding:12px 8px!important}}</style></head>
<body style="margin:0;padding:0;background:#edf1f5;font-family:Arial,Helvetica,sans-serif;color:#334155">
<div aria-hidden="true" style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all">${escape(reportTitle)} · ${escape(t('PDF adjunto'))} · VALLNEWS</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#edf1f5"><tr><td align="center" class="email-outer" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;background:#ffffff;border:1px solid #d7e1e9;border-radius:12px;overflow:hidden">
<tr><td class="email-pad" bgcolor="#082b4c" style="padding:20px 28px;background:#082b4c;border-radius:11px 11px 0 0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed"><tr><td width="53%" valign="middle"><p class="email-brand" style="margin:0;font-size:25px;line-height:1.3;font-weight:bold;letter-spacing:1.5px;color:#ffffff">VALLNEWS</p></td><td align="right" valign="middle"><p class="email-top-label" style="margin:0;font-size:10px;line-height:1.6;letter-spacing:1px;color:#bdd9df">${escape(t('Entrega de informe').toLocaleUpperCase(locale))}</p></td></tr></table>
</td></tr>
<tr><td height="3" bgcolor="#168780" style="height:3px;line-height:3px;font-size:0;background:#168780">&nbsp;</td></tr>
<tr><td class="email-pad" style="padding:25px 28px 18px">
<h1 class="email-title" style="margin:0 0 13px;font-size:26px;line-height:1.3;font-weight:bold;letter-spacing:-.5px;color:#082b4c;word-wrap:break-word;overflow-wrap:anywhere">${escape(reportTitle)}</h1>
<p style="margin:0 0 10px;font-size:11px;line-height:1.7;color:#6b7c8c;word-wrap:break-word;overflow-wrap:anywhere"><b>${escape(t('Corte'))}:</b> ${escape(cut)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:100%"><tr><td style="padding:4px 9px;border-radius:4px;background:${confidential ? '#fff3d9' : '#eaf3f3'};color:${confidential ? '#795b20' : '#2b6864'};font-size:10px;line-height:1.5;word-wrap:break-word;overflow-wrap:anywhere">${escape(classification)}</td></tr></table>
${identity ? `<p style="margin:11px 0 0;font-size:12px;line-height:1.6;color:#52697e;word-wrap:break-word;overflow-wrap:anywhere"><b>${escape(t('Preparado para'))}:</b> ${escape(identity)}</p>` : ''}
</td></tr>
<tr><td class="email-pad" style="padding:0 28px 20px">
<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#203a50">${escape(greeting)}</p>
<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#334f64">${escape(introduction)}</p>
${summary ? `<p class="email-summary" style="margin:0;font-size:14px;line-height:1.75;color:#52697e;word-wrap:break-word;overflow-wrap:anywhere">${escape(summary)}</p>` : ''}
${healthText ? `<p class="email-data-health" style="margin:12px 0 0;padding:10px 12px;background:#fff7e6;border-left:3px solid #dcae55;color:#795b20;font-size:12px;line-height:1.7">${escape(healthText)}</p>` : ''}
${healthDetails.referencesHtml}
${actionsHtml}
${metricsHtml}
</td></tr>
<tr><td class="email-pad" style="padding:0 28px 22px">
<p class="email-attachment-guide" style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#52697e">${escape(attachmentGuide)}</p>
<table role="presentation" class="email-attachment" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;background:#f1f6f8;border:1px solid #dce7eb;border-radius:8px"><tr><td width="56" valign="middle" style="width:56px;padding:12px 0 12px 14px"><table role="presentation" width="30" cellspacing="0" cellpadding="0" border="0" bgcolor="#082b4c" style="background:#082b4c;border-radius:4px"><tr><td align="center" height="38" style="height:38px;color:#ffffff;font-size:9px;font-weight:bold;letter-spacing:.5px">PDF</td></tr></table></td><td valign="middle" style="padding:12px 14px 12px 0;font-size:12px;line-height:1.7;color:#62788c;word-wrap:break-word;overflow-wrap:anywhere"><b style="color:#082b4c">${escape(t('PDF adjunto'))}</b><br>${escape(file)}</td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:0 28px 25px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:18px 0 0;border-top:1px solid #e1e9ee"><p class="email-closing" style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#334f64">${escape(closing)}</p><p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#62788c">${escape(t('Atentamente,'))}</p>${signature.html}</td></tr></table>
</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;

    const textActions = actions.length ? '\n\n' + t('QUÉ HACER HOY') + ':\n' + actions.map(a => `• [${a.pillar}] ${a.headline} -> ${a.recommendation}`).join('\n') : '';
    const textMetrics = metrics.length ? '\n\n' + t('TABLERO') + ':\n' + metrics.map(m => `• ${m.label}: ${m.value} (${m.change})`).join('\n') : '';

    const text=[reportTitle,`${t('Corte')}: ${cut}`,classification,identity && `${t('Preparado para')}: ${identity}`,greeting,introduction,summary,healthText,healthDetails.referencesText,textActions,textMetrics,attachmentGuide,`${t('PDF adjunto')}: ${file}`,closing,t('Atentamente,')+'\n'+signature.text].filter(Boolean).join('\n\n');
    return {subject:`VALLNEWS · ${reportTitle}`.slice(0,180),html,text};
}

module.exports={buildReportEmail,buildReportSignature,reportEmailAttachments};
