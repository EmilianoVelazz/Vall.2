'use strict';
const {datedPoints,indexedVisual,OBSERVATION_READING}=require('./report-observations');
const {reportNumber:formatNumber,reportAxisDigits}=require('./report-number-format');
const COLORS=require('../../shared/report-chart-colors.json');
const {proteinPrintTables}=require('../../shared/report-protein-print-layout.mjs');
const {proteinLegendLabels,proteinChartTicks,proteinBarColor}=require('../../shared/report-protein-chart-style.mjs');
const {GRAIN_FAMILIES,grainHistoryColor}=require('../../shared/report-grain-chart.mjs');
const INK='#163d4b',MUTED='#586b78',LINE='#bccdd4';
const barNumber=formatNumber;
const unique=items=>[...new Map(items.filter(Boolean).map(item=>[String(item).replace(/\s+/g,' ').trim().toLocaleLowerCase('es'),item])).values()];

// Reuse the reference's composition, keeping each report's own facts and units.
function makeCompanyDashboardPdf(title,report,helpers) {
    const {layout,PDFDocument,pdfPersonalization,pdfPageHeader,pdfExecutiveFooter,pdfWatermark}=helpers;
    const weekly=helpers.weekly;
    const {chartScale,chartLogScale,chartSeriesDash,spreadChartLabels,reportLinePanels,chartLegendLabels,chartReadingIsTabulated}=helpers.chartGeometry;
    const {t=text=>text,source=text=>text,locale='es-MX'}=helpers.localization || {};
    const number=(value,digits)=>t(formatNumber(value,digits ?? (weekly?.sessionReport ? 2 : undefined)));
    const date=(value,intraday=false)=>new Date(value).toLocaleString(locale,{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'2-digit',...(intraday ? {hour:'2-digit',minute:'2-digit',hourCycle:'h23'} : {})})+(intraday ? ' UTC' : '');
    const axisDate=(value,intraday,monthly=false)=>monthly ? new Date(value).toISOString().slice(0,7) : intraday ? new Date(value).toLocaleTimeString(locale,{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' UTC' : date(value);
    return new Promise((resolve,reject)=>{
        const margin=36,pageSize=weekly ? 'A4' : 'LEGAL',pageMargins={top:margin,left:margin,right:margin,bottom:48},document=new PDFDocument({size:pageSize,margins:pageMargins,bufferPages:true,info:{Title:report.title || title,Author:'VALLNEWS',Subject:helpers.localization ? report.title : layout.label}}),chunks=[];
        document.on('data',chunk=>chunks.push(chunk));document.on('error',reject);document.on('end',()=>{const pdf=Buffer.concat(chunks);Object.defineProperty(pdf,'reportPageCount',{value:document._vallPdfPageNumber});resolve(pdf);});
        const width=document.page.width-margin*2,gap=weekly?.sessionReport ? 6 : 8,baseLabel=t(layout.collectionLabel).toUpperCase(),bottom=()=>document.page.height-78,proteinAccent=weekly?.proteinBulletin ? '#813c56' : '#193758';
        if(weekly?.focusedMarket){const path=require('node:path');document.registerFont('VallBody',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Regular.otf'));document.registerFont('VallBold',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Bold.otf'));}
        const bodyFont=(font,text)=>weekly?.focusedMarket && /^Helvetica/.test(font) && /[↑↓→]/u.test(String(text)) ? /Bold/.test(font) ? 'VallBold' : 'VallBody' : font;
        document._vallPdfPageSize=pageSize;document._vallPdfPageMargin=margin;document._vallPdfPageLabel=t('Informe').toUpperCase()+' / '+baseLabel;document._vallPdfPageNumber=1;document._vallPdfPersonalization=pdfPersonalization(report);
        document._vallPdfDataOnly=Boolean(weekly);
        document.on('pageAdded',()=>{document._vallPdfPageNumber++;pdfPageHeader(document,document._vallPdfPageLabel);pdfExecutiveFooter(document,document._vallPdfPageNumber);});
        const reset=y=>{document.x=margin;document.y=y;};
        const measure=(text,w,size=8,font='Helvetica',lineGap=1,options={})=>document.font(bodyFont(font,text)).fontSize(size).heightOfString(String(text),{width:w,lineGap,...options});
        const write=(text,x,y,w,size=8,font='Helvetica',color=INK,options={})=>document.fillColor(color).font(bodyFont(font,text)).fontSize(size).text(String(text),x,y,{width:w,lineGap:1,...options});
        const nextPage=()=>document.addPage({size:pageSize,margins:pageMargins});
        const ensure=height=>{if(document.y+height>bottom()) nextPage();};
        const band=(heading,minBody=48,tableStart=false)=>{
            heading=t(heading);
            // Reserve the heading and a readable first fragment, never a whole
            // long card. Its remaining text can continue on the next sheet.
            const reserve=Math.min(minBody,tableStart ? 140 : 70);
            document._vallPdfPageLabel=baseLabel+' / '+heading.toUpperCase();ensure(26+reserve);const y=document.y;
            document.rect(margin,y,width,20).fillAndStroke(weekly ? proteinAccent : '#f0f3f4','#6f8791');write(heading.toUpperCase(),margin+8,y+6,width-16,8.6,'Helvetica-Bold',weekly ? '#ffffff' : INK,{align:weekly ? 'left' : 'center'});reset(y+26);
        };
        // Long text is split at word boundaries. No fixed-height text boxes or ellipses.
        const flow=(heading,body,options={})=>{
            if(!body) return;
            ensure(48);const drawHeading=()=>{const y=document.y,h=measure(heading,width,9,'Helvetica-Bold');write(heading,margin,y,width,9,'Helvetica-Bold');reset(y+h+5);};
            drawHeading();
            for(const paragraph of String(body).split(/\n{2,}/).filter(Boolean)) {
                let rest=paragraph.trim();
                while(rest) {
                    const available=bottom()-document.y;
                    if(available<22) {nextPage();drawHeading();continue;}
                    let chunk=rest;
                    if(measure(chunk,width,8.2)>available) {
                        let low=0,high=rest.length;
                        while(low<high) {const mid=Math.ceil((low+high)/2);if(measure(rest.slice(0,mid),width,8.2)<=available) low=mid;else high=mid-1;}
                        let end=rest.lastIndexOf(' ',low);if(end<low*.6) end=low;
                        if(end<1) {nextPage();drawHeading();continue;}chunk=rest.slice(0,end);
                    }
                    const y=document.y,h=measure(chunk,width,8.2);write(chunk,margin,y,width,8.2,'Helvetica',INK,options);reset(y+h+5);rest=rest.slice(chunk.length).trim();
                    if(rest) {nextPage();drawHeading();}
                }
            }
            reset(document.y+5);
        };
        const pack=(items,columns,measureItem,drawItem,full)=>{
            for(let start=0;start<items.length;start+=columns) {
                const row=items.slice(start,start+columns),cellWidth=(width-gap*(row.length-1))/row.length,sizes=row.map(item=>measureItem(item,cellWidth)),height=Math.max(...sizes.map(size=>size.height));
                if(height>document.page.height-150) {row.forEach(item=>full(item));continue;}
                ensure(height+6);const y=document.y;
                row.forEach((item,i)=>drawItem(item,margin+i*(cellWidth+gap),y,cellWidth,sizes[i],height));reset(y+height+gap);
            }
        };
        const columnPack=(items,columns,measureItem,drawItem,full,{fillGaps=false,spanLast=false}={})=>{
            if(columns<2) {pack(items,1,measureItem,drawItem,full);return;}
            const cellWidth=(width-gap*(columns-1))/columns,pending=[...items];
            let cursors=Array(columns).fill(document.y);
            while(pending.length) {
                let column=cursors.indexOf(Math.min(...cursors));
                let index=0,size=measureItem(pending[0],cellWidth);
                if(fillGaps && cursors[column]+size.height+6>bottom()) {
                    // An individually titled figure may fill an earlier gap;
                    // narrative cards always retain their editorial sequence.
                    const fitting=pending.findIndex(item=>cursors[column]+measureItem(item,cellWidth).height+6<=bottom());
                    if(fitting>=0){index=fitting;size=measureItem(pending[index],cellWidth);}
                }
                const [item]=pending.splice(index,1);
                if(spanLast && !pending.length) {
                    const wide=measureItem(item,width),top=Math.max(...cursors),narrowEnd=Math.max(...cursors,cursors[column]+size.height);
                    if(top+wide.height<=narrowEnd+gap && top+wide.height+6<=bottom()) {
                        drawItem(item,margin,top,width,wide,wide.height);cursors.fill(top+wide.height+gap);continue;
                    }
                }
                if(cursors[column]+size.height+6>bottom()) {
                    const wide=measureItem(item,width),top=Math.max(...cursors);
                    if(top+wide.height+6<=bottom()) {
                        drawItem(item,margin,top,width,wide,wide.height);cursors.fill(top+wide.height+gap);continue;
                    }
                }
                if(size.height+6>bottom()-(margin+29)) {
                    reset(Math.max(...cursors));full(item);cursors.fill(document.y);continue;
                }
                if(cursors[column]+size.height+6>bottom()) {
                    reset(Math.max(...cursors));nextPage();cursors=Array(columns).fill(document.y);column=0;
                    if(spanLast && !pending.length) {
                        const wide=measureItem(item,width);
                        if(document.y+wide.height+6<=bottom()) {
                            const y=document.y;drawItem(item,margin,y,width,wide,wide.height);cursors.fill(y+wide.height+gap);continue;
                        }
                    }
                }
                if(cursors[column]+size.height+6>bottom()) {
                    // A figure that needs a wider column retains its full data.
                    reset(Math.max(...cursors));full(item);cursors.fill(document.y);continue;
                }
                drawItem(item,margin+column*(cellWidth+gap),cursors[column],cellWidth,size,size.height);
                cursors[column]+=size.height+gap;
            }
            reset(Math.max(...cursors));
        };
        const bodyParts=text=>weekly?.sessionReport ? String(text).split(/\n{2,}/) : [String(text)];
        const bodyMeasure=(text,w,size)=>{const parts=bodyParts(text);return parts.reduce((sum,part)=>sum+measure(part,w,size),0)+Math.max(0,parts.length-1)*3;};
        const textSize=(item,w)=>({heading:measure(t(item.heading),w-12,item.compact ? 7.4 : 8.5,'Helvetica-Bold'),body:bodyMeasure(item.body,w-12,item.compact ? 6.8 : 8.2),get height(){return this.heading+this.body+(item.compact ? 7 : 13);}});
        const textDraw=(item,x,y,w,size)=>{
            document.rect(x,y,w,size.height).fillAndStroke('#ffffff',LINE);write(t(item.heading),x+6,y+(item.compact ? 2 : 4),w-12,item.compact ? 7.4 : 8.5,'Helvetica-Bold');
            let cursor=y+size.heading+(item.compact ? 5 : 8);const fontSize=item.compact ? 6.8 : 8.2;
            for(const paragraph of bodyParts(item.body)) {write(paragraph,x+6,cursor,w-12,fontSize,'Helvetica',INK,item.link ? {link:item.link} : {});cursor+=measure(paragraph,w-12,fontSize)+3;}
        };
        const rowTextPanels=(items,columns=2)=>{
            // Unlike figures, narrative cards are not atomic. Fill the current
            // sheet before continuing, retaining every word and each link.
            for(let start=0;start<items.length;start+=columns) {
                let pending=items.slice(start,start+columns).map(item=>({...item}));
                while(pending.length) {
                    const cellWidth=(width-gap*(pending.length-1))/pending.length;
                    const sizes=pending.map(item=>textSize(item,cellWidth)),available=bottom()-document.y;
                    if(available<Math.max(48,...sizes.map(size=>size.heading+30))) {nextPage();continue;}
                    const continuing=sizes.filter(size=>size.height>available).length,continuationWidth=(width-gap*Math.max(0,continuing-1))/Math.max(1,continuing);
                    const y=document.y,remaining=[];let used=0;
                    pending.forEach((item,i)=>{
                        const space=available-sizes[i].heading-(item.compact ? 7 : 13),bodyFont=item.compact ? 6.8 : 8.2;
                        let end=item.body.length;
                        if(sizes[i].height>available) {
                            let low=0,high=end;
                            while(low<high) {const mid=Math.ceil((low+high)/2);if(bodyMeasure(item.body.slice(0,mid),cellWidth-12,bodyFont)<=space) low=mid;else high=mid-1;}
                            end=item.body.lastIndexOf(' ',low);if(end<low*.6) end=low;
                            // Do not leave a few words alone under a repeated
                            // heading. Reserve two lines in the continuation.
                            const minimumTail=measure('A\nA',continuationWidth-12,bodyFont);
                            while(end>1 && bodyMeasure(item.body.slice(end).trimStart(),continuationWidth-12,bodyFont)<minimumTail) {const word=item.body.lastIndexOf(' ',end-1);end=word>0 ? word : end-1;}
                        }
                        if(end<1) {remaining.push(item);return;}
                        const fragment={...item,body:item.body.slice(0,end).trimEnd()},size=textSize(fragment,cellWidth);
                        textDraw(fragment,margin+i*(cellWidth+gap),y,cellWidth,size);used=Math.max(used,size.height);
                        const rest=item.body.slice(end).trimStart();if(rest) remaining.push({...item,body:rest});
                    });
                    reset(y+used+gap);pending=remaining;
                    if(pending.length) nextPage();
                }
            }
        };
        const textPanels=(items,columns=2)=>{
            const pending=items.filter(item=>item.body).map(item=>({...item,heading:t(item.heading)}));
            if(columns<2 || pending.length<2){rowTextPanels(pending,1);return;}
            const w=(width-gap*(columns-1))/columns,minimumBody=measure('A\nA',w-12,8.2);
            // Unequal introductions need unequal widths, not an empty rectangle
            // beneath a short summary. Keep both cards legible and on one row.
            if(pending.length===2 && columns===2) {
                const equal=Math.max(...pending.map(item=>textSize(item,w).height));
                let best={height:equal,widths:[w,w]};
                for(const ratio of [.36,.42,.58,.64]) {
                    const widths=[(width-gap)*ratio,(width-gap)*(1-ratio)],height=Math.max(...pending.map((item,i)=>textSize(item,widths[i]).height));
                    if(height<best.height)best={height,widths};
                }
                if(best.height<=bottom()-document.y) {
                    const y=document.y;let x=margin;
                    pending.forEach((item,i)=>{textDraw(item,x,y,best.widths[i],textSize(item,best.widths[i]));x+=best.widths[i]+gap;});reset(y+best.height+gap);return;
                }
            }
            while(pending.length) {
                const top=document.y,available=bottom()-top;
                const total=pending.reduce((sum,item)=>sum+textSize(item,w).height+gap,0);
                // Balance the final spread without separating a card's heading
                // from its body. Earlier spreads fill every available column.
                let limit=available;
                if(total<=available*columns)limit=Math.min(available,Math.ceil(total/columns)+28);
                else {
                    // Share a short closing tail with the preceding spread,
                    // so a continued paragraph does not occupy a page alone.
                    const capacity=(bottom()-margin-29)*columns;
                    const overflow=total-available*columns;
                    const tail=overflow%capacity || capacity,target=capacity*.4;
                    if(tail<target)limit=Math.max(Math.min(available,120),available-(target-tail)/columns);
                }
                const cursors=Array(columns).fill(top);let column=0;
                while(pending.length && column<columns) {
                    const item=pending[0],size=textSize(item,w),space=Math.min(top+limit,bottom())-cursors[column];
                    if(pending.length===1) {
                        const wide=textSize(item,width),wideTop=Math.max(...cursors);
                        if(wideTop+wide.height+6<=bottom() && (size.height>space || wideTop+wide.height<=Math.max(...cursors,cursors[column]+size.height))) {
                            textDraw(item,margin,wideTop,width,wide);cursors.fill(wideTop+wide.height+gap);pending.shift();break;
                        }
                    }
                    const font=item.compact ? 6.8 : 8.2,padding=item.compact ? 7 : 13;
                    if(space<size.heading+minimumBody+padding){column++;continue;}
                    let end=item.body.length;
                    if(size.height>space) {
                        let low=0,high=end;
                        while(low<high){const middle=Math.ceil((low+high)/2);if(bodyMeasure(item.body.slice(0,middle),w-12,font)<=space-size.heading-padding)low=middle;else high=middle-1;}
                        const paragraph=item.body.lastIndexOf('\n\n',low);
                        end=paragraph>low*.65 ? paragraph : item.body.lastIndexOf(' ',low);
                        if(end<low*.5)end=low;
                        while(end>1 && bodyMeasure(item.body.slice(end).trimStart(),w-12,font)<minimumBody){const previous=item.body.lastIndexOf(' ',end-1);end=previous>0 ? previous : end-1;}
                    }
                    if(end<1){column++;continue;}
                    const fragment={...item,body:item.body.slice(0,end).trimEnd()},fragmentSize=textSize(fragment,w);
                    textDraw(fragment,margin+column*(w+gap),cursors[column],w,fragmentSize);cursors[column]+=fragmentSize.height+gap;
                    const rest=item.body.slice(end).trimStart();
                    if(rest){pending[0]={...item,body:rest,heading:item.continuing ? item.heading : item.heading+' / '+t('Continuación'),continuing:true};column++;}
                    else pending.shift();
                }
                reset(Math.max(...cursors));
                if(pending.length)nextPage();
            }
        };
        const openingHeight=(items,columns,size)=>{
            const row=items.slice(0,columns),w=(width-gap*(row.length-1))/(row.length || 1),height=Math.max(0,...row.map(item=>size(item,w).height));
            return height>document.page.height-150 ? 48 : height+6;
        };
        const sessionNarrative=items=>{
            const cards=items.filter(item=>item.body);
            const singleHeight=cards.reduce((sum,item)=>sum+textSize(item,width).height+gap,0);
            if(singleHeight<=bottom()-document.y) {rowTextPanels(cards,1);return;}
            textPanels(cards,2);
        };
        pdfPageHeader(document,t('Informe').toUpperCase()+' / '+baseLabel);pdfExecutiveFooter(document,1);
        const heading=String(report.title || title || layout.label).replace(/\s+/g,' '),y=document.y,titleHeight=measure(heading,width-20,14,'Helvetica-Bold');
        document.rect(margin,y,width,titleHeight+19).fillAndStroke(weekly ? proteinAccent : '#f0f3f4','#6f8791');write(heading,margin+10,y+4,width-20,14,'Helvetica-Bold',weekly ? '#ffffff' : INK,{align:weekly ? 'left' : 'center'});
        const cut=Number.isFinite(Date.parse(report.generatedAt)) ? new Date(report.generatedAt).toLocaleString(locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}) : t('Fecha no disponible');
        write(t('Corte')+': '+cut,margin+10,y+titleHeight+9,width-20,6.7,'Helvetica',weekly ? '#dce6f2' : MUTED,{align:'right'});reset(y+titleHeight+24);
        const identity=document._vallPdfPersonalization;
        const meta=(weekly ? [identity.recipientName,identity.organization] : [identity.audience,identity.recipientName,identity.organization,identity.horizon,t(({brief:'Breve y accionable',detailed:'Detallado con evidencia',standard:'Estándar'})[identity.depth] || ''),report.baseReport?.title ? t('Base')+': '+report.baseReport.title : '']).filter(Boolean).join(' / ');
        if(meta) {const y=document.y,h=measure(meta,width,7);write(meta,margin,y,width,7,'Helvetica',MUTED);reset(y+h+7);}
        if(!weekly) {
        band('Lectura del periodo');
        textPanels([{heading:t('Resumen ejecutivo'),body:report.summary},...(report.objective ? [{heading:t('Objetivo de la lectura'),body:report.objective}] : [])].filter(item=>item.body));
        if(report.decisionGuide) textPanels([{heading:report.decisionGuide.heading,body:[report.decisionGuide.action,report.decisionGuide.horizonNote,report.decisionGuide.coverageNote].filter(Boolean).join('\n')}]);
        }
        const normalizeCell=value=>String(value ?? '').replace(/\s+puntos$/i,'').replace(/\s+/g,' ').trim();
        const sameCell=(a,b)=>normalizeCell(a)===normalizeCell(b) || /^[-+]?\d+(?:\.\d+)?%$/.test(normalizeCell(a)) && /^[-+]?\d+(?:\.\d+)?%$/.test(normalizeCell(b)) && parseFloat(a)===parseFloat(b);
        const representedMetrics=new Set();
        if(layout.collection==='finance' && layout.key==='equities') for(const table of report.tables || []) {
            const label=table.columns.findIndex(column=>/^Referencia$/i.test(source(column))),value=table.columns.findIndex(column=>/^(Último|Cierre)/i.test(source(column))),change=table.columns.findIndex(column=>/^Día/i.test(source(column)));
            if(label<0 || value<0 || change<0) continue;
            for(const metric of report.metrics) if(table.rows.some(row=>row[label]===metric.label && sameCell(row[value],metric.value) && sameCell(row[change],metric.change))) representedMetrics.add(metric);
        }
        const printedMetrics=weekly ? report.metrics : report.metrics.filter(metric=>!representedMetrics.has(metric));
        const drawMetrics=()=>{
        if(printedMetrics.length===1 && representedMetrics.size && !weekly) {
            const metric=printedMetrics[0],body=t('Indicadores del corte').toUpperCase()+' · '+[metric.label,metric.value,metric.change].filter(Boolean).join(' · '),height=measure(body,width,8.2,'Helvetica-Bold');
            ensure(height+8);const y=document.y;write(body,margin,y,width,8.2,'Helvetica-Bold');reset(y+height+8);
        } else if(printedMetrics.length) {
            if(!weekly) band('Indicadores del corte');
            const size=(item,w)=>{
                return {label:measure(item.label,w-10,7.2,'Helvetica-Bold'),value:measure(item.value,w-10,8.8,'Helvetica-Bold'),change:item.change ? measure(item.change,w-10,6.8) : 0,get height(){return this.label+this.value+this.change+(this.change ? 16 : 12)+(weekly ? 6 : 0);}};
            };
            pack(printedMetrics,4,size,(item,x,y,w,s,height)=>{document.rect(x,y,w,height).fillAndStroke(weekly ? '#f1f5fa' : '#ffffff',LINE);if(weekly) document.rect(x,y,w,s.label+8).fill('#315785');write(item.label,x+5,y+4,w-10,7.2,'Helvetica-Bold',weekly ? '#ffffff' : MUTED);const offset=weekly ? 6 : 0;write(item.value,x+5,y+s.label+7+offset,w-10,8.8,'Helvetica-Bold');if(item.change) write(item.change,x+5,y+s.label+s.value+10+offset,w-10,6.8,'Helvetica',MUTED);},item=>flow(item.label,[item.value,item.change].filter(Boolean).join('\n')));
        }
        };
        if(!weekly) drawMetrics();
        const visuals=[...(report.visuals || [])];
        if(!weekly && !visuals.length && layout.collection==='finance' && layout.key==='equities' && report.personalization?.sections?.charts!==false) for(const region of ['América','Europa','Asia']) {
            const visual=indexedVisual('Bolsa de '+region+' · evolución relativa',(report.equitySeries || []).filter(item=>item.region===region && item.symbol!=='^VIX').map(item=>({label:item.label,series:item.points})),'',report.generatedAt);if(visual) visuals.push(visual);
        }
        // Integrate only the standard derived table whose rows can be matched
        // exactly to a displayed series. Unmatched/custom evidence stays intact.
        const comparison=(report.tables || []).find(table=>source(table.title)==='Comparaciones calculadas de las gráficas' && table.columns.length===6);
        const integratedRows=new Set();
        const pair=value=>String(value).split(' / ').map(part=>Number(part.replace(/,/g,'')));
        const close=(a,b)=>Number.isFinite(a) && Math.abs(a-b)<=Math.max(.0000000051,Math.abs(b)*1e-12);
        const matches=(row,series,visual)=>{
            const points=series.points,first=points[0],last=points.at(-1),ends=pair(row[2]),range=pair(row[4]);
            return source(row[0])===source(series.label)+' · '+source(visual.title) && row[5]===visual.unit && source(row[1])===first.date+' a '+last.date+' · '+points.length+' datos' && close(ends[0],first.value) && close(ends[1],last.value) && close(range[0],Math.min(...points.map(point=>point.value))) && close(range[1],Math.max(...points.map(point=>point.value)));
        };
        const panels=[];
        for(const visual of [...visuals,...(weekly?.mexicoAdditionalVisuals || []).map(item=>({...item,mexicoSupplementary:true}))]) {
            if(visual.yieldCurve) {panels.push(visual);continue;}
            if(visual.type==='bar') {
                const bars=(visual.bars || []).filter(item=>visual.dailyComparison || Number.isFinite(item.value)),limit=weekly?.mexicoExecutive?.key==='mx_bolsa' ? 14 : weekly?.sessionReport ? 12 : 9,count=Math.ceil(bars.length/limit);
                for(let i=0;i<bars.length;i+=limit) panels.push({...visual,bars:bars.slice(i,i+limit),allBars:bars,title:visual.title+(count>1 ? ' / '+(i/limit+1)+' de '+count : ''),note:i+limit>=bars.length ? visual.note : ''});
            } else {
                const series=(visual.series || []).map(item=>({...item,points:datedPoints(item.points)})).filter(item=>visual.fxOverview || item.points.length>1 || visual.dailyComparison && item.points.length===1);
                if(visual.globalComparison && (series.length>4 || visual.energyHistoryOverview)){
                    const limit=visual.grainHistoryOverview ? 48 : 42;
                    for(let offset=0;offset<series.length;offset+=limit)panels.push({...visual,series:series.slice(offset,offset+limit),seriesOffset:offset,historyStrips:true,title:visual.title+(series.length>limit ? ' · '+(Math.floor(offset/limit)+1)+'/'+Math.ceil(series.length/limit) : ''),intraday:false,reading:offset+limit>=series.length ? [t(visual.grainHistoryOverview ? 'Escala propia por fila. * Historia que empieza después de 2020; consulte su fecha base en la tabla maestra.' : visual.energyHistoryOverview ? 'Cada fila tiene su propia escala vertical. Los códigos corresponden a la tabla maestra; las historias parciales no rellenan años sin datos.' : 'Cada fila tiene su propia escala. Compara los rangos y últimos valores; la altura del trazo no mide cuál bolsa subió más.'),visual.reading].filter(Boolean).join(' ') : ''});
                    continue;
                }
                if(series.length)for(const part of reportLinePanels({...visual,series})){
                    const last=!part.densityPanel || part.panelIndex===part.panelCount-1,evidence=part.series.map(series=>comparison?.rows.find(row=>matches(row,series,visual)));
                    panels.push({...part,evidence,note:last ? part.note : '',reading:last && !chartReadingIsTabulated(visual) ? part.reading : '',intraday:part.series.some(item=>item.points.some(point=>point.date.includes('T')))});
                }
            }
        }
        const formatBar=(item,bar)=>bar.value===null ? t('Sin dato') : item.yieldMovement ? (bar.value>0 ? '+' : '')+number(bar.value,2)+' pb' : item.sessionMovement ? (bar.value>0 ? '+' : '')+number(bar.value,2)+' %' : (item.fxOverview && bar.value>0 ? '+' : '')+barNumber(bar.value,item.displayDigits)+(item.fxOverview ? ' %' : '');
        const chartSize=(item,w)=>{
            const heading=measure(item.title,w-16,8.3,'Helvetica-Bold'),unit=measure(t('Unidad')+': '+(item.unit || t('No declarada'))+(item.proteinCatalogChart ? ' · '+t('Catálogo de respaldo') : '')+(item.historyStrips ? '\n'+t(item.grainHistoryOverview ? 'Color por producto · escala propia' : 'Escala propia por referencia') : item.densityPanel ? '\n'+t('Escala propia del panel') : '')+(item.source ? '\n'+t('Fuentes')+': '+item.source : ''),w-16,6.8),note=item.reading ? measure(item.reading,w-16,7)+10 : 0;
            if(item.yieldCurve) {
                const values=item.curvePoints.flatMap(point=>[point.value,point.previous]).filter(Number.isFinite),ticks=chartScale(values).ticks.length;
                const plotHeight=Math.max(72,(ticks-1)*12);return {heading,unit,note,plotHeight,height:heading+unit+note+plotHeight+76};
            }
            if(item.historyStrips){
                const labelWidth=Math.min(160,(w-16)*.32),rangeWidth=item.grainHistoryOverview ? 0 : 82,valueWidth=item.grainHistoryOverview ? 67 : 43,plotWidth=w-16-labelWidth-rangeWidth-valueWidth-16;
                const rows=item.series.map(series=>{const label=item.grainHistoryOverview || item.energyHistoryOverview ? series.shortLabel+(item.grainHistoryOverview && series.partialHistory ? ' *' : '') : series.label+(series.baseDate ? ' · '+series.baseDate : '');return {label,height:Math.max(item.energyHistoryOverview ? 33 : 13,measure(label,labelWidth-5,item.grainHistoryOverview ? 7 : 6.6)+3)};});
                return {heading,unit,note,rows,labelWidth,rangeWidth,valueWidth,plotWidth,height:heading+unit+note+rows.reduce((sum,row)=>sum+row.height,0)+57};
            }
            if(item.type==='bar') {
                // Reservar el ancho real de la cifra antes de distribuir la
                // etiqueta y la barra. Una cantidad no se divide entre líneas.
                const valueWidth=Math.max((w-16)*.21-3,...item.allBars.map(bar=>document.font('Helvetica').fontSize(6.6).widthOfString(formatBar(item,bar))+3));
                const desired=Math.max(36,...item.allBars.map(bar=>document.font('Helvetica').fontSize(6.8).widthOfString(bar.date && !item.proteinHistorical ? date(bar.date) : bar.label)+5));
                const labelWidth=Math.max(24,Math.min(desired,(w-16)*(weekly?.proteinBulletin ? .46 : .35),w-16-valueWidth-30)),barWidth=w-16-labelWidth-valueWidth-9;
                const rows=item.bars.map(bar=>{
                    const index=item.allBars.indexOf(bar),group=bar.reference && (!index || item.allBars[index-1].reference!==bar.reference),groupHeight=group ? measure(bar.reference,w-16,7,'Helvetica-Bold')+7 : 0,label=bar.date && !item.proteinHistorical ? date(bar.date) : bar.label;
                    return {bar,label,group,groupHeight,height:groupHeight+Math.max(weekly?.sessionReport ? 17 : 20,measure(label,labelWidth,6.8)+7,measure(formatBar(item,bar),valueWidth,6.6)+7)};
                });
                return {heading,unit,note,rows,labelWidth,valueWidth,barWidth,height:heading+unit+note+rows.reduce((sum,row)=>sum+row.height,0)+46};
            }
            if(weekly?.sessionReport) {
                const twoDates=item.series.every(series=>series.points.length<=2),ticks=chartScale(item.series.flatMap(series=>series.points.map(point=>point.value))).ticks.length;
                const plotHeight=item.proteinChart ? 110 : item.globalComparison && !item.densityPanel ? 140 : twoDates ? Math.max(76,(ticks-1)*14) : 108;
                const aliases=item.proteinChart ? proteinLegendLabels(item.series) : chartLegendLabels(item.series),legendLabels=item.series.map((series,index)=>aliases[index]+(item.globalComparison && series.baseDate ? ' · '+series.baseDate : ''));
                const legendColumns=item.proteinChart ? 1 : 2,legendRows=[];
                for(let i=0;i<legendLabels.length;i+=legendColumns)legendRows.push(Math.max(12,...legendLabels.slice(i,i+legendColumns).map(label=>measure(label,(w-16)/legendColumns-(item.proteinChart ? 72 : 26),6.6)+3)));
                return {heading,unit,note,plotHeight,sessionLegend:true,legendLabels,legendRows,legendColumns,height:heading+unit+note+plotHeight+legendRows.reduce((sum,row)=>sum+row,0)+43};
            }
            if(item.fxOverview) return {heading,unit,note,plotHeight:130,fxLegend:true,height:heading+unit+130+Math.ceil(item.series.length/3)*25+57};
            const integrated=item.evidence?.some(Boolean),widths=(integrated ? [.30,.24,.25,.21] : [.44,.28,.28]).map(fraction=>(w-16)*fraction),headers=(integrated ? ['Referencia','Inicio / cierre','Cambio tramo','Rango'] : ['Referencia','Último dato','Cambio tramo']).map(label=>t(label));
            const commonPeriod=integrated ? item.evidence.find(Boolean)[1] : '',period=commonPeriod ? measure(commonPeriod,w-16,6.3)+4 : 0;
            const header=Math.max(...headers.map((label,i)=>measure(label,widths[i]-6,6.3,'Helvetica-Bold')))+7;
            const rows=item.series.map((series,i)=>{
                if(!series.points.length) {
                    const cells=[series.label,t('Sin dato'),t('No calculable')],cellsHeight=Math.max(18,...cells.map((cell,index)=>measure(cell,widths[index]-11,6.6)+6));
                    return {cells,extraPeriod:'',cellsHeight,height:cellsHeight};
                }
                const evidence=item.evidence?.[i];
                if(evidence) {
                    const change=(parseFloat(evidence[3])>0 && !String(evidence[3]).startsWith('+') ? '+' : '')+evidence[3];
                    const cells=[series.label,evidence[2],change,evidence[4]],extraPeriod=evidence[1]===commonPeriod ? '' : evidence[1];
                    const cellsHeight=Math.max(...cells.map((cell,n)=>measure(cell,widths[n]-(n ? 4 : 9),6.3)+6));
                    return {evidence,cells,extraPeriod,cellsHeight,height:cellsHeight+(extraPeriod ? measure(extraPeriod,w-26,6.3)+4 : 0)};
                }
                const first=series.points[0],last=series.points.at(-1),delta=last.value-first.value,change=item.dailyComparison && series.points.length<2 ? null : item.unit==='%' ? delta : first.value>0 ? delta/first.value*100 : null,cells=integrated ? [series.label,number(first.value)+' / '+number(last.value),change===null ? t('No calculable') : number(change)+(item.unit==='%' ? ' p. p.' : '%'),number(Math.min(...series.points.map(point=>point.value)))+' / '+number(Math.max(...series.points.map(point=>point.value)))] : [series.label,number(last.value)+'\n'+date(last.timestamp,item.intraday),change===null ? t('No calculable') : (change>0 ? '+' : '')+number(change)+(item.unit==='%' ? ' p. p.' : '%')];
                const ownPeriod=helpers.localization ? t('Periodo y datos',{start:first.date,end:last.date,count:series.points.length}) : first.date+' a '+last.date+' · '+series.points.length+' datos',extraPeriod=integrated && ownPeriod!==commonPeriod ? ownPeriod : '',cellsHeight=Math.max(18,...cells.map((cell,i)=>measure(cell,widths[i]-(i ? 6 : 11),6.6)+6));
                return {cells,extraPeriod,cellsHeight,height:cellsHeight+(extraPeriod ? measure(extraPeriod,w-26,6.3)+4 : 0)};
            });
            const plotHeight=item.fxOverview ? 130 : weekly ? 101 : 94;
            return {heading,unit,note,period,commonPeriod,widths,headers,header,rows,plotHeight,height:heading+unit+note+period+header+rows.reduce((sum,row)=>sum+row.height,0)+139+plotHeight-83};
        };
        const chartDraw=(item,x,y,w,size)=>{
            if(item.proteinChart)document.lineWidth(.6);
            document.roundedRect(x,y,w,size.height,6).fillAndStroke('#ffffff','#cbd8e6');write(item.title,x+8,y+6,w-16,8.3,'Helvetica-Bold');let cursor=y+size.heading+10;
            if(item.grainHistoryOverview && item.historyStrips){
                write(t('Unidad')+': '+item.unit,x+8,cursor,w-16,6.8,'Helvetica',MUTED);
                let legendX=x+8;for(const [family,label] of GRAIN_FAMILIES.filter(([family])=>item.series.some(series=>series.grainFamily===family))){const text=t(label),color=grainHistoryColor({grainFamily:family});document.circle(legendX+2,cursor+13,1.8).fill(color);const legendWidth=document.font('Helvetica').fontSize(6.5).widthOfString(text);write(text,legendX+8,cursor+9,legendWidth+2,6.5,'Helvetica',MUTED);legendX+=legendWidth+17;}
            }else write(t('Unidad')+': '+(item.unit || t('No declarada'))+(item.proteinCatalogChart ? ' · '+t('Catálogo de respaldo') : '')+(item.historyStrips ? '\n'+t('Escala propia por referencia') : item.densityPanel ? '\n'+t('Escala propia del panel') : '')+(item.source ? '\n'+t('Fuentes')+': '+item.source : ''),x+8,cursor,w-16,6.8,'Helvetica',MUTED);
            cursor+=size.unit+9;
            if(item.historyStrips){
                const plotX=x+8+size.labelWidth+4,rangeX=plotX+size.plotWidth+5,valueX=x+w-8-size.valueWidth;
                const times=item.series.flatMap(series=>series.points.map(point=>point.timestamp)),first=item.grainHistoryOverview || item.energyHistoryOverview ? Date.UTC(2020,0,1) : Math.min(...times),last=Math.max(...times),span=last-first;
                write((item.grainHistoryOverview || item.energyHistoryOverview) ? t('Referencia · código de tabla') : t('Referencia')+' / '+t('Fecha base'),x+8,cursor,size.labelWidth-4,6.5,'Helvetica-Bold');write(t('Evolución'),plotX,cursor,size.plotWidth,6.5,'Helvetica-Bold');if(size.rangeWidth)write(t((item.grainHistoryOverview || item.energyHistoryOverview) ? 'Índice · rango' : 'Rango'),rangeX,cursor,size.rangeWidth,6.5,'Helvetica-Bold');write(t(item.grainHistoryOverview ? 'Desde su base' : item.energyHistoryOverview ? 'Índice final' : 'Último'),valueX,cursor,size.valueWidth,6.5,'Helvetica-Bold',INK,{align:'right'});cursor+=13;
                item.series.forEach((series,index)=>{
                    const row=size.rows[index],ordinal=index+(item.seriesOffset || 0),color=item.grainHistoryOverview ? grainHistoryColor(series) : COLORS[ordinal%COLORS.length],values=series.points.map(point=>point.value),scale=item.energyHistoryOverview ? chartScale(values) : chartLogScale(values),top=cursor+2,plotHeight=row.height-4;
                    document.rect(x+6,cursor,w-12,row.height).fill(index%2 ? '#f1f5f8' : '#ffffff');
                    if(item.grainHistoryOverview || item.energyHistoryOverview)for(let year=2020;year<=new Date(last).getUTCFullYear();year++){const tx=plotX+(Date.UTC(year,0,1)-first)/span*size.plotWidth;document.moveTo(tx,cursor).lineTo(tx,cursor+row.height).strokeColor('#dce4ea').lineWidth(.3).stroke();}
                    if(item.energyHistoryOverview && scale.min<0 && scale.max>0){const zero=top+scale.max/(scale.max-scale.min)*plotHeight;document.save().dash(2,{space:2}).moveTo(plotX,zero).lineTo(plotX+size.plotWidth,zero).lineWidth(.35).strokeColor('#a3acb4').stroke().restore();}
                    if(item.grainHistoryOverview)document.roundedRect(x+8,cursor+3,2,Math.max(4,row.height-6),1).fill(color);
                    write(row.label,x+(item.grainHistoryOverview ? 14 : 8),cursor+2,size.labelWidth-(item.grainHistoryOverview ? 11 : 5),item.grainHistoryOverview ? 7 : 6.6);
                    if(item.grainHistoryOverview){const yy=value=>top+(1-scale.position(value))*plotHeight,coordinates=series.points.map(point=>({x:plotX+(span ? (point.timestamp-first)/span : .5)*size.plotWidth,y:yy(point.value)}));document.save().dash(2,{space:3}).moveTo(plotX,yy(100)).lineTo(plotX+size.plotWidth,yy(100)).strokeColor('#b8c5ce').lineWidth(.35).stroke().restore();document.save().moveTo(coordinates[0].x,top+plotHeight);for(const point of coordinates)document.lineTo(point.x,point.y);document.lineTo(coordinates.at(-1).x,top+plotHeight).closePath().fillOpacity(.09).fill(color).restore();}
                    series.points.forEach((point,n)=>{const xx=plotX+(span ? (point.timestamp-first)/span : .5)*size.plotWidth,yy=top+(1-(scale.position ? scale.position(point.value) : (point.value-scale.min)/(scale.max-scale.min)))*plotHeight;if(n)document.lineTo(xx,yy);else document.moveTo(xx,yy);});document.strokeColor(color).lineWidth(.9).stroke();
                    if(item.grainHistoryOverview){const last=series.points.at(-1),lastX=plotX+(span ? (last.timestamp-first)/span : .5)*size.plotWidth,lastY=top+(1-scale.position(last.value))*plotHeight,change=last.value-100;document.circle(lastX,lastY,1.4).fill(color);write((change>0 ? '+' : '')+number(change,1)+' %',valueX,cursor+2,size.valueWidth,7,'Helvetica-Bold',change<0 ? '#946c64' : change>0 ? '#657455' : MUTED,{align:'right'});}else{write(number(Math.min(...values),1)+' / '+number(Math.max(...values),1),rangeX,cursor+2,size.rangeWidth-4,6.4,'Helvetica',MUTED);write(number(values.at(-1),1),valueX,cursor+2,size.valueWidth,6.6,'Helvetica-Bold',INK,{align:'right'});}cursor+=row.height;
                });
                if(item.grainHistoryOverview || item.energyHistoryOverview){for(let year=2020;year<=new Date(last).getUTCFullYear();year++){const tx=plotX+(Date.UTC(year,0,1)-first)/span*size.plotWidth;write(year,tx-4,cursor+3,25,6,'Helvetica',MUTED);}}
                else{write(axisDate(first,false),plotX,cursor+3,size.plotWidth/2,6,'Helvetica',MUTED);write(axisDate(last,false),plotX+size.plotWidth/2,cursor+3,size.plotWidth/2,6,'Helvetica',MUTED,{align:'right'});}
                if(item.reading)write(item.reading,x+8,y+size.height-size.note+2,w-16,7,'Helvetica',INK);
                return;
            }
            if(item.yieldCurve) {
                const points=item.curvePoints,values=points.flatMap(point=>[point.value,point.previous]).filter(Number.isFinite),scale=chartScale(values),plotX=x+31,plotWidth=w-42,plotHeight=size.plotHeight;
                const xx=index=>plotX+index/(points.length-1 || 1)*plotWidth,yy=value=>cursor+(scale.max-value)/(scale.max-scale.min)*plotHeight;
                scale.ticks.forEach(value=>{document.moveTo(plotX,yy(value)).lineTo(plotX+plotWidth,yy(value)).lineWidth(.4).strokeColor('#dce5ef').stroke();write(number(value,2),x+2,yy(value)-3,25,6,'Helvetica',MUTED,{align:'right'});});
                for(const [field,color] of [['previous','#8c9fb7'],['value','#315785']]) {
                    if(!points.every(point=>Number.isFinite(point[field]))) continue;
                    points.forEach((point,index)=>{if(index) document.lineTo(xx(index),yy(point[field]));else document.moveTo(xx(index),yy(point[field]));});document.lineWidth(1.2).strokeColor(color).stroke();
                    points.forEach((point,index)=>document.circle(xx(index),yy(point[field]),1.7).fill(color));
                }
                points.forEach((point,index)=>write(point.label,xx(index)-11,cursor+plotHeight+4,22,5.8,'Helvetica',MUTED,{align:'center'}));
                document.rect(x+8,cursor+plotHeight+20,5,3).fill('#315785');
                write(t('Actual')+': '+item.currentDate,x+16,cursor+plotHeight+18,w/2-20,6.2,'Helvetica',MUTED);
                if(item.previousDate) {document.rect(x+w/2,cursor+plotHeight+20,5,3).fill('#8c9fb7');write(t('Anterior')+': '+item.previousDate,x+w/2+8,cursor+plotHeight+18,w/2-16,6.2,'Helvetica',MUTED);}
                write(t('Plazos ordenados con separación uniforme'),x+8,cursor+plotHeight+29,w-16,6.2,'Helvetica',MUTED);
                if(item.reading) write(item.reading,x+8,y+size.height-size.note+2,w-16,7,'Helvetica',INK);
                return;
            }
            if(item.type==='bar') {
                const signed=item.fxOverview || item.allBars.some(bar=>bar.value<0),scale=chartScale(item.allBars.map(bar=>bar.value),{zero:true,symmetric:signed}),max=Math.max(Math.abs(scale.min),Math.abs(scale.max)),barX=x+8+size.labelWidth+3,barWidth=size.barWidth;
                size.rows.forEach(row=>{
                    const bar=row.bar,index=item.allBars.indexOf(bar),color=proteinBarColor(item,bar) || (item.sessionMovement ? bar.value<0 ? '#9a6d65' : '#78856a' : COLORS[index%(item.dailyComparison && !item.fxOverview ? 2 : COLORS.length)]),middle=barX+(signed ? barWidth/2 : 0),length=bar.value===null ? 0 : Math.abs(bar.value)/max*barWidth/(signed ? 2 : 1);
                    if(row.group) {write(bar.reference,x+8,cursor,w-16,7,'Helvetica-Bold');cursor+=row.groupHeight;}
                    write(row.label,x+8,cursor,size.labelWidth,6.8);document.roundedRect(barX,cursor+2,barWidth,8,2).fill('#edf2f8');
                    [0,.25,.5,.75,1].forEach(fraction=>document.moveTo(barX+fraction*barWidth,cursor+2).lineTo(barX+fraction*barWidth,cursor+10).strokeColor('#d5dfeb').lineWidth(.4).stroke());
                    document.moveTo(middle,cursor-1).lineTo(middle,cursor+13).strokeColor('#8c9fb7').lineWidth(.5).stroke();
                    if(length) document.roundedRect(bar.value<0 ? middle-length : middle,cursor+2,length,8,Math.min(2,length/2)).fill(color);
                    if(bar.value===0) document.circle(middle,cursor+6,1.8).fill(color);
                    write(formatBar(item,bar),x+w-8-size.valueWidth,cursor,size.valueWidth,6.6,'Helvetica-Bold',INK,{align:'right'});cursor+=row.height-row.groupHeight;
                });
                if(item.allBars.some(bar=>Number.isFinite(bar.value))) {const width=barWidth/3;write(number(signed ? -max : 0),barX,cursor+3,width,6,'Helvetica',MUTED);write(number(signed ? 0 : max/2),barX+width,cursor+3,width,6,'Helvetica',MUTED,{align:'center'});write((signed ? '+' : '')+number(max),barX+width*2,cursor+3,width,6,'Helvetica',MUTED,{align:'right'});}
                cursor+=22;
            } else {
                const times=[...new Set(item.dailyComparison && item.dailyDates?.length===2 ? item.dailyDates.map(Date.parse) : item.series.flatMap(series=>series.points.map(point=>point.timestamp)))].sort((a,b)=>a-b),first=times[0],span=times.at(-1)-first,values=item.series.flatMap(series=>series.points.map(point=>point.value)),scale=item.globalComparison && !item.energyHistoryOverview ? chartLogScale(values) : chartScale(values),{min,max,ticks}=scale;
                const axisDigits=reportAxisDigits(min,max),axisLabels=ticks.map(value=>number(value,axisDigits));
                const axisWidth=Math.max(30,...axisLabels.map(label=>document.font('Helvetica').fontSize(6.3).widthOfString(label)));
                const plotX=x+axisWidth+7,plotWidth=w-axisWidth-15-(item.fxOverview && values.length ? 87 : 0),plotHeight=size.plotHeight,plotY=cursor;
                const xx=time=>plotX+(span ? (time-first)/span : .5)*plotWidth,yy=value=>plotY+(1-(scale.position ? scale.position(value) : (value-min)/(max-min)))*plotHeight;
                document.roundedRect(plotX,plotY,plotWidth,plotHeight,3).fill('#f8fafc');
                ticks.forEach(value=>{const y=yy(value);document.moveTo(plotX,y).lineTo(plotX+plotWidth,y).strokeColor(value===100 && item.fxOverview ? '#8c9fb7' : '#dce5ef').lineWidth(.45).stroke();write(number(value,axisDigits),x+2,y-3,axisWidth,6.3,'Helvetica',MUTED,{align:'right'});});
                if(item.proteinChart && item.indexBaseDate && min<=100 && max>=100){document.moveTo(plotX,yy(100)).lineTo(plotX+plotWidth,yy(100)).dash(3).lineWidth(.7).strokeColor('#9aa8b1').stroke().undash();}
                if(item.proteinChart && item.series.length===1){
                    const points=item.series[0].points,color=COLORS[(item.seriesOrdinals?.[0] ?? item.seriesOffset ?? 0)%COLORS.length];
                    document.save().moveTo(xx(points[0].timestamp),plotY+plotHeight);
                    points.forEach(point=>document.lineTo(xx(point.timestamp),yy(point.value)));
                    document.lineTo(xx(points.at(-1).timestamp),plotY+plotHeight).closePath().fillOpacity(.09).fill(color).restore();
                }
                item.series.forEach((series,i)=>{
                    if(!series.points.length)return;const ordinal=item.seriesOrdinals?.[i] ?? i+(item.seriesOffset || 0),color=COLORS[ordinal%COLORS.length],dash=chartSeriesDash(ordinal,COLORS.length,item.globalComparison).split(' ').map(Number);
                    document.strokeColor(color).lineWidth(item.proteinChart ? 1.9 : 1.5);if((item.fxOverview || item.globalComparison) && dash[0]) document.dash(dash);
                    series.points.forEach((point,n)=>{if(n) document.lineTo(xx(point.timestamp),yy(point.value));else document.moveTo(xx(point.timestamp),yy(point.value));});document.stroke().undash();
                    const markers=item.dailyComparison ? series.points : [series.points.at(-1)];
                    markers.forEach(point=>{document.circle(xx(point.timestamp),yy(point.value),2.3);if(item.dailyComparison && point.timestamp===first) document.fillAndStroke('#ffffff',color);else document.fillAndStroke(color,'#ffffff');});
                });
                if(item.fxOverview && values.length) {
                    const labels=spreadChartLabels(item.series.flatMap((series,i)=>{const point=series.points.find(point=>point.timestamp===times.at(-1));return point ? [{label:series.label,index:i,value:point.value,actualY:yy(point.value),y:yy(point.value)}] : [];}),plotY+4,plotY+plotHeight-4,13);
                    labels.forEach(label=>{const color=COLORS[(label.index+(item.seriesOffset || 0))%COLORS.length];document.moveTo(plotX+plotWidth+3,label.actualY).lineTo(plotX+plotWidth+10,label.y).lineWidth(.5).strokeColor(color).stroke();write(label.label.replace(/^USD\//,'')+'  '+number(label.value,Math.max(2,axisDigits)),plotX+plotWidth+13,label.y-3,74,6.5,'Helvetica-Bold',color);});
                }
                if(!values.length) write(t('Sin datos comparables para estas fechas'),plotX,plotY+plotHeight/2,plotWidth,7,'Helvetica',MUTED,{align:'center'});
                if(item.proteinChart || item.energyFeature){
                    const long=times.at(-1)-first>540*86400000,marks=proteinChartTicks(first,times.at(-1),plotWidth);
                    marks.forEach((time,index)=>{const left=index===0 ? xx(time) : index===marks.length-1 ? xx(time)-48 : xx(time)-24,label=long ? String(new Date(time).getUTCFullYear()) : new Date(time).toLocaleDateString(locale,{month:'short',day:'2-digit',timeZone:'UTC'});write(label,left,plotY+plotHeight+5,48,6.3,'Helvetica',MUTED,{align:index===0 ? 'left' : index===marks.length-1 ? 'right' : 'center'});});
                }else{write(axisDate(first,item.intraday,item.monthly),plotX,plotY+plotHeight+5,58,6,'Helvetica',MUTED);write(axisDate(times.at(-1),item.intraday,item.monthly),plotX+plotWidth-58,plotY+plotHeight+5,58,6,'Helvetica',MUTED,{align:'right'});}
                cursor+=plotHeight+21;
                if(size.sessionLegend) {
                    if(item.proteinChart){
                        item.series.forEach((series,index)=>{const ordinal=item.seriesOrdinals?.[index] ?? index+(item.seriesOffset || 0),color=COLORS[ordinal%COLORS.length],top=cursor+size.legendRows.slice(0,index).reduce((sum,height)=>sum+height,0),value=series.points.at(-1).value;document.moveTo(x+8,top+4).lineTo(x+21,top+4).lineWidth(1.9).strokeColor(color).stroke();write(size.legendLabels[index],x+26,top,w-88,6.6);write(number(value,Math.max(2,axisDigits)),x+w-56,top,48,7,'Helvetica-Bold',color,{align:'right'});});
                        if(item.reading)write(item.reading,x+8,y+size.height-size.note+2,w-16,7,'Helvetica',INK);
                        return;
                    }
                    const cellWidth=(w-16)/2,offsets=[0];for(const row of size.legendRows)offsets.push(offsets.at(-1)+row);
                    item.series.forEach((series,i)=>{const ordinal=item.seriesOrdinals?.[i] ?? i+(item.seriesOffset || 0),left=x+8+(i%2)*cellWidth,top=cursor+offsets[Math.floor(i/2)],dash=chartSeriesDash(ordinal,COLORS.length,item.globalComparison).split(' ').map(Number);document.strokeColor(COLORS[ordinal%COLORS.length]).lineWidth(1.4);if((item.globalComparison || item.fxOverview) && dash[0])document.dash(dash);document.moveTo(left,top+4).lineTo(left+18,top+4).stroke().undash();write(size.legendLabels[i],left+24,top,cellWidth-26,6.6);});
                    if(item.reading) write(item.reading,x+8,y+size.height-size.note+2,w-16,7,'Helvetica',INK);
                    return;
                }
                if(size.fxLegend) {
                    const cellWidth=(w-16)/3;
                    item.series.forEach((series,i)=>{const column=i%3,row=Math.floor(i/3),left=x+8+column*cellWidth,top=cursor+row*25,point=series.points.find(point=>point.timestamp===times.at(-1));document.roundedRect(left,top,cellWidth-5,21,3).fill('#f1f5fa');document.rect(left+5,top+5,3,11).fill(COLORS[(i+(item.seriesOffset || 0))%COLORS.length]);write(series.label,left+12,top+3,cellWidth-19,6.5,'Helvetica-Bold');write(point ? number(point.value) : t('Sin dato'),left+12,top+11,cellWidth-19,6.4,'Helvetica',MUTED);});
                    return;
                }
                if(size.commonPeriod) {write(size.commonPeriod,x+8,cursor,w-16,6.3,'Helvetica',MUTED);cursor+=size.period;}
                document.rect(x+8,cursor,w-16,size.header).fill(INK);let left=x+8;
                size.headers.forEach((label,i)=>{write(label,left+3,cursor+3,size.widths[i]-6,6.3,'Helvetica-Bold','#ffffff');left+=size.widths[i];});cursor+=size.header;
                size.rows.forEach((row,i)=>{
                    document.rect(x+8,cursor,w-16,row.height).fill(i%2 ? '#edf4f6' : '#ffffff');
                    let left=x+8;row.cells.forEach((cell,n)=>{if(n===0) document.rect(left+2,cursor+5,3,6).fill(COLORS[i%COLORS.length]);write(cell,left+(n ? 2 : 7),cursor+3,size.widths[n]-(n ? 4 : 9),row.evidence ? 6.3 : 6.6);left+=size.widths[n];});
                    if(row.extraPeriod) write(row.extraPeriod,x+18,cursor+row.cellsHeight,w-26,6.3,'Helvetica',MUTED);
                    if(row.evidence) integratedRows.add(row.evidence);
                    cursor+=row.height;
                });cursor+=5;
            }
            if(item.reading) write(item.reading,x+8,y+size.height-size.note+2,w-16,7,'Helvetica',INK);
        };
        const drawCharts=(items=panels,withHeading=true,introduction='')=>{
            if(!items.length)return;
            const columns=items.some(item=>(item.fxOverview || item.globalComparison) && !item.densityPanel) ? 1 : weekly ? Math.min(2,items.length) : Math.min(3,items.length);
            const chartBlock=weekly?.blocks.find(block=>block.key===((weekly?.commodityExecutive || weekly?.mexicoExecutive) || !items.every(item=>item.executiveLead) ? 'charts' : 'leadChart')),chartHeading=chartBlock?.label || t('Gráficas y lectura de la sesión');
            const note=introduction ? t('Metodología de las gráficas')+': '+introduction : '';
            const noteHeight=note ? measure(note,width,7.2)+8 : 0,opening=openingHeight(items,columns,chartSize);
            if(withHeading){
                if(weekly?.sessionReport){document._vallPdfPageLabel=baseLabel+' / '+chartHeading.toUpperCase();ensure(26+noteHeight+opening);}
                band(weekly?.sessionReport ? (weekly.focusedMarket ? chartBlock?.number || '4' : '2')+' · '+chartHeading : weekly ? '1.1 · '+t('Evolución y comparaciones') : layout.chartHeading,noteHeight+opening);
            }
            // A shared reading note introduces its figures. It cannot spill
            // onto a mostly empty final page after the last chart.
            if(note){ensure(noteHeight+opening);const y=document.y;write(note,margin,y,width,7.2,'Helvetica',MUTED);reset(y+noteHeight);}
            const full=item=>{const size=chartSize(item,width);ensure(size.height+6);const y=document.y;chartDraw(item,margin,y,width,size);reset(y+size.height+gap);};
            if(weekly?.proteinPurchasing && items.length===3){pack(items.slice(0,2),2,chartSize,chartDraw,full);full(items[2]);}
            else columnPack(items,columns,chartSize,chartDraw,full,{fillGaps:true,spanLast:true});
        };
        const finishMexicoCharts=()=>{
            const pending=panels.filter(item=>item.mexicoSupplementary && !(item.series?.length===1 && new Set(item.series[0].points.map(point=>point.value)).size<2)),cw=(width-gap)/2;let heading=false;
            while(pending.length){
                const room=bottom()-document.y-(heading ? 0 : 26)-gap,eligible=pending.filter(item=>chartSize(item,cw).height<=room).slice(0,2);
                if(!eligible.length)break;
                const sizes=eligible.map(item=>chartSize(item,eligible.length===1 ? width : cw)),height=Math.max(...sizes.map(size=>size.height));
                if(height>room)break;
                if(!heading){band(t('Comparativas adicionales · mismo corte'),height);heading=true;}
                const y=document.y;
                eligible.forEach((item,index)=>{chartDraw(item,margin+index*(cw+gap),y,eligible.length===1 ? width : cw,sizes[index]);pending.splice(pending.indexOf(item),1);});
                reset(y+height+gap);
            }
        };
        if(!weekly) drawCharts();
        // Wide methodology text does not enlarge all three chart columns.
        // Keep it once, alongside the detailed evidence later in the document.
        const methods=visuals.filter(visual=>visual.note).map(visual=>({heading:visual.title,body:visual.note,compact:true}));
        if(integratedRows.size) methods.unshift({heading:comparison.title,body:comparison.note,compact:true});
        const quality=report.sections.filter(section=>source(section.heading)==='Calidad y cobertura del corte');
        const invalidComparisons=quality.length ? (comparison?.rows || []).filter(row=>!integratedRows.has(row) && row.slice(2,5).every(cell=>source(cell)==='No calculable')) : [];
        if(quality.length && !weekly) {
            textPanels(quality.map(section=>({heading:section.heading,body:section.text+(invalidComparisons.length ? '\n'+t('Respaldo sin comparación')+': '+invalidComparisons.map(row=>row[0]+'. '+row[1]+'. '+t('Unidad')+': '+row[5]+'. '+t('No calculable')+'.').join(' ') : '')})),1);
            invalidComparisons.forEach(row=>integratedRows.add(row));
        }
        const tables=(report.tables || []).map(table=>table===comparison ? {...table,note:integratedRows.size ? '' : table.note,rows:table.rows.filter(row=>!integratedRows.has(row))} : table).filter(table=>table.rows.length).map(table=>{
            if(layout.collection==='finance' && layout.key==='equities' && table.columns.some(column=>/^Referencia$/i.test(source(column))) && table.columns.some(column=>/^Último$/i.test(source(column)))) return {...table,note:t('Cierres en puntos; variaciones en %.')+' '+(table.note || '')};
            if(layout.key!=='mx_proteins' || !/referencias estatales/i.test(source(table.title))) return table;
            const groups=new Map();
            for(const row of table.rows) if(/^No disponible$/i.test(source(String(row[1])).trim())) {
                const key=JSON.stringify(row.slice(1));if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(row[0]);
            }
            if(![...groups.values()].some(states=>states.length>=6)) return table;
            const seen=new Set(),rows=[];
            for(const row of table.rows) {
                const key=JSON.stringify(row.slice(1)),states=groups.get(key);
                if(/^No disponible$/i.test(source(String(row[1])).trim()) && states?.length>=6) {if(seen.has(key)) continue;seen.add(key);rows.push([states.join(', '),...row.slice(1)]);}
                else rows.push(row);
            }
            return {...table,columns:[t('Estado / entidades agrupadas'),...table.columns.slice(1)],rows,note:table.note+' '+(helpers.localization ? t('Nota de agrupación') : 'Las entidades sin dato se agrupan sólo cuando todos sus demás campos son idénticos; se nombran todos los estados. Las cotizaciones disponibles conservan su fila individual.')};
        });
        if(!tables.length && layout.key==='equities' && report.personalization?.sections?.tables!==false && report.equitySeries?.length) tables.push({title:t('Cierres de las referencias'),columns:['Referencia','Región','Cierre · puntos','Día · %','Fecha del dato'].map(label=>t(label)),rows:report.equitySeries.map(item=>[item.label,item.region,number(item.value),number(item.performance.day),item.points.at(-1)?.date || t('Sin fecha')])});
        const compactMexicoTable=item=>{
            if(!weekly?.mexicoExecutive)return item;
            const hidden=new Set(),unit=item.columns.findIndex(column=>source(column)==='Unidad'),presentation=weekly.mexicoExecutive.key==='mx_proteins' ? item.columns.findIndex(column=>source(column)==='Etapa / presentación') : -1;
            const common=index=>index>=0 && item.rows.length && item.rows[0][index] && new Set(item.rows.map(row=>row[index])).size===1;
            let title=item.title,note=item.note;
            if(common(unit)){hidden.add(unit);title+=' · '+item.rows[0][unit];}
            if(common(presentation)){hidden.add(presentation);note=[note,t('Etapa / presentación')+': '+item.rows[0][presentation]+'.'].filter(Boolean).join(' ');}
            return hidden.size ? {...item,title,note,columns:item.columns.filter((_,index)=>!hidden.has(index)),rows:item.rows.map(row=>row.filter((_,index)=>!hidden.has(index)))} : item;
        };
        const grainTable=weekly?.commodityExecutive?.key==='grains',energyTable=Boolean(weekly?.energyExecutive),dataFirst=grainTable || energyTable;
        const cellLabel=cell=>dataFirst ? String(cell ?? '').replace(/^[↑↓→]\s*/u,'') : String(cell ?? '');
        const cellArrow=cell=>dataFirst ? String(cell ?? '').match(/^[↑↓→]/u)?.[0] : null;
        const rowSize=(cells,widths,header=false)=>Math.max(header ? 18 : weekly?.sessionReport ? 13 : 15,...widths.map((w,i)=>measure(cellLabel(cells[i]),w-8-(cellArrow(cells[i]) ? 7 : 0),header ? 7 : 7.2,header ? 'Helvetica-Bold' : 'Helvetica')+(!header && grainTable ? 3 : weekly?.sessionReport && !header ? 5 : 7)));
        const tableSize=(item,w)=>{
            // Allocate by content: dates and percentages need less room than
            // names and explanations. Preserve a readable minimum per column.
            const desired=item.columns.map((label,i)=>Math.min(item.columns.length<=3 ? w*.6 : 155,Math.max(36,...[label,...item.rows.map(row=>row[i] || '')].map(cell=>Math.max(...String(cell).split('\n').map(line=>document.font(bodyFont('Helvetica',cell)).fontSize(7.2).widthOfString(line)))+9))));
            const floor=Math.min(36,w/item.columns.length),flex=desired.map(size=>Math.max(0,size-floor)),total=flex.reduce((a,b)=>a+b,0);
            const widths=item.printColumnFractions?.length===item.columns.length ? item.printColumnFractions.map(value=>value*w) : desired.map((_,i)=>floor+(w-floor*desired.length)*(total ? flex[i]/total : 1/desired.length));
            return {widths,heading:measure(item.title,w,9,'Helvetica-Bold'),note:item.note ? measure(item.note,w,6.8) : 0,header:rowSize(item.columns,widths,true),rows:item.rows.map(row=>rowSize(row,widths)),get height(){return this.heading+this.note+this.header+this.rows.reduce((a,b)=>a+b,0)+15;}};
        };
        const tableRow=(cells,x,y,widths,header=false,index=0)=>{const h=rowSize(cells,widths,header);let left=x;for(let i=0;i<widths.length;i++) {
            document.rect(left,y,widths[i],h).fillAndStroke(header ? weekly?.proteinBulletin ? '#ead3df' : INK : index%2 ? weekly?.proteinBulletin ? '#fbf3f7' : '#eef4f6' : '#ffffff','#d2dde2');
            const arrow=header ? null : cellArrow(cells[i]),color=header ? weekly?.proteinBulletin ? '#633047' : '#ffffff' : arrow==='↑' ? '#657455' : arrow==='↓' ? '#946c64' : INK;
            if(arrow){const ax=left+6,ay=y+6;document.save().lineWidth(.6).strokeColor(color).fillColor(color);if(arrow==='→')document.moveTo(ax-2,ay).lineTo(ax+2,ay).stroke();else{const direction=arrow==='↑' ? -1 : 1;document.moveTo(ax,ay-2*direction).lineTo(ax,ay+direction).stroke();document.moveTo(ax,ay+3*direction).lineTo(ax-2,ay).lineTo(ax+2,ay).closePath().fill();}document.restore();}
            write(cellLabel(cells[i]),left+4+(arrow ? 7 : 0),y+3,widths[i]-8-(arrow ? 7 : 0),header ? 7 : 7.2,header ? 'Helvetica-Bold' : 'Helvetica',color);left+=widths[i];
        }return h;};
        const tableDraw=(item,x,y,w,size)=>{write(item.title,x,y,w,9,'Helvetica-Bold');let cursor=y+size.heading+5;if(item.note && !item.proteinQuote) {write(item.note,x,cursor,w,6.8,'Helvetica',MUTED);cursor+=size.note+5;}cursor+=tableRow(item.columns,x,cursor,size.widths,true);item.rows.forEach((row,i)=>{cursor+=tableRow(row,x,cursor,size.widths,false,i);});if(item.proteinQuote && item.note)write(item.note,x,cursor+5,w,6.8,'Helvetica',MUTED);};
        const fullTable=(item,footerReserve=0)=>{
            const size=tableSize(item,width),firstRows=size.rows.slice(0,2),openingRows=firstRows.reduce((a,b)=>a+b,0)<=70 ? firstRows : firstRows.slice(0,1);ensure(size.heading+size.note+size.header+openingRows.reduce((a,b)=>a+b,0)+12);
            let y=document.y;write(item.title,margin,y,width,9,'Helvetica-Bold');y+=size.heading+5;if(item.note) {write(item.note,margin,y,width,6.8,'Helvetica',MUTED);y+=size.note+5;}y+=tableRow(item.columns,margin,y,size.widths,true);
            item.rows.forEach((row,i)=>{if(y+size.rows[i]+(i===item.rows.length-1 ? footerReserve : 0)>bottom() || i===item.rows.length-2 && size.rows[i]+size.rows[i+1]<=70 && y+size.rows[i]+size.rows[i+1]+footerReserve>bottom()) {nextPage();y=document.y;write(item.title+' / '+(helpers.localization ? t('Continuación') : 'continuación'),margin,y,width,8,'Helvetica-Bold');y+=15;if(item.printContinuationContext){write(item.printContinuationContext,margin,y,width,6.8,'Helvetica',MUTED);y+=measure(item.printContinuationContext,width,6.8)+4;}y+=tableRow(item.columns,margin,y,size.widths,true);}y+=tableRow(row,margin,y,size.widths,false,i);});reset(y+gap);
        };
        const renderTables=items=>{
            const small=[];const flush=()=>{
                // A lone short protein board has no partner for a second
                // column. Use the sheet width instead of leaving half empty.
                if(small.length===1 && ['proteins','grains'].includes(weekly?.commodityExecutive?.key)){fullTable(small.shift());return;}
                if(small.length)columnPack(small.splice(0),2,tableSize,tableDraw,fullTable,{fillGaps:true});
            };
            for(const original of items) {
                let item=compactMexicoTable(original);
                const miningColumn=weekly?.mexicoExecutive?.key==='mx_production' ? item.columns.findIndex(column=>source(column)==='Valor (MXN)') : -1;
                if(miningColumn>=0){
                    item={...item,printColumnFractions:[.43,.35,.22],columns:item.columns.map((column,index)=>index===miningColumn ? t('Valor · miles de millones MXN') : source(column)==='Participación (%)' ? t('Part. %') : column),rows:item.rows.map(row=>row.map((cell,index)=>index===miningColumn ? ((value)=>value.toLocaleString('es-MX',value!==0 && Math.abs(value)<.001 ? {maximumSignificantDigits:3} : {maximumFractionDigits:3}))(Number(String(cell).replaceAll(',',''))/1e9) : cell)),note:[item.note,t('Valores mineros en miles de millones de MXN; tres decimales o tres cifras significativas para importes menores a 0.001. Cifras originales en anexos y Excel.')].filter(Boolean).join(' ')};
                }
                if(item.columns.length<=4 && item.rows.length<=10 && (!item.note || item.note.length<240)) {small.push(item);continue;}
                flush();
                if((weekly?.mexicoExecutive?.key==='mx_production' && item.columns.length===3 || weekly?.mexicoExecutive?.key==='mx_proteins' && item.columns.length<=4) && item.rows.length>10){
                    // Complete boards share a page; no orphaned final rows,
                    // reduced type size or changes to crop/state observations.
                    const columns=miningColumn>=0 || item.availabilityProduction && item.rows.length>40 ? 3 : 2,chunk=Math.ceil(item.rows.length/columns);
                    if(item.note){const h=measure(item.note,width,6.8);ensure(h+60);const y=document.y;write(item.note,margin,y,width,6.8,'Helvetica',MUTED);reset(y+h+5);}
                    const parts=Array.from({length:columns},(_,index)=>({...item,rows:item.rows.slice(index*chunk,(index+1)*chunk),note:''})).filter(part=>part.rows.length);
                    columnPack(parts,columns,tableSize,tableDraw,fullTable,{fillGaps:true});continue;
                }
                const financial=item.columns.length<=9 && item.columns.some(column=>/^Referencia$/i.test(source(column))) && item.columns.some(column=>/^(Último|Cierre)/i.test(source(column)));
                if(item.columns.length<=6 || financial || weekly?.sessionReport && item.columns.length===7 || weekly?.focusedMarket && item.columns.length<=9) fullTable(item);
                else {
                    // An old report started with Región, which is not a row
                    // identity. Repeat the actual reference in every group.
                    let identity=item.columns.findIndex(column=>/^(Referencia|Producto|Estado|Entidad|Serie)$/i.test(source(column)));
                    if(identity<0) identity=0;
                    const fields=item.columns.map((_,i)=>i).filter(i=>i!==identity),groups=Math.ceil(fields.length/5);
                    for(let start=0;start<fields.length;start+=5) {const indices=[identity,...fields.slice(start,start+5)];fullTable({...item,title:item.title+' / '+(helpers.localization ? t('Grupo')+' '+(start/5+1)+' / '+groups : 'grupo '+(start/5+1)+' de '+groups),columns:indices.map(i=>item.columns[i]),rows:item.rows.map(row=>indices.map(i=>row[i]))});}
                }
            }
            flush();
        };
        const renderProteinSheets=()=>{
            const proteinCharts=items=>drawCharts(items,false);
            for(const sheet of weekly.proteinSheets) {
                const body=sheet.observation+'\n\n'+sheet.scope;
                // A full-width summary lets long tables use the entire sheet;
                // a fixed commentary column would remain empty beside them.
                document._vallPdfPageLabel=baseLabel+' / '+sheet.label.toUpperCase();band(sheet.label);flow(sheet.heading,body);
                renderTables(sheet.tables);proteinCharts(panels.filter(item=>item.proteinFamily===sheet.id));
            }
            if(weekly.supplementaryTables.length){document._vallPdfPageLabel=baseLabel+' / '+t('Oferta y contexto').toUpperCase();renderTables(weekly.supplementaryTables);}
        };
        const drawCauses=()=>{
            const annex=helpers.causes || weekly?.causes;if(!annex) return;
            const intro=[annex.period,annex.status,annex.conditions,annex.coverage].filter(Boolean).join('\n');
            ensure(96);
            band((weekly ? '2' : 'A')+' · '+t('Causas y consecuencias'));
            flow(t('Comparación diaria'),intro);
            for(const group of annex.groups) {
                flow(group.label,[group.origin,t('Posibles causas por contrastar')+': '+group.factors,t('Qué verificar')+': '+group.check].join('\n'));
                const caption=group.link ? t('Base del mecanismo')+': '+group.link.label : '',height=caption ? measure(caption,width,6.8) : 0;
                fullTable({title:t('Movimiento e impacto posible'),columns:[t('Referencia'),t('Cambio observado'),t('Consecuencias posibles')],rows:group.rows.map(row=>[row.reference,row.movement+'\n'+row.values.replace(' → ',' / '),row.impact])},caption ? height+gap+3 : 0);
                if(group.link) {
                    // A short citation must not reserve a whole narrative card
                    // and push a lone link onto an otherwise empty last page.
                    ensure(height+3);const y=document.y;write(caption,margin,y,width,6.8,'Helvetica',MUTED,{link:group.link.url});reset(y+height+5);
                }
            }
        };
        if(weekly) {
            if(weekly.focusedMarket){
                band('1 · '+t(weekly.blocks.find(block=>block.key==='session')?.label || 'Resumen de la sesión'));
                if(weekly.commodityExecutive || weekly.mexicoExecutive)columnPack(weekly.summaryPanels,2,textSize,textDraw,item=>flow(item.heading,item.body),{spanLast:true});else textPanels(weekly.summaryPanels,2);
                const lead=(weekly.commodityExecutive || weekly.mexicoExecutive) ? panels.filter(item=>!item.mexicoSupplementary) : panels.filter(item=>item.executiveLead),details=(weekly.commodityExecutive || weekly.mexicoExecutive) ? [] : panels.filter(item=>!item.executiveLead);
                if(!weekly.proteinPurchasing && !dataFirst)drawCharts(lead,true,(weekly.chartNotes || []).join(' '));
                const resultTables=weekly.commodityExecutive?.key==='proteins' ? proteinPrintTables(weekly.results,{t,source}) : weekly.results;
                const prices=resultTables.filter(table=>!table.derivatives).map(compactMexicoTable),derivatives=resultTables.filter(table=>table.derivatives);
                const primary=dataFirst ? prices.filter(table=>table.printGroup==='market-levels') : prices,comparisons=dataFirst ? prices.filter(table=>table.printGroup!=='market-levels') : [];
                if(primary.length){const first=tableSize(primary[0],width),rows=first.rows.slice(0,2),opening=first.heading+first.note+first.header+(rows.reduce((sum,height)=>sum+height,0)<=70 ? rows.reduce((sum,height)=>sum+height,0) : rows[0] || 0)+12;ensure(26+opening);band((weekly.blocks.find(block=>block.key==='comparisons')?.number || '3')+' · '+t('Tablas y comparaciones'),opening,true);fullTable(primary[0]);renderTables(primary.slice(1));}
                if(grainTable && !weekly.grainGlobalHistory){drawCharts(lead,true,(weekly.chartNotes || []).join(' '));renderTables(comparisons);}
                if(energyTable)renderTables(comparisons);
                if(weekly.proteinPurchasing)drawCharts(lead,true,(weekly.chartNotes || []).join(' '));
                if(derivatives.length){const first=tableSize(derivatives[0],width);band((weekly.blocks.find(block=>block.key==='derivatives')?.number || '4')+' · '+t(weekly.blocks.find(block=>block.key==='derivatives')?.label || 'Call, put e interés abierto'),first.heading+first.note+first.header+first.rows.slice(0,2).reduce((sum,height)=>sum+height,0),true);derivatives.forEach(table=>fullTable(table));}
                if(grainTable && weekly.grainGlobalHistory){drawCharts(lead.filter(item=>!item.grainHistoryOverview),true);drawCharts(lead.filter(item=>item.grainHistoryOverview),true,(weekly.chartNotes || []).join(' '));}
                if(energyTable){const features=lead.filter(item=>!item.energyHistoryOverview);drawCharts(features,true);drawCharts(lead.filter(item=>item.energyHistoryOverview),!features.length,(weekly.chartNotes || []).join(' '));}
                const miniatures=details.filter(item=>!item.globalComparison),global=details.filter(item=>item.globalComparison);
                drawCharts(miniatures,true,lead.length ? '' : (weekly.chartNotes || []).join(' '));drawCharts(global,!miniatures.length,lead.length ? '' : (weekly.chartNotes || []).join(' '));
                if(weekly.mexicoExecutive)finishMexicoCharts();pdfWatermark(document);document.end();return;
            }
            if(weekly.sessionReport) {
                band('1 · '+t(weekly.blocks.find(block=>block.key==='session')?.label || 'Resumen de la sesión'));
                textPanels(weekly.commentary.slice(0,2),2);
                drawMetrics();
                if(weekly.proteinBulletin)flow(t('Cobertura de América'),weekly.proteinCountries.map(item=>item.label+': '+(item.count ? item.count+' '+t('referencias físicas con precio') : t('Sin precio reciente disponible'))).join(' · '));
                if(weekly.results.length) {band('1.2 · '+t(weekly.blocks.find(block=>block.key==='comparisons')?.label || 'Cierres y variaciones'));if(weekly.proteinBulletin)renderProteinSheets();else renderTables(weekly.results);}
                if(!weekly.proteinBulletin || !weekly.results.length)drawCharts();
                if(weekly.commentary[2]) {
                    document._vallPdfPageLabel=baseLabel+' / '+t('Causas y consecuencias').toUpperCase();
                    ensure(96);
                }
                band((weekly.proteinBulletin && weekly.results.length ? '2' : weekly.visuals.length ? '3' : '2')+' · '+t('Causas y consecuencias'));
                sessionNarrative([...weekly.commentary.slice(2),...(weekly.followup.length ? [{heading:weekly.followupHeading,body:weekly.followup.map(item=>'- '+item).join('\n\n')}] : [])]);
                pdfWatermark(document);document.end();return;
            }
            const withUnits=items=>items.map(item=>({...item,note:[item.unit ? t('Unidad')+': '+item.unit : '',item.period ? t('Periodo')+': '+item.period : ''].filter(Boolean).join(' · ')}));
            const block=key=>weekly.blocks.find(item=>item.key===key);
            const tableOpening=table=>{if(!table) return 48;const size=tableSize(table,width);return size.heading+size.note+size.header+size.rows.slice(0,3).reduce((sum,height)=>sum+height,0)+12;};
            const drawBlock=(key,firstTable)=>{const item=block(key);if(item) band(item.number+' · '+t(key==='results' ? layout.label : item.label),tableOpening(firstTable),Boolean(firstTable));};
            drawBlock('results');drawMetrics();
            const evidence=withUnits(tables);
            drawCharts();
            if(weekly.results.length) {
                band('1.2 · '+t('Resultado actual y comparación disponible'),tableOpening(withUnits(weekly.results)[0]),true);
                renderTables(withUnits(weekly.results));
            }
            if(block('history')) {
                drawBlock('history',withUnits(weekly.history)[0] || evidence[0]);renderTables(withUnits(weekly.history));
                renderTables(evidence);
            }
            if(block('statistics')) {drawBlock('statistics',withUnits(weekly.statistics)[0]);renderTables(withUnits(weekly.statistics));}
            drawCauses();pdfWatermark(document);document.end();return;
        }
        const evidence=tables.filter(table=>table.kind!=='guide').flatMap(table=>{
            if(source(table.title)!=='Comparaciones calculadas de las gráficas' || table.columns.length!==6) return [table];
            const groups=new Map();
            for(const row of table.rows) {
                const visual=visuals.find(visual=>source(String(row[0])).endsWith(' · '+source(visual.title)));
                if(!visual) return [table];
                const key=visual.title+'\0'+row[5];
                if(!groups.has(key)) groups.set(key,{title:table.title+' / '+visual.title,columns:['Serie',...table.columns.slice(1,5)],rows:[],note:'Unidad: '+row[5]+'.'});
                const label=source(row[0]).slice(0,-(' · '+source(visual.title)).length);
                groups.get(key).rows.push([helpers.localization ? helpers.localization.translateText(label) : label,...row.slice(1,5)]);
            }
            const result=[...groups.values()];if(result[0]) result[0].note=table.note+' '+result[0].note;return result;
        }),guides=tables.filter(table=>table.kind==='guide');
        if(evidence.length) {const first=tableSize(evidence[0],width);band('Detalle de referencias',first.heading+first.note+first.header+first.rows.slice(0,3).reduce((a,b)=>a+b,0)+12,true);renderTables(evidence);}
        // Remove only a guide's exact prose duplicate; edited analysis remains intact.
        const guideBodies=guides.map(table=>table.rows.map(row=>source(row[0])+': '+source(row[1])+'\nInformación a contrastar o solicitar: '+source(row[2])+'.').join('\n\n').replace(/\s+/g,' ').trim());
        const notes=(report.tables || []).map(table=>String(table.note || '').replace(/\s+/g,' ').trim()).filter(Boolean);
        const sections=report.sections.filter(section=>!quality.includes(section) && !guideBodies.includes(source(section.text).replace(/\s+/g,' ').trim())).map(section=>({...section,text:section.text.split(/\n{2,}/).filter(part=>!notes.includes(part.replace(/\s+/g,' ').trim())).join('\n\n')})).filter(section=>section.text && !(comparison && integratedRows.size===comparison.rows.length && source(section.text).replace(/\s+/g,' ').trim()===OBSERVATION_READING));
        if(sections.length) {const items=sections.map(section=>({heading:section.heading.toUpperCase(),body:section.text}));band('Análisis para el destinatario',openingHeight(items,2,textSize));textPanels(items);}
        const brief=report.executiveBrief;
        const conclusions=[{heading:t('Hechos y señales'),body:unique([...report.takeaways,...(brief?.mode==='ai' ? brief.drivers || [] : [])]).map(item=>'- '+item).join('\n\n')},...(report.personalization?.sections?.risks===false ? [] : [{heading:t('Riesgos a monitorear'),body:unique([...report.watchlist,...(brief?.mode==='ai' ? brief.risks || [] : [])]).map(item=>'- '+item).join('\n\n')}]),{heading:t('Acciones y seguimiento'),body:report.closing}].filter(item=>item.body);
        if(conclusions.length) {band('Conclusiones',openingHeight(conclusions,Math.min(3,conclusions.length),textSize));textPanels(conclusions,3);}
        if(guides.length) {
            const first=guides[0],caption=[first.title,first.note].filter(Boolean).join(' · ');
            const items=first.rows.map(row=>({heading:String(row[0] || ''),body:row.slice(1).join('\n'+t('Información necesaria')+': '),compact:true}));
            band('Información por validar',(caption ? measure(caption,width,6.8)+5 : 0)+openingHeight(items,2,textSize),true);
            for(const guide of guides) {
                if(guide.columns.length!==3) {renderTables([guide]);continue;}
                const items=guide.rows.map(row=>({heading:row[0],body:row[1]+'\n'+guide.columns[2]+': '+row[2],compact:true}));
                const caption=[guide.title,guide.note].filter(Boolean).join(' · ');
                if(caption) {ensure(30);const y=document.y,h=measure(caption,width,6.8);write(caption,margin,y,width,6.8,'Helvetica',MUTED);reset(y+h+5);}
                textPanels(items);
            }
        }
        if(methods.length) {band('Metodología de las gráficas');textPanels(methods);}
        drawCauses();pdfWatermark(document);document.end();
    });
}
module.exports={makeCompanyDashboardPdf};
