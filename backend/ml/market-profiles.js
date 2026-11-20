'use strict';

const PROFILES = Object.freeze({
    general: { id: 'general', name: 'Mercado financiero', extraMethods: ['general_ema20'], minObservations: 50 },
    fx: { id: 'fx', name: 'Divisas', extraMethods: ['fx_log_drift20', 'fx_ou_ema20'], minObservations: 80 },
    grains: { id: 'grains', name: 'Granos · referencia de futuros', extraMethods: ['grain_damped60', 'grain_seasonal252', 'grain_reversion60'], minObservations: 100 },
    protein_futures: { id: 'protein_futures', name: 'Proteínas · referencia de futuros', extraMethods: ['protein_reversion60', 'protein_ema20'], minObservations: 100 },
    protein_daily: { id: 'protein_daily', name: 'Proteínas · precio físico diario', extraMethods: ['physical_level20'], minObservations: 80 },
    protein_weekly: { id: 'protein_weekly', name: 'Proteínas · precio físico semanal', extraMethods: ['physical_level12', 'physical_seasonal52'], minObservations: 60 },
});
function marketProfile(instrument = {}) {
    if (instrument.physical) return PROFILES[instrument.frequency === 'weekly' ? 'protein_weekly' : 'protein_daily'];
    if (instrument.ticker?.endsWith('=X')) return PROFILES.fx;
    if (/^(?:ZC|ZW|ZS|ZM|ZL|ZO)=F$/.test(instrument.ticker)) return PROFILES.grains;
    if (/^(?:HE|LE|GF)=F$/.test(instrument.ticker)) return PROFILES.protein_futures;
    return PROFILES.general;
}
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const ema = (values, span) => {
    const k = 2 / (span + 1);
    return values.slice(-Math.min(values.length, span * 3)).reduce((acc, v, idx) => (idx === 0 ? v : v * k + acc * (1 - k)), values[0]);
};
function specialisedPredictions(values, horizon, profileId) {
    const last = values.at(-1), recent60 = values.slice(-60), recent20 = values.slice(-20);
    const seasonal = period => values.length >= period * 2 ? values[values.length - period + (horizon - 1) % period] : null;
    if (profileId === 'fx') {
        const logs = values.slice(-21).slice(1).map((value, index) => Math.log(value / values.slice(-21)[index])).sort((a, b) => a - b);
        const anchor20 = ema(values, 20);
        return {
            fx_log_drift20: last * Math.exp(.25 * horizon * mean(logs.slice(2, -2))),
            fx_ou_ema20: last + (anchor20 - last) * (1 - Math.exp(-horizon / 18)),
        };
    }
    if (profileId === 'grains') return {
        grain_damped60: last + .25 * horizon * (last - recent60[0]) / (recent60.length - 1),
        grain_seasonal252: seasonal(252),
        grain_reversion60: last + (mean(recent60) - last) * (1 - Math.exp(-horizon / 45)),
    };
    if (profileId === 'protein_futures') return {
        protein_reversion60: last + (mean(recent60) - last) * (1 - Math.exp(-horizon / 60)),
        protein_ema20: last + (ema(recent20, 10) - last) * (1 - Math.exp(-horizon / 16)),
    };
    if (profileId === 'protein_daily') return { physical_level20: mean(values.slice(-20)) };
    if (profileId === 'protein_weekly') return { physical_level12: mean(values.slice(-12)), physical_seasonal52: seasonal(52) };
    if (profileId === 'general') return { general_ema20: last + (ema(recent20, 12) - last) * (1 - Math.exp(-horizon / 20)) };
    return {};
}
module.exports = { PROFILES, marketProfile, specialisedPredictions };
