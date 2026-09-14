'use strict';

// Los informes se producen a las 09:00 de Ciudad de México. La conversión se
// hace con Intl en lugar de fijar UTC-6 para no introducir una hora incorrecta
// si cambian las reglas horarias oficiales en el futuro.
const REPORT_TIME_ZONE = 'America/Mexico_City';
const REPORT_HOUR = 9;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function partsAt(date) {
    return Object.fromEntries(partsFormatter.formatToParts(date)
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, Number(part.value)]));
}

function offsetAt(date) {
    const parts = partsAt(date);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function atMexicoTime(year, month, day, hour = REPORT_HOUR) {
    const wallClock = Date.UTC(year, month - 1, day, hour, 0, 0);
    let instant = wallClock;
    // Dos pasadas resuelven correctamente un posible cambio de desfase horario.
    for (let index = 0; index < 2; index += 1) instant = wallClock - offsetAt(new Date(instant));
    return new Date(instant);
}

function nextReportRefreshAt(from = new Date()) {
    const now = from instanceof Date ? from : new Date(from);
    const here = partsAt(now);
    let candidate = atMexicoTime(here.year, here.month, here.day);
    if (candidate.getTime() <= now.getTime()) {
        const tomorrow = new Date(Date.UTC(here.year, here.month - 1, here.day + 1));
        candidate = atMexicoTime(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate());
    }
    return candidate;
}

function scheduleDailyReport(run, label = 'reportes') {
    let timer;
    const arm = () => {
        const next = nextReportRefreshAt();
        const delay = Math.max(1_000, next.getTime() - Date.now());
        timer = setTimeout(async () => {
            try {
                await run();
                console.log(`[${label}] Informes ejecutivos actualizados a las 09:00 (America/Mexico_City).`);
            } catch (error) {
                console.warn(`[${label}] Actualización programada falló:`, error.message);
            } finally {
                arm();
            }
        }, delay);
        timer.unref?.();
    };
    arm();
    return () => clearTimeout(timer);
}

module.exports = { REPORT_TIME_ZONE, REPORT_HOUR, nextReportRefreshAt, scheduleDailyReport };
