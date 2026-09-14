'use strict';

const assert = require('assert');
const { buildDeterministicReview, normalizeModelReview, validateSniimSnapshot } = require('../backend/ai/ml-unsupervised');

const snapshot = {
    sniim: {
        ts: Date.now(),
        cerdo: { norte: 48.5, centro: 46.2, sur: 47.8 },
        res: { norte: 110, centro: 105.5, sur: 108 },
        pollo: { norte: 42, centro: 38.5, sur: 40 },
        huevo: { norte: 35.5, centro: 32, sur: 34.5 },
        _meta: { source: 'SNIIM', real_time: false, type: 'STATIC_REFERENCE' },
    },
    commodities: {},
};

const issues = validateSniimSnapshot(snapshot.sniim);
assert(issues.some(issue => issue.code === 'NON_REALTIME_SOURCE'));
assert(!issues.some(issue => issue.code === 'OUT_OF_RANGE'));
const review = buildDeterministicReview(snapshot);
assert.equal(review.status, 'review_required');
assert.equal(review.approval.approved, false);
assert.equal(review.source.realTime, false);
const normalized = normalizeModelReview({
    assessments: [{ metric: 'cerdo.centro', severity: 'critical', reason: 'Diferencia relevante.' }],
    proposedRules: [{ condition: 'Cambio extremo', proposal: 'Solicitar revisión humana.' }],
});
assert.equal(normalized.assessments.length, 1);
assert.equal(normalized.proposedRules.length, 1);
console.log('Market review tests: OK');
