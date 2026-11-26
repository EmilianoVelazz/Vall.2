'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {gzipSync} = require('node:zlib');
const {loadCachedProteinML, PROTEIN_ML_VERSION} = require('../backend/ml/protein-ml-engine');
const artifact = loadCachedProteinML();
if (!artifact || Date.now() - Date.parse(artifact.generatedAt) > 26 * 3600000) {
    throw Error('Se necesita un artefacto reciente con el protocolo temporal vigente.');
}
const folder = path.resolve(__dirname, '../backend/ml/models');
const packed = gzipSync(Buffer.from(JSON.stringify(artifact)));
const manifest = {version: PROTEIN_ML_VERSION, validationProtocol: artifact.validationProtocol,
    generatedAt: artifact.generatedAt, dataFingerprint: artifact.dataFingerprint,
    sha256: crypto.createHash('sha256').update(packed).digest('hex'),
    totalSeries: artifact.forecasts.length, publishedSeries: artifact.stats.activeModels,
    abstainedSeries: artifact.stats.abstainedSeries,
    notice: 'Validación histórica interna; no equivale a resultados prospectivos ni garantiza rendimientos.'};
fs.mkdirSync(folder, {recursive: true});
fs.writeFileSync(path.join(folder, 'protein-v7.seed.json.gz'), packed);
fs.writeFileSync(path.join(folder, 'protein-v7.seed.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
