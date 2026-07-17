'use strict';

// ── Servicio de Finanzas ─────────────────────────────────────────────────────
// Toda la lógica de generación con Gemini (datos financieros, noticias y
// escenarios Bull/Base/Bear) y los datos de respaldo viven aquí. El router
// routes/finanzas.js solo orquesta caché HTTP + respuestas; no arma prompts
// ni parsea JSON de la IA.

const { genAI, MODEL } = require('../lib/gemini');

// Limpia los ```json ... ``` que a veces envuelve Gemini y extrae el objeto/arreglo.
function _parseJsonLoose(raw, kind /* 'object' | 'array' */) {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const re    = kind === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
        const match = cleaned.match(re);
        if (!match) throw new Error('Gemini no devolvió JSON válido');
        return JSON.parse(match[0]);
    }
}

// ── Datos financieros del panel principal (/api/finanzas) ────────────────────
async function generarDatosFinanzas() {
    if (!genAI) throw new Error('GEMINI_API_KEY no configurada');
    const model = genAI.getGenerativeModel({ model: MODEL });

    const ahora    = new Date();
    const fechaStr = ahora.toLocaleDateString('es-MX', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const horaStr = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    const prompt = `
Eres un analista financiero senior de VALLNEWS. Hoy es ${fechaStr}, ${horaStr} (hora CDMX).

Genera datos financieros realistas para la sección Finanzas de un portal de inteligencia económica mexicana especializado en el sector agropecuario y empresarial.

Devuelve ÚNICAMENTE el siguiente JSON (sin bloques de código, sin comillas extra, sin texto antes o después):

{
  "generado": "${horaStr} · ${ahora.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'}).toUpperCase()}",
  "noticias": [
    {
      "categoria": "Política Monetaria",
      "fecha": "DD MES AAAA · HH:MM",
      "titulo": "Título noticia 1 (real, relevante, profesional)",
      "descripcion": "Descripción de 2 oraciones máximo. Concreta y con datos.",
      "fuente": "BLOOMBERG",
      "impacto": "alto",
      "ia_insight": "Impacto directo en costos o márgenes del sector agropecuario o empresarial. Máx 15 palabras."
    },
    {
      "categoria": "Mercados Globales",
      "fecha": "DD MES AAAA · HH:MM",
      "titulo": "Título noticia 2",
      "descripcion": "Descripción corta.",
      "fuente": "REUTERS",
      "impacto": "medio",
      "ia_insight": "Insight breve."
    },
    {
      "categoria": "Divisas y Commodities",
      "fecha": "DD MES AAAA · HH:MM",
      "titulo": "Título noticia 3",
      "descripcion": "Descripción corta.",
      "fuente": "EL ECONOMISTA",
      "impacto": "bajo",
      "ia_insight": "Insight breve."
    }
  ],
  "bancos_centrales": {
    "banxico": 11.0,
    "fed": 5.25,
    "bce": 4.25,
    "boe": 5.25,
    "boj": 0.1
  },
  "mercados": {
    "nasdaq": { "valor": 18450.5, "cambio_pct": 0.85 },
    "usdmxn": { "valor": 17.15, "cambio_pct": -0.22 }
  },
  "tiie": 11.25,
  "vai": {
    "asset": "BONOS 10Y MX",
    "prediccion": 72,
    "veredicto": "Bajista",
    "alerta": "Diferencial de tasas MX-US presiona rendimientos reales."
  }
}

Reglas:
- banxico entre 10.5 y 11.5, fed entre 4.75 y 5.5, bce entre 3.75 y 4.5, boe entre 4.75 y 5.5, boj entre 0 y 0.25
- nasdaq entre 17000 y 20000, usdmxn entre 16.5 y 18.0
- tiie siempre 0.25 puntos por encima de banxico
- impacto solo puede ser: "alto", "medio" o "bajo"
- prediccion entre 45 y 92 (entero)
- veredicto: "Alcista", "Bajista" o "Neutral"
- fuente: una de BLOOMBERG / REUTERS / WSJ / EL ECONOMISTA / BANXICO / INEGI / FMI / FORBES
- Los titulos deben sonar como noticias reales del día de hoy
- No incluyas comentarios, solo JSON puro
`;

    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();
    return _parseJsonLoose(raw, 'object');
}

// ── Datos de respaldo contextuales (cuando Gemini no está disponible) ────────
function buildFallbackData() {
    const ahora = new Date();
    const hora  = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    return {
        generado: `${hora} · ${fecha}`,
        noticias: [
            { categoria: 'Política Monetaria', fecha: `${fecha} · ${hora}`, titulo: 'Banxico recorta TIIE a 8.50% ante desaceleración inflacionaria', descripcion: 'El Banco de México continuó con su ciclo de relajamiento monetario, reduciendo la tasa de referencia ante señales de moderación en la inflación y un entorno externo más favorable.', fuente: 'BANXICO', impacto: 'alto', ia_insight: 'Recorte favorece crédito empresarial y costos de financiamiento.' },
            { categoria: 'Mercados Globales', fecha: `${fecha} · ${hora}`, titulo: 'S&P 500 supera 7,300 puntos impulsado por tecnología y resiliencia económica', descripcion: 'Los mercados de renta variable en Estados Unidos mantienen tendencia alcista apoyados en resultados corporativos sólidos y expectativas de recortes adicionales de la Fed en el segundo semestre.', fuente: 'REUTERS', impacto: 'medio', ia_insight: 'Mercados globales en modo expansivo favorecen flujos a emergentes.' },
            { categoria: 'Divisas y Commodities', fecha: `${fecha} · ${hora}`, titulo: 'Peso mexicano cotiza en $17.50 ante flujos de nearshoring e IED', descripcion: 'El tipo de cambio USD/MXN se mantiene en rangos relativamente estables respaldado por el diferencial de tasas México-EU, remesas en máximos históricos e inversión extranjera directa por nearshoring.', fuente: 'BANXICO', impacto: 'medio', ia_insight: 'Nearshoring sostiene demanda estructural de pesos mexicanos.' },
            { categoria: 'Commodities', fecha: `${fecha} · ${hora}`, titulo: 'Oro alcanza máximos históricos por encima de $4,100 dólares por onza', descripcion: 'El metal precioso mantiene su rally impulsado por la demanda de bancos centrales, tensiones geopolíticas y expectativas de política monetaria más laxa en los países desarrollados.', fuente: 'BLOOMBERG', impacto: 'medio', ia_insight: 'Oro como cobertura ante volatilidad global favorece activos alternativos.' },
            { categoria: 'Economía México', fecha: `${fecha} · ${hora}`, titulo: 'Remesas a México acumulan cifra récord en el año', descripcion: 'Los envíos de dinero de mexicanos en el exterior continúan en niveles históricos, aportando divisas que fortalecen la cuenta corriente y la estabilidad del tipo de cambio.', fuente: 'BANXICO', impacto: 'bajo', ia_insight: 'Flujo de remesas reduce presión sobre reservas internacionales.' },
        ],
        bancos_centrales: { banxico: 8.50, fed: 4.50, bce: 2.65, boe: 4.50, boj: 0.50 },
        mercados: { nasdaq: { valor: 21800, cambio_pct: 0.6 }, usdmxn: { valor: 17.50, cambio_pct: -0.1 } },
        tiie: 8.50,
        vai: { asset: 'BONOS 10Y MX', prediccion: 62, veredicto: 'Neutral', alerta: 'Monitorear diferencial de tasas MX-EU y próximas decisiones de Banxico.' },
    };
}

// ── Noticias genéricas por categoría/región (/api/noticias) ──────────────────
async function generateNoticias(categoria, region) {
    const model  = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `
Actúa como periodista económico. Genera las 5 noticias más importantes sobre ${categoria} en ${region}.
Usa fuentes serias: Bloomberg, Reuters, Financial Times, El Economista.
Devuelve un JSON array sin texto adicional fuera del JSON:
[{ "titulo": "...", "resumen": "...", "fuente": "...", "impacto": "Alto|Medio|Bajo" }]`;
    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();
    return _parseJsonLoose(raw, 'array');
}

// ── Escenarios Bull/Base/Bear (/api/scenarios) ───────────────────────────────
async function generateScenarios({ tiie, fed, usdmxn, vix, wti }) {
    const model  = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `
Eres un estratega de mercados senior. Datos actuales: TIIE=${tiie.toFixed(2)}%, Fed=${fed.toFixed(2)}%, USD/MXN=${usdmxn.toFixed(2)}, VIX=${vix.toFixed(1)}, WTI=$${wti.toFixed(2)}.

Genera exactamente 3 escenarios para los próximos 90 días para México. Responde SOLO con JSON puro, sin bloques de código:

{
  "bull": {
    "titulo": "Escenario Alcista",
    "probabilidad": 30,
    "driver": "Catalizador principal en máx 8 palabras",
    "peso": "+X.XX (fortalecimiento)",
    "ipc": "+X.X% ganancia estimada IPC",
    "tasa": "Banxico baja/mantiene a X.XX%",
    "descripcion": "2 oraciones concretas. Qué ocurre, por qué y cómo impacta al sector agropecuario y empresarial mexicano.",
    "acciones": ["Acción concreta 1", "Acción concreta 2"]
  },
  "base": {
    "titulo": "Escenario Base",
    "probabilidad": 50,
    "driver": "Catalizador principal en máx 8 palabras",
    "peso": "±X.XX (rango lateral)",
    "ipc": "±X.X% variación esperada IPC",
    "tasa": "Banxico mantiene en X.XX%",
    "descripcion": "2 oraciones concretas.",
    "acciones": ["Acción concreta 1", "Acción concreta 2"]
  },
  "bear": {
    "titulo": "Escenario Bajista",
    "probabilidad": 20,
    "driver": "Catalizador principal en máx 8 palabras",
    "peso": "-X.XX (depreciación)",
    "ipc": "-X.X% pérdida estimada IPC",
    "tasa": "Banxico pausa en X.XX%",
    "descripcion": "2 oraciones concretas.",
    "acciones": ["Acción concreta 1", "Acción concreta 2"]
  },
  "consenso": "Frase de 15 palabras máximo describiendo el sesgo del mercado MX hoy."
}

Reglas: probabilidades deben sumar 100. Usa datos realistas, no ficticios. Solo JSON.`;
    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();
    return _parseJsonLoose(raw, 'object');
}

module.exports = {
    generarDatosFinanzas,
    buildFallbackData,
    generateNoticias,
    generateScenarios,
};
