'use strict';
const {enrichSectorReport}=require('../lib/report-sector-format');
const {normalizeRecipient}=require('../lib/report-email-recipient');
const {normalizePreferenceOverrides}=require('../lib/report-preference-overrides');
const {latestReportCutAt,latestMarketReportCutAt}=require('../lib/report-schedule');

function normalizeAiCustomization(input) {
    if (!input || input.enabled !== true) return { enabled: false };
    const instructions = input.instructions ?? '';
    if (typeof instructions !== 'string' || instructions.length > 4000) {
        throw Object.assign(Error('El pedido de IA admite hasta 4000 caracteres.'), { status: 400 });
    }
    if(input.mode==='instructions' && !instructions.trim()) throw Object.assign(Error('Escribe el pedido para programar la edición con IA.'),{status:400});
    const preferenceOverrides=normalizePreferenceOverrides(input.preferenceOverrides);
    return { enabled: true, instructions: instructions.trim(), tone: ['professional', 'simple', 'technical'].includes(input.tone) ? input.tone : 'professional',...(input.mode==='instructions' ? {mode:'instructions'} : {}),...(preferenceOverrides.length ? {preferenceOverrides} : {}) };
}

function createScheduledReportDelivery({ store, collections, loadSnapshot, generate, personalize, prepare, deliver, enabled = () => true, now = Date.now, maxDurationMs = 180000, concurrency=2 }) {
    let running;
    function run() {
        if (!enabled()) return Promise.resolve({ due: 0, sent: 0, errors: 0, deferred: 0, paused: true });
        if (running) return running;
        running = (async () => {
            const due = await store.due(), snapshots = {};
            let sent = 0, errors = 0, deferred = 0;
            const started = now();
            let cursor=0;
            async function processSchedule(schedule) {
                // Deja margen para completar una generación y su PDF antes de
                // iniciar otra; los pendientes conservan su próxima ejecución.
                if (now() - started > maxDurationMs - 90000) { deferred++; return; }
                let claimed=!store.claim,accepted=false;
                const startedAt=new Date(now()).toISOString();
                try {
                    if(store.claim) {claimed=await store.claim(schedule);if(!claimed){deferred++;return;}}
                    const recipient=normalizeRecipient(schedule.preferences?.emailRecipient,schedule.ownerEmail);
                    if (!collections[schedule.area]?.reportKeys.includes(schedule.reportKey)) throw Error('Colección o informe no disponible.');
                    if (!snapshots[schedule.area]) snapshots[schedule.area] = Promise.resolve().then(()=>loadSnapshot(schedule.area));
                    const snapshot=await snapshots[schedule.area];
                    const scheduledFor=schedule.scheduledFor || schedule.nextRunAt;
                    const expectedCut=Number.isFinite(Date.parse(scheduledFor)) ? (schedule.area==='markets' ? latestMarketReportCutAt : latestReportCutAt)(new Date(Math.max(Date.parse(scheduledFor),now()))) : null;
                    if(expectedCut && !(Date.parse(snapshot?.generatedAt)>=expectedCut.getTime())) {
                        throw Object.assign(Error('El corte programado aún no está listo; se reintentará sin enviar el anterior.'),{code:'REPORT_CUT_NOT_READY'});
                    }
                    const original = snapshot?.reports?.find(report => report.key === schedule.reportKey);
                    if(expectedCut && original && !(Date.parse(original.generatedAt)>=expectedCut.getTime()))throw Object.assign(Error('El informe conserva un corte anterior; se reintentará cuando esté actualizado.'),{code:'REPORT_CUT_NOT_READY'});
                    const base = original && enrichSectorReport(original,schedule.area);
                    if (!base) throw Error('No existe el informe en el corte vigente.');
                    const ai = normalizeAiCustomization(schedule.preferences?.aiCustomization);
                    const report = ai.enabled
                        ? await generate({ report: {...base,collection:schedule.area}, preferences: schedule.preferences, instructions: ai.instructions, options: { tone: ai.tone,...(ai.mode ? {mode:ai.mode} : {}),...(ai.preferenceOverrides?.length ? {preferenceOverrides:ai.preferenceOverrides} : {}) } },{ownerEmail:schedule.ownerEmail})
                        : personalize(base, schedule.preferences);
                    const beforeSend=()=>store.isCurrent ? store.isCurrent(schedule) : Promise.resolve(true);
                    if(!(await beforeSend())) {deferred++;return;}
                    const delivery=await deliver({ recipient, title: `VALLNEWS · ${collections[schedule.area].label} · ${report.title}`, executive: prepare(report),language:schedule.preferences?.language || 'es',owner:schedule.ownerEmail,beforeSend });
                    if(delivery?.skipped){deferred++;return;}
                    accepted=true;
                    const acceptedAt=new Date(now()).toISOString();
                    const preferences={...schedule.preferences,_lastDelivery:{scheduledFor:schedule.scheduledFor || schedule.nextRunAt || null,startedAt,acceptedAt,reportGeneratedAt:base.generatedAt,...(delivery?.messageId ? {messageId:delivery.messageId} : {})}};
                    await store.record(schedule.id, { sentAt: acceptedAt, delivery: schedule.delivery,preferences,leaseUntil:schedule.leaseUntil,leaseToken:schedule.leaseToken });
                    sent++;
                } catch (error) {
                    errors++;
                    // SMTP acceptance cannot be undone. A failed receipt write
                    // must not schedule a known-delivered email as a failed send.
                    if(accepted) sent++;
                    else if(claimed) await store.record(schedule.id, { error: error.message, delivery: schedule.delivery,preferences:schedule.preferences,retryable:error.status!==400,leaseUntil:schedule.leaseUntil,leaseToken:schedule.leaseToken }).catch(() => {});
                    console.warn('[report-email-schedules] Envío programado falló:', error.message);
                }
            }
            const workers=Math.min(due.length,Math.max(1,Math.min(4,Math.floor(Number(concurrency))||2)));
            await Promise.all(Array.from({length:workers},async()=>{while(cursor<due.length){const schedule=due[cursor++];await processSchedule(schedule);}}));
            return { due: due.length, sent, errors, deferred };
        })().finally(() => { running = null; });
        return running;
    }
    return run;
}

module.exports = { normalizeAiCustomization, createScheduledReportDelivery };
