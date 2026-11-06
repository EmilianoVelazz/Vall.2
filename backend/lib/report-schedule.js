'use strict';

// Los informes se producen a las 06:00 y 14:00 de Ciudad de México. La conversión se
// hace con Intl en lugar de fijar UTC-6 para no introducir una hora incorrecta
// si cambian las reglas horarias oficiales en el futuro.
const policy=require('../../shared/report-refresh-policy.json');
const REPORT_TIME_ZONE = policy.timeZone;
const REPORT_HOURS = Object.freeze([...policy.dailyHours]);
const MARKET_REPORT_DAY=policy.markets.weekday,MARKET_REPORT_HOUR=policy.markets.hour;

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

function atMexicoTime(year, month, day, hour = REPORT_HOURS[0]) {
    const wallClock = Date.UTC(year, month - 1, day, hour, 0, 0);
    let instant = wallClock;
    // Dos pasadas resuelven correctamente un posible cambio de desfase horario.
    for (let index = 0; index < 2; index += 1) instant = wallClock - offsetAt(new Date(instant));
    return new Date(instant);
}

function nextReportRefreshAt(from = new Date()) {
    const now = from instanceof Date ? from : new Date(from);
    const here = partsAt(now);
    for (const hour of REPORT_HOURS) {
        const candidate = atMexicoTime(here.year, here.month, here.day, hour);
        if (candidate.getTime() > now.getTime()) return candidate;
    }
    const tomorrow = new Date(Date.UTC(here.year, here.month - 1, here.day + 1));
    return atMexicoTime(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), REPORT_HOURS[0]);
}

function latestReportCutAt(from=new Date()) {
    const now=from instanceof Date ? from : new Date(from),here=partsAt(now);
    if(here.hour>=14) return atMexicoTime(here.year,here.month,here.day,14);
    if(here.hour>=6) return atMexicoTime(here.year,here.month,here.day,6);
    const yesterday=new Date(Date.UTC(here.year,here.month-1,here.day-1));
    return atMexicoTime(yesterday.getUTCFullYear(),yesterday.getUTCMonth()+1,yesterday.getUTCDate(),14);
}

function marketCutAt(from,direction){
    const now=from instanceof Date ? from : new Date(from),here=partsAt(now);
    for(let offset=0;offset<=7;offset++){
        const day=new Date(Date.UTC(here.year,here.month-1,here.day+offset*direction));if(day.getUTCDay()!==MARKET_REPORT_DAY)continue;
        const candidate=atMexicoTime(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate(),MARKET_REPORT_HOUR);
        if(direction>0 ? candidate>now : candidate<=now)return candidate;
    }
    throw Error('No se pudo calcular el corte semanal de Mercados.');
}
const nextMarketReportRefreshAt=(from=new Date())=>marketCutAt(from,1);
const latestMarketReportCutAt=(from=new Date())=>marketCutAt(from,-1);
function marketReportRefreshDue(snapshot,now=new Date()){
    return !snapshot?.reports?.length || !Number.isFinite(Date.parse(snapshot.generatedAt)) || Date.parse(snapshot.generatedAt)<latestMarketReportCutAt(now).getTime();
}
function scheduleReport(run,label,nextCut) {
    let timer,active=true;
    const arm = () => {
        if(!active)return;
        const next = nextCut();
        const delay = Math.max(1_000, next.getTime() - Date.now());
        timer = setTimeout(async () => {
            try {
                await run();
                const localHour = partsAt(new Date()).hour;
                console.log(`[${label}] Informes ejecutivos actualizados en el corte de las ${String(localHour).padStart(2, '0')}:00 (America/Mexico_City).`);
            } catch (error) {
                console.warn(`[${label}] Actualización programada falló:`, error.message);
            } finally {
                arm();
            }
        }, delay);
        timer.unref?.();
    };
    arm();
    return () => {active=false;clearTimeout(timer);};
}
const scheduleDailyReport=(run,label='reportes')=>scheduleReport(run,label,nextReportRefreshAt);
const scheduleMarketReport=(run,label='market-reports')=>scheduleReport(run,label,nextMarketReportRefreshAt);

module.exports = { REPORT_TIME_ZONE, REPORT_HOURS, MARKET_REPORT_DAY,MARKET_REPORT_HOUR,nextReportRefreshAt, latestReportCutAt,scheduleDailyReport,nextMarketReportRefreshAt,latestMarketReportCutAt,marketReportRefreshDue,scheduleMarketReport };
