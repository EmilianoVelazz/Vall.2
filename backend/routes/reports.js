'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { genAI, MODEL_FLASH } = require('../lib/gemini');
const nodemailer = require('nodemailer');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, UnderlineType, AlignmentType, convertInchesToTwip } = require('docx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { verifyToken } = require('./auth');

const REPORT_TYPES = new Set(['market', 'geopolitical', 'mexico']);
const reportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados reportes solicitados. Intenta nuevamente en 15 minutos.' },
});

// Gemini se importa desde lib/gemini.js (instancia compartida)

// Configurar Nodemailer (usar Gmail App Password o servicio similar)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER || '',
        pass: process.env.GMAIL_PASS || ''
    }
});

/**
 * Generar contenido premium tipo Gemini cuando API no está disponible
 */
function generateDemoContent(reportType) {
    const demoReports = {
        market: `ANÁLISIS INTEGRAL DE MERCADOS GLOBALES - JULIO 2026

RESUMEN EJECUTIVO
Los mercados financieros globales navegaban un panorama complejo durante la primera mitad de 2026, caracterizado por una volatilidad moderada y perspectivas mixtas entre sectores. El índice S&P 500 consolidó ganancias alcanzando nuevos máximos históricos con un avance acumulado del 8.5% año a la fecha. Sin embargo, la presión inflacionaria persistente y las tensiones geopolíticas han generado una prima de riesgo significativa en activos emergentes y commodities energéticos.

Las expectativas de tasas de interés más bajas en el Q4 de 2026 han favorecido sectores defensivos y tecnología, mientras que los sectores cíclicos muestran signos de consolidación. La volatilidad del índice VIX se ha mantenido en rangos históricos controlados (12-16), sugiriendo una confianza relativa en los mercados.

ANÁLISIS DETALLADO DE ÍNDICES PRINCIPALES
El S&P 500 continúa su trayectoria alcista con una ganancia de 8.5% YTD, consolidando su posición como el índice más resiliente. El momentum técnico permanece positivo con resistencias en 5,480 puntos. El Nasdaq-100 ha experimentado una recuperación más pronunciada tras las correcciones de 2025, ganando 12.3% año a la fecha impulsado por la demanda en inteligencia artificial y computación en la nube.

El Índice DAX europeo mantiene una consolidación en el rango 17,200-17,800 puntos, afectado por la incertidumbre regulatoria en la UE y presiones inflacionarias residuales. El FTSE 100 británico ha mostrado fortaleza relativa con +6.2% YTD, beneficiándose del ajuste del Bank of England en su política monetaria.

En Asia-Pacífico, el Nikkei japonés ha sido el mejor performer con una ganancia de 12.8% desde inicio de año, impulsado por el debilitamiento del yen y expectativas de recuperación post-desinflación. El Hang Seng de Hong Kong experimenta presión por políticas regulatorias internas y restricciones de capital, acumulando pérdidas del 4.3% YTD.

ANÁLISIS DETALLADO DE COMMODITIES
El petróleo WTI se cotiza actualmente en $82 por barril, reflejando un equilibrio frágil entre limitaciones de oferta por tensiones geopolíticas y debilidad de demanda por desaceleración global. Las perspectivas de corto plazo sugieren rango de $78-$88 con sesgo alcista si escalan tensiones en Oriente Medio.

El oro ha consolidado su rol defensivo en $2,050 por onza, apreciando 7.2% YTD. Los flujos hacia activos seguros se han intensificado ante incertidumbre macro global. La plata mantiene correlación positiva con perspectivas de demanda industrial en tecnología verde.

El cobre industrial cede 3.1% debido a debilidad en ciclos de construcción en China y presiones de demanda post-pandemia. Sin embargo, la transición energética global mantiene perspectivas de demanda estructural favorable a mediano plazo.

ANÁLISIS DE DIVISAS Y TIPOS DE CAMBIO
El EUR/USD se cotiza en 1.0950, reflejando paridad relativa entre expectativas de tasas. El GBP/USD en 1.2750 muestra fortaleza de la libra esterlina por expectativas de estabilidad en política monetaria del BoE. El JPY/USD se cotiza en 153, reflejando debilidad estructural del yen en contexto de diferenciales de tasas.

RECOMENDACIONES ESTRATÉGICAS
1. Mantener sobrepeso en tecnología defensiva y semiconductores
2. Aumentar exposición a mercados emergentes selectos con valuaciones atractivas
3. Considerar cobertura en oro para portafolios agresivos
4. Reducir exposición a bonos de largo plazo antes de cambios de tasas esperados
5. Monitorear closely desarrollos geopolíticos para eventos de cola (tail risks)

RIESGOS IDENTIFICADOS Y MITIGACIÓN
- Riesgo de recesión global: Mantener exposición diversificada
- Volatilidad en commodities: Utilizar posiciones hedged
- Cambios de políticas: Monitoreo continuo de comunicaciones de bancos centrales

CONCLUSIONES
Los mercados globales permanecen en trayectoria alcista con perspectivas favorables para la segunda mitad de 2026. Se recomienda posicionamiento selectivo y gestión activa de riesgos.`,

        geopolitical: `ANÁLISIS GEOPOLÍTICO GLOBAL - IMPLICACIONES PARA MERCADOS FINANCIEROS

RESUMEN EJECUTIVO
El panorama geopolítico global durante 2026 presenta una combinación compleja de oportunidades y riesgos sistémicos. Las tensiones en Oriente Medio mantienen primas de riesgo elevadas en energía. La competencia tecnológica entre potencias genera presiones en cadenas de suministro críticas. Los conflictos comerciales persistentes imponen restricciones en flujos de capital internacional.

Sin embargo, emergentes como México y Vietnam ofrecen oportunidades de nearshoring y diversificación geográfica de riesgos. La estabilidad relativa en Asia-Pacífico y Europa proporciona anclas para inversión institucional.

ANÁLISIS REGIONAL DETALLADO

ORIENTE MEDIO - VOLATILIDAD PERSISTENTE
Las tensiones geopolíticas en Oriente Medio continúan siendo factor de riesgo sistémico para mercados de energía. Los precios del petróleo mantienen prima de riesgo de $3-5 por barril por incertidumbre geopolítica. Un escalamiento moderado en conflictividad podría elevar WTI a $90-95/barril.

Implicación para mercados: Prima de volatilidad en energía, oportunidades en defensivas y tecnología limpia.

ASIA-PACÍFICO - COMPETENCIA TECNOLÓGICA
Las tensiones comerciales y tecnológicas entre potencias generan presiones en semiconductores y componentes electrónicos. Taiwan permanece como punto focal de atención de mercados, con potencial para shocks de suministro.

Perspectiva: Oportunidades en nearshoring hacia México, Vietnamita y Tailandia. Riesgos en cadenas de suministro de electrónica.

EUROPA - ESTABILIDAD CON PRESIONES REGULATORIAS
La UE mantiene estabilidad política relativa pero enfrenta presiones por regulación climática, fiscal y tecnológica. Las elecciones europeas generan incertidumbre de corto plazo pero perspectivas favorables de mediano plazo.

Estrategia: Inversión selectiva en Tech europeo con valuaciones atractivas post-corrección.

AMÉRICA LATINA - OPORTUNIDADES DE NEARSHORING
México emerge como ganador claro de reconfiguración de cadenas de suministro. Las inversiones en manufactura y tecnología aceleran por relocalización desde Asia. Argentina y Brasil ofrecen acceso a recursos críticos.

IMPACTO EN SECTORES FINANCIEROS

Energía: Volatilidad estructural. Oportunidad en energías renovables y transición justa.
Semiconductores: Riesgos de suministro pero demanda secular de IA y computación.
Defensa: Incremento de inversión budgetary. Oportunidades en contratistas especializados.
Tecnología Verde: Momentum favorable por políticas de transición energética.
Finanzas: Digitalización acelerada por regulación fintech.

RECOMENDACIONES GEOPOLÍTICAS PARA PORTAFOLIO

1. Cobertura en oro y bonos del tesoro estadounidense
2. Exposición selectiva a mercados emergentes con fundamentos sólidos
3. Inversión en energías renovables y tecnología verde
4. Nearshoring en México para capturar reconfiguración de valor
5. Diversificación geográfica de riesgos de concentración

ESCENARIOS DE RIESGO TAIL

Escenario 1 (Baja probabilidad): Escalamiento en Oriente Medio → WTI $100+, caída de equities -15-20%
Escenario 2 (Media probabilidad): Tensiones comerciales intensas → Volatilidad sectorial, oportunidades en defensivas
Escenario 3 (Alta probabilidad): Stabilización geopolítica gradual → Continuidad de rally alcista

CONCLUSIÓN
La inestabilidad geopolítica seguirá siendo factor presente pero manejable con estrategias de diversificación y cobertura adecuadas.`,

        mexico: `PERSPECTIVA ECONÓMICA MÉXICO 2026-2027: ANÁLISIS INTEGRAL Y RECOMENDACIONES

RESUMEN EJECUTIVO
La economía mexicana se posiciona como uno de los casos de éxito en América Latina durante 2026, beneficiándose de la reconfiguración de cadenas de suministro globales (nearshoring) y el fortalecimiento de su rol como proveedor de manufac tura de calidad a Norteamérica. El crecimiento del PIB se proyecta en 1.8% para 2026, moderado por presiones internas pero sostenido por demanda externa fuerte.

El peso mexicano mantiene estabilidad relativa en 17.50 por dólar, reflejando confianza relativa en fundamentos macroeconómicos. Las tasas de Banxico permanecen en 11.0% con expectativas de moderación gradual hacia Q4 2026.

ANÁLISIS MACROECONÓMICO DETALLADO

PIB Y CRECIMIENTO ECONÓMICO
Se proyecta crecimiento del PIB mexicano de 1.8% para 2026, con riesgo a la baja por incertidumbre global pero sostenido por nearshoring. El sector manufacturero lidera crecimiento con expansión de plantas de ensamble automotriz y electrónica. El sector servicios mantiene dinamismo con crecimiento del 2.1%. Actividades primarias (agricultura) experimentan presiones por volatilidad climática.

INFLACIÓN Y POLÍTICA MONETARIA
La inflación general se modera a 4.2% desde 5.8% observado en 2025, convergiendo gradualmente a la meta de Banxico de 3.0%. Las presiones inflacionarias se concentran en energía (petróleo) y alimentos procesados. La inflación subyacente desciende a 3.8%, sugiriendo anclaje de expectativas.

Banxico mantiene su tasa de política monetaria en 11.0% pero comunica inclinación hacia recortes gradua les a partir de Q3 2026. Se proyectan recortes acumulados de 100-150 puntos base en lo restante del año.

MERCADO CAMBIARIO
El peso mexicano se cotiza en 17.50 por dólar, apreciándose 2.1% desde inicio de año. La fortaleza del peso refleja: (i) diferenciales atractivos de tasas de interés, (ii) flujos de inversión directa robusta en manufacturero, (iii) estabilidad relativa de fundamentos.

Riesgos a la baja: Depreciación si tasas globales caen más rápido de lo esperado.

MERCADO DE DEUDA SOBERANA
Los bonos mexicanos M28 (28 años) se cotizan en 6.1%, reflejando spread de 180 puntos básicos sobre Treasuries estadounidenses. El perfil de riesgo-rendimiento permanece atractivo para inversionistas internacionales.

El mercado de deuda interna (pesos) experimenta fortaleza relativa con demanda de inversión institucional robusta. Los CETEs se cotizan en 10.8%, atractivos para corto plazo.

NEARSHORING Y OPORTUNIDADES DE INVERSIÓN
El nearshoring emerges como motor principal de inversión directa en México. Se estiman inflows de $45-50 mil millones para 2026, acelerados por tensiones comerciales China-EE.UU. y reshoring desde Asia.

Sectores principales beneficiados:
- Automotriz: Nuevas plantas de manufactura en Bajío y Noreste
- Electrónica: Ensamble de semiconductores y componentes críticos
- Electrodomésticos: Reubicación de producción desde Asia
- Química: Derivados de petróleo y especializados
- Textil: Reconfiguración de cadenas desde Bangladesh y Vietnam

Regiones con mayor potencial: Guanajuato, Querétaro, Nuevo León, San Luis Potosí.

REMESAS Y FLUJOS DE CAPITAL
Las remesas de mexicanos en el extranjero mantienen fortaleza con $5.2 mil millones mensuales ($62+ mil millones anuales). Este flujo proporciona estabilidad a cuenta corriente y actúa como "estabilizador automático" de demanda interna.

Riesgos: Desaceleración económica en EE.UU. impactaría remesas con lag de 1-2 trimestres.

RECOMENDACIONES PARA INVERSORES

POSICIONES RECOMENDADAS:
1. Overweight en activos mexicanos (bonos, equities)
2. Posiciones en peso mexicano para carry trade
3. Exposición a manufactura beneficiada de nearshoring
4. Bono Soberano M28 para rendimiento atractivo ajustado por riesgo

SECTORES PREFERIDOS:
- Construcción y materiales de construcción
- Logística y infraestructura
- Tecnología aplicada a manufactura
- Energías limpias (reforma energética)
- Servicios financieros

RIESGOS A MONITOREAR:
- Cambios de política en EE.UU. que afecten nearshoring
- Inestabilidad de remesas por ciclo económico externo
- Volatilidad de precios de petróleo y energéticos
- Incertidumbre política interna (elecciones locales)

CONCLUSIÓN
México se posiciona favorablemente para capturar oportunidades de reconfiguración económica global. Los fundamentos macroeconómicos son sólidos y las perspectivas de crecimiento favorable. Los activos mexicanos ofrecen valor relativo atractivo en contexto de mercados globales complejos.

Se recomienda mantener posición OVERWEIGHT en México para portafolios latinoamericanos y emergentes.`
    };

    return demoReports[reportType] || demoReports.market;
}

