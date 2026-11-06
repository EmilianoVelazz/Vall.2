'use strict';

// Conserva los avisos de licencia incluidos en el artefacto oficial de npm.
// Evita actualizar el lockfile y dejar una copia antigua en el navegador.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const packageFile = require.resolve('mermaid/package.json');
const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
const source = path.join(path.dirname(packageFile), 'dist/mermaid.min.js');
const target = path.join(root, 'assets/js/vendor/mermaid.min.js');
const bytes = fs.readFileSync(source);
if (process.argv.includes('--check')) {
    if (!fs.readFileSync(target).equals(bytes)) throw Error('La copia pública de Mermaid no coincide con la dependencia instalada.');
} else {
    fs.copyFileSync(source, target);
}
console.log(JSON.stringify({ package: 'mermaid', version, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), checked: process.argv.includes('--check') }));
