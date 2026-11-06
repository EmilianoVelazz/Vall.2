'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { reportMailStatus, mailTransport, mailFailure, mailAutomationEnabled } = require('../services/report-mailer');
const JSZip = require('jszip');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } = require('docx');
const { verifyToken } = require('./auth');
const { reportOwnerBinding } = require('../lib/report-session-owner');
const { accountKey, createWorkGate, boundedJson } = require('../lib/resource-limits');
const {createReportEmailLimits}=require('../lib/report-email-limits');
const { IS_VERCEL } = require('../lib/config');
const financeReportStore = require('../services/finance-report-store');
const marketReportStore = require('../services/market-report-store');
const mexicoReports = require('../services/mexico-executive-reports').mexicoReports;
const REPORT_COLLECTIONS = require('../../shared/report-collections.json');
const {reportLayout}=require('../lib/report-layout');
const {reportVisualLimit}=require('../lib/report-fx');
const {dailyPoints}=require('../lib/report-observations');
const {makeCompanyDashboardPdf}=require('../lib/report-company-dashboard-pdf');
const {normalizeEquityEvidence}=require('../lib/report-equity-quality');
const reportEmailSchedules = require('../services/report-email-schedule-store');
const {normalizeScheduleSelection}=require('../lib/report-schedule-selection');
const { reportFileStore } = require('../services/report-file-store');
const { normalizePreferences, personalizeExecutiveReport } = require('../lib/executive-report-preferences');
const { userReportAgent } = require('../ai/user-report-agent');
const { createScheduledReportDelivery, normalizeAiCustomization } = require('../services/report-scheduled-delivery');
const {reportLearning}=require('../services/report-learning');
const { normalizeRecipient } = require('../lib/report-email-recipient');
const { buildReportEmail } = require('../services/report-email-template');
const {reportTranslator}=require('../services/report-translation');
const {reportLabels,requestReportLanguage}=require('../lib/report-language');
const {makeLocalizedReportPdf}=require('../lib/report-localized-pdf');
const {reportExportContent}=require('../lib/report-export-content');
const {reportPresentation,withoutSourcesText}=require('../lib/report-presentation');
const {reportDownloadName,reportDocumentTitle}=require('../../shared/report-download-name.mjs');

const router = express.Router();
const REPORT_TEMPLATE_PATH = path.join(__dirname, '..', '..', 'assets', 'templates', 'vallnews-reports-template.docx');
const REPORT_WATERMARK_PATH = path.join(__dirname, '..', '..', 'assets', 'templates', 'vallnews-report-watermark.png');
function isEquityLayout(report) {
    const layout=reportLayout(report);
    return layout?.collection==='finance' && layout.key==='equities';
}
function finiteQuote(value) {
    if(value==null || typeof value==='boolean' || typeof value==='string' && !value.trim()) return null;
    const number=Number(value);return Number.isFinite(number) ? number : null;
}

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: accountKey, standardHeaders: true, legacyHeaders: false });
const {attempts:emailAttempts,deliveries:emailLimiter,schedules:scheduleLimiter}=createReportEmailLimits({keyGenerator:accountKey});
const localeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyGenerator: accountKey, standardHeaders: true, legacyHeaders: false });
const reportWork = createWorkGate({ maxActive: 4, maxPerUser: 1 }).wrap;

function clean(value, max = 120000) { return String(value == null ? '' : value).replace(/\0/g, '').trim().slice(0, max); }
function filename(value) { return clean(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'reporte-vall-ai'; }
function plain(value) { return clean(value).replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/^>\s?/gm, '').replace(/\|/g, ' ').trim(); }
function imagesFrom(body) {
    return (Array.isArray(body?.chartImages) ? body.chartImages : []).slice(0, 8).map(value => {
        const match = String(value).match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/i);
        if (!match) return null;
        const buffer = Buffer.from(match[1], 'base64');
        return buffer.length <= 2_500_000 ? buffer : null;
    }).filter(Boolean);
}

function safeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function deliverExecutiveEmail({ recipient, title, executive, language='es', owner='',beforeSend }) {
    recipient=normalizeRecipient(recipient);
    const sender = clean(process.env.GMAIL_USER, 240);
    const transport = mailTransport();
    if (!transport || !sender) throw mailFailure();
    try {
    const localized=await reportTranslator.localize({report:executive,title,language},{owner});
    const buffer = await makeExecutivePdf(localized.title, localized.report,localized);
    const attachmentName = reportDownloadName(localized.report,'pdf',{language});
    if(beforeSend && !(await beforeSend())) return {skipped:true};
    let receipt;
    try { receipt=await transport.sendMail({
        from: `VALLNEWS <${sender}>`, to: recipient,
        headers:{'Content-Language':language},
        ...buildReportEmail({title:localized.title,executive:localized.report,attachmentName,language}),
        attachments: [{ filename: attachmentName, content: buffer, contentType: 'application/pdf' }],
    });
        const accepted=receipt?.accepted?.some(value=>String(value).trim().toLowerCase()===recipient.toLowerCase())&&!receipt?.rejected?.some(value=>String(value).trim().toLowerCase()===recipient.toLowerCase());
        if(!accepted) throw Object.assign(Error('El servidor SMTP no confirmó al destinatario.'),{code:'EENVELOPE'});
    } catch (error) { throw mailFailure(error); }
    return { attachmentName, size: buffer.length, language,messageId:String(receipt.messageId || '').slice(0,240) };
    } finally {try{transport.close?.();}catch{console.warn('[report-email] No se confirmó el cierre del transporte SMTP.');}}
}

const runScheduledReportEmails = createScheduledReportDelivery({
    enabled: mailAutomationEnabled,
    store: reportEmailSchedules, collections: REPORT_COLLECTIONS,
    loadSnapshot: area => area === 'finance' ? financeReportStore.load() : area === 'mexico' ? mexicoReports.get() : marketReportStore.load(),
    generate: async (request,{ownerEmail}) => userReportAgent.generate(request,{userContext:await reportLearning.load({email:ownerEmail})}), personalize: personalizeExecutiveReport,
    prepare: executivePayload, deliver: deliverExecutiveEmail,
});

