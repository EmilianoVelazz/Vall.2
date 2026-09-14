'use strict';

// Agente editorial para los informes ejecutivos. No consulta mercados ni usa
// búsqueda: sólo transforma el corte determinista que ya fue verificado por
// cada reporte. Así mantiene trazabilidad y evita que una prosa convincente
// introduzca cifras, causas o recomendaciones inexistentes.
const { GeminiProvider } = require('./providers/gemini-provider');

function cleanText(value, limit) {
    return String(value || '')
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

function factsFor(report) {
    return {
        key: report.key,
        title: cleanText(report.title, 100),
        objective: cleanText(report.objective, 700),
        summary: cleanText(report.summary, 900),
        metrics: (report.metrics || []).slice(0, 10).map(item => ({
            label: cleanText(item?.label, 80), value: cleanText(item?.value, 80), change: cleanText(item?.change, 80),
        })),
        conclusions: list(report.takeaways, 4, 340),
        watchlist: list(report.watchlist, 3, 340),
        headlines: (report.headlines || []).slice(0, 5).map(item => ({
            title: cleanText(item?.title, 240), source: cleanText(item?.source, 100),
            description: cleanText(item?.description, 360),
        })),
        sources: list(report.sources, 8, 180),
    };
}

function deterministicBrief(report) {
    return {
        generated: true,
        mode: 'deterministic',
        agent: 'VALL Executive Desk',
        headline: cleanText(report.title, 120),
        context: cleanText(report.objective || report.summary, 320),
        thesis: cleanText(report.summary || 'No hubo evidencia suficiente para elaborar una tesis adicional en este corte.', 420),
        drivers: list(report.takeaways, 3, 240),
        risks: list(report.watchlist, 3, 240),
        committeeQuestion: '¿Qué dato de las fuentes del corte confirmaría o cambiaría esta lectura antes de tomar una decisión?',
        evidenceNote: 'Síntesis determinista construida con los indicadores y fuentes verificables ya incluidos en este informe; no es una respuesta generada por IA.',
    };
}

class ExecutiveReportAgent {
    constructor({ provider = new GeminiProvider() } = {}) {
        this.provider = provider;
    }

    async enrich(reports, { area = 'Mercados' } = {}) {
        if (!Array.isArray(reports) || !reports.length) return reports;
        // El diseño de informe no desaparece por una cuota, un timeout o una
        // credencial ausente. Primero construimos una síntesis reproducible y
        // luego la IA puede enriquecerla, identificándose explícitamente.
        const fallbackReports = reports.map(report => report?.executiveBrief ? report : ({ ...report, executiveBrief: deterministicBrief(report) }));
        if (!this.provider.isConfigured()) return fallbackReports;
        const facts = reports.map(factsFor);
        const systemInstruction = `Eres el agente editorial de informes ejecutivos de VALLNEWS. Entregas una lectura de nivel editorial para comité directivo: un titular sobrio, contexto, tesis verificable, señales que la sostienen, riesgos que podrían invalidarla y una pregunta de seguimiento. No imitas ni atribuyes el resultado a publicaciones, analistas o plataformas externas.

Reglas no negociables:
1. Usa únicamente los hechos incluidos en DATOS VERIFICADOS.
2. No inventes cifras, porcentajes, fechas, países, causas, fuentes, titulares ni relaciones causales.
3. No des recomendaciones de inversión, compra, venta o cobertura. Formula acciones como validaciones o preguntas para comité.
4. La tesis y cada señal deben diferenciar hecho observado de implicación condicional; evita adjetivos promocionales y frases genéricas.
5. Si faltan hechos, dilo de forma explícita y breve.
6. Devuelve JSON válido, sin Markdown ni texto adicional.`;
        const prompt = `Área: ${area}. Para cada informe, devuelve exactamente este esquema:
{"reports":[{"key":"","headline":"máximo 120 caracteres; describe el hecho sin sensacionalismo","context":"máximo 320 caracteres; explica por qué el corte merece atención usando sólo los datos dados","thesis":"máximo 420 caracteres; hecho y lectura condicional","drivers":["máximo 3, 240 caracteres c/u; señal observable y por qué importa"],"risks":["máximo 3, 240 caracteres c/u; condición que hay que contrastar"],"committeeQuestion":"máximo 260 caracteres"}]}

DATOS VERIFICADOS:
${JSON.stringify(facts)}`;
        try {
            const response = await this.provider.generate({
                prompt, systemInstruction, tier: 'pro', json: true, maxOutputTokens: 5000,
            });
            const parsed = JSON.parse(response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
            const byKey = new Map((parsed?.reports || []).filter(item => item?.key).map(item => [String(item.key), item]));
            return fallbackReports.map(report => {
                const draft = byKey.get(String(report.key));
                if (!draft) return report;
                const headline = cleanText(draft.headline, 120);
                const context = cleanText(draft.context, 320);
                const thesis = cleanText(draft.thesis, 420);
                const drivers = list(draft.drivers, 3, 240);
                const risks = list(draft.risks, 3, 240);
                const committeeQuestion = cleanText(draft.committeeQuestion, 260);
                if (!headline && !context && !thesis && !drivers.length && !risks.length && !committeeQuestion) return report;
                return {
                    ...report,
                    executiveBrief: {
                        generated: true,
                        mode: 'ai',
                        agent: 'VALL Executive Desk',
                        model: response.model,
                        generatedAt: new Date().toISOString(),
                        headline, context, thesis, drivers, risks, committeeQuestion,
                        evidenceNote: 'Lectura editorial generada exclusivamente a partir del corte verificable mostrado en este informe.',
                    },
                };
            });
        } catch (error) {
            console.warn('[executive-report-agent] Edición no disponible:', error.message);
            return fallbackReports;
        }
    }
}

const executiveReportAgent = new ExecutiveReportAgent();

module.exports = { ExecutiveReportAgent, executiveReportAgent, deterministicBrief };
