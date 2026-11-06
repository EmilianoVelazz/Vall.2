'use strict';
const {reportLayout}=require('./report-layout');
const numeric=value=>{
    if(typeof value==='number') return Number.isFinite(value) ? value : null;
    const text=String(value ?? '').trim().replace(/\s+puntos$/i,'').replace(/,/g,'');
    return /^[-+]?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
};

// Positive index levels are required only for an equity report. A zero change,
// coverage count or negative yield in another sector remains legitimate.
function normalizeEquityEvidence(report) {
    if(report?.periodType==='annual')return report;
    const layout=reportLayout(report);
    if(layout?.collection!=='finance' || layout.key!=='equities') return report;
    const invalid=new Set();
    const reject=(label,value)=>{const level=numeric(value);if(label && level!==null && level<=0) invalid.add(label);};
    for(const quote of report.sourceSnapshot?.equities || []) reject(quote.label,quote.value);
    for(const metric of report.metrics || []) reject(metric.label,metric.value);
    for(const table of report.tables || []) {
        const label=table.columns?.findIndex(column=>/^(Referencia|Índice)$/i.test(column)),level=table.columns?.findIndex(column=>/^(Último|Cierre)(?:\b|\s)/i.test(column));
        if(label>=0 && level>=0) for(const row of table.rows || []) reject(row[label],row[level]);
    }
    if(!invalid.size) return report;
    const metrics=(report.metrics || []).map(item=>invalid.has(item.label) ? {...item,value:'Sin dato validado',change:'No calculable'} : item);
    const tables=(report.tables || []).map(table=>{
        const label=table.columns?.findIndex(column=>/^(Referencia|Índice)$/i.test(column));
        if(label>=0) return {...table,rows:table.rows.map(row=>invalid.has(row[label]) ? row.map((cell,i)=>/^(Último|Cierre|Día|5 sesiones|21 sesiones|1 mes|YTD)/i.test(table.columns[i]) ? ( /^(Último|Cierre)/i.test(table.columns[i]) ? 'Sin dato validado' : 'No calculable') : cell) : row)};
        if(table.title==='Comparaciones calculadas de las gráficas') return {...table,rows:table.rows.map(row=>invalid.has(String(row[0]).split(' · ')[0]) ? row.map((cell,i)=>i>=2 && i<=4 ? 'No calculable' : cell) : row)};
        return table;
    });
    const visuals=(report.visuals || []).map(visual=>visual.type==='line' ? {...visual,series:(visual.series || []).filter(series=>!invalid.has(series.label))} : visual).filter(visual=>visual.type==='bar' || visual.series.length);
    const valid=metrics.filter(item=>item.label!=='VIX' && !invalid.has(item.label) && /^[-+]?\d+(?:\.\d+)?%$/.test(item.change || ''));
    const weakest=[...valid].sort((a,b)=>parseFloat(a.change)-parseFloat(b.change))[0];
    let summary=report.summary || '';
    let takeaways=report.takeaways || [],sections=report.sections || [];
    // Repair only recognized automatic sentences from the old generator.
    if(!report.userEdition && weakest) {
        summary=summary.replace(/El corte reúne \d+ referencias de renta variable(?: con cierre válido)?/,`El corte reúne ${valid.length} referencias de renta variable con cierre válido`)
            .replace(/[^.;]+ registra la variación relativa más débil \([^)]*\)\./,` ${weakest.label} registra la variación relativa más débil (${weakest.change}).`);
        takeaways=takeaways.map(item=>/^.+ es la referencia más rezagada de la sesión \(/.test(item) ? `${weakest.label} es la referencia más rezagada de la sesión (${weakest.change}); contrasta el cierre con su trayectoria antes de decidir.` : item);
        sections=sections.map(section=>({...section,text:section.text?.replace(/mientras que .+ sirve como contraste\./,`mientras que ${weakest.label} sirve como contraste.`)}));
    }
    const heading='Calidad y cobertura del corte';
    if(sections.length<20 && !sections.some(section=>section.heading===heading)) sections=[...sections,{heading,text:`Sin cierre validado: ${[...invalid].join(', ')}. Se descartaron niveles no positivos y sus variaciones derivadas; no se interpretan como caídas de mercado. Confirmar el cierre con la fuente antes de utilizar estas referencias.`}];
    const result={...report,summary,takeaways,sections,metrics,tables,visuals};
    return JSON.stringify(result)===JSON.stringify(report) ? report : result;
}
module.exports={normalizeEquityEvidence};
