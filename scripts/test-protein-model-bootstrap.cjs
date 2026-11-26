'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {gzipSync} = require('node:zlib');
const {installBundledProteinModel, loadCachedProteinML} = require('../backend/ml/protein-ml-engine');
const {MODEL_VERSION, VALIDATION_PROTOCOL} = require('../backend/ml/protein-forecast-policy');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vallnews-model-bootstrap-'));
const cacheFile = path.join(folder, 'cache.json');
const now = Date.now();
const today = new Date(now).toISOString().slice(0, 10);
const future = new Date(now + 7 * 86400000).toISOString().slice(0, 10);
const eligible = {code: '1w', eligible: true, targetDate: future, validation: {protocol: VALIDATION_PROTOCOL}};
const seed = {version: MODEL_VERSION, validationProtocol: VALIDATION_PROTOCOL, generatedAt: new Date(now - 1000).toISOString(),
    stats: {}, forecasts: [{symbol: 'SYNTHETIC', species: 'cerdo', region: 'MX', cadence: 'weekly', lastDate: today,
        primaryForecast: eligible, horizons: [eligible, {...eligible, code: 'expired', targetDate: today}]}]};
function pack(value, hashOverride) {
    const packed = gzipSync(Buffer.from(JSON.stringify(value)));
    fs.writeFileSync(path.join(folder, 'protein-v7.seed.json.gz'), packed);
    fs.writeFileSync(path.join(folder, 'protein-v7.seed.json'), JSON.stringify({
        sha256: hashOverride || crypto.createHash('sha256').update(packed).digest('hex')}));
}
try {
    pack(seed);
    assert.equal(installBundledProteinModel({cacheFile, seedDirectory: folder, now}), true);
    const installed = loadCachedProteinML(cacheFile);
    assert.equal(installed.stats.activeModels, 1);
    assert.deepEqual(installed.forecasts[0].horizons.map(h => h.code), ['1w'], 'No publicar objetivos vencidos');
    const newer = {...seed, generatedAt: new Date(now).toISOString()};
    fs.writeFileSync(cacheFile, JSON.stringify(newer));
    const before = fs.readFileSync(cacheFile, 'utf8');
    assert.equal(installBundledProteinModel({cacheFile, seedDirectory: folder, now}), false);
    assert.equal(fs.readFileSync(cacheFile, 'utf8'), before, 'No reemplazar un entrenamiento más reciente');
    for (const invalid of [{...seed, version: 'legacy'}, {...seed, validationProtocol: 'legacy'},
        {...seed, generatedAt: new Date(now + 1000).toISOString()},
        {...seed, generatedAt: new Date(now - 27 * 3600000).toISOString()}]) {
        pack(invalid);
        assert.equal(installBundledProteinModel({cacheFile, seedDirectory: folder, now}), false);
        assert.equal(fs.readFileSync(cacheFile, 'utf8'), before);
    }
    pack(seed, 'invalid-hash');
    assert.equal(installBundledProteinModel({cacheFile, seedDirectory: folder, now}), false);
    assert.equal(fs.readFileSync(cacheFile, 'utf8'), before, 'Rechazar corrupción conservando el modelo actual');
    console.log('Model bootstrap: integridad, vigencia, protocolo y conservación del modelo más reciente verificados.');
} finally {
    // Directorio temporal propio, sin acceso al caché real ni a datos de usuarios.
    for (const name of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, name));
    fs.rmdirSync(folder);
}
