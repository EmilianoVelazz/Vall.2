'use strict';
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('node:path').join(__dirname, '..', 'backend', '.env'), quiet: true });
const { _test } = require('../backend/routes/export');

(async () => {
    const content = '# Reporte de prueba\n\n## Datos\n\n- México: 4.3%\n- EUA: 3.0%';
    const docx = await _test.makeDocx('Prueba VALL AI', content, []);
    const pdf = await _test.makePdf('Prueba VALL AI', content, []);
    const html = _test.htmlReport('Prueba VALL AI', content, []);
    assert(Buffer.isBuffer(docx) && docx.length > 1000);
    assert(Buffer.isBuffer(pdf) && pdf.subarray(0, 4).toString() === '%PDF');
    assert(Buffer.isBuffer(html) && html.toString().includes('Prueba VALL AI'));
    console.log('Report export tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
