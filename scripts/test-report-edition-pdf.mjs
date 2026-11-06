import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getDocument } from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { personalizeExecutiveReport } from '../frontend/src/lib/executiveReportPreferences.js';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: 'backend/.env', quiet: true });
const { _test } = require('../backend/routes/export.js');
const points = Array.from({ length: 15 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, value: 100 + i }));
const report = { key: 'equities', title: 'Bolsa', generatedAt: '2026-10-07T14:00:00Z', summary: 'Resumen de prueba.',
  metrics: [{ label: 'IndicadorExcluir', value: '110' }],
  visuals: [{ title: 'GraficaExcluir', series: [{ label: 'Serie', points }] }],
  tables: [{ title: 'TablaExcluir', columns: ['Activo'], rows: [['Mercado']] }],
  sections: [{ heading: 'Lectura principal', text: 'Conclusión basada en el corte de prueba.' }],
  sources: ['FuenteExcluir'], watchlist: ['RiesgoExcluir'], executiveBrief: { generated: true, risks: ['RiesgoExcluir'], drivers: ['Seguimiento del corte'] },
  sourceSnapshot: { equities: ['A', 'B', 'C'].map(label => ({ label, value: 114, previous: 113, recentSeries: points })) },
};
const edited = personalizeExecutiveReport(report, { audience: 'purchasing', depth: 'detailed', customTitle: 'Edición elegida por Ana', sections: { indicators: false, charts: false, tables: false, risks: false, sources: false } });
const normalized = _test.executivePayload(edited);
assert.equal(normalized.personalization.customized, true);
assert.equal(normalized.equitySeries.length, 3, 'La muestra reproduce la ruta especializada de Bolsa');
const bytes = await _test.makeExecutivePdf('Prueba de edición', normalized);
const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true });
const pdf = await task.promise;
let text = '';
for (let page = 1; page <= pdf.numPages; page++) text += (await (await pdf.getPage(page)).getTextContent()).items.map(item => item.str).join(' ') + '\n';
assert.match(text, /Edición elegida por Ana/);
assert.match(text, /VERIFICACIÓN DE LA EVIDENCIA/);
assert.match(text, /Compras y abastecimiento/);
for (const excluded of ['IndicadorExcluir', 'GraficaExcluir', 'TablaExcluir', 'RiesgoExcluir', 'FuenteExcluir', 'PROYECCIONES ESTADISTICAS', 'RIESGOS A VIGILAR']) assert(!text.includes(excluded), `El PDF no debe reintroducir ${excluded}`);
await task.destroy();
console.log('Report edition PDF: OK · título, audiencia, detalle y exclusión de cinco bloques');
process.exit(0);
