'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { cases } = require('./lib/protein-business-cases.cjs');
const { domainDecision } = require('../backend/ai/domain-policy');
const { planQuery, planContext } = require('../backend/ai/query-planner');
const { buildAnswerStrategy } = require('../backend/ai/answer-strategy');

const phase = process.argv.includes('--baseline') ? 'antes' : 'despues';
const results = cases.map(item => {
    const plan = planQuery({ message: item.message, history: item.history || [] });
    const strategy = buildAnswerStrategy({ message: item.message, history: item.history || [], plan });
    const failures = [];
    const compare = (name, actual, expected) => { if (!isDeepStrictEqual(actual, expected)) failures.push({ name, actual, expected }); };
    compare('allowed', domainDecision({ message: item.message, history: item.history || [] }).allowed, item.allowed !== false);
    if (item.products) compare('products', plan.proteinProfile.products, item.products);
    if (item.countries) compare('countries', plan.proteinProfile.countries, item.countries);
    if (item.audience) compare('audience', strategy.audience, item.audience);
    if (item.global !== undefined) compare('global', plan.proteinProfile.global, item.global);
    if (item.specific !== undefined) compare('specificPrice', plan.proteinProfile.specificPrice, item.specific);
    if (item.physical !== undefined) compare('needsProteinPrices', plan.needsProteinPrices, item.physical);
    if (item.research !== undefined) compare('requiresWebResearch', plan.requiresWebResearch, item.research);
    if (item.trade !== undefined) compare('needsTradeResearch', plan.needsTradeResearch, item.trade);
    if (item.inputsOnly !== undefined) compare('providedInputsOnly', plan.providedInputsOnly, item.inputsOnly);
    if (item.allowed !== false && item.research && !plan.providedInputsOnly) compare('sourceGuidance', /fuente|source|evidencia/i.test(planContext(plan)), true);
    return { id: item.id, category: item.category, passed: failures.length === 0, failures };
});
const directory = path.join(__dirname, '../output/chat-proteinas-global/pruebas');
fs.mkdirSync(directory, { recursive: true });
const summary = { generatedAt: new Date().toISOString(), phase, cases: results.length, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length,
    environment: 'clasificación y estrategia reales; sin llamadas a proveedores; no evalúa exactitud factual de una respuesta generada', results };
fs.writeFileSync(path.join(directory, `${phase}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, results: results.filter(result => !result.passed) }, null, 2));
if (summary.failed) process.exitCode = 1;
