'use strict';
const JSZip=require('jszip');
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const escape=value=>String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const column=index=>{let label='';for(let n=index+1;n;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;return label;};
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) ? new Date(value+'T00:00:00Z') : value || null;
const style='<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.########;[Red]-#,##0.########"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF30475D"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF30475D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// Used by the application at runtime; only existing JSZip is needed to package OOXML.
async function makeReportWorkbook(report,{t=value=>value}={}) {
    const {weeklyReport}=await import('../../shared/report-weekly.mjs');
    const {displayReferenceLabel}=await import('../../shared/report-display-format.mjs');
    const {mexicoProductionObservations}=await import('../../shared/report-mexico-export-data.mjs');
    const model=weeklyReport(report),annual=report.periodType==='annual',tables=report.personalization?.sections?.tables!==false;
    const cadence=value=>({daily:'Diaria',weekly:'Semanal',monthly:'Mensual',annual:'Anual',auction:'Subasta'})[value] || 'No declarada';
    const summary=[['Campo','Detalle'],['Informe',report.title],['Periodo',annual ? report.reportYear : report.generatedAt],['Preparado el',date(report.generatedAt?.slice(0,10))],['Alcance','Informe completo; los filtros de lectura no se aplican a esta descarga.'],['Resumen',model.focusedMarket ? model.summary : report.summary],['Método','Las observaciones numéricas conservan la precisión almacenada. Las tablas documentales conservan el texto publicado; no se convierten sus cifras redondeadas en datos originales.'],...(model.sessionReport ? (model.focusedMarket ? model.summaryPanels : model.commentary).filter(item=>String(item.body).replace(/\s+/g,' ').trim()!==String(model.summary).replace(/\s+/g,' ').trim()).map(item=>({heading:item.heading,text:item.body})) : report.sections || []).flatMap(section=>[[section.heading,section.text]])];
    const observations=[['Referencia','Mercado','Unidad','Fecha observada','Periodo anual','Valor','Naturaleza','Frecuencia original','Fuente','Enlace']];
    const comparisons=[['Referencia','Mercado','Unidad','Base','Fecha base','Último','Fecha último','Cambio','Unidad del cambio','Promedio disponible','Mínimo','Máximo','Meses disponibles','Observaciones originales','Valor del indicador anual']];
    const coverage=[['Referencia','Mercado','Unidad','Periodo','Meses disponibles','Meses sin dato','Estado','Fuente','Enlace']];
    const states={missing:'Sin datos',partial:'Parcial',comparable:'Comparación anual válida','no-base':'Sin cierres anuales comparables',annual:'Indicador anual publicado'};
    if(tables && annual)for(const reference of report.annualReferences || []) {
        if(reference.prior)observations.push([reference.label,reference.market,reference.unit,date(reference.prior.date),report.reportYear,reference.prior.value,'Base del cierre anual anterior',cadence(reference.cadence),reference.source,reference.url]);
        for(const point of reference.points)observations.push([reference.label,reference.market,reference.unit,date(point.date),report.reportYear,point.value,'Muestra mensual: último dato del mes; fuente mensual = valor publicado',cadence(reference.cadence),reference.source,reference.url]);
        if(Number.isFinite(reference.annualValue))observations.push([reference.label,reference.market,reference.unit,null,report.reportYear,reference.annualValue,'Indicador anual; no se asigna una fecha diaria ficticia',cadence(reference.cadence),reference.source,reference.url]);
        comparisons.push([reference.label,reference.market,reference.unit,reference.prior?.value,date(reference.prior?.date),reference.last?.value,date(reference.last?.date),reference.change,reference.kind==='yield' ? 'pb' : reference.kind==='volatility' ? 'puntos' : '%',reference.mean,reference.minimum,reference.maximum,reference.cadence==='annual' ? null : reference.months,reference.observationCount,reference.annualValue]);
        coverage.push([reference.label,reference.market,reference.unit,report.reportYear,reference.cadence==='annual' ? null : reference.months,reference.cadence==='annual' ? 'No aplica' : Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).filter(month=>!reference.points.some(point=>point.date.slice(5,7)===month)).join(', '),states[reference.status],reference.source,reference.url]);
    }
    if(tables && annual)for(const row of report.annualProduction || [])for(const [key,label] of [['corn','Maíz'],['wheat','Trigo'],['sorghum','Sorgo'],['soy','Soya']]){
        observations.push([label,'México · '+row.state,'t',null,report.reportYear,row[key],'Volumen anual; no es una cotización','Anual','DGSIAP','https://nube.agricultura.gob.mx/datosAbiertos/Agricola.php']);
        coverage.push([label,'México · '+row.state,'t',report.reportYear,null,'No aplica',Number.isFinite(row[key]) ? 'Registro anual disponible' : 'Sin datos','DGSIAP','https://nube.agricultura.gob.mx/datosAbiertos/Agricola.php']);
    }
    if(tables && !annual)for(const reference of model.references || []) {
        const points=reference.points || [],prior=points.at(-2),last=points.at(-1) || reference.last,published=points.length ? points : Number.isFinite(last?.value) ? [last] : [],label=model.mexicoExecutive ? displayReferenceLabel(reference.label) : reference.label;
        for(const point of published)observations.push([label,reference.market || reference.region,reference.unit,date(point.date),null,point.value,reference.cadence==='monthly' ? 'Valor mensual publicado; no es una cotización diaria' : reference.cadence==='weekly' ? 'Referencia semanal publicada' : 'Observación de la fuente',cadence(reference.cadence),reference.source,reference.url]);
        comparisons.push([label,reference.market || reference.region,reference.unit,prior?.value,date(prior?.date),last?.value,date(last?.date),Number.isFinite(prior?.value) && Number.isFinite(last?.value) ? last.value-prior.value : null,'Cambio absoluto en la unidad original']);
        coverage.push([label,reference.market || reference.region,reference.unit,report.generatedAt,null,null,last ? 'Con observaciones; consultar fecha y frecuencia' : 'Sin datos',reference.source,reference.url]);
    }
    if(tables && !annual)for(const item of mexicoProductionObservations(report)){
        observations.push([item.label,item.market,item.unit,null,item.year,item.value,'Producción anual publicada; no es inventario disponible',cadence(item.cadence),item.source,item.url]);
        coverage.push([item.label,item.market,item.unit,item.year,null,'No aplica','Registro anual disponible',item.source,item.url]);
    }
    if(tables && model.equityExecutive)for(const reference of model.equityExecutive.signals)for(const point of reference.points)observations.push([reference.label,'Contexto de Bolsa',reference.unit,date(point.date),null,point.value,'Observación de contexto; no es un índice bursátil','Diaria',reference.source,reference.url]);
    if(model.equityExecutive)for(const panel of model.equityExecutive.business)summary.push([panel.heading,panel.body]);
    if(model.bondExecutive)for(const panel of model.bondExecutive.business)summary.push([panel.heading,panel.body]);
    if(model.panorama){
        for(const panel of model.panorama.implications)summary.push([panel.heading,panel.body]);
        for(const chapter of model.panorama.chapters)summary.push([chapter.label,chapter.generatedAt+' · '+(chapter.kind==='structural' ? 'Contexto estructural mensual o anual' : 'Consultar fecha de cada observación')]);
    }
    const sheets=[{name:'Resumen',rows:summary,widths:[36,115]},{name:'Observaciones',rows:observations},{name:'Comparaciones',rows:comparisons},{name:'Cobertura',rows:coverage}].filter(sheet=>!model.mexicoExecutive || sheet.rows.length>1);
    if(model.panorama?.signals?.length && tables)sheets.push({name:'Señales del panorama',rows:[['Referencia','Valor','Unidad','Fecha / periodo observado','Variación','Unidad del cambio','Base comparada','Frecuencia','Fuente','Enlace'],...model.panorama.signals.map(item=>[item.label,item.numericValue,item.unit,item.kind==='structural' ? item.date : date(item.date),item.numericChange,item.changeUnit,item.baseDate,item.cadence,item.source,item.url])]});
    if(tables && !annual && report.marketDerivatives){
        const {safeCommodityDerivatives}=require('../../shared/report-commodity-derivatives.mjs'),{marketEvidence}=require('../../shared/report-market-analysis.mjs'),data=safeCommodityDerivatives(report.marketDerivatives,report.generatedAt),symbols=new Set(marketEvidence(report).map(reference=>reference.symbol));
        const rows=[['Producto','Mercado','Serie','Mes de serie','Tipo','Fecha del dato','OI · contratos','Cambio publicado · contratos','Estado','Consulta','Fuente','Enlace','Página']];
        for(const item of [...data.options,...data.futures].filter(item=>symbols.has(item.symbol)))rows.push([item.label,item.exchange,item.productCode,item.contractMonth || 'Todos los vencimientos',item.side || 'Futuro',date(item.date),item.openInterest,item.changeOpenInterest,item.status,item.retrievedAt,item.source,item.url,item.page]);
        if(rows.length>1)sheets.push({name:'Derivados',rows});
    }
    if(tables && !annual){const periods=[['Referencia','Horizonte','Unidad original','Valor base','Fecha base','Último','Fecha último',model.panorama ? 'Variación' : model.bondExecutive ? 'Variación · pb' : 'Variación · %','Fuente',...(model.panorama ? ['Unidad del cambio'] : [])]];for(const reference of model.references || [])for(const [key,change] of Object.entries(reference.periods || {}))if(change)periods.push([reference.label,key,reference.unit,change.base,date(change.baseDate),change.last,date(change.lastDate),change.value,reference.source,...(model.panorama ? [reference.panoramaChangeUnit] : [])]);if(periods.length>1)sheets.push({name:'Horizontes',rows:periods});}
    if(annual)summary.push(['Muestras y estadísticos','Las observaciones del año son muestras mensuales. Los promedios y extremos de Comparaciones se calcularon con las observaciones disponibles en su frecuencia original; una muestra de cierres mensuales no permite reconstruir el promedio de todos los cierres diarios o semanales.']);
    if(report.personalization?.sections?.sources!==false)sheets.push({name:'Fuentes',rows:[['Fuente','Enlace'],...(report.sourceLinks || []).filter(source=>(report.baseReport?.key || report.key)!=='proteins' || model.references.some(item=>item.url===source.url)).map(source=>[source.label,source.url])],widths:[60,110]});
    if((model.mexicoExecutive || model.commodityExecutive?.key==='proteins') && report.personalization?.sections?.charts!==false){
        const rows=[['Gráfica','Referencia / categoría','Unidad','Fecha o periodo','Valor','Naturaleza']];
        for(const visual of model.visuals){
            if(visual.type==='bar')for(const bar of visual.bars || [])rows.push([visual.title,bar.label,visual.unit,bar.date || visual.periodLabel || (/^20\d{2}$/.test(bar.label) ? bar.label : ''),bar.value,visual.mexicoWindow==='concentration' ? 'Participación calculada sobre el catálogo del periodo' : 'Valor numérico de la gráfica; ver método y periodo']);
            else for(const series of visual.series || [])for(const point of series.points)rows.push([visual.title,series.label,visual.unit,date(point.date),point.value,visual.unit==='Índice base 100' ? 'Trayectoria relativa calculada; no es un precio físico ni rendimiento de inversión' : 'Observación de la referencia']);
        }
        if(rows.length>1)sheets.push({name:'Datos de gráficas',rows});
    }
    if(model.grainGlobalHistory && tables){
        const rows=[['Código','Referencia','País','Unidad original','Frecuencia','Precio inicial','Fecha base','Último publicado','Fecha último','Cambio desde inicio · %','Fuente','Enlace']];
        for(const [index,item] of model.references.entries()){const base=item.points.find(point=>point.date>='2020-01-01'),last=item.points.at(-1);if(base && last && base.date<last.date)rows.push([String(index+1).padStart(2,'0'),item.label,item.country,item.unit,item.cadence,base.value,date(base.date),last.value,date(last.date),(last.value/base.value-1)*100,item.source,item.url]);}
        sheets.push({name:'Maestra 2020-actual',rows});
        if(report.personalization?.sections?.charts!==false)sheets.push({name:'Historia global',rows:[['Referencia','Fecha base','Fecha observada','Índice base 100','Unidad del precio original'],...model.grainGlobalHistory.series.flatMap(item=>item.points.map(point=>[item.label,date(item.baseDate),date(point.date),point.value,item.originalUnit]))]});
    }
    if(model.energyExecutive && tables){
        const rows=[['Código','Referencia','Tipo de precio','Unidad original','Cierre anterior','Fecha anterior','Último publicado','Fecha último','Variación diaria · %','Precio inicial disponible','Fecha base histórica','Cambio desde inicio · %','Fuente','Enlace']];
        for(const [index,item] of model.references.entries()){const base=item.points.find(point=>point.date>='2020-01-01'),move=item.periods.day;rows.push([String(index+1).padStart(2,'0'),item.label,/^EIA-/.test(item.symbol) ? 'Físico' : /futuros/i.test(item.basis) ? 'Futuro continuo' : 'Referencia',item.unit,move?.base,date(move?.baseDate),item.last.value,date(item.last.date),move?.value,base?.value,date(base?.date),base?.value>0 ? (item.last.value/base.value-1)*100 : null,item.source,item.url]);}
        sheets.push({name:'Maestra energía',rows});
        if(model.energyExecutive.history && report.personalization?.sections?.charts!==false)sheets.push({name:'Historia energía',rows:[['Referencia','Tipo de precio','Unidad original','Fecha base','Fecha observada','Índice base 100'],...model.energyExecutive.history.series.flatMap(item=>item.points.map(point=>[item.label,item.priceType,item.originalUnit,date(item.baseDate),date(point.date),point.value]))]});
    }
    if(tables)for(const [index,table] of (model.sessionReport ? [...model.results,...(model.annexTables || [])].filter(table=>!model.grainGlobalHistory || !table.grainMaster) : report.tables || []).entries())sheets.push({name:'Tabla '+(index+1),rows:[table.columns,...table.rows,[],['Título',table.title],['Método',table.note || ''],['Precisión','Texto publicado; las cifras numéricas estructuradas están en Observaciones, Comparaciones y Horizontes.']]});
    const zip=new JSZip(),ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>');
    zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>`+sheets.map((sheet,i)=>`<sheet name="${escape(t(sheet.name))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml',style.replace('[Red]',''));
    sheets.forEach((sheet,i)=>{
        const width=Math.max(...sheet.rows.map(row=>row.length)),widths=sheet.widths || Array.from({length:width},(_,c)=>c===0 ? 44 : c===1 ? 32 : 24);
        const rows=sheet.rows.map((row,r)=>{
            const height=Math.min(300,Math.max(24,...row.map((value,c)=>Math.ceil(String(value ?? '').length/(widths[c] || 24))*15)));
            return `<row r="${r+1}" ht="${height}" customHeight="1">`+row.map((value,c)=>{
                const year=Number.isInteger(value) && value>=1900 && value<=2100 && (['Periodo anual','Año','Periodo'].includes(sheet.rows[0][c]) || sheet.name==='Resumen' && row[0]==='Periodo');
                const ref=column(c)+(r+1),base=r===0 ? 1 : value instanceof Date ? 2 : typeof value==='number' && !year ? 3 : 0;
                if(value==null)return `<c r="${ref}" s="${base}"/>`;
                if(value instanceof Date)return `<c r="${ref}" s="${base}"><v>${value.getTime()/86400000+25569}</v></c>`;
                if(typeof value==='number' && Number.isFinite(value))return `<c r="${ref}" s="${base}"><v>${value}</v></c>`;
                return `<c r="${ref}" s="${base}" t="inlineStr"><is><t xml:space="preserve">${escape(t(String(value)).slice(0,32767))}</t></is></c>`;
            }).join('')+'</row>';
        }).join('');
        zip.file(`xl/worksheets/sheet${i+1}.xml`,`<worksheet xmlns="${ns}"><dimension ref="A1:${column(width-1)}${sheet.rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols>`+widths.map((w,c)=>`<col min="${c+1}" max="${c+1}" width="${w}" customWidth="1"/>`).join('')+`</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${column(width-1)}${sheet.rows.length}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`);
    });
    return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports={makeReportWorkbook,REPORT_WORKBOOK_MIME:MIME};
