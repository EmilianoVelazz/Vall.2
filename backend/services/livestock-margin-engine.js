'use strict';

// ============================================================================
// Motor de Margen Ganadero, Percentil 52 Semanas y Playbook de Compra México
//
// Cruza 100% fuentes reales ya verificadas en caché:
//  - Precios físicos México: Mediana SNIIM + históricos 52s (backend/data/orion-forecast)
//  - Paridad de importación: USDA AMS / CME / DG AGRI / CEPEA (protein-ml-forecasts.json)
//  - Ración balanceada: 70% Maíz (ZC=F) + 30% Soya (ZS=F) × USD/MXN + molienda/flete ref.
//  - Riesgo sanitario/comercial: Radar NLP MARRANAS (H5N1, PPA, Barrenador, Aranceles)
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');

const CACHE_DIR = path.resolve(__dirname, '../cache');
const ORION_FORECAST_DIR = path.resolve(__dirname, '../data/orion-forecast');
const PROTEIN_ML_FILE = path.join(CACHE_DIR, 'protein-ml-forecasts.json');
const SHOWCASE_FILE = path.join(CACHE_DIR, 'ml-predictions-showcase.json');
const COMMODITY_CACHE_FILE = path.join(CACHE_DIR, 'commodity-cache.json');

// Conversión alimenticia (FCR) estándar de industria pecuaria (kg alimento / kg producto)
const SPECIES_SPECS = Object.freeze({
    cerdo: {
        id: 'cerdo',
        label: 'Cerdo (Canal)',
        icon: '🐖',
        fcr: 3.0,
        cornWeight: 0.72,
        soyWeight: 0.28,
        millingMxnTon: 850,
        orionProductIds: ['pork', 'cerdo'],
    },
    pollo: {
        id: 'pollo',
        label: 'Pollo (Entero)',
        icon: '🐔',
        fcr: 1.85,
        cornWeight: 0.65,
        soyWeight: 0.35,
        millingMxnTon: 950,
        orionProductIds: ['poultry', 'chicken', 'pollo'],
    },
    huevo: {
        id: 'huevo',
        label: 'Huevo (Blanco)',
        icon: '🥚',
        fcr: 2.15,
        cornWeight: 0.68,
        soyWeight: 0.32,
        millingMxnTon: 900,
        orionProductIds: ['eggs', 'egg', 'huevo'],
    },
    res: {
        id: 'res',
        label: 'Res (Engorda / Canal)',
        icon: '🐄',
        fcr: 6.5,
        cornWeight: 0.80,
        soyWeight: 0.20,
        millingMxnTon: 750,
        orionProductIds: ['beef', 'cattle', 'res'],
    },
});

const SPECIES_ORDER = ['cerdo', 'res', 'pollo', 'huevo'];

