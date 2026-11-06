'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Una iteración completa sin llamadas externas, esperas ni escrituras reales.
let clock = 0;
const saved = new Map();
const evidence = { collected_at: '2026-01-01', failures: [], source_catalog: [], snapshots: [{ source_id: 'verified', payload: { value: 10 }, retrieved_at: '2026-01-01' }] };
class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
}
class FakeProvider {
    isConfigured() { return true; }
    async generate() { return { text: JSON.stringify({ proposals: [{ species: 'cerdo', title: 'Prueba', insight: 'Observación con evidencia.', evidence_source_ids: ['verified', 'unknown'], confidence_score: 80 }] }) }; }
}
const moduleMock = { exports: {} };
const filename = path.resolve(__dirname, '../backend/ai/protein-training-loop.js');
const context = {
    module: moduleMock, __dirname: path.dirname(filename), Date: FakeDate,
    process: { env: { VALL_PROTEIN_TRAINING_ENABLED: 'true', VALL_PROTEIN_TRAINING_MINUTES: '1' } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout(callback, ms) { clock += ms; callback(); },
    require(name) {
        if (name === 'dotenv') return { config() {} };
        if (name === 'fs') return {
            // Simula archivos existentes con estructura incorrecta.
            readFileSync() { return '{"corrupt":true}'; }, mkdirSync() {},
            writeFileSync(file, value) { saved.set(path.basename(file), JSON.parse(value)); },
        };
        if (name === './providers/gemini-provider') return { GeminiProvider: FakeProvider };
        if (name === './protein-training-sources') return { gatherProteinEvidence: async () => structuredClone(evidence) };
        return require(name);
    },
};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
(async () => {
    const result = await moduleMock.exports.runProteinTrainingLoop();
    assert.equal(result.attempts, 1);
    assert.equal(result.failures, 0);
    assert.equal(result.proposals_created, 1);
    const snapshots = saved.get('protein-source-snapshots.json');
    const proposals = saved.get('protein-research-proposals.json');
    assert.equal(snapshots.length, 1, 'La evidencia debe guardarse antes de generar propuestas');
    assert.equal(proposals[0].status, 'pending_human_review');
    assert.deepEqual(Array.from(proposals[0].evidence_source_ids), ['verified']);
    assert.equal(proposals[0].evidence_snapshot_hashes[0], snapshots[0].snapshot_hash);
    assert.equal(saved.get('protein-training-summary.json').status, 'completed');
    console.log('Protein training loop tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
