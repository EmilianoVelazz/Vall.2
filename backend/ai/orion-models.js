'use strict';

// Product names map to bounded provider configurations, never arbitrary client model IDs.
//
const ORION_MODELS = Object.freeze({
    nebula: Object.freeze({ name: 'Nebula', tier: 'flash', reasoning: 'low' }),
    cirius: Object.freeze({ name: 'Cirius', tier: 'flash', reasoning: 'medium' }),
    pulsar: Object.freeze({ name: 'ORION Pulsar', tier: 'pro', reasoning: 'high' }),
});
function orionModel(value) {
    return typeof value === 'string' && Object.hasOwn(ORION_MODELS, value) ? ORION_MODELS[value] : null;
}
module.exports = { ORION_MODELS, orionModel };
