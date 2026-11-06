'use strict';
const path=require('node:path');
const PDFDocument=require('pdfkit');
const {makeCompanyDashboardPdf}=require('./report-company-dashboard-pdf');
const {reportLayout}=require('./report-layout');

function localizedPdfDocument(localization) {
    const {language,locale}=localization;
    return class ReportDocument extends PDFDocument {
        constructor(options) {super({...options,lang:locale});}
        font(source,family,size) {
            if(language==='ja' && /^Helvetica/.test(source)) source=path.join(__dirname,'../../assets/fonts/noto-jp',source.includes('Bold') ? 'NotoSansJP-Bold.otf' : 'NotoSansJP-Regular.otf');
            return super.font(source,family,size);
        }
    };
}
async function makeLocalizedReportPdf(title,report,localization,watermark) {
    const labels=localization.t;
    localization={...localization,t:(text,parameters)=>report.causeText?.[text] || labels(text,parameters)};
    const {t}=localization;
    const layout=reportLayout(report) || {collection:'mine',key:'manual',label:report.title,collectionLabel:'Mis informes',chartHeading:'Gráficas del informe'};
    const pdfPersonalization=value=>({audience:t('Comité directivo'),horizon:t('Corte actual'),confidentialityLabel:t('Uso interno'),...value.personalization});
    const pdfPageHeader=(document,label)=>{
        const x=document.page.margins.left,y=document.page.margins.top,width=document.page.width-x-document.page.margins.right;
        const identity=document._vallPdfPersonalization || {},owner=identity.organization || identity.recipientName || 'VALLNEWS';
        document.fillColor('#586b78').font('Helvetica-Bold').fontSize(6.2).text(`${owner} · ${t('Hoja')} ${String(document._vallPdfPageNumber || 1).padStart(2,'0')}`,x,y,{width:width*.45,ellipsis:true});
        document.text(label,x+width*.45,y,{width:width*.55,align:'right',ellipsis:true});
        document.moveTo(x,y+17).lineTo(x+width,y+17).strokeColor('#bccdd4').lineWidth(.5).stroke();document.x=x;document.y=y+29;
    };
    const pdfExecutiveFooter=(document,page)=>{
        if(report.panoramaMember)return;
        const x=document.page.margins.left,y=document.page.height-46,width=document.page.width-x-document.page.margins.right;
        const previousBottom=document.page.margins.bottom;document.page.margins.bottom=0;
        document.moveTo(x,y-5).lineTo(x+width,y-5).strokeColor('#bccdd4').lineWidth(.4).stroke();
        const identity=document._vallPdfPersonalization || {},owner=identity.organization || identity.recipientName || 'VALLNEWS';
        document.fillColor('#586b78').font('Helvetica').fontSize(5.4).text(`${identity.confidentialityLabel || t('Uso interno')} · ${owner}${document._vallPdfDataOnly ? '' : ' · '+t('Documento informativo. Confirme fecha, unidad y fuente primaria.')}`,x,y,{width:width-65,ellipsis:true,lineBreak:false});
        document.font('Helvetica-Bold').text(`${t('Página')} ${page}`,x+width-60,y,{width:60,align:'right',lineBreak:false});document.page.margins.bottom=previousBottom;document.x=x;document.y=document.page.margins.top+29;
    };
    const pdfWatermark=document=>{
        if(report.panoramaMember || weekly?.commodityExecutive || weekly?.mexicoExecutive)return;
        for(const [index,data] of (localization.images || []).entries()) {
            document.addPage();const x=document.page.margins.left,width=document.page.width-x-document.page.margins.right;
            document.font('Helvetica-Bold').fontSize(11).text(`${t('Gráfica')} ${index+1}`,x,document.y,{width});document.moveDown();
            document.image(data,x,document.y,{fit:[width,document.page.height-document.y-85],align:'center'});
        }
        watermark(document);
    };
    report=require('./report-daily-evidence').withDailyEvidence(report);
    const daily=(await import('../../shared/report-weekly.mjs')).weeklyReport(report,{t:localization.t,source:localization.source,number:value=>localization.t(value.toLocaleString('es-MX',{maximumFractionDigits:5}))});
    const weekly=layout.composition==='weekly-sheet' ? daily : null;
    const chartGeometry=await import('../../shared/report-chart-geometry.mjs');
    if(weekly?.panorama)return require('./report-panorama-pdf').makePanoramaPdf(title,report,{weekly,chartGeometry,PDFDocument:localizedPdfDocument(localization),pdfPersonalization,pdfPageHeader,pdfExecutiveFooter,renderPart:(partTitle,part)=>makeLocalizedReportPdf(partTitle,part,localization,watermark)});
    const helpers={layout,chartGeometry,PDFDocument:localizedPdfDocument(localization),pdfPersonalization,pdfPageHeader,pdfExecutiveFooter,pdfWatermark,localization};
    const renderCompact=async edition=>{const {compactChartReadings}=await import('../../shared/report-chart-layout.mjs'),charts=compactChartReadings(edition.visuals || []),model={...edition,visuals:charts.visuals,chartNotes:charts.notes};return makeCompanyDashboardPdf(title,{...report,metrics:model.metrics,visuals:model.visuals,tables:model.tables},{...helpers,weekly:model,causes:daily.causes});};
    const render=edition=>{
        const specialized={...helpers,weekly:edition};
        if(edition?.newsExecutive)return require('./report-financial-news-pdf').makeFinancialNewsPdf(title,report,specialized);
        if(edition?.equityExecutive)return require('./report-equity-executive-pdf').makeEquityExecutivePdf(title,report,specialized);
        if(edition?.bondExecutive)return require('./report-bond-executive-pdf').makeBondExecutivePdf(title,report,specialized);
        if(edition?.fxExecutive)return require('./report-fx-executive-pdf').makeFxExecutivePdf(title,report,specialized);
        return renderCompact(edition);
    };
    if(weekly)return require('./report-pdf-page-limit').renderIndividualReportPdf({report,model:weekly,render,renderCompact,t,source:localization.source,completeFirst:Boolean(weekly.newsExecutive || weekly.equityExecutive || weekly.bondExecutive || weekly.fxExecutive || report.panoramaMember)});
    return makeCompanyDashboardPdf(title,report,{...helpers,weekly,causes:daily.causes});
}
module.exports={makeLocalizedReportPdf};
