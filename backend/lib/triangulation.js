/**
 * Motor de Triangulación y Veracidad de Datos v2.0
 * 
 * PRINCIPIO: Nunca presentar una estimación como un hecho.
 * Cada dato que sale del backend lleva un "pasaporte de veracidad" (_meta)
 * que describe exactamente de dónde viene y qué tan confiable es.
 * 
 * FUENTES VERIFICADAS EN TIEMPO REAL:
 *   ✅ CME (Lean Hogs, Live Cattle, Corn, Soybeans) — vía Yahoo Finance
 *   ✅ Banxico FIX (SF43718) — Tipo de cambio oficial
 *   ✅ Banxico TIIE 28 días (SF43783) — Tasa interbancaria oficial
 *   ✅ GDELT / Finnhub — Noticias
 * 
 * FUENTES CON DATOS ESTÁTICOS DE REFERENCIA (NO son tiempo real):
 *   ⚠️ SNIIM — Scraping real no implementado, valores fijos
 *   ⚠️ SIAP — Promedios históricos 2024, no conectado a datos.gob.mx
 *   ⚠️ USDA AMS — Requiere API key, mock sin llave
 *   ⚠️ OECD-FAO — Proyecciones 2023-2032, no conectado a API SDMX
 * 
 * DATOS DERIVADOS (FÓRMULAS INTERNAS):
 *   🔶 Precio Pollo — No cotiza en bolsa. Derivado sintético de maíz (coef. 0.08)
 *   🔶 Feed Cost — Estimación basada en fórmula interna (maíz + soya + fijo)
 */

function triangulateData(sniimData, cmeData, exchangeRate) {
    if (!sniimData || !cmeData || !exchangeRate) return sniimData;

    let icd_global = 100;
    const warnings = [];
    const anomalies = {};
    const provenance = {};

    // ────────────────────────────────────────────────────────────
    // 1. Auditoría de Frescura (Latency Penalty)
    // ────────────────────────────────────────────────────────────
    const hoursOld = (Date.now() - (sniimData.ts || Date.now())) / (1000 * 60 * 60);
    if (hoursOld > 72) {
        icd_global -= 30;
        warnings.push('CRÍTICO: Datos con más de 72 horas de antigüedad.');
    } else if (hoursOld > 24) {
        icd_global -= 10;
        warnings.push('El reporte físico tiene más de 24 horas de antigüedad.');
    }

    // ────────────────────────────────────────────────────────────
    // 2. Detección de datos estáticos vs reales
    // ────────────────────────────────────────────────────────────
    const sniimMeta = sniimData._meta || {};
    if (sniimMeta.type === 'STATIC_REFERENCE' || sniimMeta.type === 'FALLBACK_STATIC') {
        icd_global -= 25;
        warnings.push('SNIIM: Los precios físicos de México son referencias estáticas, NO datos en tiempo real.');
        provenance.sniim = 'STATIC_REFERENCE';
    } else if (sniimMeta.real_time === true) {
        provenance.sniim = 'REAL_TIME';
    } else {
        provenance.sniim = 'UNKNOWN';
        icd_global -= 15;
        warnings.push('SNIIM: No se pudo verificar si los datos son en tiempo real.');
    }

    // ────────────────────────────────────────────────────────────
    // 3. Triangulación CME vs Físico (solo si hay datos de CME)
    // ────────────────────────────────────────────────────────────
    const getCmePrice = (symbol) => {
        if (!Array.isArray(cmeData)) return null;
        const d = cmeData.find(x => x.symbol === symbol || (x.name && x.name.includes(symbol)));
        return d ? parseFloat(d.price) : null;
    };

    const hogsCME = getCmePrice('HE=F');
    const cattleCME = getCmePrice('LE=F');

    if (hogsCME) {
        provenance.cerdo_cme = 'REAL_TIME';
        const factorLbToKg = 1 / 0.453592;
        const precioCmeMxnKg = (hogsCME / 100) * factorLbToKg * exchangeRate;
        const precioSniimPromedio = calcularPromedio(sniimData.cerdo);
        
        if (precioSniimPromedio > 0) {
            const precioTeoricoMX = precioCmeMxnKg * 1.20;
            const desviacion = Math.abs((precioSniimPromedio - precioTeoricoMX) / precioTeoricoMX);

            if (desviacion > 0.40) {
                icd_global -= 20;
                anomalies.cerdo = {
                    type: 'PRICE_DIVERGENCE',
                    fisico_mx: precioSniimPromedio.toFixed(2),
                    teorico_cme: precioTeoricoMX.toFixed(2),
                    desviacion_pct: (desviacion * 100).toFixed(1),
                    message: `Divergencia del ${(desviacion * 100).toFixed(1)}% entre precio físico MX y referencia CME.`
                };
            }
        }
    } else {
        provenance.cerdo_cme = 'NOT_AVAILABLE';
    }

    if (cattleCME) {
        provenance.res_cme = 'REAL_TIME';
    } else {
        provenance.res_cme = 'NOT_AVAILABLE';
    }

    // ────────────────────────────────────────────────────────────
    // 4. Clasificar datos derivados (NO son datos de mercado)
    // ────────────────────────────────────────────────────────────
    provenance.pollo = 'SYNTHETIC_DERIVED';
    provenance.pollo_methodology = 'Precio estimado por correlación lineal con maíz CBOT (coef. 0.08). El pollo no cotiza en bolsa de futuros. Coeficiente NO validado con regresión histórica formal.';
    
    provenance.huevo = 'STATIC_REFERENCE';
    provenance.huevo_note = 'El huevo no cotiza en futuros. Precio fijo de referencia.';

    // ────────────────────────────────────────────────────────────
    // 5. Compilación del Reporte de Veracidad
    // ────────────────────────────────────────────────────────────
    const status = icd_global >= 80 ? 'VERIFIED' 
                 : icd_global >= 60 ? 'CAUTION' 
                 : 'LOW_CONFIDENCE';

    sniimData.veracity_report = {
        icd_score: Math.max(0, icd_global),
        status,
        provenance,
        anomalies,
        warnings,
        real_time_sources: ['CME (Cerdo/Res)', 'Banxico FIX', 'Banxico TIIE', 'GDELT News'],
        static_sources: ['SNIIM (ref. estática)', 'SIAP (cierre 2024)', 'OECD-FAO (outlook 2023)'],
        derived_sources: ['Pollo (sintético maíz)', 'Huevo (ref. fija)', 'Feed Cost (fórmula interna)'],
        last_triangulation: Date.now(),
        disclaimer: 'Los datos etiquetados como STATIC_REFERENCE o SYNTHETIC_DERIVED son estimaciones o promedios históricos. Solo los datos de fuentes CME, Banxico y GDELT son verificados en tiempo real.'
    };

    return sniimData;
}

function calcularPromedio(categoria) {
    if (!categoria) return 0;
    
    if (!Array.isArray(categoria) && typeof categoria === 'object') {
        const valores = Object.values(categoria).map(v => parseFloat(v)).filter(v => v > 0);
        if (valores.length === 0) return 0;
        return valores.reduce((acc, val) => acc + val, 0) / valores.length;
    }

    if (Array.isArray(categoria)) {
        if (categoria.length === 0) return 0;
        let sum = 0, count = 0;
        for (const item of categoria) {
            const val = parseFloat(item.precio || item);
            if (val > 0) { sum += val; count++; }
        }
        return count > 0 ? sum / count : 0;
    }
    
    return 0;
}

module.exports = { triangulateData };