function round(value, digits = 2) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function readJsonSafe(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function resolveGrainAndFxInputs(proteinArtifact) {
    const showcase = readJsonSafe(SHOWCASE_FILE);
    const commodities = readJsonSafe(COMMODITY_CACHE_FILE);
    const cross = showcase?.crossAssetDemo?.inputs || {};

    let cornUsdTon = Number(cross?.cornUsdTon?.spot);
    let cornSource = 'CBOT ZC=F (ORION ML)';
    if (!Number.isFinite(cornUsdTon) || cornUsdTon <= 0) {
        const rows = commodities?.CORN?.data?.data;
        cornUsdTon = Array.isArray(rows) && rows.length ? Number(rows[0]?.value) : null;
        cornSource = 'CBOT ZC=F (Commodity Cache)';
    }

    let soyUsdTon = Number(cross?.soyUsdTon?.spot);
    let soySource = 'CBOT ZS=F (ORION ML)';
    if (!Number.isFinite(soyUsdTon) || soyUsdTon <= 0) {
        const rows = commodities?.SOYBEANS?.data?.data;
        soyUsdTon = Array.isArray(rows) && rows.length ? Number(rows[0]?.value) : null;
        soySource = 'CBOT ZS=F (Commodity Cache)';
    }

    const fxFromParity = Number(proteinArtifact?.importParity?.fxRates?.usdMxn);
    const fxFromShowcase = Number(cross?.usdMxn?.spot);
    const usdMxn = Number.isFinite(fxFromParity) && fxFromParity > 0
        ? fxFromParity
        : (Number.isFinite(fxFromShowcase) && fxFromShowcase > 0 ? fxFromShowcase : null);

    return {
        cornUsdTon: Number.isFinite(cornUsdTon) ? round(cornUsdTon, 2) : null,
        cornSource,
        soyUsdTon: Number.isFinite(soyUsdTon) ? round(soyUsdTon, 2) : null,
        soySource,
        usdMxn: Number.isFinite(usdMxn) ? round(usdMxn, 4) : null,
        usdMxnDate: proteinArtifact?.importParity?.fxRates?.usdMxnDate || null,
    };
}

function collectMexico52WeekDistributions(nowMs = Date.now()) {
    const cutoffIso = new Date(nowMs - 365 * 86_400_000).toISOString().slice(0, 10);
    const buckets = { cerdo: [], res: [], pollo: [], huevo: [] };
    if (!fs.existsSync(ORION_FORECAST_DIR)) return buckets;

    let files = [];
    try {
        files = fs.readdirSync(ORION_FORECAST_DIR).filter(f => f.endsWith('.json'));
    } catch {
        return buckets;
    }

    for (const file of files) {
        const doc = readJsonSafe(path.join(ORION_FORECAST_DIR, file));
        const id = doc?.identity;
        if (!id || String(id.countryCode || '').toUpperCase() !== 'MX') continue;
        const unit = String(id.unit || '').toUpperCase();
        if (!unit.includes('MXN')) continue;
        const prod = String(id.productId || '').toLowerCase();

        const species = SPECIES_ORDER.find(sp => SPECIES_SPECS[sp].orionProductIds.includes(prod));
        if (!species) continue;

        // Evitar mezclar ganado en pie con canal (ej. cerdo vivo ~$35 vs canal ~$73)
        const basisText = `${id.priceBasis || ''} ${id.category || ''}`.toLowerCase();
        if ((species === 'cerdo' || species === 'res') && /\b(?:live|pie|vivo|becerro|destete)\b/.test(basisText)) continue;

        const pts = Array.isArray(doc.points) ? doc.points : [];
        for (const pt of pts) {
            const val = Number(pt?.value);
            if (!pt?.date || pt.date < cutoffIso || !Number.isFinite(val) || val <= 0) continue;
            buckets[species].push(val);
        }
    }
    return buckets;
}

function computePercentileStats(values, currentPrice, fallbackMin, fallbackMax) {
    const clean = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (clean.length >= 12) {
        const min52w = clean[0];
        const max52w = clean[clean.length - 1];
        const mid = Math.floor(clean.length / 2);
        const median52w = clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
        const belowOrEqual = clean.filter(v => v <= currentPrice).length;
        const percentile = Math.max(0, Math.min(100, Math.round((belowOrEqual / clean.length) * 100)));
        const zone = percentile <= 25 ? 'BARATO' : percentile >= 75 ? 'CARO' : 'NEUTRAL';
        return {
            min52w: round(min52w, 2),
            median52w: round(median52w, 2),
            max52w: round(max52w, 2),
            percentile52w: percentile,
            zone,
            observations52w: clean.length,
            rangeBasis: 'historico_52s',
        };
    }

    // Fallback transparente al rango actual de plazas SNIIM cuando aún no hay 12+ obs históricas
    const lo = Number.isFinite(fallbackMin) ? fallbackMin : currentPrice;
    const hi = Number.isFinite(fallbackMax) ? fallbackMax : currentPrice;
    const span = hi - lo;
    const percentile = span > 0 ? Math.max(0, Math.min(100, Math.round(((currentPrice - lo) / span) * 100))) : 50;
    const zone = percentile <= 25 ? 'BARATO' : percentile >= 75 ? 'CARO' : 'NEUTRAL';
    return {
        min52w: round(lo, 2),
        median52w: round(currentPrice, 2),
        max52w: round(hi, 2),
        percentile52w: percentile,
        zone,
        observations52w: clean.length,
        rangeBasis: 'plazas_actuales',
    };
}

function buildBuyingPlaybook({ speciesLabel, rangeStats, arbitrage, sanitary, marginOverFeedPct }) {
    const spreadPct = arbitrage?.spreadPct ?? 0;
    const spreadMxn = arbitrage?.spreadMxnKg ?? 0;
    const hasImportCeiling = arbitrage?.signal === 'TECHO_IMPORTACION' && spreadPct >= 15;
    const hasMxDiscount = arbitrage?.signal === 'DESCUENTO_MX' && spreadPct <= -10;
    const highSanitary = sanitary && (sanitary.riskScore >= 45 || ['ALTO', 'CRÍTICO'].includes(sanitary.riskLevel));

    if (hasImportCeiling && rangeStats.zone === 'CARO') {
        return {
            stance: 'COTIZAR_IMPORTACION',
            label: 'Cotizar importación / evitar sobrepago',
            rationale: `${speciesLabel} en percentil ${rangeStats.percentile52w} (zona cara) con prima de +$${spreadMxn} MXN/kg (+${spreadPct}%) sobre ${arbitrage.originCountry}. Conviene presionar precio en plaza o evaluar cuota importada.`,
        };
    }
    if (hasImportCeiling) {
        return {
            stance: 'COTIZAR_IMPORTACION',
            label: 'Techo de importación activo',
            rationale: `Plaza mexicana cotiza +$${spreadMxn} MXN/kg (+${spreadPct}%) arriba de paridad puesta frontera (${arbitrage.originCountry}); comprar al día y usar paridad como referencia de negociación.`,
        };
    }
    if (hasMxDiscount || rangeStats.zone === 'BARATO') {
        return {
            stance: 'COMPRAR_OPORTUNIDAD',
            label: 'Ventana favorable de compra',
            rationale: `${speciesLabel} en percentil ${rangeStats.percentile52w} (${rangeStats.zone.toLowerCase()}) con ventaja competitiva en plaza nacional; oportunidad para adelantar cobertura física.`,
        };
    }
    if (highSanitary) {
        return {
            stance: 'CUBRIR_RIESGO',
            label: 'Asegurar abasto por riesgo sanitario',
            rationale: `Alerta sanitaria ${sanitary.riskLevel} (${sanitary.riskScore}/100, sesgo ${sanitary.bias}); priorizar continuidad de proveedores y cobertura de inventario.`,
        };
    }
    return {
        stance: 'COMPRA_ESCALONADA',
        label: 'Compra escalonada en rango',
        rationale: `Precio en zona neutral (percentil ${rangeStats.percentile52w}) con margen sobre alimento de ${marginOverFeedPct != null ? `${marginOverFeedPct}%` : 'referencia'}; mantener compras semanales escalonadas.`,
    };
}

function buildLivestockMarginReport({ proteinArtifact = null, nowMs = Date.now() } = {}) {
    const artifact = proteinArtifact || readJsonSafe(PROTEIN_ML_FILE);
    const parityBySpecies = artifact?.importParity?.bySpecies || {};
    const nlpBySpecies = artifact?.nlpEvents?.bySpecies || {};
    const inputs = resolveGrainAndFxInputs(artifact);
    const distributions = collectMexico52WeekDistributions(nowMs);

    const bySpecies = {};
    const rows = [];

    for (const sp of SPECIES_ORDER) {
        const spec = SPECIES_SPECS[sp];
        const parity = parityBySpecies[sp] || null;
        const mxPrice = Number(parity?.mexicoBenchmark?.priceMxnKg);
        if (!Number.isFinite(mxPrice) || mxPrice <= 0) continue;

        let feedMxnTon = null;
        let feedMxnKg = null;
        let feedCostPerKgMeatMxn = null;
        let grossMarginMxnKg = null;
        let marginOverFeedPct = null;
        let feedToMeatRatio = null;

        if (inputs.cornUsdTon && inputs.soyUsdTon && inputs.usdMxn) {
            const rawGrainUsdTon = inputs.cornUsdTon * spec.cornWeight + inputs.soyUsdTon * spec.soyWeight;
            feedMxnTon = round(rawGrainUsdTon * inputs.usdMxn + spec.millingMxnTon, 2);
            feedMxnKg = round(feedMxnTon / 1000, 2);
            feedCostPerKgMeatMxn = round(feedMxnKg * spec.fcr, 2);
            grossMarginMxnKg = round(mxPrice - feedCostPerKgMeatMxn, 2);
            marginOverFeedPct = round((grossMarginMxnKg / mxPrice) * 100, 1);
            feedToMeatRatio = round(mxPrice / feedMxnKg, 2);
        }

        const rangeStats = computePercentileStats(
            distributions[sp] || [],
            mxPrice,
            Number(parity?.mexicoBenchmark?.minMxnKg),
            Number(parity?.mexicoBenchmark?.maxMxnKg)
        );

        const prim = parity?.primaryParity || null;
        const arbitrage = prim ? {
            originCountry: prim.originCountry,
            originLabel: prim.label,
            landedMxnKg: prim.landedMxnKg,
            spreadMxnKg: prim.spreadMxnKg,
            spreadPct: prim.spreadPct,
            signal: prim.signal,
        } : null;

        const nlp = nlpBySpecies[sp] || null;
        const sanitary = nlp ? {
            riskLevel: nlp.riskLevel,
            riskScore: nlp.riskScore,
            bias: nlp.bias,
            dominantType: nlp.dominantType || null,
        } : null;

        const playbook = buildBuyingPlaybook({
            speciesLabel: spec.label,
            rangeStats,
            arbitrage,
            sanitary,
            marginOverFeedPct,
        });

        const entry = {
            species: sp,
            label: spec.label,
            icon: spec.icon,
            mexicoPriceMxnKg: round(mxPrice, 2),
            plazasCount: parity?.mexicoBenchmark?.plazasCount || 0,
            observedAt: parity?.mexicoBenchmark?.observedAt || null,
            feedFormula: `${Math.round(spec.cornWeight * 100)}% Maíz + ${Math.round(spec.soyWeight * 100)}% Soya · FCR ${spec.fcr}`,
            fcr: spec.fcr,
            balancedFeedMxnTon: feedMxnTon,
            balancedFeedMxnKg: feedMxnKg,
            feedCostPerKgMeatMxn,
            grossMarginOverFeedMxnKg: grossMarginMxnKg,
            marginOverFeedPct,
            feedToMeatRatio,
            range52w: rangeStats,
            arbitrage,
            sanitary,
            playbook,
        };

        bySpecies[sp] = entry;
        rows.push(entry);
    }

    return {
        available: rows.length > 0,
        generatedAt: new Date(nowMs).toISOString(),
        inputs,
        methodology: 'Margen sobre alimento = Precio Mediana SNIIM (MXN/kg) − [Costo ración balanceada Maíz/Soya CBOT × USD/MXN + molienda ref.] × FCR estándar. Percentil 52s calculado sobre observaciones reales MX registradas en VALLNews.',
        bySpecies,
        species: rows,
    };
}

module.exports = { buildLivestockMarginReport, SPECIES_SPECS };
