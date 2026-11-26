'use strict';
const DAY = 86_400_000;
const VALIDATION_PROTOCOL = 'purged_prequential_v1';
const MIN_VALIDATION_WINDOWS = 12;
const MODEL_VERSION = 'orion-protein-ml-v7.0-purged';

function targetDate(lastDate, steps, cadence) {
    const date = new Date(lastDate + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || !Number.isInteger(steps) || steps < 1) return null;
    if (cadence === 'monthly') {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + steps);
        const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, end));
    } else if (cadence === 'weekly') date.setUTCDate(date.getUTCDate() + steps * 7);
    else for (let count = 0; count < steps;) {
        date.setUTCDate(date.getUTCDate() + 1);
        if (![0, 6].includes(date.getUTCDay())) count++;
    }
    return date.toISOString().slice(0, 10);
}

function seriesFreshness(lastDate, cadence, now = Date.now()) {
    const observed = Date.parse(lastDate), ageDays = (Number(now) - observed) / DAY;
    const maxAgeDays = ({daily: 14, weekly: 35, monthly: 120})[cadence] || 14;
    return {fresh: Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= maxAgeDays,
        ageDays: Number.isFinite(ageDays) ? Math.round(ageDays * 10) / 10 : null, maxAgeDays};
}

function publicationReasons({point, directional, freshness, target, now}) {
    const reasons = [];
    if (!freshness?.fresh) reasons.push('stale_observations');
    if (!target || target <= new Date(now).toISOString().slice(0, 10)) reasons.push('target_not_in_future');
    if (!point || !(Number.isFinite(point.improvementPct) && point.improvementPct > 0)) reasons.push('price_baseline_not_beaten');
    if (!(Number.isFinite(point?.evaluationPoints) && point.evaluationPoints >= MIN_VALIDATION_WINDOWS)) reasons.push('insufficient_price_validation');
    if (!directional?.available || directional.validationProtocol !== VALIDATION_PROTOCOL
        || directional.evalWindows < MIN_VALIDATION_WINDOWS) reasons.push('insufficient_temporal_validation');
    if (!(Number.isFinite(directional?.directionalAccuracyPct) && Number.isFinite(directional?.baselineAccuracyPct)
        && directional.directionalAccuracyPct > directional.baselineAccuracyPct + 1)) reasons.push('directional_baseline_not_beaten');
    if (!(Number.isFinite(directional?.brierSkillPct) && directional.brierSkillPct > 0)) reasons.push('probabilities_not_improved');
    return reasons;
}

module.exports = {MODEL_VERSION, VALIDATION_PROTOCOL, MIN_VALIDATION_WINDOWS, targetDate, seriesFreshness, publicationReasons};