function docxParagraphs(content) {
    const paragraphs = [];
    let inCode = false;
    for (const raw of clean(content).split(/\r?\n/)) {
        if (/^```/.test(raw.trim())) { inCode = !inCode; continue; }
        if (inCode) continue;
        const heading = raw.match(/^(#{1,4})\s+(.+)/);
        if (heading) {
            const levels = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
            paragraphs.push(new Paragraph({ text: plain(heading[2]), heading: levels[Math.min(heading[1].length - 1, 3)], spacing: { before: 220, after: 100 } }));
            continue;
        }
        const bullet = raw.match(/^\s*[-•]\s+(.+)/);
        const ordered = raw.match(/^\s*\d+\.\s+(.+)/);
        if (bullet || ordered) {
            paragraphs.push(new Paragraph({ text: plain((bullet || ordered)[1]), bullet: { level: 0 }, spacing: { after: 60 } }));
            continue;
        }
        if (!raw.trim()) { paragraphs.push(new Paragraph('')); continue; }
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: plain(raw), size: 22 })], spacing: { after: 100 } }));
    }
    return paragraphs;
}

async function mergeDocxWithVallnewsTemplate(generatedBuffer) {
    // Se parte de la plantilla subida por VALLNews: conserva la sección Letter,
    // la cabecera y su imagen de marca de agua. Sólo se reemplaza el cuerpo.
    if (!fs.existsSync(REPORT_TEMPLATE_PATH)) return generatedBuffer;
    const [templateZip, generatedZip] = await Promise.all([JSZip.loadAsync(fs.readFileSync(REPORT_TEMPLATE_PATH)), JSZip.loadAsync(generatedBuffer)]);
    const [templateDocument, generatedDocument, templateRelations, generatedRelations] = await Promise.all([
        templateZip.file('word/document.xml').async('string'),
        generatedZip.file('word/document.xml').async('string'),
        templateZip.file('word/_rels/document.xml.rels').async('string'),
        generatedZip.file('word/_rels/document.xml.rels').async('string'),
    ]);
    const generatedBody = generatedDocument.match(/<w:body>([\s\S]*?)<\/w:body>/)?.[1] || '';
    const generatedContent = generatedBody.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/, '');
    const templateSection = templateDocument.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0];
    if (!templateSection) return generatedBuffer;

    const existingIds = new Set([...templateRelations.matchAll(/\bId="([^"]+)"/g)].map(match => match[1]));
    const imageRelations = [...generatedRelations.matchAll(/<Relationship\s+Id="([^"]+)"\s+Type="([^"]*\/image)"\s+Target="([^"]+)"\s*\/>/g)];
    let nextImage = 1;
    let mergedContent = generatedContent;
    let mergedRelations = templateRelations;
    for (const relation of imageRelations) {
        const [, originalId, type, sourceTarget] = relation;
        const sourceFile = `word/${sourceTarget.replace(/^\.\//, '')}`;
        const source = generatedZip.file(sourceFile);
        if (!source) continue;
        let relationId = `rIdVallChart${nextImage}`;
        while (existingIds.has(relationId)) relationId = `rIdVallChart${++nextImage}`;
        existingIds.add(relationId);
        const extension = path.extname(sourceTarget) || '.png';
        const target = `media/orion-chart-${nextImage}${extension}`;
        templateZip.file(`word/${target}`, await source.async('nodebuffer'));
        mergedRelations = mergedRelations.replace('</Relationships>', `<Relationship Id="${relationId}" Type="${type}" Target="${target}"/></Relationships>`);
        mergedContent = mergedContent.replace(new RegExp(`r:embed="${originalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'), `r:embed="${relationId}"`);
        nextImage += 1;
    }
    templateZip.file('word/document.xml', templateDocument.replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${mergedContent}${templateSection}</w:body>`));
    templateZip.file('word/_rels/document.xml.rels', mergedRelations);
    return templateZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function makeDocx(title, content, images,localization=reportLabels()) {
    const {t,locale,language}=localization;
    const children = [
        new Paragraph({ text: 'VALLNEWS · '+t('Inteligencia económica').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
        new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
        new Paragraph({ text: `${t('Generado por ORION')} · ${new Date().toLocaleDateString(locale)}`, spacing: { after: 300 } }),
        ...docxParagraphs(content),
    ];
    images.forEach((data, index) => {
        children.push(new Paragraph({ text: `${t('Gráfica')} ${index + 1}`, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data, transformation: { width: 620, height: 340 } })] }));
    });
    children.push(new Paragraph({ text: language==='es' ? 'Documento informativo. Verifique las cifras antes de tomar decisiones.' : t('Documento informativo. Confirme fecha, unidad y fuente primaria.'), spacing: { before: 300 } }));
    const document = new Document({ sections: [{ properties: {}, children }] });
    const result=await mergeDocxWithVallnewsTemplate(await Packer.toBuffer(document));
    if(language==='es') return result;
    const zip=await JSZip.loadAsync(result);
    for(const name of Object.keys(zip.files).filter(name=>/^word\/(?:header\d+|footer\d+|styles)\.xml$/.test(name))) {
        let xml=await zip.file(name).async('string');
        xml=xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g,(match,attrs,text)=>t(text)===text ? match : `<w:t${attrs}>${safeHtml(t(text))}</w:t>`).replace(/<w:lang\b[^>]*\/?\s*>/g,`<w:lang w:val="${locale}" w:eastAsia="${locale}"/>`);
        zip.file(name,xml);
    }
    return zip.generateAsync({type:'nodebuffer'});
}

function executivePayload(input) {
    if (!input || typeof input !== 'object') return null;
    input=require('../lib/report-daily-evidence').withDailyEvidence(input);
    input=reportPresentation(normalizeEquityEvidence(input));
    // El PDF usa las fuentes nativas de PDFKit. Normalizar los guiones evita
    // sustituciones tipográficas distintas entre lectores de PDF.
    const text = (value, max = 1600) => plain(String(value ?? '')).replace(/[\u2013\u2014\u2212]/g, '-').slice(0, max);
    if (input.userEdition === true || input.collection === 'mexico') {
        const { normalizeReport } = require('../services/user-report-store');
        const owned = normalizeReport(input);
        const included=normalizePreferences(owned.personalization).sections;
        return { ...owned, userEdition:input.userEdition===true, ...require('../../shared/report-market-analysis.mjs').focusedEvidence(input), collection:owned.baseReport?.collection || (input.collection==='mexico' ? 'mexico' : undefined), key: text(input.key, 60),
            title: owned.title, sections: owned.sections.map(section => ({heading:text(section.heading,140),text:text(section.text,8000)})),
            metrics:included.indicators ? owned.metrics : [],visuals:included.charts ? owned.visuals : [],tables:included.tables ? owned.tables : [],watchlist:included.risks ? owned.watchlist : [],
            sourceLinks:included.sources ? owned.sourceLinks : [],sources:included.sources ? [...owned.sources, ...owned.sourceLinks.map(source => `${source.label}: ${source.url}`)].filter(Boolean) : [],
            personalization: {...owned.personalization, customized:true,
                audience:({general:'Comité directivo',finance:'Finanzas y tesorería',purchasing:'Compras y abastecimiento',operations:'Operaciones',commercial:'Dirección comercial'})[owned.personalization.audience] || 'Comité directivo',
                horizon:({current:'Corte actual',month:'Próximos 30 días',quarter:'Próximo trimestre',year:'Próximos 12 meses'})[owned.personalization.decisionHorizon] || 'Corte actual',
                confidentialityLabel:owned.personalization.confidentiality==='confidential' ? 'Confidencial' : owned.personalization.confidentiality==='shareable' ? 'Compartible' : 'Uso interno'}, comparisons:[], equitySeries:[], executiveBrief:null, decisionGuide:null };
    }
    const rows = value => Array.isArray(value) ? value.slice(0, 100).map(row => Array.isArray(row) ? row.slice(0, 12).map(cell => text(cell, 500)) : []).filter(row => row.length) : [];
    const visuals = Array.isArray(input.visuals) ? input.visuals.slice(0, reportVisualLimit(input)).map(visual => ({
        type: visual?.type === 'bar' ? 'bar' : 'line', title: text(visual?.title, 140), unit: text(visual?.unit, 80), note: text(visual?.note, 800),
        bars: Array.isArray(visual?.bars) ? visual.bars.slice(0, 30).map(item => ({ label: text(item?.label, 140), value: finiteQuote(item?.value) })).filter(item => Number.isFinite(item.value)) : [],
        series: Array.isArray(visual?.series) ? visual.series.slice(0, 8).map(series => ({ label: text(series?.label, 140), points: Array.isArray(series?.points) ? series.points.slice(-150).map(point => ({ date: text(point?.date, 40), value: finiteQuote(point?.value) })).filter(point => Number.isFinite(point.value)) : [] })).filter(series => series.points.length > 1) : [],
    })).filter(visual => visual.title && (visual.bars.length || visual.series.length)) : [];
    const comparisonRows = [];
    const visited = new Set();
    const visitSnapshot = (value, depth = 0) => {
        if (!value || typeof value !== 'object' || depth > 5 || visited.has(value)) return;
        visited.add(value);
        if (Array.isArray(value)) { value.forEach(item => visitSnapshot(item, depth + 1)); return; }
        const current = finiteQuote(value.value);
        const previous = finiteQuote(value.previous);
        if (typeof value.label === 'string' && Number.isFinite(current) && Number.isFinite(previous) && previous !== 0) {
            const calculated = ((current - previous) / previous) * 100;
            const supplied = finiteQuote(value.change);
            comparisonRows.push({ label: text(value.label, 65), previous, current, change: Number.isFinite(supplied) ? supplied : calculated, unit: text(value.unit, 24) });
        }
        Object.values(value).forEach(item => visitSnapshot(item, depth + 1));
    };
    visitSnapshot(input.sourceSnapshot);
    const comparisons = [...new Map(comparisonRows.map(item => [item.label, item])).values()].slice(0, 4);
    const briefInput = input.executiveBrief && typeof input.executiveBrief === 'object' ? input.executiveBrief : {
        mode: 'deterministic', agent: 'VALL Executive Desk', headline: input.title, context: input.objective, thesis: input.summary,
        drivers: input.takeaways, risks: input.watchlist,
        committeeQuestion: '¿Qué dato de las fuentes del corte confirmaría o cambiaría esta lectura antes de tomar una decisión?',
        evidenceNote: 'Síntesis determinista construida con los indicadores y fuentes verificables ya incluidos en este informe; no es una respuesta generada por IA.',
    };
    const executiveBrief = briefInput ? {
        mode: briefInput.mode === 'ai' ? 'ai' : 'deterministic', agent: text(briefInput.agent || 'VALL Executive Desk', 80), headline: text(briefInput.headline, 140), context: text(briefInput.context, 360), thesis: text(briefInput.thesis, 500),
        drivers: Array.isArray(briefInput.drivers) ? briefInput.drivers.slice(0, 3).map(item => text(item, 300)).filter(Boolean) : [],
        risks: Array.isArray(briefInput.risks) ? briefInput.risks.slice(0, 3).map(item => text(item, 300)).filter(Boolean) : [],
        committeeQuestion: text(briefInput.committeeQuestion, 320), evidenceNote: text(briefInput.evidenceNote, 500),
    } : null;
    const personalizationInput = input.personalization && typeof input.personalization === 'object' ? input.personalization : {};
    const personalization = {
        customized: Object.keys(personalizationInput).length > 0,
        sections: normalizePreferences(personalizationInput).sections,
        audience: ({general:'Comité directivo',finance:'Finanzas y tesorería',purchasing:'Compras y abastecimiento',operations:'Operaciones',commercial:'Dirección comercial'})[personalizationInput.audience] || text(personalizationInput.audienceLabel || personalizationInput.audience, 80),
        depth: ['brief', 'standard', 'detailed'].includes(personalizationInput.depth) ? personalizationInput.depth : 'standard',
        objective: text(personalizationInput.objective, 400),
        recipientName: text(personalizationInput.recipientName, 80),
        organization: text(personalizationInput.organization, 100),
        customTitle: text(personalizationInput.customTitle, 110),
        decisionHorizon: ['current', 'month', 'quarter', 'year'].includes(personalizationInput.decisionHorizon) ? personalizationInput.decisionHorizon : 'current',
        horizon: text(personalizationInput.horizon, 60) || ({current:'Corte actual',month:'Próximos 30 días',quarter:'Próximo trimestre',year:'Próximos 12 meses'})[personalizationInput.decisionHorizon] || 'Corte actual',
        confidentiality: ['internal', 'confidential', 'shareable'].includes(personalizationInput.confidentiality) ? personalizationInput.confidentiality : 'internal',
        confidentialityLabel: text(personalizationInput.confidentialityLabel, 40) || ({internal:'Uso interno',confidential:'Confidencial',shareable:'Compartible'})[personalizationInput.confidentiality] || 'Uso interno',
        theme: 'graphite',
    };
    const equitySeries = String(input.key || '').toLowerCase() === 'equities' && Array.isArray(input?.sourceSnapshot?.equities)
        ? input.sourceSnapshot.equities.slice(0, 80).map(item => {
            const isDaily = Array.isArray(item?.recentSeries) && item.recentSeries.length > 10;
            const rawPoints = isDaily ? item.recentSeries : item?.series;
            const points = dailyPoints(Array.isArray(rawPoints) ? rawPoints.slice(-65).map(point => ({
                date: text(point?.date, 18), value: finiteQuote(point?.value),
            })) : [],input.generatedAt || new Date());
            return {
                label: text(item?.label, 60), symbol: text(item?.symbol, 20), region: text(item?.region, 28), market: text(item?.market, 40), value: finiteQuote(item?.value), previous: finiteQuote(item?.previous), change: finiteQuote(item?.change),
                performance: {
                    day: finiteQuote(item?.performance?.day), week: finiteQuote(item?.performance?.week), month: finiteQuote(item?.performance?.month), ytd: finiteQuote(item?.performance?.ytd),
                },
                points, isDaily,
            };
        }).filter(item => item.label && item.points.length > 10 && Number.isFinite(item.value))
        : [];
    const sourceLimit=require('../lib/report-source-limits').reportSourceLimit(input);
    const sourceLinks=(Array.isArray(input.sourceLinks) ? input.sourceLinks : []).slice(0,sourceLimit).flatMap(source=>{
        try {const url=new URL(source?.url);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? [{label:text(source?.label,240),url:url.href.slice(0,1800)}] : [];}
        catch {return [];}
    });
    const fullFxHistory=require('../lib/report-fx').exportFxHistory(input);
    return {
        key: text(input.key, 48), collection:text(input.collection,40), title: personalization.customTitle || text(input.title, 140), eyebrow: text(input.eyebrow, 160), objective: text(input.objective, 2000), summary: text(input.summary, 4000), closing: text(input.closing, 4000),
        generatedAt: text(input.generatedAt, 80),
        ...(require('../../shared/report-panorama.mjs').isPanorama(input) ? {panoramaVersion:require('../../shared/report-panorama.mjs').PANORAMA_VERSION,panoramaParts:require('../../shared/report-panorama.mjs').safePanoramaParts(input.panoramaParts,input.generatedAt),panoramaMissing:Array.isArray(input.panoramaMissing) ? input.panoramaMissing.slice(0,3) : []} : {}),
        ...require('../../shared/report-market-analysis.mjs').focusedEvidence(input),
        ...(fullFxHistory ? {marketHistory:fullFxHistory} : {}),
        ...require('../../shared/report-annual-evidence.mjs').annualEvidence(input),
        ...(input.periodType==='annual' && [2022,2023,2024,2025].includes(input.reportYear) ? {periodType:'annual',reportYear:input.reportYear} : {}),
        ...((input.baseReport?.key || input.key)==='equities' ? {equityObservations:(input.equityObservations || input.sourceSnapshot?.equities || []).slice(0,80).map(item=>({label:text(item.label,140),region:text(item.region,40),symbol:text(item.symbol,30),market:text(item.market,80),exchange:text(item.exchange,80),kind:['equity','volatility','informational'].includes(item.kind) ? item.kind : 'equity',points:(item.series || item.points || item.recentSeries || []).slice(-65).map(point=>({date:text(point.date,40),value:finiteQuote(point.value)})).filter(point=>point.value>0)}))} : {}),
        ...(input.equityCatalogVersion ? {equityCatalogVersion:1} : {}),
        ...(require('../../shared/report-market-news.mjs').isMarketNews(input) ? {marketNewsVersion:1,marketNews:require('../../shared/report-market-news.mjs').marketNewsEvidence(input)} : {}),
        ...(require('../../shared/report-financial-news.mjs').isFinancialNews(input) ? {newsVersion:1,newsStatus:['current','empty','unavailable'].includes(input.newsStatus) ? input.newsStatus : 'current',financialNews:require('../../shared/report-financial-news.mjs').financialNewsEvidence(input)} : {}),
        ...((input.baseReport?.key || input.key)==='bonds' ? {bondObservations:(input.bondObservations || input.sourceSnapshot?.bonds || []).slice(0,96).map(item=>({id:text(item.id,40),label:text(item.label,140),symbol:text(item.symbol,30),market:text(item.market,80),currency:text(item.currency,8),maturity:text(item.maturity,12),tenorYears:finiteQuote(item.tenorYears),cadence:['auction','monthly'].includes(item.cadence) ? item.cadence : 'daily',basis:text(item.basis,40),region:text(item.region,40),code:text(item.code,3),source:text(item.source,240),url:text(item.url,1800),points:(item.cadence==='monthly' ? (item.series || item.points || []).filter(point=>point.date>='2020-01').slice(-256) : require('../../shared/report-bond-evidence.mjs').compactBondPoints(item.series || item.points || item.recentSeries || [],input.generatedAt)).map(point=>({date:text(point.date,40),value:finiteQuote(point.value)})).filter(point=>Number.isFinite(point.value))}))} : {}),
        ...(input.bondSchemaVersion ? {bondSchemaVersion:require('../../shared/report-bond-markets.json').version} : {}),
        ...(Array.isArray(input.bondNews) ? {bondNews:input.bondNews.slice(0,12).map(item=>({title:text(item.title,500),description:text(item.description,800),source:text(item.source,240),publishedAt:text(item.publishedAt,80),url:text(item.url,1800)}))} : {}),
        ...(Array.isArray(input.equityNews) ? {equityNews:input.equityNews.slice(0,12).map(item=>({title:text(item.title,500),description:text(item.description,800),source:text(item.source,240),publishedAt:text(item.publishedAt,80),url:text(item.url,1800)}))} : {}),
        ...(Array.isArray(input.dailyReferences) ? {dailyReferences:input.dailyReferences.map(item=>({label:text(item.label,140),unit:text(item.unit,80),points:item.points.map(point=>({date:text(point.date,40),value:point.value}))}))} : {}),
        ...(Array.isArray(input.sessionObservations) ? {sessionObservations:input.sessionObservations.slice(0,192).map(item=>({label:text(item.label,140),unit:text(item.unit,80),region:text(item.region,40),market:text(item.market,100),exchange:text(item.exchange,80),source:text(item.source,240),url:text(item.url,1800),cadence:['weekly','monthly','annual','auction'].includes(item.cadence) ? item.cadence : 'daily',category:text(item.category,80),basis:text(item.basis,400),quoteStatus:['verified','preserved','unavailable'].includes(item.quoteStatus) ? item.quoteStatus : '',points:(item.points || []).slice(-65).map(point=>({date:text(point.date,40),value:finiteQuote(point.value)})).filter(point=>Number.isFinite(point.value))}))} : {}),
        ...(Array.isArray(input.sessionNews) ? {sessionNews:input.sessionNews.slice(0,12).map(item=>({title:text(item.title,500),description:text(item.description,800),source:text(item.source,240),publishedAt:text(item.publishedAt,80),url:text(item.url,1800),categoryLabel:text(item.categoryLabel,140)}))} : {}),
        metrics: personalization.sections.indicators && Array.isArray(input.metrics) ? input.metrics.slice(0, 30).map(item => ({ label: text(item?.label, 140), value: text(item?.value, 140), change: text(item?.change, 140) })) : [],
        takeaways: Array.isArray(input.takeaways) ? input.takeaways.slice(0, 20).map(item => text(item, 1500)).filter(Boolean) : [],
        watchlist: personalization.sections.risks && Array.isArray(input.watchlist) ? input.watchlist.slice(0, 20).map(item => text(item, 1500)).filter(Boolean) : [],
        sections: Array.isArray(input.sections) ? input.sections.slice(0, 20).map(item => ({ heading: text(item?.heading, 140), text: text(item?.text, 8000) })).filter(item => item.heading && item.text) : [],
        tables: personalization.sections.tables && Array.isArray(input.tables) ? input.tables.slice(0, 6).map(table => ({ ...(table?.kind==='guide' ? {kind:'guide'} : {}),title: text(table?.title, 140), note: text(table?.note, 800), columns: Array.isArray(table?.columns) ? table.columns.slice(0, 12).map(column => text(column, 140)) : [], rows: rows(table?.rows) })).filter(table => table.title && table.columns.length && table.rows.length) : [],
        visuals: personalization.sections.charts ? visuals : [],
        comparisons: personalization.sections.indicators ? comparisons : [],
        executiveBrief: executiveBrief ? { ...executiveBrief, risks: personalization.sections.risks ? executiveBrief.risks : [] } : null,
        equitySeries, personalization,
        decisionGuide: input.decisionGuide ? { heading: text(input.decisionGuide.heading, 120), action: text(input.decisionGuide.action, 500), horizonNote: text(input.decisionGuide.horizonNote, 500), coverageNote: text(input.decisionGuide.coverageNote, 300) } : null,
        sourceLinks:personalization.sections.sources ? sourceLinks : [],
        sources: personalization.sections.sources ? [...new Set([
            ...(Array.isArray(input.sources) ? input.sources.slice(0, sourceLimit).map(item => text(item, 240)) : []),
            ...(Array.isArray(input.sourceLinks) ? input.sourceLinks.slice(0, sourceLimit).map(item => {
                try {const link=new URL(item?.url);return ['http:','https:'].includes(link.protocol) && !link.username && !link.password ? text(item?.label,240)+': '+link.href.slice(0,1800) : '';}
                catch {return '';}
            }) : []),
        ].filter(Boolean))] : [],
    };
}

const PDF_COLORS = { navy: '#111827', blue: '#1F2937', cyan: '#4B5563', ink: '#1F2937', muted: '#6B7280', pale: '#F3F4F6', line: '#D1D5DB', grid: '#E5E7EB', midnight: '#111827', slate: '#1F2937', gold: '#9CA3AF', mint: '#6B7280' };
const PDF_THEMES = {
    graphite: { accent: '#EDEDED', deep: '#111827', band: '#1F2937', panel: '#1F2937' },
};

function pdfPersonalization(report) {
    const value = report?.personalization || {};
    return {
        ...value,
        audience: value.audience || 'Comité directivo',
        horizon: value.horizon || 'Corte actual',
        confidentialityLabel: value.confidentialityLabel || 'Uso interno',
    };
}

function pdfTheme(report) {
    return PDF_THEMES[report?.personalization?.theme] || PDF_THEMES.graphite;
}

function pdfCutLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'fecha no disponible'
        : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function pdfResetFlow(document, y = document.y) {
    document.x = document.page.margins.left;
    document.y = Math.max(document.page.margins.top, y);
}

function pdfVallnewsWatermark(document, opacity = 1) {
    if (!fs.existsSync(REPORT_WATERMARK_PATH)) return;
    const image = document.openImage(REPORT_WATERMARK_PATH);
    // La plantilla Word ancla el archivo original a 6 pulgadas de ancho en el
    // centro de la página. Conservamos esa misma medida en PDF y sólo usamos
    // opacidad para que funcione como marca de agua, no como decoración tenue.
    const width = Math.min(432, document.page.width - 54);
    const height = width * (image.height / image.width);
    document.save();
    document.opacity(opacity);
    document.image(REPORT_WATERMARK_PATH, (document.page.width - width) / 2, (document.page.height - height) / 2, { width, height });
    document.restore();
}

function pdfVallnewsWatermarksOnTop(document, { skipFirstPage = false, skipLastPage = false } = {}) {
    // Las tarjetas y las gráficas dibujan fondos blancos opacos. Si la marca
    // se coloca al abrir una página queda técnicamente incluida, pero termina
    // cubierta por esos fondos. Con bufferPages podemos aplicarla al final de
    // cada hoja: conserva el mismo PNG, tamaño y transparencia de Word, y se
    // mantiene legible sin ocultar el contenido.
    if (!fs.existsSync(REPORT_WATERMARK_PATH) || typeof document.bufferedPageRange !== 'function') return;
    const { start, count } = document.bufferedPageRange();
    for (let offset = 0; offset < count; offset += 1) {
        if (skipFirstPage && offset === 0) continue;
        if (skipLastPage && offset === count - 1) continue;
        document.switchToPage(start + offset);
        pdfVallnewsWatermark(document);
    }
}

function pdfPageHeader(document, label = 'INFORME EJECUTIVO') {
    const x = document.page.margins.left;
    const y = document.page.margins.top;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const pageNumber = String(document._vallPdfPageNumber || 2).padStart(2, '0');
    // La cabecera conserva orientación de sección y página para que cada
    // hoja pueda circular por separado sin perder el contexto del informe.
    const personalization = document._vallPdfPersonalization || {};
    const owner = personalization.organization || personalization.recipientName || 'VALLNEWS';
    document.fillColor('#6B7280').font('Helvetica-Bold').fontSize(6.4).text(`${owner.toUpperCase()} · HOJA ${pageNumber}`, x, y, { width: contentWidth * .52, characterSpacing: .45, ellipsis: true });
    document.fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(6.7).text(label, x, y, { width: contentWidth, align: 'right', characterSpacing: .45 });
    document.strokeColor(PDF_COLORS.line).lineWidth(.7).moveTo(x, y + 17).lineTo(x + contentWidth, y + 17).stroke();
    pdfResetFlow(document, y + 29);
}

function pdfExecutiveFooter(document, page) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const y = document.page.height - document.page.margins.bottom - 18;
    document.strokeColor('#D1D5DB').lineWidth(.45).moveTo(x, y - 6).lineTo(x + width, y - 6).stroke();
    const personalization = document._vallPdfPersonalization || {};
    const classification = personalization.confidentialityLabel || 'Uso interno';
    const owner = personalization.organization || personalization.recipientName || 'VALLNEWS';
    document.fillColor('#6B7280').font('Helvetica').fontSize(5.55).text(`${classification.toUpperCase()} · ${owner}${document._vallPdfDataOnly ? '' : ' · Documento informativo. Confirme fecha, unidad y fuente primaria.'}`, x, y, { width: width - 54, ellipsis: true });
    document.fillColor('#4B5563').font('Helvetica-Bold').fontSize(5.7).text(`PAGINA ${page}`, x + width - 50, y, { width: 50, align: 'right' });
    pdfResetFlow(document, document.page.margins.top + 29);
}

function pdfExecutiveChapter(document, index, heading, caption = '') {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const y = document.y;
    document.rect(x, y, width, 22).fillAndStroke('#F3F4F6', '#9CA3AF');
    document.rect(x, y, 27, 22).fill('#1F2937');
    document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(String(index).padStart(2, '0'), x, y + 7.5, { width: 27, align: 'center' });
    document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(7.7).text(heading, x + 37, y + 7.5, { characterSpacing: .55, width: width * .58, ellipsis: true });
    if (caption) document.fillColor('#6B7280').font('Helvetica').fontSize(6).text(caption, x + width * .48, y + 7.5, { width: width * .48 - 12, align: 'right', ellipsis: true });
    pdfResetFlow(document, y + 32);
}

function pdfVisualOpening(document, report) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    pdfExecutiveChapter(document, 1, 'GRAFICAS DEL CORTE', 'Evidencia visual para contrastar la lectura');
    document.fillColor('#4B5563').font('Helvetica').fontSize(7.5).text(
        `Lectura visual de ${report.eyebrow || report.title || 'las variables del informe'}. Cada grafica conserva su propia escala; se debe confirmar la unidad y el horario de cada fuente antes de comparar niveles entre series.`,
        x,
        document.y,
        { width, lineGap: 2 }
    );
    pdfResetFlow(document, document.y + 13);
}

function pdfVisualReading(document) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const needed = 78;
    const bottom = document.page.height - document.page.margins.bottom;
    // Sólo ocupa espacio ya disponible en la última página visual. Así no
    // abre una hoja adicional sólo para una nota y conserva el flujo visual.
    if (document.y + needed > bottom) return;
    const y = document.y + 8;
    document.rect(x, y, width, 68).fillAndStroke('#F3F4F6', '#D1D5DB');
    document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(6.1).text('CRITERIO DE LECTURA VISUAL', x + 11, y + 10, { characterSpacing: .42 });
    document.fillColor('#4B5563').font('Helvetica').fontSize(6.75).text('Las gráficas describen observaciones y no sustituyen la fuente primaria. Una trayectoria reciente no confirma causalidad, ni constituye un pronóstico o una recomendación. Confirma la unidad, el horario de corte y el hecho que podría cambiar la señal.', x + 11, y + 22, { width: width - 22, height: 34, lineGap: 1.5, ellipsis: true });
    pdfResetFlow(document, y + 78);
}

