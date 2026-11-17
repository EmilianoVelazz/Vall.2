'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,PDFName,PDFBool,PDFArray}=require('pdf-lib');
const LOGO=path.join(__dirname,'../../assets/templates/vallnews-report-watermark.png');
const HEADER_LOGO=path.join(__dirname,'../../assets/img/brand/logo.png');
// The watermark PNG already has alpha <= 30/255; .4 yields at most 4.7%
// effective opacity, visible on white paper while leaving numbers readable.
const BRAND=Object.freeze({navy:'#082b4c',teal:'#168780',muted:'#5e7182',line:'#cfdae3',pale:'#edf5f5',watermarkOpacity:.4});
const PAGE_MARK=PDFName.of('VallnewsWatermark');
const HEADER_RECT=PDFName.of('VallnewsHeaderLogoRect'),HEADER_DONE=PDFName.of('VallnewsHeaderLogoApplied');
let watermarkTemplate,headerTemplate;
async function imageStamp(file){
    const document=await PDFDocument.create(),image=await document.embedPng(fs.readFileSync(file));
    const page=document.addPage([image.width,image.height]);
    page.drawImage(image,{x:0,y:0,width:image.width,height:image.height});
    return document.save();
}
// Decode the large, public PNG once. Subsequent documents copy its compressed
// PDF image resource instead of decoding all 13 million pixels again.
function watermarkStamp(){
    if(!watermarkTemplate)watermarkTemplate=imageStamp(LOGO).catch(error=>{watermarkTemplate=undefined;throw error;});
    return watermarkTemplate;
}
function headerStamp(){
    if(!headerTemplate)headerTemplate=imageStamp(HEADER_LOGO).catch(error=>{headerTemplate=undefined;throw error;});
    return headerTemplate;
}

function reportBrandHeader(document,label,{t=value=>value}={}){
    const x=document.page.margins.left,top=document.page.margins.top,width=document.page.width-x-document.page.margins.right;
    const identity=document._vallPdfPersonalization || {},owner=identity.organization || identity.recipientName;
    document.save();
    document.rect(0,0,document.page.width,4).fill(BRAND.navy);
    document.rect(document.page.width-96,0,96,4).fill(BRAND.teal);
    document.roundedRect(x,top-18,72,35,2).fill(BRAND.navy);
    if(document._vallDeferBrandAssets)document.page.dictionary.data.VallnewsHeaderLogoRect=[x+5,top-16,62];
    else document.image(HEADER_LOGO,x+5,top-16,{width:62});
    document.fillColor(BRAND.navy).font('Helvetica-Bold').fontSize(6.4).text(t('Inteligencia económica').toLocaleUpperCase(),x+84,top-7,{width:142,lineBreak:false,ellipsis:true,characterSpacing:.45});
    document.fillColor(BRAND.muted).font('Helvetica').fontSize(6).text(t('Informe ejecutivo'),x+84,top+4,{width:142,lineBreak:false,ellipsis:true});
    const right=x+235,rightWidth=width-235;
    document.fillColor(BRAND.navy).font('Helvetica-Bold').fontSize(6.5).text(label,right,top-6,{width:rightWidth,align:'right',lineBreak:false,ellipsis:true,characterSpacing:.25});
    if(owner)document.fillColor(BRAND.muted).font('Helvetica').fontSize(6).text(owner,right,top+5,{width:rightWidth,align:'right',lineBreak:false,ellipsis:true});
    document.moveTo(x,top+20).lineTo(x+width,top+20).strokeColor(BRAND.line).lineWidth(.6).stroke();
    document.moveTo(x,top+20).lineTo(x+40,top+20).strokeColor(BRAND.teal).lineWidth(1.8).stroke();
    document.restore();document.x=x;document.y=top+29;
}

function reportBrandFooter(document,page,{t=value=>value}={}){
    const x=document.page.margins.left,width=document.page.width-x-document.page.margins.right,y=document.page.height-document.page.margins.bottom-18;
    const identity=document._vallPdfPersonalization || {},classification=identity.confidentialityLabel || t('Uso interno'),owner=identity.organization || identity.recipientName;
    const bottom=document.page.margins.bottom;document.page.margins.bottom=0;
    document.save();
    document.moveTo(x,y-7).lineTo(x+width,y-7).strokeColor(BRAND.line).lineWidth(.5).stroke();
    document.moveTo(x,y-7).lineTo(x+24,y-7).strokeColor(BRAND.teal).lineWidth(1.5).stroke();
    document.fillColor(BRAND.muted).font('Helvetica').fontSize(5.55).text(`${classification.toLocaleUpperCase()} · VALLNEWS${owner ? ' · '+owner : ''}`,x,y,{width:width-65,lineBreak:false,ellipsis:true});
    document.roundedRect(x+width-56,y-3,56,13,2).fill(BRAND.pale);
    document.fillColor(BRAND.navy).font('Helvetica-Bold').fontSize(5.7).text(`${t('Página').toLocaleUpperCase()} ${String(page).padStart(2,'0')}`,x+width-53,y,{width:50,align:'center',lineBreak:false});
    document.restore();document.page.margins.bottom=bottom;document.x=x;document.y=document.page.margins.top+29;
}

function reportBrandWatermark(document){
    if(document._vallDeferBrandAssets)return;
    if(document.page.dictionary.data.VallnewsWatermark)return;
    const width=Math.min(402,document.page.width-90),image=document.openImage(LOGO),height=width*image.height/image.width;
    document.save();document.opacity(BRAND.watermarkOpacity);
    document.image(LOGO,(document.page.width-width)/2,(document.page.height-height)/2,{width,height});
    document.restore();document.page.dictionary.data.VallnewsWatermark=true;
}

// Run after chapter assembly, so specialist, translated and panorama pages
// receive exactly one mark above opaque chart/table fills. Text stays selectable.
async function finishReportBranding(document){
    const pages=document.getPages().filter(page=>page.node.get(PAGE_MARK)!==PDFBool.True);
    const headers=document.getPages().flatMap(page=>{
        const rect=page.node.get(HEADER_RECT);
        return rect instanceof PDFArray && page.node.get(HEADER_DONE)!==PDFBool.True ? [{page,rect:rect.asArray().map(value=>value.asNumber())}] : [];
    });
    if(!pages.length && !headers.length)return;
    if(headers.length){
        const [logo]=await document.embedPdf(await headerStamp(),[0]);
        for(const {page,rect:[x,top,width]}of headers){const height=width*logo.height/logo.width;page.drawPage(logo,{x,y:page.getHeight()-top-height,width,height});page.node.set(HEADER_DONE,PDFBool.True);}
    }
    if(!pages.length)return;
    const [logo]=await document.embedPdf(await watermarkStamp(),[0]);
    for(const page of pages){const width=Math.min(402,page.getWidth()-90),height=width*logo.height/logo.width;page.drawPage(logo,{x:(page.getWidth()-width)/2,y:(page.getHeight()-height)/2,width,height,opacity:BRAND.watermarkOpacity});page.node.set(PAGE_MARK,PDFBool.True);}
}
const prepareReportBranding=()=>Promise.all([headerStamp(),watermarkStamp()]).then(()=>undefined);
module.exports={BRAND,reportBrandHeader,reportBrandFooter,reportBrandWatermark,finishReportBranding,prepareReportBranding};
