'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareBusinessConversation } = require('../backend/ai/business-memory');
const { calculateMargin } = require('../backend/ai/commercial-calculator');
const { auditResearchAnswer } = require('../backend/ai/research-evidence');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const results = [];
async function check(id, run) {
    try { await run(); results.push({ id, passed: true }); }
    catch (error) { results.push({ id, passed: false, detail: error.message }); }
}
async function main() {
    const message = 'Soy distribuidor de cerdo en canal en Puebla. Compro 1000 kg a 70 MXN/kg y vendo a 90 MXN/kg, merma del 5%. Calcula mi margen.';
    const initial = prepareBusinessConversation({ message });
    const follow = text => prepareBusinessConversation({ message: text, conversationMemory: initial.conversationMemory });
    for (const [text, key, expected] of [['El precio de compra es 80', 'buyPricePerKg', 80], ['No, son 800 kilos', 'purchasedKg', 800], ['La merma es 4%', 'shrinkFraction', .04], ['El flete es 1200 MXN', 'freight', 1200]]) {
        await check(`correction:${key}`, () => {
            const turn = follow(text);
            assert.equal(turn.commercialInputs[key], expected);
            assert.equal(turn.conversationMemory?.profile.products[0], 'pork');
            assert(calculateMargin(turn.commercialInputs).available, 'Una corrección conserva los demás datos del lote');
        });
    }
    await check('correction:history-reload', () => {
        const turn = prepareBusinessConversation({ message: 'No, son 800 kilos', history: [{ role: 'user', content: message }] });
        assert.equal(turn.commercialInputs.purchasedKg, 800);
        assert.equal(turn.commercialInputs.buyPricePerKg, 70);
    });
    for (const text of ['Ahora pollo', 'Cambia a pollo entero', 'Ahora en pie']) {
        await check(`new-scope:${text}`, () => {
            const turn = follow(text);
            assert.equal(turn.commercialInputs.buyPricePerKg, undefined, 'No trasladar costos a otra especie o presentación');
            assert.equal(turn.conversationMemory?.inputs.sellPricePerKg, undefined);
            assert.equal(calculateMargin(turn.commercialInputs).available, false);
            assert.deepEqual(turn.conversationMemory.profile.mexicoStates, ['PUE']);
        });
    }
    await check('new-scope:explicit-scenario', () => {
        const turn = follow('Ahora pollo entero, usa los mismos supuestos');
        assert.equal(turn.commercialInputs.buyPricePerKg, 70);
        assert.equal(turn.conversationMemory.profile.products[0], 'poultry');
    });
    await check('new-scope:new-values', () => {
        const turn = follow('Ahora pollo entero. Compro 500 kg a 40 MXN/kg y vendo a 60 MXN/kg, merma del 2%');
        assert.equal(turn.commercialInputs.purchasedKg, 500);
        assert.equal(turn.commercialInputs.buyPricePerKg, 40);
        assert.equal(turn.commercialInputs.shrinkFraction, .02);
    });
    await check('same-product:location', () => {
        const turn = follow('y en Jalisco');
        assert.equal(turn.commercialInputs.buyPricePerKg, 70);
        assert.deepEqual(turn.conversationMemory.profile.mexicoStates, ['JAL']);
    });
    const url = 'https://example.org/synthetic-report';
    const plan = { needsTradeResearch: true, tradeResearchQuery: 'acuerdos en septiembre de 2026' };
    const evidence = { citations: [{ url, date: '2026-09-25' }], tradeDocuments: [{ url, date: '2026-09-25', verified: true,
        title: 'Documento sintético', excerpts: ['Se propuso un arancel de 210%. El volumen fue 1200 toneladas. El cambio fue -5%. La tasa de 10% no está en vigor.'] }] };
    const suffix = ` (2026-09-25). [Documento](${url}).`;
    const now = Date.parse('2026-10-15T18:00:00Z');
    for (const [id, text] of [
        ['partial-number', 'El volumen fue 200 toneladas.'],
        ['percent-as-price', 'El precio fue 210 USD.'],
        ['sign-changed', 'El cambio fue +5%.'],
        ['invented-date', 'El arancel se aplicará el 2026-11-15.'],
        ['heading', '### Se aprobó el arancel 99%.'],
        ['blockquote', '> Se aprobó el arancel 99%.'],
        ['bold-heading', '**Arancel aprobado: 99%.**'],
        ['html-heading', '<h3>Arancel aprobado: 99%.</h3>'],
    ]) await check(`evidence:block-${id}`, () => assert.equal(auditResearchAnswer(plan, evidence, text + suffix, now).needed, true));
    for (const [id, text] of [
        ['observed', 'El volumen fue 1200 toneladas.'],
        ['signed', 'El cambio fue -5%.'],
        ['decimal-equivalent', 'Se propuso un arancel de 210.0%.'],
        ['list-number', '1. Se propuso un arancel de 210%.'],
        ['negative-status', 'La tasa de 10% no está en vigor.'],
    ]) await check(`evidence:accept-${id}`, () => assert.equal(auditResearchAnswer(plan, evidence, text + suffix, now).needed, false));
    await check('chat:corrected-margin-through-mcp', async () => {
        const chat = new AIOrchestrator({ provider: { name: 'offline', isConfigured: () => false }, retriever: { recordQuery: async () => null, recordEvidence: async () => null } });
        const answer = await chat.generateStructured({ message: 'El precio de compra es 80, recalcula mi margen', history: [], conversationMemory: initial.conversationMemory });
        assert.equal(answer.response.meta.calculation?.inputs.buyPricePerKg, 80);
        assert.equal(answer.response.meta.calculation?.profit, 5500);
        assert.equal(answer.response.meta.toolExecution.protocol, 'mcp');
    });
    const baseline = process.argv.includes('--baseline');
    const report = { scope: 'Regresiones controladas sin proveedor externo. No mide exactitud financiera ni factual general.',
        cases: results.length, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length, results };
    const directory = path.resolve(__dirname, '../output/analisis-inteligencia-orion');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `regresiones-respuesta-${baseline ? 'antes' : 'despues'}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, results: results.filter(row => !row.passed) }, null, 2));
    if (report.failed && !baseline) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