function pdfDataOpening(document) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    pdfExecutiveChapter(document, 2, 'PANORAMA Y DATOS', 'Indicadores, comparativos y tablas verificables del corte');
    document.fillColor('#4B5563').font('Helvetica').fontSize(7.5).text(
        'Detalle de las referencias disponibles. Las fechas de observación y las unidades pueden diferir entre fuentes.',
        x,
        document.y,
        { width, lineGap: 2, height: 34, ellipsis: true }
    );
    pdfResetFlow(document, document.y + 14);
}

function pdfAddPage(document, layout = 'portrait', label = 'INFORME EJECUTIVO') {
    const margin = document._vallPdfPageMargin || (layout === 'landscape' ? 42 : 48);
    document._vallPdfPageLabel = document._vallPdfMarketEdition ? label==='INFORME EJECUTIVO' ? 'INFORME DE BOLSA' : /BOLSA/.test(label) ? label : 'BOLSA / '+label : label;
    document.addPage({ size: document._vallPdfPageSize || 'A4', layout, margin });
}

function ensurePdfSpace(document, needed = 70, layout = 'portrait', label = 'INFORME EJECUTIVO') {
    const bottom = document.page.height - document.page.margins.bottom - 30;
    if (document.y + needed > bottom) pdfAddPage(document, layout, label);
    else pdfResetFlow(document);
}

function pdfSection(document, heading, text, {link} = {}) {
    if (!text) return;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const drawHeading = () => {
        document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(11.5)
            .text(heading, document.page.margins.left, document.y, {width, lineGap:2});
        pdfResetFlow(document, document.y + 9);
    };
    ensurePdfSpace(document, 76);
    drawHeading();
    const paragraphs = String(text).replace(/\r/g, '').split(/\n{2,}/).filter(part => part.trim());
    for (const paragraph of paragraphs) {
        let remaining = paragraph.trim();
        while (remaining) {
            document.font('Helvetica').fontSize(10.5);
            const available = document.page.height - document.page.margins.bottom - 30 - document.y;
            const options = {width, lineGap:3,...(link ? {link}: {})};
            if (available < 30) {
                pdfAddPage(document, 'portrait', document._vallPdfPageLabel);
                drawHeading();
                continue;
            }
            let chunk = remaining;
            if (document.heightOfString(chunk, options) > available) {
                let low = 0, high = remaining.length;
                while (low < high) {
                    const middle = Math.ceil((low + high) / 2);
                    if (document.heightOfString(remaining.slice(0, middle), options) <= available) low = middle;
                    else high = middle - 1;
                }
                const boundary = remaining.slice(0, low).search(/\s+\S*$/);
                chunk = remaining.slice(0, boundary > 0 ? boundary : Math.max(1, low));
            }
            document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(10.5)
                .text(chunk, document.page.margins.left, document.y, options);
            remaining = remaining.slice(chunk.length).trimStart();
            pdfResetFlow(document, document.y + 9);
        }
    }
    pdfResetFlow(document, document.y + 8);
}

function pdfMetricGrid(document, metrics, heading = '', continuation = false) {
    if (!metrics?.length) return;
    if (metrics.length > 4) {
        for (let start=0; start<metrics.length; start+=4) pdfMetricGrid(document, metrics.slice(start,start+4),heading,start>0);
        return;
    }
    const items = metrics.slice(0, 4);
    const gap = 10; const columns = 2;
    const width = (document.page.width - document.page.margins.left - document.page.margins.right - gap) / columns;
    const sizes = items.map(metric => {
        const options={width:width-24,lineGap:2};
        const label=document.font('Helvetica-Bold').fontSize(8).heightOfString(metric.label,options);
        const value=document.font('Helvetica-Bold').fontSize(14).heightOfString(metric.value,options);
        const change=metric.change ? document.font('Helvetica').fontSize(8).heightOfString(metric.change,options) : 0;
        return {label,value,change};
    });
    const height = Math.max(72,...sizes.map(size=>size.label+size.value+size.change+30)); const rows = Math.ceil(items.length / columns);
    const needed=rows*height+Math.max(0,rows-1)*gap+15;
    if(needed>document.page.height-document.page.margins.top-document.page.margins.bottom-90) {
        items.forEach(metric=>pdfSection(document,metric.label,[metric.value,metric.change].filter(Boolean).join('\n')));
        return;
    }
    const previousPage=document._vallPdfPageNumber;
    ensurePdfSpace(document,needed+(heading ? 30 : 0),'portrait',heading || 'INDICADORES');
    if(heading && (!continuation || previousPage!==document._vallPdfPageNumber)) pdfUserHeading(document,heading);
    const startY = document.y;
    items.forEach((metric, index) => {
        const column = index % columns; const row = Math.floor(index / columns);
        const x = document.page.margins.left + column * (width + gap); const y = startY + row * (height + gap);
        document.roundedRect(x, y, width, height, 7).fillAndStroke(PDF_COLORS.pale, '#D1D5DB');
        document.rect(x, y, 4, height).fill(index % 2 ? PDF_COLORS.cyan : PDF_COLORS.blue);
        const options={width:width-24,lineGap:2};
        document.fillColor('#4B5563').font('Helvetica-Bold').fontSize(8).text(metric.label, x + 12, y + 10, options);
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(14).text(metric.value, x + 12, y + 15 + sizes[index].label, options);
        if (metric.change) document.fillColor('#6B7280').font('Helvetica').fontSize(8).text(metric.change, x + 12, y + 20 + sizes[index].label + sizes[index].value, options);
    });
    pdfResetFlow(document, startY + rows * height + Math.max(0, rows - 1) * gap + 16);
}

function pdfValue(value) {
    return Number(value).toLocaleString('es-MX', { maximumFractionDigits: Math.abs(Number(value)) >= 100 ? 2 : 4 });
}

function pdfBeforeAfter(document, rows) {
    if (!rows?.length) return;
    const x = document.page.margins.left;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const gap = 10; const columns = 2; const width = (contentWidth - gap) / columns; const height = 82;
    const count = Math.min(rows.length, 4); const rowCount = Math.ceil(count / columns);
    ensurePdfSpace(document, 31 + rowCount * height + Math.max(0, rowCount - 1) * gap + 16);
    document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(10.8).text('ANTES VS. AHORA', x, document.y, { characterSpacing: .28 });
    document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.1).text('Cierre previo verificable frente al corte actual de la misma serie.', x, document.y + 15, { width: contentWidth });
    const startY = document.y + 30;
    rows.slice(0, count).forEach((item, index) => {
        const column = index % columns; const row = Math.floor(index / columns);
        const cardX = x + column * (width + gap); const cardY = startY + row * (height + gap);
        const positive = item.change >= 0;
        const accent = positive ? '#269b79' : '#b04772';
        document.roundedRect(cardX, cardY, width, height, 7).fillAndStroke('#F9FAFB', '#D1D5DB');
        document.rect(cardX, cardY, 4, height).fill(accent);
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(7.4).text(item.label, cardX + 12, cardY + 9, { width: width - 24, ellipsis: true });
        document.fillColor('#6B7280').font('Helvetica-Bold').fontSize(5.9).text('ANTES', cardX + 12, cardY + 29);
        document.fillColor(PDF_COLORS.ink).font('Helvetica-Bold').fontSize(9).text(`${pdfValue(item.previous)}${item.unit ? ` ${item.unit}` : ''}`, cardX + 12, cardY + 38, { width: width * .43, ellipsis: true });
        document.fillColor('#6B7280').font('Helvetica-Bold').fontSize(5.9).text('AHORA', cardX + width * .52, cardY + 29);
        document.fillColor(PDF_COLORS.ink).font('Helvetica-Bold').fontSize(9).text(`${pdfValue(item.current)}${item.unit ? ` ${item.unit}` : ''}`, cardX + width * .52, cardY + 38, { width: width * .35, ellipsis: true });
        document.fillColor(accent).font('Helvetica-Bold').fontSize(7.2).text(`${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%`, cardX + 12, cardY + 62, { width: width - 24, align: 'right' });
    });
    pdfResetFlow(document, startY + rowCount * height + Math.max(0, rowCount - 1) * gap + 16);
}



function pdfDecisionSnapshot(document, report) {
    const brief = report.executiveBrief || {};
    const thesis = brief.thesis || report.summary;
    const question = brief.committeeQuestion || '¿Qué dato verificable debe confirmar el comité antes de decidir?';
    if (!thesis && !question) return;
    ensurePdfSpace(document, 118);
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const y = document.y;
    const split = Math.round(width * .61);
    document.roundedRect(x, y, width, 104, 9).fillAndStroke(PDF_COLORS.midnight, '#4B5563');
    document.rect(x, y, 5, 104).fill(PDF_COLORS.gold);
    document.fillColor('#9CA3AF').font('Helvetica-Bold').fontSize(6.8).text('LECTURA PARA DIRECCIÓN', x + 18, y + 15, { characterSpacing: .8 });
    document.fillColor('#EDEDED').font('Helvetica').fontSize(8.55).text(thesis || 'El corte no contiene una tesis adicional.', x + 18, y + 31, { width: split - 33, height: 53, lineGap: 2, ellipsis: true });
    document.strokeColor('#4B5563').lineWidth(.65).moveTo(x + split, y + 15).lineTo(x + split, y + 88).stroke();
    document.fillColor('#9CA3AF').font('Helvetica-Bold').fontSize(6.3).text('PREGUNTA DE DECISIÓN', x + split + 17, y + 15, { width: width - split - 29, characterSpacing: .65 });
    document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.35).text(question, x + split + 17, y + 31, { width: width - split - 31, height: 55, lineGap: 1.8, ellipsis: true });
    pdfResetFlow(document, y + 122);
}

function pdfReportPassport(document, report) {
    const x = document.page.margins.left;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const personalization = pdfPersonalization(report);
    const items = [
        { label: 'HORA DE CORTE', value: pdfCutLabel(report.generatedAt) },
        { label: 'AUDIENCIA', value: personalization.audience },
        { label: 'HORIZONTE', value: personalization.horizon },
        { label: 'FUENTES', value: `${report.sources?.length || 0} referencias` },
    ];
    ensurePdfSpace(document, 70);
    document.fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(6.55).text('FICHA DE CONTROL DEL CORTE', x, document.y, { characterSpacing: .72 });
    const y = document.y + 14; const gap = 7; const cardWidth = (contentWidth - gap * 3) / 4;
    items.forEach((item, index) => {
        const cardX = x + index * (cardWidth + gap);
        document.roundedRect(cardX, y, cardWidth, 43, 6).fillAndStroke('#F9FAFB', '#D1D5DB');
        document.rect(cardX, y, 3, 43).fill(index === 0 ? PDF_COLORS.gold : index % 2 ? PDF_COLORS.cyan : PDF_COLORS.blue);
        document.fillColor('#6B7280').font('Helvetica-Bold').fontSize(5.35).text(item.label, cardX + 9, y + 8, { width: cardWidth - 16, ellipsis: true });
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(index === 0 ? 6.3 : 7.3).text(item.value, cardX + 9, y + 19, { width: cardWidth - 16, height: 15, ellipsis: true });
    });
    pdfResetFlow(document, y + 56);
}

function pdfDecisionMap(document, report) {
    const brief = report.executiveBrief || {};
    const drivers = brief.mode !== 'deterministic' && brief.drivers?.length ? brief.drivers : report.takeaways || [];
    const risks = brief.mode !== 'deterministic' && brief.risks?.length ? brief.risks : report.watchlist || [];
    const x = document.page.margins.left;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const gap = 11; const width = report.personalization?.sections?.risks === false ? contentWidth : (contentWidth - gap) / 2;
    const pointHeight = (points, availableWidth) => points.reduce((sum, point) => {
        document.font('Helvetica').fontSize(9.2);
        return sum + Math.max(24, document.heightOfString(point, { width: availableWidth - 48, lineGap: 2 }) + 10);
    }, 0);
    const driverHeight = pointHeight(drivers.slice(0, 3), width);
    const riskHeight = pointHeight(risks.slice(0, 3), width);
    // El agente puede entregar tres puntos largos. La altura se adapta al
    // contenido para conservar toda la evidencia en vez de ocultarla con puntos suspensivos.
    const cardHeight = Math.max(116, Math.max(driverHeight, riskHeight) + 41);
    if (cardHeight + 54 > document.page.height - document.page.margins.top - document.page.margins.bottom - 60) {
        pdfSection(document,'CLAVES PARA DIRECCION',drivers.join('\n\n'));
        if (report.personalization?.sections?.risks !== false) pdfSection(document,'RIESGOS A VIGILAR',risks.join('\n\n'));
        return;
    }
    ensurePdfSpace(document, cardHeight + 54, 'portrait', 'MAPA DE DECISIÓN');
    const startY = document.y;
    document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(10.8).text('MAPA DE DECISIÓN', x, startY, { characterSpacing: .34 });
    document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.2).text('Señales que respaldan la lectura y condiciones que requieren contraste antes de escalar una decisión.', x, startY + 15, { width: contentWidth });
    const y = startY + 31;
    const drawPanel = (panelX, heading, points, accent, background, empty) => {
        document.roundedRect(panelX, y, width, cardHeight, 8).fillAndStroke(background, accent);
        document.rect(panelX, y, 4, cardHeight).fill(accent);
        document.fillColor(accent).font('Helvetica-Bold').fontSize(6.7).text(heading, panelX + 14, y + 14, { width: width - 26, characterSpacing: .64 });
        if (!points.length) {
            document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(8).text(empty, panelX + 14, y + 36, { width: width - 28, lineGap: 2 });
            return;
        }
        let cursorY = y + 32;
        points.slice(0, 3).forEach((point, index) => {
            document.font('Helvetica').fontSize(9.2);
            const height = Math.max(24, document.heightOfString(point, { width: width - 48, lineGap: 2 }) + 10);
            if (index) document.strokeColor('#D1D5DB').lineWidth(.45).moveTo(panelX + 14, cursorY - 4).lineTo(panelX + width - 14, cursorY - 4).stroke();
            document.circle(panelX + 21, cursorY + 6, 5.5).fill(accent);
            document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(5.5).text(String(index + 1), panelX + 17.4, cursorY + 3.6, { width: 7, align: 'center' });
            document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(9.2).text(point, panelX + 33, cursorY, { width: width - 48, lineGap: 2 });
            cursorY += height;
        });
    };
    drawPanel(x, 'IMPULSORES A CONFIRMAR', drivers, '#4B5563', '#F3F4F6', 'No se identificaron impulsores adicionales en este corte.');
    if (report.personalization?.sections?.risks !== false) drawPanel(x + width + gap, 'RIESGOS A VIGILAR', risks, '#b04772', '#fff6f8', 'No se identificaron riesgos adicionales en este corte.');
    pdfResetFlow(document, y + cardHeight + 13);
    pdfSection(document,'SEÑALES ADICIONALES',drivers.slice(3).join('\n\n'));
    if (report.personalization?.sections?.risks !== false) pdfSection(document,'RIESGOS ADICIONALES',risks.slice(3).join('\n\n'));
}

