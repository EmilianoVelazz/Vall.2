'use strict';

// ============================================================================
// Calendario de Catalizadores Institucionales (Macro MX/US · Granos · Proteínas)
//
// Genera la agenda vigente de eventos que mueven USD/MXN, tasas, granos y
// proteínas (Banxico, Fed FOMC, INEGI INPC, USDA WASDE, Cold Storage,
// Cattle on Feed y Hogs & Pigs) con cuenta regresiva y lectura de impacto.
// ============================================================================

const DAY_MS = 86_400_000;

function nearestBusinessDay(year, monthIndex, targetDay) {
    const dt = new Date(Date.UTC(year, monthIndex, targetDay, 12, 0, 0));
    const dow = dt.getUTCDay();
    if (dow === 6) dt.setUTCDate(dt.getUTCDate() - 1); // Sábado → viernes
    if (dow === 0) dt.setUTCDate(dt.getUTCDate() + 1); // Domingo → lunes
    return dt;
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
    const first = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + offset + (nth - 1) * 7;
    return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

function lastBusinessDayNear(year, monthIndex, targetDay) {
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return nearestBusinessDay(year, monthIndex, Math.min(targetDay, lastDay));
}

function formatIsoDate(dt) {
    return dt.toISOString().slice(0, 10);
}

function generateCatalystsForYear(year) {
    const events = [];

    // 1. USDA WASDE (mensual, ~día 10–12 hábil)
    for (let m = 0; m < 12; m++) {
        const dt = nearestBusinessDay(year, m, 11);
        events.push({
            id: `wasde-${year}-${String(m + 1).padStart(2, '0')}`,
            date: formatIsoDate(dt),
            timeCdmx: '11:00 CDMX',
            institution: 'USDA',
            title: 'Reporte USDA WASDE (Oferta y Demanda Mundial)',
            category: 'agro',
            impact: 'ALTO',
            assets: ['Maíz (ZC=F)', 'Soya (ZS=F)', 'Trigo (ZW=F)', 'Costo Ración MX'],
            whyItMatters: 'Ajusta inventarios finales globales de maíz y soya; mueve directo el costo de alimento balanceado y márgenes pecuarios.',
        });
    }

    // 2. INEGI INPC Inflación Mensual (mensual, ~día 9 hábil)
    for (let m = 0; m < 12; m++) {
        const dt = nearestBusinessDay(year, m, 9);
        events.push({
            id: `inegi-inpc-${year}-${String(m + 1).padStart(2, '0')}`,
            date: formatIsoDate(dt),
            timeCdmx: '06:00 CDMX',
            institution: 'INEGI',
            title: 'Inflación Nacional INPC México (Mensual)',
            category: 'macro',
            impact: 'ALTO',
            assets: ['USD/MXN', 'CETES / Bonos M', 'Canasta Pecuaria MX'],
            whyItMatters: 'Define expectativas de recorte o pausa de Banxico y mide la presión inflacionaria en alimentos pecuarios.',
        });
    }

    // 3. USDA Cold Storage (mensual, ~día 23 hábil)
    for (let m = 0; m < 12; m++) {
        const dt = nearestBusinessDay(year, m, 23);
        events.push({
            id: `usda-cold-storage-${year}-${String(m + 1).padStart(2, '0')}`,
            date: formatIsoDate(dt),
            timeCdmx: '14:00 CDMX',
            institution: 'USDA NASS',
            title: 'USDA Cold Storage (Inventarios Congelados de Proteína)',
            category: 'proteinas',
            impact: 'ALTO',
            assets: ['Cerdo (HE=F)', 'Res (LE=F)', 'Pollo', 'Paridad MX'],
            whyItMatters: 'Indicador adelantado a 30–60 días de presión en precios de cerdo, res y pollo en Norteamérica.',
        });
    }

    // 4. USDA Cattle on Feed (mensual, 3er viernes)
    for (let m = 0; m < 12; m++) {
        const dt = nthWeekdayOfMonth(year, m, 5, 3);
        events.push({
            id: `usda-cattle-feed-${year}-${String(m + 1).padStart(2, '0')}`,
            date: formatIsoDate(dt),
            timeCdmx: '14:00 CDMX',
            institution: 'USDA NASS',
            title: 'USDA Cattle on Feed (Engorda Bovina EE. UU.)',
            category: 'proteinas',
            impact: 'MEDIO',
            assets: ['Res (LE=F)', 'Ganado en Pie (GF=F)', 'Paridad Res MX'],
            whyItMatters: 'Mide colocaciones en corrales y oferta esperada de carne bovina para los próximos 3–5 meses.',
        });
    }

    // 5. Decisión de Política Monetaria Banxico (8 reuniones/año: feb, mar, may, jun, ago, sep, nov, dic)
    const banxicoMonths = [1, 2, 4, 5, 7, 8, 10, 11];
    for (const m of banxicoMonths) {
        const dt = nthWeekdayOfMonth(year, m, 4, 3); // 3er jueves
        events.push({
            id: `banxico-rate-${year}-${String(m + 1).padStart(2, '0')}`,
            date: formatIsoDate(dt),
            timeCdmx: '13:00 CDMX',
            institution: 'Banxico',
            title: 'Decisión de Política Monetaria · Banco de México',
            category: 'macro',
            impact: 'ALTO',
            assets: ['USD/MXN', 'TIIE 28d', 'CETES', 'Costo Inventario'],
            whyItMatters: 'Cambia el diferencial de tasas México–EE. UU., el tipo de cambio y el costo financiero de mantener inventario.',
        });
    }

    // 6. Decisión de Tasas Reserva Federal (FOMC: ene, mar, may, jun, jul, sep, nov, dic)
    const fomcMonths = [0, 2, 4, 5, 6, 8, 10, 11];
    for (const m of fomcMonths) {
        const dt = nthWeekdayOfMonth(year, m, 3, 3); // 3er miércoles
        events.push({
            id: `fed-fomc-${year}-${String(m + 1).padStart(2, '0')}`,
            date: formatIsoDate(dt),
            timeCdmx: '13:00 CDMX',
            institution: 'Reserva Federal',
            title: 'Decisión de Tasas de Interés · FOMC (Fed)',
            category: 'macro',
            impact: 'ALTO',
            assets: ['USD/MXN', 'DXY', 'Treasury 10A', 'Commodities USD'],
            whyItMatters: 'Marca la dirección global del dólar (DXY) y los rendimientos soberanos, afectando coberturas cambiarias y granos.',
        });
    }

    // 7. USDA Quarterly Hogs & Pigs (mar, jun, sep, dic · ~día 27 hábil)
    for (const m of [2, 5, 8, 11]) {
        const dt = lastBusinessDayNear(year, m, 27);
        events.push({
            id: `usda-hogs-pigs-${year}-${String(m + 1).padStart(2, '0')}`,
            date: formatIsoDate(dt),
            timeCdmx: '14:00 CDMX',
            institution: 'USDA NASS',
            title: 'USDA Quarterly Hogs & Pigs (Inventario Porcino)',
            category: 'proteinas',
            impact: 'ALTO',
            assets: ['Cerdo (HE=F)', 'Cutout USDA', 'Paridad Cerdo MX'],
            whyItMatters: 'El reporte trimestral más influyente para el ciclo porcino: mide piara reproductora, pariciones y oferta a 6 meses.',
        });
    }

    return events;
}

function getUpcomingMarketCatalysts({ nowMs = Date.now(), daysAhead = 45, category = 'all', limit = 10 } = {}) {
    const todayIso = new Date(nowMs).toISOString().slice(0, 10);
    const todayUtcMs = Date.parse(`${todayIso}T12:00:00Z`);
    const year = new Date(todayUtcMs).getUTCFullYear();

    const all = [
        ...generateCatalystsForYear(year),
        ...generateCatalystsForYear(year + 1),
    ];

    const normCat = String(category || 'all').toLowerCase();
    const upcoming = all
        .map(ev => {
            const evMs = Date.parse(`${ev.date}T12:00:00Z`);
            const daysUntil = Math.round((evMs - todayUtcMs) / DAY_MS);
            return {
                ...ev,
                daysUntil,
                countdownLabel: daysUntil === 0 ? 'Hoy' : daysUntil === 1 ? 'Mañana' : `En ${daysUntil} días`,
            };
        })
        .filter(ev => ev.daysUntil >= 0 && ev.daysUntil <= daysAhead)
        .filter(ev => normCat === 'all' || normCat === 'todos' || ev.category === normCat)
        .sort((a, b) => a.daysUntil - b.daysUntil || (a.impact === 'ALTO' ? -1 : 1));

    return {
        available: true,
        generatedAt: new Date(nowMs).toISOString(),
        asOfDate: todayIso,
        scheduleBasis: 'calendario_institucional_referencial',
        disclaimer: 'Agenda de referencia basada en calendarios oficiales (Banxico, Fed, INEGI, USDA); verificar hora exacta el día de publicación.',
        count: Math.min(upcoming.length, limit),
        events: upcoming.slice(0, limit),
    };
}

function formatCatalystsForOrion(report) {
    if (!report?.events?.length) return '';
    const lines = [
        `[CALENDARIO DE CATALIZADORES DE MERCADO (PRÓXIMOS EVENTOS · CORTE ${report.asOfDate})]`,
        ...report.events.slice(0, 6).map(ev =>
            `- ${ev.date} (${ev.countdownLabel}, ${ev.timeCdmx}) · ${ev.institution} — ${ev.title} [Impacto ${ev.impact}]: afecta ${ev.assets.join(', ')}. ${ev.whyItMatters}`
        ),
        `Nota: ${report.disclaimer}`,
    ];
    return lines.join('\n');
}

module.exports = { getUpcomingMarketCatalysts, formatCatalystsForOrion };
