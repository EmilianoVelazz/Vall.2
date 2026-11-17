'use strict';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { createMorningBriefService } = require('../backend/services/morning-brief-service');
const snapshot=name=>JSON.parse(fs.readFileSync('backend/cache/'+name+'.json','utf8'));
const buildMorningBrief=createMorningBriefService({loadFinance:async()=>snapshot('finance_executive_reports'),loadMarkets:async()=>snapshot('market_executive_reports'),loadMexico:async()=>snapshot('mexico-executive-reports'),now:()=>Date.parse('2030-01-01T00:00:00Z')});
const { buildReportEmail } = require('../backend/services/report-email-template');

async function testMorningBrief() {
    const brief = await buildMorningBrief();
    assert(brief, 'Briefing generado');
    assert.equal(brief.key, 'morning_brief');
    assert.match(brief.title, /Briefing Matutino/);
    assert.equal(brief.metrics.length, 10, 'Tablero con 10 métricas clave');
    assert.equal(brief.actions.length, 3, '3 pilares de decisión');
    
    // Validar pilares
    const pillars = brief.actions.map(a => a.pillar);
    assert(pillars.includes('Tesorería & Divisas'));
    assert(pillars.includes('Compras de Granos & Alimento'));
    assert(pillars.includes('Proteínas & Margen Comercial'));

    // Validar correo enriquecido
    const email = buildReportEmail({
        title: brief.title,
        executive: brief,
        attachmentName: 'Briefing-Matutino.pdf'
    });

    assert(email.html.includes('Qué hacer hoy · Decisiones clave'), 'El correo contiene el bloque de acciones');
    assert(email.html.includes('Tablero de indicadores del corte'), 'El correo contiene el tablero');
    assert(email.text.includes('QUÉ HACER HOY:'), 'Texto alternativo incluye decisiones');
    assert(email.text.includes('TABLERO:'), 'Texto alternativo incluye métricas');

    console.log('Morning Brief: OK · 10 métricas, 3 acciones, HTML responsivo y texto enriquecido');
}

testMorningBrief().catch(err => {
    console.error('Test morning brief failed:', err);
    process.exit(1);
});