function pdfValidationPlan(document, report) {
    const brief = report.executiveBrief || {};
    const checks = (report.metrics || []).slice(0, 3).map(metric => `Confirmar ${metric.label || 'indicador'}: ${metric.value || 'sin valor'}${metric.change ? ` (${metric.change})` : ''}.`);
    const monitoring = (report.watchlist || brief.risks || []).slice(0, 2);
    const items = [
        { label: 'DECISIÓN A PREPARAR', text: brief.committeeQuestion || 'Definir el dato que confirmaría o cambiaría la lectura antes de tomar una decisión.' },
        { label: 'VALIDAR EN LA PRÓXIMA VENTANA', text: checks.length ? checks.join(' ') : 'Contrastar los indicadores del corte contra su fuente primaria y su hora de actualización.' },
        { label: 'SEGUIMIENTO ASIGNABLE', text: monitoring.length ? monitoring.join(' ') : 'Asignar responsable, umbral y fuente de confirmación para el siguiente corte.' },
    ];
    const x = document.page.margins.left;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    ensurePdfSpace(document, 175, 'portrait', 'PLAN DE VALIDACIÓN');
    const startY = document.y;
    document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(10.8).text('PLAN DE VALIDACIÓN', x, startY, { characterSpacing: .3 });
    document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.15).text('Acciones de contraste derivadas de las señales disponibles. No constituye una recomendación de inversión.', x, startY + 15, { width: contentWidth });
    let y = startY + 32;
    items.forEach((item, index) => {
        document.font('Helvetica').fontSize(8.25);
        const height = Math.max(42, document.heightOfString(item.text, { width: contentWidth - 56, lineGap: 1.75 }) + 29);
        if (y + height > document.page.height - document.page.margins.bottom) {
            pdfAddPage(document, 'portrait', 'PLAN DE VALIDACIÓN'); y = document.y;
        }
        document.roundedRect(x, y, contentWidth, height, 7).fillAndStroke(index === 0 ? '#F3F4F6' : '#F9FAFB', '#D1D5DB');
        document.roundedRect(x + 12, y + 11, 22, 22, 11).fill(index === 0 ? PDF_COLORS.gold : PDF_COLORS.blue);
        document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(String(index + 1), x + 12, y + 17, { width: 22, align: 'center' });
        document.fillColor('#4B5563').font('Helvetica-Bold').fontSize(5.95).text(item.label, x + 45, y + 9, { width: contentWidth - 58, characterSpacing: .46 });
        document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(8.25).text(item.text, x + 45, y + 19, { width: contentWidth - 58, height: height - 22, lineGap: 1.75, ellipsis: true });
        y += height + 6;
    });
    pdfResetFlow(document, y + 3);
}

function pdfExecutiveCover(document, title, report) {
    const personalization = pdfPersonalization(report);
    pdfPageHeader(document, isEquityLayout(report) ? 'INFORME DE BOLSA' : report.collection === 'mexico' ? 'INFORME DE MEXICO' : 'INFORME EJECUTIVO');
    pdfExecutiveFooter(document, 1);
    const x = document.page.margins.left;
    const width = document.page.width - x - document.page.margins.right;
    document.fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(8)
        .text('VALLNEWS / INTELIGENCIA ECONOMICA', x, document.y, {width, characterSpacing:.8});
    pdfResetFlow(document, document.y + 10);
    document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(24)
        .text(report.title || title, x, document.y, {width, lineGap:3});
    pdfResetFlow(document, document.y + 10);
    const metadata = [report.eyebrow, 'Corte: ' + pdfCutLabel(report.generatedAt),
        [personalization.audience,personalization.horizon,({standard:'Estándar',brief:'Breve y accionable',detailed:'Detallado con evidencia'})[personalization.depth]].filter(Boolean).join(' / '),
        [personalization.recipientName, personalization.organization].filter(Boolean).join(' / '),
        report.baseReport?.title ? `Base: ${report.baseReport.title}` : ''].filter(Boolean);
    document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9)
        .text(metadata.join('\n'), x, document.y, {width, lineGap:3});
    pdfResetFlow(document, document.y + 14);
    document.strokeColor(PDF_COLORS.line).moveTo(x, document.y).lineTo(x + width, document.y).stroke();
    pdfResetFlow(document, document.y + 14);
    pdfSection(document, 'RESUMEN EJECUTIVO', report.summary);
    pdfSection(document, 'OBJETIVO DE LA LECTURA', report.objective);
    const brief = report.executiveBrief;
    if (brief?.mode === 'ai') {
        const editorial = [brief.context, brief.thesis].filter(value => value && value !== report.summary && value !== report.objective);
        pdfSection(document, 'LECTURA EDITORIAL', [...new Set(editorial)].join('\n\n'));
    }
}

function pdfTableHeading(document, table) {
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(12.2).text(table.title, x, document.y);
    if (table.note) {
        document.moveDown(.18).fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.6).text(table.note, x, document.y, { width: contentWidth, lineGap: 2 });
    }
    pdfResetFlow(document, document.y + 9);
}

function pdfCompactTable(document, table) {
    ensurePdfSpace(document, 115, 'portrait', 'DATOS DEL CORTE');
    pdfTableHeading(document, table);
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const cols = table.columns.slice(0, 6);
    const widths = cols.map((_, index) => cols.length === 1 ? contentWidth : index === 0 ? contentWidth * .25 : (contentWidth * .75) / (cols.length - 1));
    const rowHeight = (cells, header = false) => {
        document.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 7.1 : 7.45);
        return Math.max(header ? 21 : 23, ...cols.map((_, index) => document.heightOfString(String(cells[index] || ''), { width: widths[index] - 10, lineGap: 1.5 }) + 9));
    };
    const drawRow = (cells, header = false) => {
        const height = rowHeight(cells, header); const y = document.y; let cursor = x;
        cols.forEach((_, index) => { document.rect(cursor, y, widths[index], height).fillAndStroke(header ? '#E5E7EB' : '#F9FAFB', '#D1D5DB'); cursor += widths[index]; });
        cursor = x;
        cols.forEach((_, index) => {
            document.fillColor(header ? '#1F2937' : PDF_COLORS.ink).font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 7.1 : 7.45)
                .text(String(cells[index] || ''), cursor + 5, y + 5, { width: widths[index] - 10, lineGap: 1.5, ellipsis: true });
            cursor += widths[index];
        });
        pdfResetFlow(document, y + height);
    };
    const drawHeader = () => drawRow(cols, true);
    drawHeader();
    table.rows.forEach(row => {
        const height = rowHeight(row);
        if (document.y + height > document.page.height - document.page.margins.bottom - 30) {
            pdfAddPage(document, 'portrait', 'DATOS DEL CORTE');
            drawHeader();
        }
        drawRow(row);
    });
    pdfResetFlow(document, document.y + 9);
}

function pdfDataCards(document, table) {
    ensurePdfSpace(document, 115, 'portrait', 'DATOS DEL CORTE');
    pdfTableHeading(document, table);
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const columns = table.columns.slice(0, 6); const dataColumns = columns.slice(1); const cardGap = 8; const dataGap = 7; const dataWidth = (contentWidth - dataGap * 2) / 3;
    table.rows.forEach((row, rowIndex) => {
        const fields = dataColumns.map((column, index) => ({ label: column, value: String(row[index + 1] || '') }));
        const fieldRows = Math.ceil(fields.length / 3);
        const labelHeight = document.font('Helvetica-Bold').fontSize(6.25).heightOfString(String(row[0] || ''), { width: contentWidth - 26, lineGap: 1 });
        const gridHeights = Array.from({ length: fieldRows }, (_, rowIndex) => Math.max(...fields.slice(rowIndex * 3, rowIndex * 3 + 3).map(field => {
            document.font('Helvetica').fontSize(7.1);
            return document.heightOfString(`${field.label}\n${field.value}`, { width: dataWidth - 10, lineGap: 1.4 }) + 4;
        })));
        const height = Math.max(48, 19 + labelHeight + gridHeights.reduce((sum, value) => sum + value, 0) + 10);
        if (document.y + height > document.page.height - document.page.margins.bottom - 30) {
            pdfAddPage(document, 'portrait', 'DATOS DEL CORTE');
        }
        const y = document.y;
        document.roundedRect(x, y, contentWidth, height, 6).fillAndStroke(rowIndex % 2 ? '#F9FAFB' : '#F3F4F6', '#D1D5DB');
        document.rect(x, y, 4, height).fill(rowIndex % 2 ? PDF_COLORS.cyan : PDF_COLORS.blue);
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(7.1).text(String(row[0] || ''), x + 12, y + 8, { width: contentWidth - 24, lineGap: 1, ellipsis: true });
        let fieldY = y + 11 + labelHeight;
        fields.forEach((field, index) => {
            const fieldColumn = index % 3; const fieldRow = Math.floor(index / 3);
            const previousRowsHeight = gridHeights.slice(0, fieldRow).reduce((sum, value) => sum + value, 0);
            const fieldX = x + 12 + fieldColumn * (dataWidth + dataGap);
            const rowY = fieldY + previousRowsHeight;
            document.fillColor('#6B7280').font('Helvetica-Bold').fontSize(5.7).text(field.label, fieldX, rowY, { width: dataWidth - 10, ellipsis: true });
            document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(7.1).text(field.value, fieldX, rowY + 8, { width: dataWidth - 10, lineGap: 1.4, ellipsis: true });
        });
        pdfResetFlow(document, y + height + cardGap);
    });
    pdfResetFlow(document, document.y + 2);
}

function pdfTable(document, table) {
    if (table.columns.length > 6) {
        for (let start=1; start<table.columns.length; start+=5) pdfCompactTable(document, {
            ...table, columns:[table.columns[0], ...table.columns.slice(start,start+5)],
            rows:table.rows.map(row=>[row[0], ...row.slice(start,start+5)]),
        });
        return;
    }
    // Una tabla ancha pero breve sigue siendo más eficiente como tabla: seis
    // columnas y hasta cuatro filas caben con legibilidad en A4. Las fichas se
    // reservan para matrices extensas, donde sí evitan una página horizontal.
    const isBriefWideTable = (table.columns || []).length <= 6 && (table.rows || []).length <= 4;
    if (isBriefWideTable) pdfCompactTable(document, table);
    else pdfDataCards(document, table);
}

