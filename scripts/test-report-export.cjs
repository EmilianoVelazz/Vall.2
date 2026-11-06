'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
require('dotenv').config({ path: require('node:path').join(__dirname, '..', 'backend', '.env'), quiet: true });
const { _test } = require('../backend/routes/export');

(async () => {
    const content = '# Reporte de prueba\n\n## Datos\n\n- México: 4.3%\n- EUA: 3.0%';
    const docx = await _test.makeDocx('Prueba VALL AI', content, []);
    const pdf = await _test.makePdf('Prueba VALL AI', content, []);
    const html = _test.htmlReport('Prueba VALL AI', content, []);
    assert(Buffer.isBuffer(docx) && docx.length > 1000);
    const docxZip = await JSZip.loadAsync(docx);
    const templateDocumentXml = await docxZip.file('word/document.xml').async('string');
    const templateRelationsXml = await docxZip.file('word/_rels/document.xml.rels').async('string');
    assert.match(templateDocumentXml, /<w:headerReference w:type="default" r:id="rId9"\/>/);
    assert.match(templateRelationsXml, /Target="header1\.xml"/);
    assert(docxZip.file('word/header1.xml'));
    assert(docxZip.file('word/media/image1.png'));
    assert(Buffer.isBuffer(pdf) && pdf.subarray(0, 4).toString() === '%PDF');
    assert(Buffer.isBuffer(html) && html.toString().includes('Prueba VALL AI'));

    const olsContent = `# Regresión lineal: tendencia de S&P 500

## Regresión lineal: tendencia de S&P 500

250 cierres diarios - 2025-01-02 a 2025-12-31

| Métrica | Resultado |
| --- | --- |
| Modelo | Tendencia lineal temporal |
| Observaciones | 250 |
| Ecuación | S&P 500 = 5,543.381193 + 5.36641 x t |
| R² | 0.7043 |
| Pendiente | 5.36641 puntos por día |
| Error estándar residual | 251.958422 puntos |

## Lectura del análisis

El modelo estima una trayectoria alcista promedio sobre cierres diarios del S&P 500 durante 2025. La pendiente describe una tendencia histórica y no una recomendación de inversión.

## Límites del modelo

El ajuste OLS es exploratorio y no incorpora choques macroeconómicos, cambios de valuación ni volatilidad futura.`;
    const olsPdf = await _test.makePdf('Informe técnico: regresión lineal del S&P 500 (2025)', olsContent, []);
    assert(Buffer.isBuffer(olsPdf) && olsPdf.subarray(0, 4).toString() === '%PDF');
    if (process.argv.includes('--preview-ols')) {
        const outputDir = path.join(__dirname, '..', 'output', 'pdf');
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, 'orion-regresion-lineal-sp500-vista-previa.pdf'), olsPdf);
    }

    const equityMarkets = [
        ['S&P 500', 'América', 'Estados Unidos'], ['Nasdaq Composite', 'América', 'Estados Unidos'], ['Dow Jones', 'América', 'Estados Unidos'], ['S&P/BMV IPC', 'América', 'México'], ['Ibovespa', 'América', 'Brasil'],
        ['Euro Stoxx 50', 'Europa', 'Eurozona'], ['FTSE 100', 'Europa', 'Reino Unido'], ['DAX 40', 'Europa', 'Alemania'], ['CAC 40', 'Europa', 'Francia'],
        ['Nikkei 225', 'Asia', 'Japón'], ['Hang Seng', 'Asia', 'Hong Kong'], ['Shanghai Composite', 'Asia', 'China'], ['KOSPI', 'Asia', 'Corea del Sur'], ['S&P/ASX 200', 'Asia', 'Australia'],
    ];
    const equityInput = {
        key: 'equities', title: 'Bolsa global - validación visual', eyebrow: 'Renta variable global', generatedAt: '2026-09-18T14:00:00.000Z',
        summary: 'Corte sintético de validación visual con referencias de América, Europa y Asia.', closing: 'La variación de sesión no equivale a una tendencia estructural.',
        objective: 'Revisar el cierre de las bolsas globales y sus señales de corto plazo.',
        metrics: equityMarkets.slice(0, 8).map(([label], index) => ({ label, value: String(1000 + index * 100), change: '+0.50%' })),
        takeaways: ['La referencia líder conserva una variación positiva en la muestra.', 'La dispersión entre índices requiere seguimiento.'],
        watchlist: ['Confirmar el siguiente cierre.', 'Revisar la volatilidad implícita.'],
        sources: ['Yahoo Finance · cierre diario más reciente'],
        sourceSnapshot: {
            equities: equityMarkets.map(([label, region, market], itemIndex) => {
                const recentSeries = Array.from({ length: 42 }, (_, index) => ({
                    date: new Date(Date.UTC(2026, 7, 8 + index)).toISOString().slice(0, 10),
                    value: 1000 + itemIndex * 100 + index * (itemIndex % 2 ? -1.4 : 1.7),
                }));
                return {
                    label, region, market, symbol: `TEST${itemIndex}`, value: recentSeries.at(-1).value, previous: recentSeries.at(-2).value,
                    change: itemIndex % 2 ? -0.14 : 0.17, performance: { day: itemIndex % 2 ? -0.14 : 0.17, week: .4, month: .8, ytd: 1.2 }, recentSeries,
                };
            }),
        },
    };
    const equityReport = _test.executivePayload(equityInput);
    const equityPdf = await _test.makeExecutivePdf('VALLNEWS · Finanzas · Bolsa', equityReport);
    assert.equal(equityReport.equitySeries.length, equityMarkets.length);
    assert(Buffer.isBuffer(equityPdf) && equityPdf.subarray(0, 4).toString() === '%PDF');

    const dates = Array.from({ length: 28 }, (_, index) => new Date(Date.UTC(2026, 7, 22 + index)).toISOString().slice(0, 10));
    const genericInput = {
        key: 'custom_visual_layout', title: 'Energía y metales - validación visual', eyebrow: 'Energía, transporte e insumos industriales', generatedAt: '2026-09-18T14:00:00.000Z',
        personalization: {
            audience: 'Finanzas y tesorería', depth: 'detailed', recipientName: 'Mariana López', organization: 'Dirección Financiera',
            customTitle: 'Pulso estratégico de energía y metales', decisionHorizon: 'quarter', horizon: 'Próximo trimestre',
            confidentiality: 'confidential', confidentialityLabel: 'Confidencial', theme: 'emerald',
        },
        objective: 'Validar la composición visual antes de publicar los informes ejecutivos de Finanzas y Mercados.',
        summary: 'Corte sintético para comprobar que las gráficas se presentan completas antes de indicadores, tablas y conclusiones.',
        closing: 'La señal de una sesión debe contrastarse con el calendario económico y la fuente primaria antes de convertirla en una decisión.',
        metrics: [
            { label: 'WTI', value: '83.90 USD', change: '+1.14%' }, { label: 'Cobre', value: '4.61 USD/lb', change: '-0.42%' },
            { label: 'Gas natural', value: '2.78 USD', change: '+0.31%' }, { label: 'USD/MXN', value: '17.19', change: '+0.08%' },
        ],
        takeaways: ['El bloque visual queda completo antes de los datos del corte.', 'La lectura ejecutiva separa señal, riesgo y trazabilidad.'],
        watchlist: ['Confirmar la hora de cierre y la unidad de cada contrato.', 'Contrastar inventarios y eventos de oferta antes de extrapolar la señal.'],
        sections: [
            { heading: 'Contexto operativo', text: 'La plantilla conserva el contexto específico de cada informe y evita mezclar los datos tabulares con el recorrido de sus gráficas.' },
            { heading: 'Criterio de lectura', text: 'Las series se interpretan por su propia unidad, fuente y horario. Una variación diaria no equivale por sí sola a una tendencia estructural.' },
        ],
        tables: [
            { title: 'Contratos y desempeño del corte', note: 'Datos sintéticos usados sólo para validación visual.', columns: ['Activo', 'Cierre', 'Día', '5 sesiones', '1 mes', 'Fuente'], rows: [
                ['WTI', '83.90 USD', '+1.14%', '+2.31%', '+4.20%', 'Fuente de prueba'], ['Cobre', '4.61 USD/lb', '-0.42%', '+0.72%', '+1.90%', 'Fuente de prueba'], ['Gas natural', '2.78 USD', '+0.31%', '-1.12%', '+3.40%', 'Fuente de prueba'],
            ] },
            { title: 'Puntos de control', note: 'Acciones de seguimiento del corte.', columns: ['Frente', 'Dato a confirmar', 'Responsable', 'Horizonte'], rows: [
                ['Oferta', 'Inventarios y producción', 'Mesa de mercados', 'Próxima sesión'], ['Demanda', 'Actividad industrial', 'Análisis económico', 'Próxima semana'],
            ] },
        ],
        visuals: [
            { type: 'line', title: 'Trayectoria comparativa', unit: 'índice de validación', note: 'Dos series de prueba para revisar la composición de la gráfica.', series: [
                { label: 'Energía', points: dates.map((date, index) => ({ date, value: 100 + index * 1.15 })) },
                { label: 'Metales', points: dates.map((date, index) => ({ date, value: 106 - index * .62 })) },
            ] },
            { type: 'bar', title: 'Frentes a monitorear', unit: 'eventos', note: 'Distribución sintética para comprobar barras y leyendas.', bars: [
                { label: 'Oferta', value: 8 }, { label: 'Demanda', value: 5 }, { label: 'Logística', value: 3 }, { label: 'Divisas', value: 6 },
            ] },
            { type: 'line', title: 'Pulso de costos', unit: 'índice de validación', note: 'Serie de prueba para una segunda visualización temporal.', series: [
                { label: 'Costo agregado', points: dates.map((date, index) => ({ date, value: 95 + Math.sin(index / 3) * 4 + index * .38 })) },
            ] },
        ],
        sources: ['Fuente de prueba - validación visual', 'Fuente primaria simulada - no usar para decisiones'],
        sourceSnapshot: { indicators: [
            { label: 'WTI', value: 83.9, previous: 82.95, unit: 'USD' }, { label: 'Cobre', value: 4.61, previous: 4.63, unit: 'USD/lb' },
            { label: 'Gas natural', value: 2.78, previous: 2.77, unit: 'USD' }, { label: 'USD/MXN', value: 17.19, previous: 17.18, unit: 'MXN' },
        ] },
    };
    const genericReport = _test.executivePayload(genericInput);
    const genericPdf = await _test.makeExecutivePdf('VALLNEWS · Mercados · Energía y metales', genericReport);
    assert.equal(genericReport.visuals.length, 3);
    assert.equal(genericReport.personalization.recipientName, 'Mariana López');
    assert.equal(genericReport.personalization.theme, 'graphite');
    assert(Buffer.isBuffer(genericPdf) && genericPdf.subarray(0, 4).toString() === '%PDF');
    if (process.argv.includes('--preview-personalized')) {
        const outputDir = path.join(__dirname, '..', 'output', 'pdf');
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, 'vallnews-pdf-personalizado-muestra.pdf'), genericPdf);
    }
    if (process.argv.includes('--preview')) {
        const outputDir = path.join(__dirname, '..', 'output', 'pdf');
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, 'vallnews-bolsa-global-vista-previa.pdf'), equityPdf);
        fs.writeFileSync(path.join(outputDir, 'vallnews-formato-ejecutivo-vista-previa.pdf'), genericPdf);
    }
    console.log('Report export tests: OK');
    process.exit(0);
})().catch(error => { console.error(error); process.exitCode = 1; });
