'use strict';

const assert = require('node:assert/strict');
const { normalizePreferences, personalizeExecutiveReport, changed } = require('../backend/lib/executive-report-preferences');
const { normalizeDelivery, nextRunAt } = require('../backend/services/report-email-schedule-store');
const { nextReportRefreshAt } = require('../backend/lib/report-schedule');

const standard = normalizePreferences({});
assert.equal(changed(standard), false);
const report = {
    key: 'grains', title: 'Granos', eyebrow: 'Mercados', objective: 'Objetivo base', summary: 'Resumen base',
    metrics: [1, 2, 3, 4, 5], visuals: [1, 2], tables: [1, 2], sections: [1, 2, 3, 4],
    takeaways: ['a', 'b', 'c', 'd'], watchlist: ['r1', 'r2', 'r3'], sources: ['s1', 's2'],
};
assert.equal(personalizeExecutiveReport(report, standard), report);
const custom = personalizeExecutiveReport(report, {
    audience: 'purchasing', depth: 'brief', objective: 'costos de alimento',
    recipientName: 'Ana Torres', organization: 'Compras Estratégicas', customTitle: 'Pulso de costos para comité',
    decisionHorizon: 'quarter', confidentiality: 'confidential', theme: 'emerald',
    sections: { indicators: true, charts: false, tables: true, risks: false, sources: true },
});
assert.equal(custom.title, 'Pulso de costos para comité');
assert.match(custom.objective, /costos de alimento/);
assert.match(custom.objective, /Próximo trimestre/);
assert.equal(custom.personalization.recipientName, 'Ana Torres');
assert.equal(custom.personalization.organization, 'Compras Estratégicas');
assert.equal(custom.personalization.confidentialityLabel, 'Confidencial');
assert.equal(custom.personalization.theme, 'graphite');
assert.equal(custom.visuals.length, 0);
assert.equal(custom.watchlist.length, 0);
assert.equal(custom.sections.length, 3);
assert.equal(custom.tables.length, 1);
assert.deepEqual(normalizeDelivery({ frequency: 'weekly', time: '17:00', weekday: 5 }), {
    frequency: 'weekly', time: '17:00', weekday: 5, timeZone: 'America/Mexico_City',
});
assert.equal(
    nextRunAt({ frequency: 'daily', time: '08:00' }, new Date('2026-09-30T12:30:00.000Z')).toISOString(),
    '2026-09-30T14:00:00.000Z',
);
assert.equal(
    nextRunAt({ frequency: 'weekdays', time: '09:00' }, new Date('2026-10-03T16:00:00.000Z')).toISOString(),
    '2026-10-05T15:00:00.000Z',
);
for (const time of ['2026-10-15T11:59:59Z', '2026-10-15T12:00:00Z', '2026-10-15T20:00:00Z', '2026-12-31T20:00:00Z']) {
    assert.equal(nextRunAt({ frequency: 'twice_daily' }, new Date(time)).toISOString(), nextReportRefreshAt(time).toISOString(), 'Cada corte usa el mismo calendario de los reportes');
}
console.log('Report email schedule tests: OK');