function pdfLineChart(document, visual, pageLabel = 'SEÑALES DEL MERCADO', options = {}) {
    const {datedPoints}=require('../lib/report-observations');
    const series = (visual.series || []).map(item=>({...item,points:datedPoints(item.points)})).filter(item=>item.points.length>1).map(item=>{
        const first=item.points[0],last=item.points.at(-1),delta=last.value-first.value;
        const change=visual.unit==='%' ? delta : first.value>0 ? delta/first.value*100 : null;
        const format=value=>value.toLocaleString('es-MX',{maximumFractionDigits:options.compactLegend && (value===0 || Math.abs(value)>=.01) ? 2 : 8});
        const date=new Date(last.timestamp).toLocaleDateString('es-MX',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'});
        const movement=change===null ? 'No calculable' : `${change>0 ? '+' : ''}${format(change)} ${visual.unit==='%' ? 'p. p.' : '%'}`;
        return {...item,legend:options.compactLegend ? `${item.label} · ${format(last.value)} ${visual.unit || ''}\n${date} · Cambio: ${movement}` : `${item.label}\nÚltimo dato: ${format(last.value)} ${visual.unit || ''} · ${date}\nCambio del tramo: ${movement}`};
    });
    if (!series.length) return;
    const requestedHeight = Number(options.chartHeight);
    const chartHeight = Number.isFinite(requestedHeight) ? Math.max(108, Math.min(250, requestedHeight)) : 160;
    const x = document.page.margins.left;
    const contentWidth=document.page.width-document.page.margins.left-document.page.margins.right;
    const legendColumns=series.length>1 ? 2 : 1,legendWidth=contentWidth/legendColumns;
    const legendRows=Array.from({length:Math.ceil(series.length/legendColumns)},(_,row)=>Math.max(...series.slice(row*legendColumns,(row+1)*legendColumns).map(item=>document.font('Helvetica').fontSize(7.3).heightOfString(item.legend,{width:legendWidth-22})+8)));
    const caption=`${visual.unit || ''}${visual.note ? ` · ${visual.note}` : ''}`;
    const headingHeight=document.font('Helvetica-Bold').fontSize(14).heightOfString(visual.title,{width:contentWidth});
    const captionHeight=document.font('Helvetica').fontSize(7.7).heightOfString(caption,{width:contentWidth});
    ensurePdfSpace(document,chartHeight+headingHeight+captionHeight+legendRows.reduce((sum,height)=>sum+height,0)+58,'portrait',pageLabel);
    document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(14).text(visual.title, x, document.y);
    document.moveDown(.2).fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.7).text(caption, x, document.y,{width:contentWidth});
    pdfResetFlow(document, document.y + 14);
    const x0 = x + 39; const y0 = document.y; const chartWidth = document.page.width - document.page.margins.left - document.page.margins.right - 47;
    const values = series.flatMap(item => item.points.map(point => point.value)); const rawMin = Math.min(...values); const rawMax = Math.max(...values); const gap = (rawMax - rawMin) || Math.max(Math.abs(rawMax) * .04, 1); const min = rawMin - gap * .12; const max = rawMax + gap * .12;
    const axisDigits=Math.min(8,Math.max(2,Math.ceil(-Math.log10((max-min)/2))+1));
    [0, .5, 1].forEach(position => {
        const y = y0 + chartHeight * position; const value = max - ((max - min) * position);
        document.strokeColor(PDF_COLORS.grid).lineWidth(.55).moveTo(x0, y).lineTo(x0 + chartWidth, y).stroke();
        document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(6.7).text(value.toLocaleString('es-MX', { maximumFractionDigits: axisDigits }), x, y - 3, { width: 31, align: 'right' });
    });
    const colors = options.colors || ['#111827', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB'];
    const dates=[...new Set(series.flatMap(item=>item.points.map(point=>point.timestamp)))].sort((a,b)=>a-b);
    const firstDate=dates[0],span=dates.at(-1)-firstDate;
    const coordinate=date=>x0+(span ? (date-firstDate)/span : .5)*chartWidth;
    series.forEach((item, seriesIndex) => {
        const points = item.points; document.strokeColor(colors[seriesIndex % colors.length]).lineWidth(1.7);
        points.forEach((point, index) => {
            const pointX = coordinate(point.timestamp);
            const pointY = y0 + chartHeight - ((point.value - min) / (max - min)) * chartHeight;
            if (index === 0) document.moveTo(pointX, pointY); else document.lineTo(pointX, pointY);
        });
        document.stroke();
        const last=points.at(-1);
        document.circle(coordinate(last.timestamp),y0+chartHeight-((last.value-min)/(max-min))*chartHeight,2.6).fill(colors[seriesIndex%colors.length]);
    });
    [...new Set([0,Math.round((dates.length-1)/2),dates.length-1])].forEach(index=>{
        const label=new Date(dates[index]).toLocaleDateString('es-MX',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'});
        const position=index===0 ? x0 : index===dates.length-1 ? x0+chartWidth-64 : coordinate(dates[index])-32;
        document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(6.7).text(label,position,y0+chartHeight+8,{width:64,align:index===0 ? 'left' : index===dates.length-1 ? 'right' : 'center'});
    });
    let legendY=y0+chartHeight+25;
    legendRows.forEach((height,row)=>{
        series.slice(row*legendColumns,(row+1)*legendColumns).forEach((item,column)=>{
            const index=row*legendColumns+column,legendX=x+column*legendWidth;
            document.rect(legendX,legendY+3,10,3).fill(colors[index%colors.length]);
            document.fillColor('#4B5563').font('Helvetica').fontSize(7.3).text(item.legend,legendX+16,legendY,{width:legendWidth-22});
        });
        legendY+=height;
    });
    pdfResetFlow(document,legendY+12);
}

function pdfBarChart(document, visual, pageLabel = 'SEÑALES DEL MERCADO') {
    const bars = visual.bars || []; if (!bars.length) return;
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const caption=continuation=>{
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(14).text(visual.title+(continuation ? ' · continuación' : ''), x, document.y,{width:contentWidth});
        if(visual.unit) document.moveDown(.2).fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(8).text('Unidad: '+visual.unit,x,document.y,{width:contentWidth});
        if (!continuation && visual.note) document.moveDown(.2).fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.7).text(visual.note, x, document.y, { width: contentWidth });
        pdfResetFlow(document, document.y + 15);
    };
    ensurePdfSpace(document, 185, 'portrait', pageLabel);caption(false);
    const values=bars.map(bar=>Number(bar.value).toLocaleString('es-MX',{maximumFractionDigits:4}));
    document.font('Helvetica-Bold').fontSize(8.3);
    const max = Math.max(...bars.map(bar => Math.abs(bar.value)),0) || 1,signed=bars.some(bar=>bar.value<0);
    const labelWidth=112,valueWidth=Math.min(120,Math.max(46,...values.map(value=>document.widthOfString(value)+10))),barX=x+labelWidth+12,barWidth=contentWidth-labelWidth-valueWidth-22;
    bars.forEach((bar, index) => {
        const rowHeight=Math.max(22,document.font('Helvetica').fontSize(8.3).heightOfString(bar.label,{width:labelWidth})+8);
        const previousPage=document._vallPdfPageNumber;
        ensurePdfSpace(document,rowHeight+8,'portrait',pageLabel);
        if(previousPage!==document._vallPdfPageNumber) caption(true);
        const rowY = document.y;
        document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(8.3).text(bar.label, x, rowY + 2, { width: labelWidth, ellipsis: true });
        document.roundedRect(barX, rowY + 4, barWidth, 9, 4).fill('#E5E7EB');
        const zero=barX+(signed ? barWidth/2 : 0),extent=barWidth*(signed ? .5 : 1)*Math.abs(bar.value)/max;
        if(bar.value!==0) document.rect(bar.value<0 ? zero-extent : zero,rowY+4,extent,9).fill(['#111827', '#4B5563', '#6B7280', '#9CA3AF'][index % 4]);
        if(signed) document.strokeColor('#6B7280').lineWidth(.7).moveTo(zero,rowY+2).lineTo(zero,rowY+15).stroke();
        document.fillColor(PDF_COLORS.ink).font('Helvetica-Bold').fontSize(8.3).text(values[index], barX + barWidth + 6, rowY + 2, { width: valueWidth - 2, align: 'right' });
        pdfResetFlow(document, rowY + rowHeight);
    });
    document.moveDown(.25);
}

function equityNumber(value, digits = 2) {
    const number = finiteQuote(value);
    return Number.isFinite(number) ? number.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : 'Sin dato';
}

function equityPercent(value) {
    const number = finiteQuote(value);
    return Number.isFinite(number) ? `${number >= 0 ? '+' : ''}${number.toFixed(2)}%` : 'Sin dato';
}

function equityShortDate(value) {
    const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function equityNextSessions(value, count) {
    const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return [];
    const dates = [];
    while (dates.length < count) {
        date.setUTCDate(date.getUTCDate() + 1);
        const day = date.getUTCDay();
        if (day === 0 || day === 6) continue;
        dates.push(date.toISOString().slice(0, 10));
    }
    return dates;
}

// Escenario técnico de corto plazo: ajusta una recta OLS contra los últimos
// cierres diarios disponibles. No pretende anticipar noticias, liquidez ni
// cambios de régimen; por eso el PDF muestra también el rango residual.
function equityLinearScenario(points, horizon = 5) {
    const sample = (points || []).slice(-30).filter(point => Number.isFinite(Number(point?.value)));
    if (sample.length < 12) return null;
    const n = sample.length;
    const xMean = (n - 1) / 2;
    const yMean = sample.reduce((total, point) => total + Number(point.value), 0) / n;
    const denominator = sample.reduce((total, _, index) => total + (index - xMean) ** 2, 0);
    if (!denominator) return null;
    const slope = sample.reduce((total, point, index) => total + (index - xMean) * (Number(point.value) - yMean), 0) / denominator;
    const intercept = yMean - slope * xMean;
    const residualSum = sample.reduce((total, point, index) => total + (Number(point.value) - (intercept + slope * index)) ** 2, 0);
    const residual = Math.sqrt(residualSum / Math.max(n - 2, 1));
    const fallbackSpread = Math.max(Math.abs(Number(sample.at(-1)?.value || 0)) * .002, .01);
    const dates = equityNextSessions(sample.at(-1)?.date, horizon);
    const projected = dates.map((date, index) => {
        const x = n + index;
        const value = Math.max(.0001, intercept + slope * x);
        // Intervalo orientativo del 80% del ajuste lineal, no una banda de
        // volatilidad implícita ni una garantía de cotización.
        const error = 1.282 * Math.max(residual, fallbackSpread) * Math.sqrt(1 + (1 / n) + ((x - xMean) ** 2 / denominator));
        return { date, value, lower: Math.max(.0001, value - error), upper: value + error };
    });
    return { points: projected, slope, residual: Math.max(residual, fallbackSpread), sampleSize: n };
}

function pdfEquityPageHeader(document, label, title, generatedAt, report) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const theme = pdfTheme(report);
    const personalization = pdfPersonalization(report);
    document.rect(0, 0, document.page.width, 13).fill(theme.accent);
    document.rect(x, 27, width, 50).fillAndStroke('#F3F4F6', '#4B5563');
    document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(7.3).text('VALLNEWS · INTELIGENCIA ECONÓMICA', x + 12, 37, { characterSpacing: .8 });
    document.fillColor('#111827').font('Helvetica-Bold').fontSize(14.2).text(title || 'INFORME DE BOLSA', x + 12, 49, { width: width - 170, ellipsis: true });
    document.fillColor('#4B5563').font('Helvetica-Bold').fontSize(6.15).text(label, x + width - 153, 38, { width: 141, align: 'right', characterSpacing: .48 });
    document.fillColor('#6B7280').font('Helvetica').fontSize(5.8).text(`Corte: ${pdfCutLabel(generatedAt)}`, x + width - 153, 52, { width: 141, align: 'right' });
    const owner = [personalization.recipientName, personalization.organization].filter(Boolean).join(' · ') || personalization.audience;
    document.fillColor('#6B7280').font('Helvetica').fontSize(5.2).text(`${personalization.confidentialityLabel.toUpperCase()} · ${owner} · ${personalization.horizon}`, x + 12, 65, { width: width - 177, ellipsis: true });
    return 91;
}

function pdfEquitySectionBar(document, y, index, heading, caption) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    document.rect(x, y, width, 20).fillAndStroke('#F3F4F6', '#9CA3AF');
    document.rect(x, y, 24, 20).fill('#1F2937');
    document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.8).text(String(index).padStart(2, '0'), x, y + 7, { width: 24, align: 'center' });
    document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(7.4).text(heading, x + 33, y + 7, { characterSpacing: .62 });
    document.fillColor('#6B7280').font('Helvetica').fontSize(5.9).text(caption, x + 210, y + 7, { width: width - 220, align: 'right', ellipsis: true });
}

const EQUITY_REGION_ORDER = ['América', 'Europa', 'Asia'];

function equityRegion(item) {
    return EQUITY_REGION_ORDER.includes(item?.region) ? item.region : 'Global';
}

function equityRegionalGroups(series) {
    const groups = new Map();
    series.forEach(item => {
        const region = equityRegion(item);
        if (!groups.has(region)) groups.set(region, []);
        groups.get(region).push(item);
    });
    return [...groups.entries()]
        .map(([region, items]) => ({ region, items }))
        .sort((left, right) => (EQUITY_REGION_ORDER.indexOf(left.region) + 1 || 99) - (EQUITY_REGION_ORDER.indexOf(right.region) + 1 || 99));
}

function equityChartSelection(series) {
    const preferred = ['S&P 500', 'S&P/BMV IPC', 'Euro Stoxx 50', 'DAX 40', 'Nikkei 225', 'Hang Seng'];
    const byLabel = new Map(series.map(item => [item.label, item]));
    const selected = preferred.map(label => byLabel.get(label)).filter(Boolean);
    series.forEach(item => { if (!selected.includes(item) && selected.length < 6) selected.push(item); });
    return selected.slice(0, 6);
}

function pdfEquityKpiStrip(document, y, series) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const groups = equityRegionalGroups(series);
    if (!groups.length) return 0;
    const gap = 6; const cardWidth = (width - gap * (groups.length - 1)) / groups.length; const height = 58;
    groups.forEach((group, index) => {
        const cardX = x + index * (cardWidth + gap);
        const leader = group.items.filter(item=>Number.isFinite(item.performance?.day)).sort((left,right)=>right.performance.day-left.performance.day)[0];
        const color = !leader || leader.performance.day===0 ? '#51657d' : leader.performance.day>0 ? '#187256' : '#a83f50';
        document.rect(cardX, y, cardWidth, height).fillAndStroke('#F9FAFB', '#D1D5DB');
        document.rect(cardX, y, 3, height).fill(color);
        document.fillColor('#4B5563').font('Helvetica-Bold').fontSize(5.45).text(`${group.region.toUpperCase()} · ${group.items.length} REFERENCIAS`, cardX + 9, y + 8, { width: cardWidth - 16, ellipsis: true });
        document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(7.2).text(leader?.label || 'Sin referencia', cardX + 9, y + 22, { width: cardWidth - 16, ellipsis: true });
        document.fillColor(color).font('Helvetica-Bold').fontSize(7.5).text(leader ? `${equityPercent(leader.performance.day)} en su ultima sesion` : 'Sin variacion comparable', cardX + 9, y + 37, { width: cardWidth - 16, ellipsis: true });
        document.fillColor('#6B7280').font('Helvetica').fontSize(4.9).text(leader ? `Cierre: ${leader.points.at(-1)?.date || 'Sin fecha'}` : 'Sin lider verificable', cardX + 9, y + 49, { width: cardWidth - 16, ellipsis: true });
    });
    return height;
}

function pdfEquityMiniChart(document, item, projection, x, y, width, height, title) {
    const historical = (item?.points || []).slice(projection ? -22 : -60);
    if (historical.length < 2) return;
    const forecast = projection?.points || [];
    const values = [
        ...historical.map(point => Number(point.value)),
        ...forecast.flatMap(point => [Number(point.value), Number(point.lower), Number(point.upper)]),
    ].filter(Number.isFinite);
    if (!values.length) return;
    const rawMin = Math.min(...values); const rawMax = Math.max(...values);
    const spread = (rawMax - rawMin) || Math.max(Math.abs(rawMax) * .04, 1);
    const min = rawMin - spread * .1; const max = rawMax + spread * .1;
    const cardTitle = title || item.label;
    document.rect(x, y, width, height).fillAndStroke('#ffffff', '#9CA3AF');
    document.rect(x, y, width, 21).fill('#F3F4F6');
    document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(6.3).text(cardTitle, x + 8, y + 7, { width: width - 75, ellipsis: true });
    document.fillColor('#4B5563').font('Helvetica').fontSize(5.4).text(`Cierre ${equityNumber(item.value)}`, x + width - 67, y + 7, { width: 59, align: 'right', ellipsis: true });
    const plotX = x + 34; const plotY = y + 33; const plotWidth = width - 43; const plotHeight = height - 57;
    [0, .5, 1].forEach(position => {
        const lineY = plotY + position * plotHeight; const value = max - position * (max - min);
        document.strokeColor('#E5E7EB').lineWidth(.45).moveTo(plotX, lineY).lineTo(plotX + plotWidth, lineY).stroke();
        document.fillColor('#6B7280').font('Helvetica').fontSize(4.8).text(equityNumber(value, 0), x + 2, lineY - 2, { width: 28, align: 'right' });
    });
    const total = historical.length + forecast.length;
    const pointX = index => plotX + (index / Math.max(total - 1, 1)) * plotWidth;
    const pointY = value => plotY + plotHeight - ((value - min) / (max - min)) * plotHeight;
    document.strokeColor('#111827').lineWidth(1.2);
    historical.forEach((point, index) => {
        const px = pointX(index); const py = pointY(Number(point.value));
        if (!index) document.moveTo(px, py); else document.lineTo(px, py);
    });
    document.stroke();
    if (forecast.length) {
        const firstIndex = historical.length - 1;
        document.strokeColor('#9CA3AF').lineWidth(.6).dash(2, { space: 2 });
        forecast.forEach((point, index) => {
            const px = pointX(firstIndex + index + 1);
            if (!index) document.moveTo(pointX(firstIndex), pointY(Number(historical.at(-1).value)));
            document.lineTo(px, pointY(Number(point.upper)));
        });
        document.stroke();
        document.strokeColor('#9CA3AF').lineWidth(.6).dash(2, { space: 2 });
        forecast.forEach((point, index) => {
            const px = pointX(firstIndex + index + 1);
            if (!index) document.moveTo(pointX(firstIndex), pointY(Number(historical.at(-1).value)));
            document.lineTo(px, pointY(Number(point.lower)));
        });
        document.stroke();
        document.strokeColor('#4B5563').lineWidth(1.35).undash();
        forecast.forEach((point, index) => {
            const px = pointX(firstIndex + index + 1); const py = pointY(Number(point.value));
            if (!index) document.moveTo(pointX(firstIndex), pointY(Number(historical.at(-1).value)));
            document.lineTo(px, py);
        });
        document.stroke();
    }
    document.undash();
    const firstDate = historical[0]?.date; const lastDate = forecast.at(-1)?.date || historical.at(-1)?.date;
    document.fillColor('#6B7280').font('Helvetica').fontSize(4.8).text(equityShortDate(firstDate), plotX, y + height - 13, { width: 42 });
    document.fillColor('#6B7280').font('Helvetica').fontSize(4.8).text(equityShortDate(lastDate), x + width - 50, y + height - 13, { width: 42, align: 'right' });
    if (forecast.length) document.fillColor('#4B5563').font('Helvetica-Bold').fontSize(4.7).text('Negro: cierre real · grafito: escenario OLS · gris: rango 80%', x + 8, y + height - 13, { width: width - 60, align: 'center' });
}

function pdfEquityPerformanceTable(document, y, series) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const columns = ['REGION', 'MERCADO', 'BOLSA', 'CIERRE', 'DIA', '5 SES.', '1 MES', 'YTD'];
    const ratios = [.095, .115, .205, .16, .10, .11, .11, .105];
    const heights = { header: 20, row: 18 };
    document.rect(x, y, width, heights.header).fill('#1F2937');
    let cursor = x;
    columns.forEach((column, index) => {
        const cellWidth = width * ratios[index];
        document.fillColor('#effafb').font('Helvetica-Bold').fontSize(5.3).text(column, cursor + 5, y + 7, { width: cellWidth - 8, align: index ? 'right' : 'left', ellipsis: true });
        cursor += cellWidth;
    });
    series.forEach((item, rowIndex) => {
        const rowY = y + heights.header + rowIndex * heights.row;
        document.rect(x, rowY, width, heights.row).fillAndStroke(rowIndex % 2 ? '#F3F4F6' : '#ffffff', '#D1D5DB');
        const values = [equityRegion(item), item.market || 'Mercado', item.label, equityNumber(item.value), equityPercent(item.performance?.day), equityPercent(item.performance?.week), equityPercent(item.performance?.month), equityPercent(item.performance?.ytd)];
        cursor = x;
        values.forEach((value, index) => {
            const cellWidth = width * ratios[index];
            const negative = index > 3 && String(value).startsWith('-');
            document.fillColor(index < 3 ? '#1F2937' : negative ? '#a94351' : index > 3 ? '#18745a' : '#4B5563')
                .font(index === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(index < 3 ? 4.9 : 5.25).text(value, cursor + 4, rowY + 6, { width: cellWidth - 7, align: index > 2 ? 'right' : 'left', ellipsis: true });
            cursor += cellWidth;
        });
    });
    return heights.header + series.length * heights.row;
}