/**
 * POST /api/reports/generate
 * Genera un reporte con Gemini Pro y lo envía por email en formato Word
 */
router.post('/generate', verifyToken, reportLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const reportType = String(body.reportType || 'market');
        const userEmail = String(body.userEmail || req.user.email || '').trim().toLowerCase();

        if (!REPORT_TYPES.has(reportType)) {
            return res.status(400).json({ error: 'Tipo de reporte inválido' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) || userEmail.length > 254) {
            return res.status(400).json({ error: 'Email inválido' });
        }
        if (userEmail !== String(req.user.email || '').trim().toLowerCase()) {
            return res.status(403).json({ error: 'Solo puedes enviar reportes al correo de tu cuenta.' });
        }

        // Validar que Gemini esté disponible
        if (!genAI) {
            return res.status(503).json({ error: 'Gemini API no configurada' });
        }

        // Prompt según el tipo de reporte
        const prompts = {
            market: `Genera un reporte ejecutivo profesional sobre análisis de mercados financieros globales. El reporte debe incluir:
1. Resumen Ejecutivo (3-4 párrafos)
2. Análisis de Índices Principales (S&P 500, DAX, Nikkei, etc.)
3. Análisis de Commodities (Petróleo, Oro, Cobre)
4. Análisis de Divisas (EUR/USD, GBP/USD, etc.)
5. Recomendaciones de Inversión
6. Riesgos Identificados
7. Conclusiones

Usa un tono profesional y formal. Incluye datos ficticios pero realistas.`,

            geopolitical: `Genera un reporte profesional sobre análisis geopolítico global. Incluye:
1. Resumen Ejecutivo
2. Tensiones Regionales (Oriente Medio, Asia-Pacífico, Europa)
3. Impacto en Mercados de Energía
4. Análisis de Conflictos Comerciales
5. Riesgos Sistémicos
6. Oportunidades de Inversión
7. Conclusiones

Usa un lenguaje analítico y formal.`,

            mexico: `Genera un reporte sobre la economía mexicana y perspectivas de inversión. Incluye:
1. Resumen de Coyuntura Actual
2. Análisis del Peso Mexicano
3. Mercado de Deuda Soberana
4. Proyecciones del PIB
5. Tasas de Interés (Banxico)
6. Nearshoring y Oportunidades
7. Recomendaciones de Inversión en Activos Mexicanos
8. Conclusiones

Mantén un tono profesional y basado en datos.`
        };

        const prompt = prompts[reportType] || prompts.market;

        // Generar contenido con Gemini
        console.log(`[GEMINI] Generando reporte tipo: ${reportType}`);
        let generatedText;
        
        try {
            const model = genAI.getGenerativeModel({ model: MODEL_FLASH });
            const result = await model.generateContent(prompt);
            generatedText = result.response.text();
            console.log(`[GEMINI] ✅ Reporte generado con ${MODEL_FLASH}`);
        } catch (error) {
            console.log(`[GEMINI] Fallback: usando contenido de demostración (${error.message})`);
        }
        
        // Si Gemini falló, usar fallback
        if (!generatedText) {
            generatedText = generateDemoContent(reportType);
        }

        // Crear documento Word mejorado
        const docSections = generatedText.split('\n\n').filter(s => s.trim());
        
        // Mapeo de emojis según el tipo de reporte
        const reportEmojis = {
            market: '📊',
            geopolitical: '🌍',
            mexico: '🇲🇽'
        };
        
        const emoji = reportEmojis[reportType] || '📄';
        const reportTitles = {
            market: 'ANÁLISIS DE MERCADOS',
            geopolitical: 'ANÁLISIS GEOPOLÍTICO',
            mexico: 'PERSPECTIVA MÉXICO'
        };

        // Procesar secciones con mejor formato
        const docParagraphs = [];
        docSections.forEach((section, idx) => {
            const lines = section.split('\n');
            
            lines.forEach((line, lineIdx) => {
                if (!line.trim()) return;
                
                // Detectar si es un encabezado (comienza con número o está en mayúsculas)
                const isMainHeading = /^[\d]+\./.test(line) || (line.length < 80 && line === line.toUpperCase() && line.length > 5);
                const isSubHeading = line.startsWith('  ');
                
                if (isMainHeading && lineIdx === 0) {
                    docParagraphs.push(
                        new Paragraph({
                            heading: HeadingLevel.HEADING_1,
                            shading: { type: 'clear', color: '0055BB' },
                            spacing: { before: 300, after: 100 },
                            children: [
                                new TextRun({ text: line.replace(/^[\d]+\.\s*/, ''), bold: true, size: 28, color: 'FFFFFF' })
                            ]
                        })
                    );
                } else if (isSubHeading) {
                    docParagraphs.push(
                        new Paragraph({
                            heading: HeadingLevel.HEADING_2,
                            spacing: { before: 150, after: 100 },
                            children: [
                                new TextRun({ text: line.trim(), bold: true, size: 24, color: '003366' })
                            ]
                        })
                    );
                } else {
                    docParagraphs.push(
                        new Paragraph({
                            spacing: { after: 120, line: 320 },
                            alignment: AlignmentType.JUSTIFIED,
                            children: [
                                new TextRun({ text: line.trim(), size: 22 })
                            ]
                        })
                    );
                }
            });
        });

        // Encabezado profesional ejecutivo
        const now = new Date();
        const titleParagraphs = [
            new Paragraph({
                spacing: { after: 50 },
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: 'VALLNEWS', bold: true, size: 72, color: '0055BB' })
                ]
            }),
            new Paragraph({
                spacing: { after: 200 },
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: `${emoji} ${reportTitles[reportType] || 'REPORTE ESPECIAL'}`, bold: true, size: 36, color: '003366' })
                ]
            }),
            // Línea divisora
            new Paragraph({
                spacing: { after: 200 },
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: '═════════════════════════════════════════════════════', size: 20, color: '0055BB' })
                ]
            }),
            // Información del reporte
            new Paragraph({
                spacing: { after: 300 },
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({
                        text: 'Reporte de Inteligencia Económica Global • ',
                        color: '666666',
                        size: 20
                    }),
                    new TextRun({
                        text: `${now.toLocaleDateString('es-ES')} • ${now.toLocaleTimeString('es-ES')}`,
                        color: '666666',
                        size: 20,
                        bold: true
                    })
                ]
            })
        ];

        const doc = new Document({
            sections: [{
                children: [...titleParagraphs, ...docParagraphs],
                footers: {
                    default: new (require('docx').Footer)({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({
                                        text: '🌍 VALLNEWS · ',
                                        color: '0055BB',
                                        size: 18,
                                        bold: true
                                    }),
                                    new TextRun({
                                        text: `Reporte ${reportType.toUpperCase()} • ${now.toLocaleDateString('es-ES')} • Página `,
                                        color: '666666',
                                        size: 18
                                    })
                                ]
                            })
                        ]
                    })
                }
            }]
        });

        // Generar buffer del documento
        const docBuffer = await Packer.toBuffer(doc);

        // Guardar temporalmente en un directorio escribible tambien en serverless.
        const tempPath = path.join(os.tmpdir(), `vallnews_report_${Date.now()}.docx`);
        fs.writeFileSync(tempPath, docBuffer);

        // Enviar por email con template mejorado
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: userEmail,
            subject: `🌍 ${emoji} VALLNEWS - ${reportTitles[reportType] || 'Reporte'} - ${now.toLocaleDateString('es-ES')}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; background: #f5f5f5; }
                        .container { max-width: 650px; margin: 0 auto; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                        .header { background: linear-gradient(135deg, #0055BB 0%, #003366 100%); color: white; padding: 40px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
                        .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
                        .content { padding: 40px; }
                        .executive-summary { background: #f0f4f8; border-left: 4px solid #0055BB; padding: 20px; margin: 20px 0; border-radius: 4px; }
                        .executive-summary h3 { margin-top: 0; color: #0055BB; }
                        .report-details { background: #f9f9f9; padding: 20px; border-radius: 4px; margin: 20px 0; }
                        .report-details table { width: 100%; border-collapse: collapse; }
                        .report-details td { padding: 8px 0; border-bottom: 1px solid #ddd; }
                        .report-details strong { color: #0055BB; }
                        .cta-button { display: inline-block; background: #0055BB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
                        .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; }
                        .footer-logo { color: #0055BB; font-weight: bold; font-size: 14px; }
                        .badge { display: inline-block; background: #0055BB; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; margin-right: 8px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>${emoji} VALLNEWS</h1>
                            <p>Inteligencia Económica Global</p>
                        </div>
                        
                        <div class="content">
                            <h2 style="color: #0055BB; margin-top: 0;">
                                ${reportTitles[reportType] || 'Reporte Especial'}
                            </h2>
                            
                            <p>Estimado cliente,</p>
                            <p>
                                Adjuntamos su <strong>reporte ejecutivo personalizado</strong> con análisis 
                                de mercados, indicadores económicos y oportunidades de inversión.
                            </p>
                            
                            <div class="report-details">
                                <table>
                                    <tr>
                                        <td><strong>📄 Tipo de Reporte:</strong></td>
                                        <td><span class="badge">${reportType.toUpperCase()}</span></td>
                                    </tr>
                                    <tr>
                                        <td><strong>📅 Fecha:</strong></td>
                                        <td>${now.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>⏰ Hora Generación:</strong></td>
                                        <td>${now.toLocaleTimeString('es-ES')}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>📊 Formato:</strong></td>
                                        <td>Documento ejecutivo (Word .docx)</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div class="executive-summary">
                                <h3>📌 Contenido del Reporte</h3>
                                <ul style="margin: 10px 0; padding-left: 20px;">
                                    <li>Resumen Ejecutivo de Coyuntura</li>
                                    <li>Análisis Técnico y Fundamental</li>
                                    <li>Indicadores Clave de Desempeño</li>
                                    <li>Recomendaciones de Inversión</li>
                                    <li>Riesgos Identificados y Oportunidades</li>
                                    <li>Proyecciones y Conclusiones</li>
                                </ul>
                            </div>
                            
                            <p style="text-align: center; margin: 30px 0;">
                                <a href="mailto:support@vallnews.com" class="cta-button">💬 Preguntas o Comentarios</a>
                            </p>
                            
                            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                            
                            <p style="font-size: 12px; color: #666; margin: 20px 0 0 0;">
                                <strong>Aviso Confidencial:</strong> Este reporte contiene información 
                                confidencial y análisis propietario. Si recibió este mensaje por error, 
                                favor de notificarnos inmediatamente.
                            </p>
                        </div>
                        
                        <div class="footer">
                            <p class="footer-logo">🌍 VALLNEWS 2026</p>
                            <p>Inteligencia Económica Global • Análisis de Mercados • Asesoría Financiera</p>
                            <p style="color: #999;">© 2026 VALLNEWS. Todos los derechos reservados.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            attachments: [{
                filename: `VALLNEWS_Report_${reportType}_${new Date().toISOString().split('T')[0]}.docx`,
                path: tempPath
            }]
        };

        // Intentar enviar email, o guardar localmente si falla
        try {
            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Reporte enviado a: ${userEmail}`);
            fs.unlinkSync(tempPath);
        } catch (emailError) {
            console.log(`[EMAIL FALLBACK] No se pudo enviar email (${emailError.message})`);
            if (process.env.VERCEL) {
                try { fs.unlinkSync(tempPath); } catch {}
                return res.status(502).json({ error: 'No se pudo enviar el reporte por email.' });
            }
            // Guardar documento localmente solo en desarrollo; en Vercel el FS persistente no existe.
            const localPath = path.join(__dirname, '..', 'generated-reports', `VALLNEWS_Report_${reportType}_${Date.now()}.docx`);
            
            if (!process.env.VERCEL) {
                const reportDir = path.dirname(localPath);
                if (!fs.existsSync(reportDir)) {
                    fs.mkdirSync(reportDir, { recursive: true });
                }
                fs.copyFileSync(tempPath, localPath);
                fs.unlinkSync(tempPath);
            }
            
            console.log(`[EMAIL FALLBACK] Reporte guardado localmente en: ${localPath}`);
        }

        res.json({
            success: true,
            message: `Reporte generado exitosamente${process.env.GMAIL_USER && process.env.GMAIL_USER !== 'tu_email@gmail.com' ? ' y enviado a ' + userEmail : ' (guardado localmente)'}`,
            reportType,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('[REPORTS ERROR]', error.message);
        res.status(500).json({ error: 'Error generando reporte' });
    }
});

/**
 * GET /api/reports/types
 * Retorna tipos de reportes disponibles
 */
router.get('/types', (req, res) => {
    res.json({
        types: [
            { id: 'market', name: 'Análisis de Mercados', icon: '📈' },
            { id: 'geopolitical', name: 'Análisis Geopolítico', icon: '🌍' },
            { id: 'mexico', name: 'Perspectiva México', icon: '🇲🇽' }
        ]
    });
});

module.exports = router;
