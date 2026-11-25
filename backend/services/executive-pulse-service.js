'use strict';

// ============================================================================
// Briefing Ejecutivo de 1 Minuto (VALLNews)
// Sintetiza en 3 bloques accionables 100% respaldados por datos reales:
//  1) Oportunidad #1 de Compra (Motor de Margen Ganadero + Arbitraje)
//  2) Riesgo #1 Activo (Radar NLP Sanitario/Comercial + Paridad)
//  3) Próximo Catalizador + Pulso FX/Ración (Banxico/Fed/INEGI/USDA)
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');
const { buildLivestockMarginReport } = require('./livestock-margin-engine');
const { getUpcomingMarketCatalysts } = require('./market-catalysts');
const { loadCachedClosedLoopAudit } = require('../ml/protein-ml-closed-loop');

const PROTEIN_ML_FILE = path.resolve(__dirname, '../cache/protein-ml-forecasts.json');

function readProteinArtifact() {
    try {
        return JSON.parse(fs.readFileSync(PROTEIN_ML_FILE, 'utf8'));
    } catch {
        return null;
    }
}

function buildExecutivePulse({ nowMs = Date.now() } = {}) {
    const artifact = readProteinArtifact();
    const margins = buildLivestockMarginReport({ proteinArtifact: artifact, nowMs });
    const catalysts = getUpcomingMarketCatalysts({ nowMs, daysAhead: 45, limit: 3 });
    const audit = loadCachedClosedLoopAudit();

    const speciesList = Array.isArray(margins?.species) ? margins.species : [];

    // 1. Oportunidad #1 de compra (prioriza COMPRAR_OPORTUNIDAD con mayor descuento MX, luego COTIZAR_IMPORTACION)
    const buyCandidates = speciesList
        .filter(s => s.playbook?.stance === 'COMPRAR_OPORTUNIDAD')
        .sort((a, b) => (a.arbitrage?.spreadPct ?? 0) - (b.arbitrage?.spreadPct ?? 0));
    const importCandidates = speciesList
        .filter(s => s.playbook?.stance === 'COTIZAR_IMPORTACION')
        .sort((a, b) => (b.arbitrage?.spreadPct ?? 0) - (a.arbitrage?.spreadPct ?? 0));
    const topOpp = buyCandidates[0] || importCandidates[0] || speciesList[0] || null;

    const opportunity = topOpp ? {
        species: topOpp.species,
        label: topOpp.label,
        icon: topOpp.icon,
        stance: topOpp.playbook?.label || 'Seguimiento',
        metric: topOpp.arbitrage?.spreadPct != null
            ? `${topOpp.arbitrage.spreadPct > 0 ? '+' : ''}${topOpp.arbitrage.spreadPct}% vs ${topOpp.arbitrage.originCountry}`
            : `Margen ${topOpp.marginOverFeedPct}%`,
        priceMxnKg: topOpp.mexicoPriceMxnKg,
        detail: topOpp.playbook?.rationale || '',
    } : null;

    // 2. Riesgo #1 activo (mayor score NLP sanitario/comercial)
    const nlpBySpecies = artifact?.nlpEvents?.bySpecies || {};
    const riskEntries = Object.entries(nlpBySpecies)
        .map(([sp, ev]) => ({ species: sp, ...ev }))
        .filter(ev => Number.isFinite(ev.riskScore))
        .sort((a, b) => b.riskScore - a.riskScore);
    const topRisk = riskEntries[0] || null;

    const risk = topRisk ? {
        species: topRisk.species,
        riskLevel: topRisk.riskLevel,
        riskScore: topRisk.riskScore,
        bias: topRisk.bias,
        title: topRisk.dominantType || `Riesgo ${topRisk.riskLevel} en ${topRisk.species}`,
        headline: topRisk.topHeadlines?.[0]?.title || null,
        eventCount: topRisk.eventCount || 0,
    } : null;

    // 3. Próximo catalizador de alto impacto
    const nextEvent = catalysts?.events?.find(e => e.impact === 'ALTO') || catalysts?.events?.[0] || null;

    // 4. 3 señales clave cuantificadas del día
    const keyMoves = [];
    if (margins?.inputs?.usdMxn && margins?.inputs?.cornUsdTon && margins?.inputs?.soyUsdTon) {
        const porkFeed = margins.bySpecies?.cerdo?.balancedFeedMxnTon;
        keyMoves.push({
            id: 'fx-feed',
            tag: 'FX & Ración',
            text: `USD/MXN ${margins.inputs.usdMxn} · Maíz $${margins.inputs.cornUsdTon}/t · Soya $${margins.inputs.soyUsdTon}/t${porkFeed ? ` → Ración cerdo $${porkFeed.toLocaleString('es-MX')} MXN/t` : ''}.`,
        });
    }
    const cerdo = margins?.bySpecies?.cerdo;
    if (cerdo?.arbitrage) {
        keyMoves.push({
            id: 'arbitrage',
            tag: 'Arbitraje MX',
            text: `Cerdo SNIIM $${cerdo.mexicoPriceMxnKg}/kg vs paridad ${cerdo.arbitrage.originCountry} $${cerdo.arbitrage.landedMxnKg}/kg (${cerdo.arbitrage.spreadPct > 0 ? '+' : ''}${cerdo.arbitrage.spreadPct}% · ${cerdo.playbook.label}).`,
        });
    }
    if (audit?.summary?.totalEvaluated > 0) {
        const cerdoHit = audit.bySpecies?.cerdo?.directionalHitRatePct;
        keyMoves.push({
            id: 'ml-health',
            tag: 'Radar ML',
            text: `Bandas P80 reales en ${audit.summary.conformal80CoveragePct}% (MAPE ${audit.summary.avgMapePct}%)${cerdoHit != null ? ` · Cerdo dirección validada en ${cerdoHit}%` : ''}.`,
        });
    }

    return {
        available: Boolean(opportunity || risk || nextEvent),
        generatedAt: new Date(nowMs).toISOString(),
        asOfDate: new Date(nowMs).toISOString().slice(0, 10),
        opportunity,
        risk,
        nextCatalyst: nextEvent,
        keyMoves,
    };
}

module.exports = { buildExecutivePulse };
