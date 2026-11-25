'use strict';

// Agente editorial para los informes ejecutivos. No consulta mercados ni usa
// búsqueda: sólo transforma el corte determinista que ya fue verificado por
// cada reporte. Así mantiene trazabilidad y evita que una prosa convincente
// introduzca cifras, causas o recomendaciones inexistentes.
const { GeminiProvider } = require('./providers/gemini-provider');
const { enrichSectorReport } = require('../lib/report-sector-format');
const {numericTokens}=require('../lib/report-evidence-numbers');
const {reportDeadline}=require('../lib/report-deadline');
const {editorialFacts,editorialFingerprint}=require('../lib/report-editorial-evidence');
const { getReportReasoningContext } = require('./loopus-knowledge');

function cleanText(value, limit) {
    return String(value ?? '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
}

function list(value, maxItems, maxLength) {
    return Array.isArray(value)
        ? value.map(item => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems)
        : [];
}

// Validate the complete answer before publishing. Cutting a field to length
// can leave its condition or conclusion unfinished even when the JSON is valid.
function checkedBrief(draft, facts) {
    const issues=[],brief={};
    const read=value=>typeof value==='string' ? cleanText(value,Number.MAX_SAFE_INTEGER) : '';
    for(const [key,limit] of Object.entries({headline:130,context:440,thesis:560,committeeQuestion:340})) {
        brief[key]=read(draft?.[key]);
        if(!brief[key] || brief[key].length>limit)issues.push(`${key}: texto completo de hasta ${limit} caracteres`);
        else if(key!=='headline' && !/[.!?…]["'»”’)]?$/.test(brief[key]))issues.push(`${key}: cerrar la frase con puntuación`);
    }
    for(const key of ['drivers','risks']) {
        brief[key]=Array.isArray(draft?.[key]) ? draft[key].map(read) : [];
        if(!brief[key].length || brief[key].length>3)issues.push(`${key}: de una a tres frases`);
        if(brief[key].some(value=>!value || value.length>320 || !/[.!?…]["'»”’)]?$/.test(value)))issues.push(`${key}: frases completas de hasta 320 caracteres, con puntuación final`);
    }
    const allowed=numericTokens(JSON.stringify(facts));
    const unsupported=[...numericTokens(JSON.stringify(brief))].filter(value=>!allowed.has(value));
    if(unsupported.length)issues.push('Conservar las cifras literales del material; eliminar cifras nuevas, redondeos o conteos derivados: '+unsupported.slice(0,20).join(', '));
    return {brief,issues};
}

function factsFor(report) { return editorialFacts(report); }

function compactFactsForPrompt(fact) {
    return {
        ...fact,
        sections: (fact.sections || []).slice(0, 6).map(s => ({ heading: s.heading, text: cleanText(s.text, 700) })),
        tables: (fact.tables || []).slice(0, 4).map(t => ({
            ...t,
            rows: (t.rows || []).slice(0, 10),
        })),
        sources: (fact.sources || []).slice(0, 10),
        sourceLinks: (fact.sourceLinks || []).slice(0, 8),
    };
}

const QUESTIONS_BY_KEY = {
    fx: '¿La paridad USD/MXN actual altera el costo de importaciones o compromisos en dólares del mes? Revisa margen y ventanas de cobertura.',
    bonds: '¿El nivel de CETES y Treasury impacta el costo de financiamiento o la tasa variable de los créditos de la empresa?',
    equities: '¿La volatilidad en el IPC y bolsas de EE. UU. cambia valuaciones de contrapartes o apetito de inversión este trimestre?',
    daily_news: '¿Las noticias del día introducen riesgos regulatorios, arancelarios o de liquidez sobre la operación inmediata?',
    grains: '¿La relación entre futuros CBOT y precios puestos en México justifica adelantar compras o fijar coberturas de maíz y soya?',
    proteins: '¿El precio en canal de cerdo, res, pollo o huevo frente al costo de alimento sostiene el margen operativo proyectado?',
    energy_metals: '¿El movimiento en crudo y gas natural se está reflejando en el costo de diésel, fletes y fertilizantes de la empresa?',
    market_news: '¿Los acontecimientos comerciales o sanitarios reportados comprometen rutas de abastecimiento o acceso a insumos?',
    overview: '¿El balance conjunto de tipo de cambio, tasas e insumos exige ajustar el presupuesto operativo de la semana?'
};

function deterministicBrief(report) {
    const key = report.baseReport?.key || report.key;
    const committeeQuestion = QUESTIONS_BY_KEY[key] || '¿Qué dato del corte confirmaría o cambiaría esta lectura antes de comprometer inventario o liquidez?';
    return {
        generated: true,
        mode: 'deterministic',
        agent: 'VALL Executive Desk',
        headline: cleanText(report.title, 120),
        context: cleanText(report.objective || report.summary, 320),
        thesis: cleanText(report.summary || 'No hubo evidencia suficiente para elaborar una tesis adicional en este corte.', 420),
        drivers: list(report.takeaways, 3, 240),
        risks: list(report.watchlist, 3, 240),
        committeeQuestion,
        evidenceNote: 'Síntesis ejecutiva elaborada a partir de los datos verificados del corte.',
    };
}

class ExecutiveReportAgent {
    constructor({ provider = new GeminiProvider(), timeoutMs = 45000 } = {}) {
        this.provider = provider;
        this.timeoutMs = timeoutMs;
    }

    async enrich(reports, { area = 'Mercados' } = {}) {
        const effectiveBudget = process.env.NODE_ENV === 'test' || process.env.VERCEL ? this.timeoutMs : Math.max(this.timeoutMs, 90000);
        const deadline=Date.now()+effectiveBudget;
        if (!Array.isArray(reports) || !reports.length) return reports;
        // El diseño de informe no desaparece por una cuota, un timeout o una
        // credencial ausente. Primero construimos una síntesis reproducible y
        // luego la IA puede enriquecerla, identificándose explícitamente.
        const sectorReports=reports.map(report=>enrichSectorReport(report,area==='Finanzas' ? 'finance' : area==='Mercados' ? 'markets' : 'mexico'));
        const fallbackReports = sectorReports.map(report => report?.executiveBrief ? report : ({ ...report, executiveBrief: deterministicBrief(report) }));
        if (!this.provider.isConfigured()) return fallbackReports;
        const facts = sectorReports.map(factsFor);
        const promptFacts = facts.map(compactFactsForPrompt);
        let systemInstruction = `Eres el agente editorial de informes ejecutivos de VALLNEWS. Entregas una lectura de nivel editorial para comité directivo: un titular sobrio, contexto, tesis verificable, señales que la sostienen, riesgos que podrían invalidarla y una pregunta de seguimiento. No imitas ni atribuyes el resultado a publicaciones, analistas o plataformas externas.

Reglas no negociables:
1. Usa únicamente los hechos incluidos en DATOS VERIFICADOS.
2. No inventes cifras, porcentajes, fechas, países, causas, fuentes, titulares ni relaciones causales. Copia las cifras con la precisión literal del material: no redondees ni calcules porcentajes, diferencias o conteos nuevos, aunque la operación parezca obvia.
3. No des recomendaciones de inversión, compra, venta o cobertura. Formula acciones como validaciones o preguntas para comité.
4. La tesis y cada señal deben diferenciar hecho observado de implicación condicional; evita adjetivos promocionales y frases genéricas. El contexto explica la exposición del negocio sin repetir la tesis ni el resumen. Cada impulsor une evidencia e implicación; cada riesgo identifica la condición y el dato a contrastar. La pregunta de comité debe ser específica para el informe, sin inventar responsables, umbrales ni plazos.
5. Si faltan hechos, dilo de forma explícita y breve.
Las preguntas e información a solicitar de la guía sectorial son criterios de análisis, no datos observados. Úsalas para precisar qué debe validarse; no afirmes que esa evidencia o exposición ya existe.
6. Devuelve JSON válido, sin Markdown ni texto adicional. Sintetiza dentro de los límites de cada campo; todas las frases deben quedar completas y cerrar con puntuación. No copies todas las filas de las tablas.`;
        const loopusGuidance = getReportReasoningContext({ area, key: fallbackReports.map(r => r.key).join(' '), depth: 'detailed' });
        if (loopusGuidance) systemInstruction += `\n\n${loopusGuidance}`;
        const buildAreaPrompt = (selectedFacts, repairNote = '') => `Área: ${area}. Para cada informe, entrega profundidad analítica de comité conectando cifras literales, fechas, unidades, dispersión regional o entre activos y mecanismos de transmisión (FX, tasas, insumos, energía o abasto) usando únicamente DATOS VERIFICADOS. Devuelve exactamente este esquema:
{"reports":[{"key":"","headline":"máximo 130 caracteres; describe el hecho rector con precisión sin sensacionalismo","context":"máximo 440 caracteres; explica exposición del negocio, corte y relevancia operativa sin repetir la tesis","thesis":"máximo 560 caracteres; hecho observado con cifra/unidad literal, mecanismo causal y lectura condicional","drivers":["máximo 3, hasta 320 caracteres c/u; señal observable con cifra/fuente del corte, mecanismo e implicación práctica"],"risks":["máximo 3, hasta 320 caracteres c/u; condición específica de riesgo y dato concreto a contrastar para confirmarla"],"committeeQuestion":"máximo 340 caracteres; pregunta accionable y específica para comité"}]}

DATOS VERIFICADOS:
${JSON.stringify(selectedFacts)}${repairNote}`;
        const output=[...fallbackReports],remaining=new Set(fallbackReports.map(report=>String(report.key)));
        let repair='';
        for(let attempt=0;attempt<2 && remaining.size;attempt++) {
            const timeoutMs=deadline-Date.now();if(timeoutMs<=0)break;
            const targetFacts=attempt===0 ? promptFacts : promptFacts.filter((_,index)=>remaining.has(String(fallbackReports[index].key)));
            try {
                const response=await reportDeadline(signal=>this.provider.generate({prompt:buildAreaPrompt(targetFacts,repair),systemInstruction,tier:'report',json:true,maxOutputTokens:32768,signal,timeoutMs}),timeoutMs);
                const parsed=JSON.parse(response.text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,''));
                if(!Array.isArray(parsed?.reports))throw new SyntaxError('Esquema de informes inválido');
                const byKey=new Map();
                for(const draft of parsed.reports)if(draft?.key){const key=String(draft.key);byKey.set(key,byKey.has(key) ? null : draft);}
                const corrections=[];
                for(const [index,report] of fallbackReports.entries()) {
                    const key=String(report.key);if(!remaining.has(key))continue;
                    const {brief,issues}=checkedBrief(byKey.get(key),facts[index]);
                    if(issues.length){corrections.push({key,corrections:issues});continue;}
                    output[index]={...report,executiveBrief:{generated:true,mode:'ai',agent:'VALL Executive Desk',model:response.model,generatedAt:new Date().toISOString(),evidenceHash:editorialFingerprint(facts[index]),...brief,evidenceNote:'Lectura editorial generada exclusivamente a partir del corte verificable mostrado en este informe.'}};
                    remaining.delete(key);
                }
                repair='\n\nCORRECCIÓN ÚNICA: devuelve sólo las claves pendientes. Conserva las cifras literales de DATOS VERIFICADOS; abrevia la redacción sin cortar frases ni añadir información. Corrige estos campos: '+JSON.stringify(corrections);
            } catch(error) {
                if(!(error instanceof SyntaxError)) {console.warn('[executive-report-agent] Edición no disponible; se conserva el respaldo.');break;}
                repair='\n\nCORRECCIÓN ÚNICA: devuelve JSON válido con el esquema indicado, frases completas y sólo las claves pendientes: '+JSON.stringify([...remaining]);
            }
        }
        return output;
    }
}

const executiveReportAgent = new ExecutiveReportAgent();

module.exports = { ExecutiveReportAgent, executiveReportAgent, deterministicBrief };