function pdfEquityScenarioTable(document, y, series) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const columns = ['REGION', 'BOLSA', 'ULTIMO CIERRE', 'ESCENARIO 5 SES.', 'RANGO 80%', 'PENDIENTE / SES.'];
    const ratios = [.12, .22, .17, .18, .18, .13]; const headerHeight = 20; const rowHeight = 18;
    document.rect(x, y, width, headerHeight).fill('#1F2937');
    let cursor = x;
    columns.forEach((column, index) => {
        const cellWidth = width * ratios[index];
        document.fillColor('#effafb').font('Helvetica-Bold').fontSize(5.1).text(column, cursor + 5, y + 7, { width: cellWidth - 8, align: index ? 'right' : 'left', ellipsis: true });
        cursor += cellWidth;
    });
    series.forEach((item, index) => {
        const scenario = equityLinearScenario(item.points); const last = scenario?.points?.at(-1);
        const rowY = y + headerHeight + index * rowHeight;
        document.rect(x, rowY, width, rowHeight).fillAndStroke(index % 2 ? '#F3F4F6' : '#ffffff', '#D1D5DB');
        const values = [
            equityRegion(item),
            item.label,
            equityNumber(item.value),
            last ? equityNumber(last.value) : 'Sin escenario',
            last ? `${equityNumber(last.lower)} - ${equityNumber(last.upper)}` : 'Sin serie diaria',
            scenario ? equityNumber(scenario.slope, 3) : 'Sin dato',
        ];
        cursor = x;
        values.forEach((value, valueIndex) => {
            const cellWidth = width * ratios[valueIndex];
            document.fillColor(valueIndex < 2 ? '#1F2937' : valueIndex === 5 && scenario?.slope < 0 ? '#a94351' : '#4B5563')
                .font(valueIndex === 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(valueIndex < 2 ? 5 : 5.25).text(value, cursor + 4, rowY + 6, { width: cellWidth - 7, align: valueIndex > 1 ? 'right' : 'left', ellipsis: true });
            cursor += cellWidth;
        });
    });
    return headerHeight + series.length * rowHeight;
}

function pdfEquityConclusions(document, y, report) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const gap = 7; const columnWidth = (width - gap * 2) / 3; const height = 121;
    const brief = report.executiveBrief || {};
    const blocks = [
        { heading: 'SEÑALES VISIBLES', accent: '#4B5563', text: (report.takeaways || []).slice(0, 2).map((item, index) => `${index + 1}. ${item}`).join('\n') || 'Sin señales adicionales en este corte.' },
        { heading: 'RIESGOS A MONITOREAR', accent: '#b05a62', text: (report.watchlist || []).slice(0, 2).map((item, index) => `${index + 1}. ${item}`).join('\n') || 'Sin riesgos adicionales declarados.' },
        { heading: 'PREGUNTA PARA COMITE', accent: '#4B5563', text: brief.committeeQuestion || report.objective || 'Definir el dato que confirmaría o cambiaría la lectura antes de decidir.' },
    ];
    blocks.forEach((block, index) => {
        const blockX = x + index * (columnWidth + gap);
        document.rect(blockX, y, columnWidth, height).fillAndStroke(index === 1 ? '#fff8f8' : '#F9FAFB', '#D1D5DB');
        document.rect(blockX, y, 3, height).fill(block.accent);
        document.fillColor(block.accent).font('Helvetica-Bold').fontSize(5.5).text(block.heading, blockX + 10, y + 10, { width: columnWidth - 17, characterSpacing: .3, ellipsis: true });
        document.fillColor('#4B5563').font('Helvetica').fontSize(6.25).text(block.text, blockX + 10, y + 24, { width: columnWidth - 18, height: 86, lineGap: 1.5, ellipsis: true });
    });
    return height;
}

function pdfEquityFooter(document, page, report) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    // Mantener el pie dentro del área imprimible evita que PDFKit abra una
    // página adicional sólo para la última línea de texto.
    const y = document.page.height - document.page.margins.bottom - 20;
    document.strokeColor('#9CA3AF').lineWidth(.45).moveTo(x, y - 6).lineTo(x + width, y - 6).stroke();
    const personalization = pdfPersonalization(report);
    const owner = personalization.organization || personalization.recipientName || 'VALLNEWS';
    document.fillColor('#6B7280').font('Helvetica').fontSize(5.35).text(`${personalization.confidentialityLabel.toUpperCase()} · ${owner} · Documento informativo; verifique fecha, unidad y fuente primaria.`, x, y, { width: width - 55, ellipsis: true });
    document.fillColor('#4B5563').font('Helvetica-Bold').fontSize(5.4).text(`PÁGINA ${page}`, x + width - 48, y, { width: 48, align: 'right' });
}

function makeEquityWeeklyPdf(title, report) {
    return new Promise((resolve, reject) => {
        const document = new PDFDocument({ size: 'LEGAL', margin: 34, bufferPages: true, info: { Title: title, Author: 'VALLNEWS', Subject: 'Informe global de bolsa con cierres y escenario técnico', Keywords: 'VALLNEWS, bolsas globales, cierres, histórico, escenario OLS' } });
        const chunks = [];
        document.on('data', chunk => chunks.push(chunk)); document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks)));
        const allSeries = (report.equitySeries || []).filter(item => item.points?.length > 10);
        const marketSeries = allSeries.filter(item => !/\bvix\b/i.test(item.label));
        const charts = equityChartSelection(marketSeries);
        const x = document.page.margins.left;
        const width = document.page.width - document.page.margins.left - document.page.margins.right;
        const cardGap = 8; const cardWidth = (width - cardGap) / 2; const chartHeight = 127;

        // Primero se entrega toda la lectura visual. Las tablas y conclusiones
        // comienzan después, para que un lector pueda recorrer las gráficas sin
        // interrumpir el flujo con cifras tabulares.
        let y = pdfEquityPageHeader(document, 'INFORME SEMANAL - BOLSAS GLOBALES', report.personalization?.customTitle || 'HISTORICOS POR REGION', report.generatedAt, report);
        pdfEquitySectionBar(document, y, 1, 'HISTORICOS DE CIERRE', 'Referencias seleccionadas de América, Europa y Asia'); y += 28;
        document.fillColor('#4B5563').font('Helvetica').fontSize(6.75).text('Cada gráfica conserva cierres diarios reales. Se seleccionan dos referencias por región para dar una lectura visual comparable; las tablas completas se presentan después de todas las gráficas. Las escalas no se comparan entre gráficos.', x, y, { width, height: 27, lineGap: 1.5, ellipsis: true }); y += 35;
        charts.forEach((item, index) => {
            const column = index % 2; const row = Math.floor(index / 2);
            pdfEquityMiniChart(document, item, null, x + column * (cardWidth + cardGap), y + row * (chartHeight + 8), cardWidth, chartHeight, `${equityRegion(item).toUpperCase()} · ${item.label}`);
        });
        y += Math.ceil(charts.length / 2) * (chartHeight + 8) + 2;
        document.rect(x, y, width, 48).fillAndStroke('#F3F4F6', '#D1D5DB');
        document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(5.9).text('LECTURA DE LOS HISTORICOS', x + 10, y + 9, { characterSpacing: .4 });
        document.fillColor('#4B5563').font('Helvetica').fontSize(6.35).text('Una dirección parecida entre regiones puede ser una coincidencia de cierre y no evidencia de causalidad. Confirma horarios, moneda y hechos de cada mercado antes de extrapolar el movimiento a una exposición propia.', x + 10, y + 20, { width: width - 20, height: 19, lineGap: 1.4, ellipsis: true });
        pdfEquityFooter(document, 1, report);

        document.addPage({ size: 'LEGAL', margin: 34 });
        y = pdfEquityPageHeader(document, 'INFORME SEMANAL - BOLSAS GLOBALES', report.personalization?.customTitle || 'PROYECCIONES ESTADISTICAS', report.generatedAt, report);
        pdfEquitySectionBar(document, y, 2, 'ESCENARIO TECNICO DE CORTO PLAZO', 'OLS sobre 30 cierres diarios; horizonte de cinco sesiones'); y += 28;
        document.fillColor('#4B5563').font('Helvetica').fontSize(6.85).text('La línea grafito es una extrapolación lineal de los cierres observados. Las bandas grises muestran un rango residual orientativo del 80%. No incorpora noticias, resultados corporativos, liquidez ni eventos inesperados; no es una recomendación ni un precio objetivo.', x, y, { width, height: 28, lineGap: 1.5, ellipsis: true }); y += 37;
        charts.forEach((item, index) => {
            const column = index % 2; const row = Math.floor(index / 2);
            pdfEquityMiniChart(document, item, equityLinearScenario(item.points), x + column * (cardWidth + cardGap), y + row * (chartHeight + 8), cardWidth, chartHeight, `${equityRegion(item).toUpperCase()} · ${item.label}`);
        });
        y += Math.ceil(charts.length / 2) * (chartHeight + 8) + 2;
        document.rect(x, y, width, 52).fillAndStroke('#F3F4F6', '#D1D5DB');
        document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(5.9).text('CÓMO LEER EL ESCENARIO', x + 10, y + 9, { characterSpacing: .42 });
        document.fillColor('#4B5563').font('Helvetica').fontSize(6.4).text('La pendiente expresa el cambio lineal estimado por sesión dentro de la muestra. Un escenario alcista o bajista sólo describe la dirección del ajuste reciente; debe contrastarse con las fuentes, el calendario económico y la exposición real antes de actuar.', x + 10, y + 20, { width: width - 20, height: 23, lineGap: 1.45, ellipsis: true });
        pdfEquityFooter(document, 2, report);

        document.addPage({ size: 'LEGAL', margin: 34 });
        y = pdfEquityPageHeader(document, 'INFORME SEMANAL - BOLSAS GLOBALES', report.title || 'INFORME DE BOLSA', report.generatedAt, report);
        pdfEquitySectionBar(document, y, 3, 'PANORAMA GLOBAL', 'América, Europa y Asia - cierres diarios por referencia'); y += 28;
        document.fillColor('#4B5563').font('Helvetica').fontSize(7.15).text(report.summary || 'No hubo suficientes cierres verificables para resumir este corte.', x, y, { width, height: 27, lineGap: 1.7, ellipsis: true }); y += 34;
        y += pdfEquityKpiStrip(document, y, marketSeries) + 10;
        pdfEquitySectionBar(document, y, 4, 'CIERRES Y DESEMPENO', 'Variaciones calculadas con cierres diarios de Yahoo Finance'); y += 26;
        y += pdfEquityPerformanceTable(document, y, marketSeries) + 9;
        document.rect(x, y, width, 47).fillAndStroke('#F3F4F6', '#D1D5DB');
        document.fillColor('#1F2937').font('Helvetica-Bold').fontSize(5.9).text('LECTURA DEL CORTE', x + 10, y + 9, { characterSpacing: .4 });
        document.fillColor('#4B5563').font('Helvetica').fontSize(6.35).text(report.closing || report.objective || 'Las variaciones de sesión no equivalen por sí solas a una tendencia estructural.', x + 10, y + 20, { width: width - 20, height: 19, lineGap: 1.4, ellipsis: true });
        pdfEquityFooter(document, 3, report);

        document.addPage({ size: 'LEGAL', margin: 34 });
        y = pdfEquityPageHeader(document, 'INFORME SEMANAL - BOLSAS GLOBALES', report.personalization?.customTitle || 'DATOS Y CONCLUSIONES', report.generatedAt, report);
        pdfEquitySectionBar(document, y, 5, 'TABLA DE ESCENARIOS', 'Cierre actual frente a la proyección lineal de cinco sesiones'); y += 26;
        y += pdfEquityScenarioTable(document, y, charts) + 10;
        pdfEquitySectionBar(document, y, 6, 'CONCLUSIONES', 'Señales, riesgos y pregunta para la revisión ejecutiva'); y += 26;
        y += pdfEquityConclusions(document, y, report) + 10;
        pdfEquityFooter(document, 4, report);
        pdfVallnewsWatermarksOnTop(document);
        document.end();
    });
}

// User editions preserve the full saved content without adding conclusions.

function pdfUserHeading(document, heading) {
    const width=document.page.width-document.page.margins.left-document.page.margins.right;
    document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(11.5)
        .text(heading,document.page.margins.left,document.y,{width,lineGap:2});
    pdfResetFlow(document,document.y+10);
}

function pdfUserCards(document, heading, items, risk=false) {
    if (!items.length) return;
    const x=document.page.margins.left,width=document.page.width-x-document.page.margins.right;
    const textOptions={width:width-58,lineGap:2.4};
    const maxHeight=document.page.height-document.page.margins.top-document.page.margins.bottom-100;
    items.forEach((item,index)=>{
        const text=typeof item==='string' ? item : item.text;
        const link=typeof item==='object' ? item.url : undefined;
        const height=Math.max(44,document.font('Helvetica').fontSize(10).heightOfString(text,textOptions)+22);
        // Las entradas extensas conservan el flujo de texto con saltos de página.
        if (height>maxHeight) {
            pdfSection(document,`${heading} / ${String(index+1).padStart(2,'0')}`,text,{link});
            return;
        }
        const previousPage=document._vallPdfPageNumber;
        ensurePdfSpace(document,height+(index===0 ? 30 : 0),'portrait',heading);
        if(index===0 || previousPage!==document._vallPdfPageNumber) pdfUserHeading(document,heading);
        const y=document.y,accent=risk ? '#987137' : '#496b98';
        document.roundedRect(x,y,width,height,7).fillAndStroke(risk ? '#FDFBF6' : '#F7F9FC',risk ? '#E6DECB' : '#DCE5F0');
        document.roundedRect(x+10,y+10,26,24,5).fill(risk ? '#F0E7D5' : '#E6EEF8');
        document.fillColor(accent).font('Helvetica-Bold').fontSize(8).text(String(index+1).padStart(2,'0'),x+10,y+17,{width:26,align:'center'});
        document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(10).text(text,x+46,y+10,{...textOptions,...(link ? {link}: {})});
        pdfResetFlow(document,y+height+10);
    });
}

function pdfFullTables(document,tables) {
    tables.forEach(table=>{
        if(table.columns.length<=6) {pdfCompactTable(document,table);return;}
        const groups=Math.ceil((table.columns.length-1)/5);
        for(let start=1;start<table.columns.length;start+=5) pdfCompactTable(document,{...table,title:`${table.title || 'Tabla'} / grupo ${Math.ceil(start/5)} de ${groups}`,columns:[table.columns[0],...table.columns.slice(start,start+5)],rows:table.rows.map(row=>[row[0],...row.slice(start,start+5)])});
    });
}

async function makeDashboardPdf(title,report,layout) {
    report=require('../lib/report-daily-evidence').withDailyEvidence(report);
    const daily=(await import('../../shared/report-weekly.mjs')).weeklyReport(report);
    const weekly=layout.composition==='weekly-sheet' ? daily : null;
    const chapterFooter=report.panoramaMember ? ()=>{} : pdfExecutiveFooter;
    const chartGeometry=await import('../../shared/report-chart-geometry.mjs');
    if(weekly?.panorama)return require('../lib/report-panorama-pdf').makePanoramaPdf(title,report,{weekly,chartGeometry,PDFDocument,pdfPersonalization,pdfPageHeader,pdfExecutiveFooter:chapterFooter,renderPart:makeExecutivePdf});
    const helpers={layout,chartGeometry,PDFDocument,pdfPersonalization,pdfPageHeader,pdfExecutiveFooter:chapterFooter,pdfSection,pdfWatermark:report.panoramaMember || weekly?.commodityExecutive || weekly?.mexicoExecutive ? ()=>{} : pdfVallnewsWatermarksOnTop};
    const renderCompact=async edition=>{const {compactChartReadings}=await import('../../shared/report-chart-layout.mjs'),charts=compactChartReadings(edition.visuals || []),model={...edition,visuals:charts.visuals,chartNotes:charts.notes};return makeCompanyDashboardPdf(title,{...report,metrics:model.metrics,visuals:model.visuals,tables:model.tables},{...helpers,weekly:model,causes:daily.causes});};
    const render=edition=>{
        const specialized={...helpers,weekly:edition};
        if(edition?.newsExecutive)return require('../lib/report-financial-news-pdf').makeFinancialNewsPdf(title,report,specialized);
        if(edition?.equityExecutive)return require('../lib/report-equity-executive-pdf').makeEquityExecutivePdf(title,report,specialized);
        if(edition?.bondExecutive)return require('../lib/report-bond-executive-pdf').makeBondExecutivePdf(title,report,specialized);
        if(edition?.fxExecutive)return require('../lib/report-fx-executive-pdf').makeFxExecutivePdf(title,report,specialized);
        return renderCompact(edition);
    };
    if(weekly)return require('../lib/report-pdf-page-limit').renderIndividualReportPdf({report,model:weekly,render,renderCompact,completeFirst:Boolean(weekly.newsExecutive || weekly.equityExecutive || weekly.bondExecutive || weekly.fxExecutive || report.panoramaMember)});
    return makeCompanyDashboardPdf(title,report,{...helpers,weekly,causes:daily.causes});
}

