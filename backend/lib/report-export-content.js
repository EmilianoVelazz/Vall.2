'use strict';
const {reportLayout}=require('./report-layout');
const {availablePresentationModel,availableReportTables,missingReportValue,hasPublishedReportData}=require('../../shared/report-available-data.mjs');
async function reportExportContent(report,t=value=>value,source=value=>value) {
    report=require('./report-daily-evidence').withDailyEvidence(report);
    const model=availablePresentationModel((await import('../../shared/report-weekly.mjs')).weeklyReport(report,{t,source}),{t,source});
    if(!hasPublishedReportData(model))throw Object.assign(Error(t('No hay datos publicados para generar este informe.')),{status:422,code:'REPORT_DATA_UNAVAILABLE'});
    if(model.newsExecutive){
        const lines=[`# ${report.title}`,`${t('Corte')}: ${report.generatedAt}`,model.summary];
        for(const group of model.newsExecutive.groups){lines.push(`## ${group.label}`);for(const item of group.stories)lines.push(`### ${item.title}`,item.description,`${t('Canal financiero')}: ${item.channel}`,`${t('Posibles repercusiones')}: ${item.effect}`,...(report.personalization?.sections?.risks===false ? [] : [`${t('Qué vigilar')}: ${item.watch}`]),`${item.source} · ${item.publishedAt}`,...(report.personalization?.sections?.sources===false ? [] : [`[${t('Leer publicación')}](${item.url})`]));}
        lines.push(model.newsExecutive.note);return lines.filter(Boolean).join('\n\n');
    }
    if(model.panorama){
        const lines=[`# ${report.title}`,`${t('Corte integrado')}: ${report.generatedAt}`];
        if(model.panorama.signals.length){lines.push(`## ${t('Señales principales')}`);for(const item of model.panorama.signals)lines.push(item.label+': '+item.value+' '+item.unit+' · '+item.date+(item.change ? ' · '+item.change+' ('+item.baseDate+' / '+item.date+')' : ''));}
        for(const item of [...(model.panorama.signals.length ? [] : model.panorama.facts),...model.panorama.implications])lines.push(`## ${item.heading}`,item.body);
        for(const chapter of model.panorama.chapters){
            lines.push(`## ${chapter.label}`,`${t('Corte del capítulo')}: ${chapter.generatedAt}`);
            if(chapter.kind==='structural')lines.push(t('Contexto estructural: periodos mensuales o anuales declarados. No son cambios de la sesión.'));
            if(chapter.kind==='news')for(const item of chapter.news)lines.push(`### ${item.title}`,item.description,...(item.effect ? [`${t('Posibles repercusiones')}: ${item.effect}`,`${t('Qué vigilar')}: ${item.watch}`] : []),`[${item.source} · ${item.publishedAt.slice(0,10)}](${item.url})`);
            else lines.push(await reportExportContent({...chapter.componentReport,personalization:report.personalization,analysisPeriod:report.analysisPeriod},t,source));
        }
        return lines.join('\n\n');
    }
    const chartReadings=(await import('../../shared/report-chart-layout.mjs')).compactChartReadings(model.visuals);
    if(model.sessionReport) {
        const lines=[`# ${report.title}`,`${t('Corte')}: ${report.generatedAt || ''}`];
        for(const block of model.blocks) {
            lines.push(`## ${block.number} · ${t(block.label)}`);
            if(block.key==='fxTreasury'){
                const desk=model.fxExecutive;if(desk.dxy)lines.push('DXY: '+desk.dxy.last.value+' · '+desk.dxy.last.date);
                for(const table of model.results)lines.push('### '+table.title,table.note || '','| '+table.columns.join(' | ')+' |','| '+table.columns.map(()=>'---').join(' | ')+' |',...table.rows.map(row=>'| '+row.join(' | ')+' |'));
                lines.push(desk.costNote,'### '+desk.decision.title,...desk.decision.items.map(item=>item.heading+': '+item.body),desk.decision.stress?.body || '',desk.decision.note,desk.methodology);
                const rates=[['Fed',desk.carry.fed],['Banxico',desk.carry.banxico],['Selic',desk.carry.selic]].filter(([,value])=>!missingReportValue(value,source)).map(([label,value])=>label+' '+value);if(rates.length)lines.push('Tasas objetivo: '+rates.join('; '));
                if(desk.risk)lines.push('Volatilidad realizada USD/MXN (20 sesiones): '+desk.risk.volatility+'%.');
                for(const item of desk.bullets)lines.push('### '+item.heading,item.body);
                if(desk.visual)lines.push(desk.visual.note);
            }
            if(block.key==='session') {
                if(model.equityExecutive)lines.push(model.equityExecutive.risk.label,...model.equityExecutive.dashboard.map(item=>`${item.label}: ${item.value} · ${item.change} · ${item.dates} · [${item.source}](${item.url})`));
                if(model.bondExecutive)lines.push(...model.bondExecutive.dashboard.map(item=>`${item.label}: ${item.value} · ${item.date} · [${item.source}](${item.url})`));
                for(const item of model.focusedMarket ? model.summaryPanels : model.commentary.slice(0,2)) lines.push(`### ${item.heading}`,item.body);
            }
            if(block.key==='results') for(const item of model.metrics) lines.push(`${item.label}: ${item.value}${item.change ? ' · '+item.change : ''}`);
            if(['comparisons','derivatives','equityContext'].includes(block.key)) for(const table of model.results.filter(table=>block.key==='equityContext' ? table.equityContext : model.equityExecutive ? table.equityMaster : Boolean(table.derivatives)===(block.key==='derivatives'))) lines.push(`### ${table.title}`,table.note || '','| '+table.columns.join(' | ')+' |','| '+table.columns.map(()=>'---').join(' | ')+' |',...table.rows.map(row=>'| '+row.join(' | ')+' |'));
            if(block.key==='equityBusiness')for(const item of model.equityExecutive.business)lines.push(`### ${item.heading}`,item.body);
            if(block.key==='bondBusiness')for(const item of model.bondExecutive.business)lines.push(`### ${item.heading}`,item.body);
            if(block.key==='sessionContext') {
                for(const item of model.commentary.slice(2)) lines.push(`### ${item.heading}`,item.body);
                if(model.followup.length) lines.push(`### ${model.followupHeading}`,...model.followup);
            }
            if(block.key==='charts'){
                for(const visual of chartReadings.visuals){lines.push(`### ${visual.title}`,...[...new Set([visual.note,visual.reading].filter(Boolean))]);if(visual.equityYears)for(const table of availableReportTables([{columns:[t('Índice'),...visual.years.map(String)],rows:visual.rows.map(row=>[row.label,...row.cells.map(cell=>Number.isFinite(cell.value) ? cell.value.toFixed(2)+' %' : null)])}],{t,source}))lines.push('| '+table.columns.join(' | ')+' |','| '+table.columns.map(()=>'---').join(' | ')+' |',...table.rows.map(row=>'| '+row.join(' | ')+' |'));}
                if(chartReadings.notes.length)lines.push(`### ${t('Metodología de las gráficas')}`,...chartReadings.notes);
            }
        }
        return lines.join('\n\n');
    }
    const annex=()=>{
        const item=model.causes,lines=[item.period,item.status,item.conditions,item.coverage].filter(Boolean);
        for(const group of item.groups) {
            lines.push(`### ${group.label}`,`${t('De dónde viene')}: ${group.origin}`,`${t('Posibles causas por contrastar')}: ${group.factors}`,`${t('Qué verificar')}: ${group.check}`);
            for(const row of group.rows) lines.push(`#### ${row.reference}`,row.movement,row.values,`${t('Consecuencias posibles')}: ${row.impact}`);
            if(group.link) lines.push(`${t('Base del mecanismo')}: [${group.link.label}](${group.link.url})`);
        }
        return lines.join('\n\n');
    };
    if(reportLayout(report)?.composition==='weekly-sheet') {
        const lines=[`# ${report.title}`,`${t('Corte')}: ${report.generatedAt || ''}`];
        const table=item=>{
            lines.push(`### ${item.title}`);
            if(item.unit) lines.push(`${t('Unidad')}: ${item.unit}`);
            if(item.period) lines.push(`${t('Periodo')}: ${item.period}`);
            lines.push('| '+item.columns.join(' | ')+' |','| '+item.columns.map(()=> '---').join(' | ')+' |',...item.rows.map(row=>'| '+row.map(cell=>String(cell ?? '').replace(/\n/g,' ')).join(' | ')+' |'));
        };
        for(const block of model.blocks) {
            lines.push(`## ${block.number} · ${t(block.label)}`);
            if(block.key==='results') {for(const metric of model.metrics) lines.push(`${metric.label}: ${metric.value}${metric.change ? ' · '+metric.change : ''}`);}
            if(block.key==='comparisons') model.results.forEach(table);
            if(block.key==='charts') for(const visual of model.visuals) {
                lines.push(`### ${visual.title}`,`${t('Unidad')}: ${visual.unit || t('Unidad no declarada')}`);
                if(visual.type==='bar') table({title:visual.title,columns:[t('Referencia'),t('Valor')],rows:visual.bars.map(bar=>[bar.label,bar.value===null ? t('Sin dato') : bar.value])});
            }
            if(block.key==='history') [...model.history,...model.tables].forEach(table);
            if(block.key==='statistics') model.statistics.forEach(table);
            if(block.key==='causes') lines.push(annex());
        }
        return lines.join('\n\n');
    }
    const lines=[`# ${report.title}`,`${t('Corte')}: ${report.generatedAt || ''}`];
    for(const [label,key] of [['Resumen ejecutivo','summary'],['Objetivo','objective'],['Decisión y seguimiento','closing']]) if(report[key]) lines.push(`## ${t(label)}`,report[key]);
    for(const section of report.sections || []) lines.push(`## ${section.heading}`,section.text);
    if(report.metrics?.length) lines.push(`## ${t('Indicadores')}`,...report.metrics.map(item=>`${item.label}: ${item.value}${item.change ? ' · '+item.change : ''}`));
    for(const table of report.tables || []) {lines.push(`## ${table.title}`,'| '+table.columns.join(' | ')+' |','| '+table.columns.map(()=> '---').join(' | ')+' |',...table.rows.map(row=>'| '+row.join(' | ')+' |'));if(table.note) lines.push(table.note);}
    for(const visual of report.visuals || []) {
        lines.push(`## ${visual.title}`,`${t('Unidad')}: ${visual.unit || t('Sin unidad declarada')}`);
        if(visual.type==='bar') lines.push(...(visual.bars || []).map(item=>`${item.label}: ${item.value}`));
        else for(const series of visual.series || []) lines.push(series.label,...series.points.map(point=>`${point.date}: ${point.value}`));
        if(visual.note) lines.push(visual.note);
    }
    for(const [label,key] of [['Claves para dirección','takeaways'],['Riesgos y seguimiento','watchlist']]) if(report[key]?.length) lines.push(`## ${t(label)}`,...report[key].map(text=>'- '+text));
    lines.push(`## A · ${t('Causas y consecuencias')}`,annex());
    return lines.join('\n\n');
}
module.exports={reportExportContent};