function makeUserEditionPdf(title, report) {
    return new Promise((resolve,reject) => {
        const document = new PDFDocument({size:'A4',margin:48,bufferPages:true,info:{Title:report.title || title,Author:'VALLNEWS'}}), chunks=[];
        document.on('data',chunk=>chunks.push(chunk)); document.on('error',reject); document.on('end',()=>resolve(Buffer.concat(chunks)));
        const pageLabel=report.collection==='mexico' ? 'INFORME DE MEXICO' : 'INFORME DEL USUARIO';
        document._vallPdfPageLabel=pageLabel; document._vallPdfPageNumber=1; document._vallPdfPersonalization=pdfPersonalization(report);
        document.on('pageAdded',()=>{document._vallPdfPageNumber++;pdfPageHeader(document,document._vallPdfPageLabel || pageLabel);pdfExecutiveFooter(document,document._vallPdfPageNumber);});
        pdfExecutiveCover(document, title, report);
        pdfUserCards(document,'CLAVES PARA DIRECCION',report.takeaways);
        report.sections.forEach(section=>pdfSection(document,section.heading || 'ANÁLISIS',section.text));
        pdfUserCards(document,'RIESGOS Y SEGUIMIENTO',report.watchlist,true);
        pdfSection(document,'DECISION Y SEGUIMIENTO',report.closing);
        pdfMetricGrid(document,report.metrics,'INDICADORES DEL CORTE');
        report.visuals.forEach(visual=>{if(visual.type==='bar') pdfBarChart(document,visual);else pdfLineChart(document,visual);});
        pdfFullTables(document,report.tables);
        // Las ediciones propias conservan la marca institucional también en
        // documentos de una página y después de dibujar tablas y gráficas.
        pdfVallnewsWatermarksOnTop(document);
        document.end();
    });
}

async function makeExecutivePdf(title,report,localization){
    const bytes=await renderExecutivePdf(title,report,localization);
    // El visor y las propiedades del archivo identifican la misma edición que
    // su nombre de descarga, incluso cuando Panorama combina varios PDF.
    const {PDFDocument:ExportDocument}=require('pdf-lib');
    const document=await ExportDocument.load(bytes,{updateMetadata:false});
    document.setTitle(reportDocumentTitle(report,{language:localization?.language || 'es',title:report.title || title}),{showInWindowTitleBar:true});
    document.setAuthor('VALLNEWS');
    const result=Buffer.from(await document.save());
    Object.defineProperty(result,'reportPageCount',{value:document.getPageCount()});
    return result;
}

function renderExecutivePdf(title, report,localization) {
    if(localization?.language && localization.language!=='es') return makeLocalizedReportPdf(title,report,localization,pdfVallnewsWatermarksOnTop);
    // Los informes base y las ediciones de Bolsa comparten el tablero.
    // La composición se identifica por el origen, aunque el usuario lo renombre.
    const layout=reportLayout(report);
    if (['company-dashboard','weekly-sheet'].includes(layout?.composition)) return makeDashboardPdf(title,report,layout);
    if (report?.userEdition) return makeUserEditionPdf(title,report);
    return new Promise((resolve, reject) => {
        const document = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: title, Author: 'VALLNEWS', Subject: 'Executive decision brief', Keywords: 'VALLNEWS, inteligencia económica, mercado, reporte ejecutivo' } }); const chunks = [];
        document.on('data', chunk => chunks.push(chunk)); document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks)));
        // Executive narrative comes first; detail follows as evidence.
        document._vallPdfPageLabel = 'INFORME EJECUTIVO';
        document._vallPdfPageNumber = 1;
        document._vallPdfPersonalization = pdfPersonalization(report);
        document.on('pageAdded', () => {
            document._vallPdfPageNumber += 1;
            pdfPageHeader(document, document._vallPdfPageLabel);
            pdfExecutiveFooter(document, document._vallPdfPageNumber);
        });
        pdfExecutiveCover(document, title, report);
        const reportSections = report.sections.filter(section => !/^lectura complementaria de vall ai$/i.test(String(section.heading || '').trim()));
        pdfDecisionMap(document, report);
        reportSections.forEach(section => pdfSection(document, section.heading.toUpperCase(), section.text));
        pdfValidationPlan(document, report);
        pdfSection(document, 'DECISION Y SEGUIMIENTO', report.closing);


        // Primero se muestran todas las gráficas disponibles. Los saltos de
        // página de cada gráfica permanecen en este bloque, así que las tablas
        // jamás se intercalan entre visualizaciones.
        if (report.visuals.length) {
            ensurePdfSpace(document, 300, 'portrait', 'GRAFICAS DEL CORTE');
            pdfVisualOpening(document, report);
            const visualCount = report.visuals.length;
            const lineHeight = visualCount === 1 ? 245 : visualCount === 2 ? 180 : 118;
            report.visuals.forEach(visual => {
                if (visual.type === 'bar') pdfBarChart(document, visual, 'GRAFICAS DEL CORTE');
                else pdfLineChart(document, visual, 'GRAFICAS DEL CORTE', { chartHeight: lineHeight });
            });
            pdfVisualReading(document);
        }

        ensurePdfSpace(document, 200, 'portrait', 'PANORAMA Y DATOS');
        pdfDataOpening(document, report);
        pdfDecisionSnapshot(document, report);
        pdfReportPassport(document, report);
        if (report.decisionGuide) pdfSection(document, report.decisionGuide.heading.toUpperCase(), [report.decisionGuide.action, report.decisionGuide.horizonNote, report.decisionGuide.coverageNote].filter(Boolean).join('\n\n'));
        pdfMetricGrid(document, report.metrics);
        pdfBeforeAfter(document, report.comparisons);
        // Las tablas compactas se colocan antes que los tableros de fichas:
        // así una tabla breve no queda aislada en una página casi vacía al
        // final del bloque de datos.
        const orderedTables = [...report.tables].sort((left, right) => Number((left.columns || []).length > 4) - Number((right.columns || []).length > 4));
        orderedTables.forEach(table => pdfTable(document, table));

        // Keep the primary reading and references free of watermark overlays.
        pdfVallnewsWatermarksOnTop(document, { skipFirstPage: true, skipLastPage: true });
        document.end();
    });
}

function pdfText(value) {
    // PDFKit con Helvetica no interpreta LaTex. Convertir estas marcas antes
    // de dibujar evita los símbolos rotos que aparecían en el informe OLS.
    return plain(value)
        .replace(/\$\$?/g, '')
        .replace(/\\hat\{?Y_?t\}?/gi, 'Y estimado')
        .replace(/\\beta_?([01])/gi, 'beta $1')
        .replace(/\\epsilon_?t/gi, 'error t')
        .replace(/\\cdot/gi, 'x')
        .replace(/\\[a-z]+/gi, '')
        .replace(/[–—]/g, '-')
        .replace(/[•·]/g, '-')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function pdfTablesFromMarkdown(content) {
    const lines = String(content || '').replace(/\r/g, '').split('\n');
    const tables = [];
    for (let index = 0; index < lines.length; index += 1) {
        if (!/^\s*\|.+\|\s*$/.test(lines[index]) || !/^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || '')) continue;
        const headers = lines[index].split('|').slice(1, -1).map(cell => pdfText(cell));
        const rows = []; index += 2;
        while (/^\s*\|.+\|\s*$/.test(lines[index] || '')) {
            rows.push(lines[index].split('|').slice(1, -1).map(cell => pdfText(cell)));
            index += 1;
        }
        if (headers.length >= 2 && rows.length) tables.push({ headers, rows });
    }
    return tables;
}

function pdfMetricFromTables(tables, expression, fallback = 'No disponible') {
    for (const table of tables) {
        const row = table.rows.find(candidate => expression.test(String(candidate[0] || '')));
        if (row?.[1]) return String(row[1]).replace(/\s+/g, ' ').trim();
    }
    return fallback;
}

function pdfReportSections(content) {
    const sections = []; let current = null; let inTable = false; let inChart = false;
    String(content || '').replace(/\r/g, '').split('\n').forEach(raw => {
        const line = raw.trim();
        if (/^```chart\b/i.test(line)) { inChart = true; return; }
        if (inChart) { if (/^```\s*$/.test(line)) inChart = false; return; }
        if (/^\|/.test(line)) { inTable = true; return; }
        if (inTable && !line) { inTable = false; return; }
        if (inTable) return;
        const heading = line.match(/^#{1,4}\s+(.+)/);
        if (heading) {
            current = { heading: pdfText(heading[1]), paragraphs: [] };
            sections.push(current); return;
        }
        const text = pdfText(line.replace(/^(?:[-*]|\d+\.)\s+/, ''));
        if (!text || text === '---' || /^fecha:/i.test(text)) return;
        if (!current) { current = { heading: 'Resumen ejecutivo', paragraphs: [] }; sections.push(current); }
        if (!/^claro, aqu/i.test(text)) current.paragraphs.push(text);
    });
    return sections.filter(section => section.paragraphs.length || section.heading);
}

function pdfAnalyticalFrame(document, label, page) {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const top = document.page.margins.top - 18;
    document.fillColor('#526174').font('Helvetica-Bold').fontSize(6.8).text('VALLNEWS - INTELIGENCIA ECONOMICA', x, top, { characterSpacing: .7 });
    document.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.6).text(label, x, top, { width, align: 'right', characterSpacing: .6 });
    document.strokeColor('#CBD5E1').lineWidth(.7).moveTo(x, top + 16).lineTo(x + width, top + 16).stroke();
    // El pie debe quedar dentro del área util. Colocarlo debajo del margen
    // hacía que PDFKit abriera otra página mientras dibujaba el pie y entrara
    // en un ciclo de pageAdded.
    const footerY = document.page.height - document.page.margins.bottom - 18;
    document.strokeColor('#E2E8F0').lineWidth(.55).moveTo(x, footerY - 8).lineTo(x + width, footerY - 8).stroke();
    document.fillColor('#64748B').font('Helvetica').fontSize(6.2).text('Documento informativo - Verifica cifras, unidad y fuente antes de tomar decisiones.', x, footerY, { width: width - 45 });
    document.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.2).text(`Pagina ${page}`, x + width - 45, footerY, { width: 45, align: 'right' });
    document.x = x; document.y = document.page.margins.top + 14;
}

function pdfAnalyticalHeading(document, index, heading, caption = '') {
    const x = document.page.margins.left;
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const y = document.y;
    document.rect(x, y, width, 25).fill('#F1F5F9');
    document.rect(x, y, 5, 25).fill('#2563EB');
    document.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text(`${index}. ${heading.toUpperCase()}`, x + 14, y + 8, { width: width * .68, ellipsis: true });
    if (caption) document.fillColor('#64748B').font('Helvetica').fontSize(6.8).text(caption, x + width * .55, y + 9, { width: width * .42, align: 'right', ellipsis: true });
    document.x = x; document.y = y + 35;
}

function pdfAnalyticalMetrics(document, metrics) {
    const x = document.page.margins.left; const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const gap = 8; const cardWidth = (width - gap * 3) / 4; const y = document.y;
    const accents = ['#2563EB', '#059669', '#D97706', '#475569'];
    metrics.forEach((metric, index) => {
        const cardX = x + index * (cardWidth + gap);
        document.roundedRect(cardX, y, cardWidth, 64, 5).fillAndStroke('#F8FAFC', '#D6E0EB');
        document.rect(cardX, y, 3, 64).fill(accents[index]);
        document.fillColor('#64748B').font('Helvetica-Bold').fontSize(5.75).text(metric.label.toUpperCase(), cardX + 10, y + 10, { width: cardWidth - 18, ellipsis: true });
        document.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11.4).text(metric.value, cardX + 10, y + 25, { width: cardWidth - 18, ellipsis: true });
        document.fillColor('#475569').font('Helvetica').fontSize(5.85).text(metric.note, cardX + 10, y + 47, { width: cardWidth - 18, height: 10, ellipsis: true });
    });
    document.x = x; document.y = y + 78;
}

function pdfAnalyticalTable(document, table) {
    const x = document.page.margins.left; const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const columns = table.headers.slice(0, 6); const widths = columns.map((_, index) => index === 0 ? width * .25 : (width * .75) / Math.max(columns.length - 1, 1));
    const drawRow = (values, header = false) => {
        const height = header ? 24 : Math.max(22, ...columns.map((_, index) => document.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 6.7 : 7.15).heightOfString(values[index] || '', { width: widths[index] - 10, lineGap: 1.25 }) + 9));
        if (document.y + height > document.page.height - document.page.margins.bottom - 18) {
            // pageAdded ya instala cabecera, pie y contador; repetirlo aquí
            // duplicaba la composición y adelantaba el número de página.
            document.addPage(); drawRow(columns, true);
        }
        const y = document.y; let cursor = x;
        columns.forEach((_, index) => { document.rect(cursor, y, widths[index], height).fillAndStroke(header ? '#0F172A' : (index % 2 ? '#FFFFFF' : '#F8FAFC'), '#D6E0EB'); cursor += widths[index]; });
        cursor = x;
        columns.forEach((_, index) => {
            document.fillColor(header ? '#FFFFFF' : '#1E293B').font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 6.7 : 7.15).text(values[index] || '', cursor + 5, y + 7, { width: widths[index] - 10, lineGap: 1.25, ellipsis: true }); cursor += widths[index];
        });
        document.x = x; document.y = y + height;
    };
    drawRow(columns, true); table.rows.slice(0, 16).forEach(row => drawRow(row)); document.y += 10;
}

function pdfAnalyticalImage(document, data) {
    const x = document.page.margins.left; const width = document.page.width - document.page.margins.left - document.page.margins.right;
    const image = document.openImage(data); const maxWidth = width - 20; const maxHeight = 292;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const imageWidth = image.width * scale; const imageHeight = image.height * scale; const y = document.y;
    // Las gráficas se exportan sobre una superficie clara para que azul, cian,
    // verde y rojo se lean como señales, no como decoración sobre azul oscuro.
    document.roundedRect(x, y, width, imageHeight + 34, 6).fillAndStroke('#FFFFFF', '#C7D7EA');
    document.image(data, x + (width - imageWidth) / 2, y + 17, { width: imageWidth, height: imageHeight });
    document.x = x; document.y = y + imageHeight + 44;
}

function makePdf(title, content, images) {
    return new Promise((resolve, reject) => {
        const document = new PDFDocument({ size: 'A4', margin: 52, bufferPages: true, info: { Title: title, Author: 'ORION', Subject: 'Informe cuantitativo ORION' } });
        const chunks = []; const source = String(content || ''); const tables = pdfTablesFromMarkdown(source); const sections = pdfReportSections(source);
        document.on('data', chunk => chunks.push(chunk)); document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks)));
        document._orionPdfPage = 1;
        document.on('pageAdded', () => pdfAnalyticalFrame(document, 'INFORME CUANTITATIVO', ++document._orionPdfPage));
        pdfAnalyticalFrame(document, 'INFORME CUANTITATIVO', 1);
        const x = document.page.margins.left; const width = document.page.width - document.page.margins.left - document.page.margins.right;
        const observations = pdfMetricFromTables(tables, /observaciones/i);
        const rSquared = pdfMetricFromTables(tables, /r[²2]/i);
        const slope = pdfMetricFromTables(tables, /pendiente/i);
        const residual = pdfMetricFromTables(tables, /error est[aá]ndar/i);
        const equation = pdfMetricFromTables(tables, /ecuaci[oó]n/i, 'Modelo OLS sobre cierres históricos');
        document.fillColor('#0F172A').font('Helvetica-Bold').fontSize(21).text(title, x, document.y, { width, lineGap: 1 });
        document.moveDown(.16).fillColor('#475569').font('Helvetica').fontSize(9.3).text('Modelo de regresión lineal y lectura cuantitativa', x, document.y, { width });
        document.moveDown(.15).strokeColor('#0F172A').lineWidth(1.3).moveTo(x, document.y + 5).lineTo(x + width, document.y + 5).stroke();
        document.y += 16;
        pdfAnalyticalMetrics(document, [
            { label: 'Muestra', value: observations, note: 'Observaciones analizadas' },
            { label: 'Coef. R2', value: rSquared, note: 'Ajuste de la tendencia' },
            { label: 'Pendiente', value: slope, note: 'Cambio medio estimado' },
            { label: 'Error residual', value: residual, note: 'Dispersión del modelo' },
        ]);
        pdfAnalyticalHeading(document, 1, 'Especificación del modelo', 'OLS - interpretación no causal');
        const intro = sections.flatMap(section => section.paragraphs).find(value => value.length > 80) || 'El modelo estima la trayectoria lineal de la serie solicitada con cierres históricos verificables. La pendiente describe una tendencia promedio, no una recomendación ni un pronóstico.';
        document.fillColor('#334155').font('Helvetica').fontSize(8.8).text(intro, x, document.y, { width, lineGap: 2.5 });
        document.y += 13;
        const formulaY = document.y; document.roundedRect(x, formulaY, width, 48, 5).fillAndStroke('#F8FAFC', '#D6E0EB');
        document.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.3).text(equation, x + 12, formulaY + 16, { width: width - 24, align: 'center', ellipsis: true }); document.y = formulaY + 60;
        if (images[0]) {
            pdfAnalyticalImage(document, images[0]);
        }
        const mainTable = tables.find(table => table.headers.length >= 2) || null;
        if (mainTable) {
            if (document.y > document.page.height - document.page.margins.bottom - 180) document.addPage();
            pdfAnalyticalHeading(document, 2, 'Parámetros estadísticos', 'Resultados reproducibles del cálculo');
            pdfAnalyticalTable(document, mainTable);
        }
        // Se omiten subtítulos que sólo repiten el periodo. Antes generaban
        // saltos con una línea aislada y dejaban una página casi vacía.
        const narrativeSections = sections.filter(section => section.paragraphs.join(' ').length >= 80).slice(0, 6);
        narrativeSections.forEach((section, index) => {
            const paragraphs = section.paragraphs.slice(0, 3); if (!paragraphs.length) return;
            if (document.y > document.page.height - document.page.margins.bottom - 120) document.addPage();
            pdfAnalyticalHeading(document, index + 3, section.heading || 'Lectura del análisis');
            paragraphs.forEach(paragraph => { document.fillColor('#334155').font('Helvetica').fontSize(8.65).text(paragraph, x, document.y, { width, lineGap: 2.35 }); document.y += 8; });
        });
        images.slice(1).forEach(data => { document.addPage(); pdfAnalyticalHeading(document, 'A', 'Visualización complementaria'); pdfAnalyticalImage(document, data); });
        pdfVallnewsWatermarksOnTop(document);
        document.end();
    });
}

function htmlReport(title, content, images,language='es') {
    const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return Buffer.from(`<!doctype html><html lang="${esc(language)}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{max-width:820px;margin:40px auto;padding:0 28px;font:15px/1.65 Arial;color:#1F2937}h1{color:#111827;border-bottom:4px solid #4B5563;padding-bottom:12px}pre{white-space:pre-wrap}.chart{max-width:100%;margin:20px 0;border:1px solid #D1D5DB}</style></head><body><h1>${esc(title)}</h1><pre>${esc(content)}</pre>${images.map(data => `<img class="chart" src="data:image/png;base64,${data.toString('base64')}">`).join('')}</body></html>`, 'utf8');
}

router.post('/report-localize', verifyToken, localeLimiter, boundedJson({limit:'7mb'}), reportOwnerBinding, reportWork(async(req,res)=>{
    const controller=new AbortController();
    const disconnected=()=>{if(!res.writableEnded) controller.abort(Object.assign(Error('La lectura cambió.'),{code:'REPORT_TRANSLATION_CANCELLED'}));};
    res.on('close',disconnected);
    try {
        const executive=executivePayload(req.body?.executiveReport),language=requestReportLanguage(req);
        if(!executive) return res.status(400).json({success:false,error:'El informe no tiene una estructura válida.'});
        const title=clean(req.body?.title || executive.title,140);
        const localized=await reportTranslator.localize({report:executive,title,language},{owner:req.user.email,signal:controller.signal});
        const report=localized.report;
        if(report.executiveBrief) report.executiveBrief.generated=true;
        if(report.personalization) report.personalization.audienceKey=normalizePreferences(req.body?.executiveReport?.personalization).audience;
        res.set({'Content-Language':language,'Cache-Control':'private, no-store'});
        res.json({success:true,accountEmail:req.user.email,language,report});
    } catch(error) {
        if(controller.signal.aborted) return;
        res.status(error.status || 502).json({success:false,error:error.code?.startsWith('REPORT_') ? error.message : 'No se pudo traducir la vista previa.',code:error.code || 'REPORT_TRANSLATION_INVALID'});
    } finally {res.removeListener('close',disconnected);}
}));

router.post('/report-export', verifyToken, limiter, boundedJson({ limit: '7mb' }), reportOwnerBinding, reportWork(async (req, res) => {
    try {
        let title = clean(req.body?.title || 'Reporte ORION', 140);
        let content = withoutSourcesText(clean(req.body?.content, 180000));
        let executive = executivePayload(req.body?.executiveReport);
        const language=requestReportLanguage(req);
        const format = ['docx', 'pdf', 'html', 'markdown', 'txt', 'json','csv','xlsx'].includes(req.body?.format) ? req.body.format : 'docx';
        if (!content && !executive) return res.status(400).json({ success: false, error: 'El reporte está vacío.' });
        if(format==='csv' && !executive) return res.status(400).json({success:false,error:'El informe no contiene datos estructurados para CSV.'});
        if(format==='xlsx' && !executive)return res.status(400).json({success:false,error:'El informe no contiene datos estructurados para Excel.'});
        const localized=await reportTranslator.localize({report:executive,title,content:executive ? '' : content,language},{owner:req.user.email});
        title=localized.title;executive=localized.report;
        if(executive)content=await reportExportContent(executive,localized.t,localized.source);
        else if(language!=='es')content=localized.content;
        res.setHeader('Content-Language',language);
        const images = imagesFrom(req.body);
        if(!executive && language!=='es') localized.images=images;
        let buffer, mime, extension;
        if (format === 'docx') { buffer = await makeDocx(title, content, images,localized); mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; extension = 'docx'; }
        else if (format === 'pdf') { buffer = executive ? await makeExecutivePdf(title, executive,localized) : language==='es' ? await makePdf(title, content, images) : await makeExecutivePdf(title,{title,generatedAt:new Date().toISOString(),summary:'',sections:[{heading:localized.t('Análisis'),text:content}],metrics:[],visuals:[],tables:[],takeaways:[],watchlist:[],sources:[],sourceLinks:[],personalization:{}},localized); mime = 'application/pdf'; extension = 'pdf'; }
        else if (format === 'csv') {const {reportCsv}=await import('../../frontend/src/lib/reportCsv.js');buffer=Buffer.from(reportCsv(executive,localized));mime='text/csv; charset=utf-8';extension='csv';}
        else if(format==='xlsx'){const {makeReportWorkbook,REPORT_WORKBOOK_MIME}=require('../lib/report-workbook');buffer=await makeReportWorkbook(executive,localized);mime=REPORT_WORKBOOK_MIME;extension='xlsx';}
        else if (format === 'html') { buffer = htmlReport(title, content, images,language); mime = 'text/html; charset=utf-8'; extension = 'html'; }
        else if (format === 'markdown') { buffer = Buffer.from(content, 'utf8'); mime = 'text/markdown; charset=utf-8'; extension = 'md'; }
        else if (format === 'txt') { buffer = Buffer.from(plain(content), 'utf8'); mime = 'text/plain; charset=utf-8'; extension = 'txt'; }
        else { buffer = Buffer.from(JSON.stringify({ title, generatedAt: new Date().toISOString(), language,content }, null, 2), 'utf8'); mime = 'application/json; charset=utf-8'; extension = 'json'; }
        // La vista previa y la descarga del editor reciben el PDF en esta misma
        // petición: /tmp no se comparte entre instancias de Vercel. Los clientes
        // que guardan enlaces en el chat conservan el contrato JSON anterior.
        const name=executive ? reportDownloadName(executive,extension,{language}) : `${filename(title)}${language==='es' ? '' : '-'+language}.${extension}`;
        if (['pdf','csv','xlsx'].includes(format) && req.body?.response === 'file') {
            res.set({ 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${name}"`,
                'Content-Length': String(buffer.length), 'Cache-Control': 'private, no-store, max-age=0' });
            return res.send(buffer);
        }
        const saved = await reportFileStore.save({ buffer, mime, name, owner: req.user?.email });
        res.json({ success: true, downloadUrl: `/api/report-download/${saved.token}`, filename: saved.name,
            size: saved.size, createdAt: saved.createdAt, storage: saved.storage,language });
    } catch (error) {
        console.error('/api/report-export error:', error.message);
        res.status(error.status || 500).json({ success: false, error: error.code?.startsWith('REPORT_') ? error.message : 'No se pudo generar el documento.',...(error.code?.startsWith('REPORT_') ? {code:error.code} : {}) });
    }
}));

router.get('/report-email/status', verifyToken, (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-VALL-Mail-API', '2');
    const scheduler=IS_VERCEL ? {mode:'cron',authorizationConfigured:!!process.env.CRON_SECRET,dispatchVerified:false} : {mode:'local',...require('../lib/report-email-worker').reportEmailWorkerStatus()};
    res.json({ success: true, accountEmail: req.user.email, mail: { ...reportMailStatus(), automaticEnabled: mailAutomationEnabled(), environment: IS_VERCEL ? 'vercel' : 'local', version: 2,scheduler } });
});

router.post('/report-email', verifyToken, emailAttempts, emailLimiter, boundedJson({ limit: '7mb' }), reportOwnerBinding, reportWork(async (req, res) => {
    res.set('X-VALL-Mail-API', '2');
    try {
        const recipient = normalizeRecipient(req.body?.recipientEmail,req.user?.email);
        if (!reportMailStatus().configured) throw mailFailure();

        const title = clean(req.body?.title || 'Informe ejecutivo VALLNEWS', 140);
        const content = clean(req.body?.content, 180000);
        const executive = executivePayload(req.body?.executiveReport);
        if (!content || !executive) return res.status(400).json({ success: false, error: 'El informe está vacío o no tiene una estructura válida.' });
        const delivered = await deliverExecutiveEmail({ recipient, title, executive,language:requestReportLanguage(req),owner:req.user.email });
        res.setHeader('Content-Language',delivered.language);
        const [name, domain] = recipient.split('@');
        const masked = `${name.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(5, name.length - 2)))}@${domain}`;
        res.json({ success: true, email: masked, filename: delivered.attachmentName, size: delivered.size, language: delivered.language });
    } catch (error) {
        if(error.status===400 || error.code?.startsWith('REPORT_TRANSLATION_') || error.code?.startsWith('REPORT_LANGUAGE_')) return res.status(error.status || 502).json({success:false,error:error.message,code:error.code});
        const failure = error.code?.startsWith('REPORT_EMAIL_') ? error : mailFailure(error);
        console.error('/api/report-email error:', failure.code);
        res.status(failure.status).json({ success: false, error: failure.message, code: failure.code });
    }
}));

router.get('/report-email-schedules', verifyToken, async (req, res) => {
    try {
        const data = await reportEmailSchedules.list(String(req.user.email || '').toLowerCase());
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, data, accountEmail:req.user.email });
    } catch (error) {
        console.error('/api/report-email-schedules:', error.message);
        res.status(500).json({ success: false, error: 'No se pudieron consultar las programaciones.' });
    }
});

router.post('/report-email-schedules', verifyToken, scheduleLimiter, express.json({ limit: '32kb' }), reportOwnerBinding, async (req, res) => {
    try {
        const ownerEmail = String(req.user.email || '').toLowerCase();
        if(!reportMailStatus().configured) throw mailFailure();
        if(!mailAutomationEnabled()) throw Object.assign(Error('Las entregas automáticas están pausadas. Actívalas en el servidor antes de programar.'),{status:503});
        const area = ['finance','markets','mexico'].includes(req.body?.area) ? req.body.area : '';
        const reportKey = clean(req.body?.reportKey, 48);
        if (!area || !reportKey) return res.status(400).json({ success: false, error: 'Selecciona un informe válido de Finanzas, Mercados o México.' });
        const allowedKeys = REPORT_COLLECTIONS[area].reportKeys;
        if (!allowedKeys.includes(reportKey)) return res.status(404).json({ success: false, error: 'El informe ya no está disponible en el corte vigente.' });
        const schedule = await reportEmailSchedules.upsert({
            ownerEmail, area, reportKey,
            recipientEmail: normalizeRecipient(req.body?.recipientEmail,ownerEmail),
            preferences: { ...normalizePreferences(req.body?.preferences),language:requestReportLanguage(req,req.body?.language===undefined ? req.body?.preferences?.language : req.body.language), aiCustomization: normalizeAiCustomization(req.body?.ai) },
            delivery: req.body?.delivery,
        });
        res.json({ success: true, schedule });
    } catch (error) {
        console.error('/api/report-email-schedules POST:', error.message);
        res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'No se pudo programar la entrega del informe.',...(error.code?.startsWith('REPORT_') ? {code:error.code} : {}) });
    }
});

router.post('/report-email-schedules/batch', verifyToken, scheduleLimiter, express.json({limit:'128kb'}), reportOwnerBinding, async(req,res)=>{
    try {
        if(!reportMailStatus().configured) throw mailFailure();
        if(!mailAutomationEnabled()) throw Object.assign(Error('Las entregas automáticas están pausadas. Actívalas en el servidor antes de programar.'),{status:503});
        const ownerEmail=String(req.user.email||'').toLowerCase();
        const selected=normalizeScheduleSelection(req.body?.reports);
        const language=requestReportLanguage(req,req.body?.language);
        const recipientEmail=normalizeRecipient(req.body?.recipientEmail,ownerEmail);
        const schedules=await reportEmailSchedules.upsertMany(selected.map(item=>({ownerEmail,area:item.area,reportKey:item.reportKey,
            recipientEmail,delivery:req.body?.delivery,
            preferences:{...normalizePreferences(item.preferences),language,aiCustomization:normalizeAiCustomization(item.ai)}})));
        res.json({success:true,accountEmail:ownerEmail,schedules});
    } catch(error) {
        res.status(error.status||500).json({success:false,error:error.status?error.message:'No se pudo guardar la selección de informes.',...(error.code?.startsWith('REPORT_')?{code:error.code}:{})});
    }
});

router.post('/report-email-schedules/cancel', verifyToken, express.json({ limit: '8kb' }), reportOwnerBinding, async (req, res) => {
    try {
        const area = ['finance','markets','mexico'].includes(req.body?.area) ? req.body.area : '';
        const reportKey = clean(req.body?.reportKey, 48);
        if (!area || !reportKey) return res.status(400).json({ success: false, error: 'Programación no válida.' });
        await reportEmailSchedules.remove(String(req.user.email || '').toLowerCase(), area, reportKey);
        res.json({ success: true });
    } catch (error) {
        console.error('/api/report-email-schedules/cancel:', error.message);
        res.status(500).json({ success: false, error: 'No se pudo cancelar la programación.' });
    }
});

router.get('/report-email-schedules/run', async (req, res) => {
    const expected = process.env.CRON_SECRET || process.env.REFRESH_SECRET;
    if (!expected || String(req.headers.authorization || '') !== `Bearer ${expected}`) return res.status(401).json({ success: false, error: 'No autorizado.' });
    try { res.json({ success: true, ...(await runScheduledReportEmails()) }); }
    catch (error) { console.error('/api/report-email-schedules/run:', error.message); res.status(500).json({ success: false, error: 'No se pudieron procesar los envíos programados.' }); }
});

if (!IS_VERCEL && process.env.NODE_ENV !== 'test' && mailAutomationEnabled()) {
    require('../lib/report-email-worker').startReportEmailWorker(runScheduledReportEmails);
    console.log('[report-email-schedules] Programador activo: revisión al arrancar y al inicio de cada minuto.');
}

router.get('/report-download/:token', verifyToken, async (req, res) => {
    try {
    const file = await reportFileStore.get(req.params.token, req.user?.email);
    if (!file) return res.status(404).json({ success: false, error: 'El archivo no está disponible. Puedes recuperarlo desde el contenido guardado del chat.' });
    // La vista previa se abre dentro de ORION. No consume el archivo: el
    // usuario todavía puede descargar exactamente ese PDF después de revisarlo.
    const preview = req.query?.preview === '1' && file.mime === 'application/pdf';
    if (preview) {
        // Sólo PDFs generados por el servidor y del propietario autenticado.
        // HTML, descargas normales y errores mantienen el bloqueo de marcos.
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; base-uri 'self'; object-src 'self'");
    }
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${file.name}"`);
    res.setHeader('Content-Length', file.buffer.length);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.send(file.buffer);
    } catch (error) {
        console.error('/api/report-download:', error.message);
        res.status(503).json({ success: false, error: 'No se pudo leer el archivo guardado. Intenta de nuevo.' });
    }
});

module.exports = router;
module.exports.runScheduledReportEmails = runScheduledReportEmails;
module.exports._test = { makeDocx, makePdf, makeExecutivePdf, makeEquityWeeklyPdf, executivePayload, htmlReport, plain, safeHtml, runScheduledReportEmails,deliverExecutiveEmail };
