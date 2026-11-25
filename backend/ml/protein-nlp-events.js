'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { externalGet } = require('../lib/http');

const NLP_EVENTS_CACHE_FILE = path.join(__dirname, '..', 'cache', 'protein-nlp-events.json');
const MAX_AGE_DAYS = 35;
const HALF_LIFE_DAYS = 7;

const QUERIES = Object.freeze([
    { id: 'es-h5n1', q: 'influenza aviar H5N1 pollo huevo brote', mkt: 'es-MX', hintRegion: 'MX' },
    { id: 'es-ppa', q: 'peste porcina africana cerdo brote', mkt: 'es-MX', hintRegion: null },
    { id: 'es-barrenador', q: 'gusano barrenador ganado Mexico SENASICA', mkt: 'es-MX', hintRegion: 'MX' },
    { id: 'es-comercio', q: 'aranceles carne cerdo res pollo importacion Mexico frontera', mkt: 'es-MX', hintRegion: 'MX' },
    { id: 'en-h5n1', q: 'avian influenza H5N1 poultry egg USDA', mkt: 'en-US', hintRegion: 'US' },
    { id: 'en-asf', q: 'African swine fever pork outbreak Europe', mkt: 'en-US', hintRegion: 'EU' },
    { id: 'en-screwworm', q: 'screwworm cattle Mexico border USDA', mkt: 'en-US', hintRegion: 'MX' },
    { id: 'en-trade', q: 'pork beef poultry tariff import ban trade', mkt: 'en-US', hintRegion: 'GLOBAL' },
    { id: 'pt-br-sanidad', q: 'gripe aviaria Brasil carne frango exportacao', mkt: 'pt-BR', hintRegion: 'LATAM' },
    { id: 'pt-br-beef', q: 'carne bovina Brasil exportacao China tarifa', mkt: 'pt-BR', hintRegion: 'LATAM' },
]);

const SPECIES_PATTERNS = Object.freeze({
    cerdo: /\b(?:cerdos?|porcin[oa]s?|puerco|pork|hogs?|swine|pig(?:s|meat)?|suin[oa]s?|peste porcina|african swine fever|asf\b|ppa\b|lechon(?:es)?)\b/i,
    res: /\b(?:res\b|bovin[oa]s?|vacun[oa]|ganado|beef|cattle|livestock|gusano barrenador|screwworm|fiebre aftosa|foot[- ]and[- ]mouth|boi gordo|lechera|dairy cattle)\b/i,
    pollo: /\b(?:pollos?|avicol[ae]s?|avicultura|poultry|chicken|broiler|frango|aves de corral|influenza aviar|gripe aviar|avian influenza|bird flu|h5n1)\b/i,
    huevo: /\b(?:huevos?|eggs?|ponedoras?|laying hens?|gallinas? ponedoras?|influenza aviar|gripe aviar|avian influenza|bird flu|h5n1)\b/i,
});

const REGION_PATTERNS = Object.freeze({
    MX: /\b(?:mexico|mexican[oa]s?|senasica|sader|yucatan|sonora|chihuahua|jalisco|veracruz|sinaloa|chiapas|tamaulipas|coahuila|sniim|pacic|frontera sur|frontera norte)\b/i,
    US: /\b(?:estados unidos|ee\.?\s*uu\.?|united states|u\.s\.|usda|aphis|texas|iowa|california|new mexico|arizona|washington|trump|ustr)\b/i,
    EU: /\b(?:europa|europe|union europea|eu\b|espana|spain|alemania|germany|francia|france|polonia|poland|italia|italy|belgica|belgium|paises bajos|netherlands|cataluna)\b/i,
    LATAM: /\b(?:brasil|brazil|brasileir[oa]|argentina|colombia|chile|uruguay|paraguay|peru|ecuador|latinoamerica|mercosur|abpa|mapa)\b/i,
    GLOBAL: /\b(?:china|japon|japan|corea|korea|tailandia|thailand|asia|mundial|global|omisa|woah|fao)\b/i,
});

const NOISE_EXCLUDE_RE = /\b(?:receta|cocina|restaurante|futbol|soccer|pelicula|horoscopo|famosos|espectaculos|viral en tiktok)\b/i;

function stripAccentsLower(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function decodeXml(value) {
    return String(value || '')
        .replace(/^<!\[CDATA\[|\]\]>$/g, '')
        .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTag(block, tag) {
    const m = String(block || '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? decodeXml(m[1]) : '';
}

function unwrapBingUrl(raw) {
    try {
        const u = new URL(String(raw || '').trim());
        if (/(^|\.)bing\.com$/i.test(u.hostname)) {
            const inner = u.searchParams.get('url');
            if (inner) {
                const parsed = new URL(inner);
                if (['http:', 'https:'].includes(parsed.protocol)) return parsed.toString();
            }
        }
        return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
    } catch {
        return '';
    }
}

function parseRssItems(xml, queryMeta) {
    return [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
        const item = match[1];
        const title = extractTag(item, 'title');
        const summary = extractTag(item, 'description');
        const pubRaw = extractTag(item, 'pubDate');
        const source = extractTag(item, 'News:Source') || extractTag(item, 'source') || 'Bing News';
        const url = unwrapBingUrl(extractTag(item, 'link'));
        const pubMs = pubRaw ? Date.parse(pubRaw) : NaN;
        return {
            title,
            summary,
            source,
            url,
            publishedAt: Number.isFinite(pubMs) ? new Date(pubMs).toISOString() : null,
            publishedMs: Number.isFinite(pubMs) ? pubMs : null,
            queryId: queryMeta.id,
            hintRegion: queryMeta.hintRegion,
        };
    }).filter(a => a.title && a.url);
}

/**
 * Clasificador NLP determinista de eventos sanitarios, comerciales y climáticos
 * para proteínas animales (español / inglés / portugués).
 */
function classifyProteinEvent(article, now = Date.now()) {
    const rawText = `${article.title || ''} ${article.summary || ''}`;
    const norm = stripAccentsLower(rawText);
    if (!norm || NOISE_EXCLUDE_RE.test(norm)) return null;

    // Filtro de vigencia: descarta artículos sin fecha o mayores a MAX_AGE_DAYS días
    if (!Number.isFinite(article.publishedMs)) return null;
    const ageDays = Math.max(0, (now - article.publishedMs) / 86_400_000);
    if (ageDays > MAX_AGE_DAYS) return null;

    // Detectar especies (evitando que H5N1 exclusivo de ganado lechero contamine pollo/huevo)
    const isDairyOnlyH5N1 = /\b(?:dairy cattle|dairy herds?|vacas? lecheras?|ganado lechero)\b/.test(norm)
        && !/\b(?:pollos?|huevos?|avicol|avicultura|poultry|chicken|broiler|eggs?|aves de corral|ponedoras?|frango)\b/.test(norm);
    const species = Object.entries(SPECIES_PATTERNS)
        .filter(([sp, re]) => {
            if (isDairyOnlyH5N1 && (sp === 'pollo' || sp === 'huevo')) return false;
            return re.test(norm);
        })
        .map(([sp]) => sp);
    if (!species.length) return null;

    // Detectar regiones
    let regions = Object.entries(REGION_PATTERNS)
        .filter(([, re]) => re.test(norm))
        .map(([reg]) => reg);
    if (!regions.length && article.hintRegion) regions = [article.hintRegion];
    if (!regions.length) regions = ['GLOBAL'];

    // Clasificación de evento + polaridad de precio (supply shock vs alivio/reapertura vs trampa exportadora)
    const isH5N1 = /\b(?:influenza aviar|gripe aviar|gripe aviaria|avian influenza|bird flu|h5n1|h5n2)\b/.test(norm);
    const isASF = /\b(?:peste porcina africana|african swine fever|\basf\b|\bppa\b|fiebre porcina)\b/.test(norm);
    const isScrewworm = /\b(?:gusano barrenador|screwworm|cochliomyia)\b/.test(norm);
    const isFMD = /\b(?:fiebre aftosa|foot[- ]and[- ]mouth)\b/.test(norm);
    const isOutbreak = /\b(?:confirma brote|nuevo brote|brote activo|llega a granjas|outbreak|cuarentena|quarantine|sacrificio|slaughtered|culled|culling|emergencia sanitaria|spread(?:ing)?|fuels? .* spread)\b/.test(norm);
    const isRetrospectiveOrStable = /\b(?:un ano (?:con|de)|se mantiene estable|sin llegar a|pese a no haber llegado|supply safe|descarta afectacion|no afecta granjas)\b/.test(norm);
    const isReopeningOrRelief = /\b(?:reabre|reapertura|reopens?|reopened|levanta(?:n|do)? (?:suspension|veda|bloqueo|restriccion)|exporta mexico mas de|pese al gusano barrenador|vacunacion autorizada|libre de|controlado|reanuda(?:n|cion)?)\b/.test(norm);
    const isBorderBanOrTariff = /\b(?:arancel(?:es)?|tariffs?|cierre de frontera|border closure|suspension|suspende|prohibe|import ban|export ban|embargo|restriccion(?:es)?|cuota|cupo|falta de reglas|bloqueo|advierten aumento|mas cara)\b/.test(norm);
    const isTradeDeal = /\b(?:acuerdo comercial|trade deal|purchases?|compras agricolas|abre mercado|habilita plantas|autoriza exportacion)\b/.test(norm);
    const isWeatherFeed = /\b(?:sequia|drought|helada|escasez de grano|alza del maiz|costo del alimento)\b/.test(norm);

    let eventType = null;
    let eventLabel = '';
    let severityWeight = 0;
    let priceDirection = 0; // +1 = presión alcista (choque oferta / arancel), -1 = alivio / reapertura / sobreoferta exportador

    if (isH5N1 || isASF || isScrewworm || isFMD) {
        const diseaseTag = isH5N1 ? 'Influenza Aviar (H5N1)'
            : isASF ? 'Peste Porcina Africana (PPA)'
                : isScrewworm ? 'Gusano Barrenador del Ganado'
                    : 'Fiebre Aftosa';

        const isExportTrap = /\b(?:sobreoferta|desplome|excedente|cierre de exportaciones|perdidas de mas de|perdidas millonarias|deja perdidas|afronta perdidas)\b/.test(norm);
        if (isReopeningOrRelief && !isOutbreak) {
            eventType = 'ALIVIO_SANITARIO';
            eventLabel = `Alivio / Flujo Sanitario (${diseaseTag})`;
            severityWeight = 0.45;
            priceDirection = -0.5;
        } else if (isExportTrap) {
            eventType = 'BROTE_SANITARIO';
            eventLabel = `Presión Exportadora · ${diseaseTag}`;
            severityWeight = 0.72;
            priceDirection = -0.65; // Restricción exportadora atrapa oferta doméstica y presiona precios a la baja en el origen
        } else if (isRetrospectiveOrStable && !isOutbreak) {
            eventType = 'VIGILANCIA_SANITARIA';
            eventLabel = `Vigilancia Sanitaria · ${diseaseTag}`;
            severityWeight = 0.32;
            priceDirection = 0.15;
        } else {
            eventType = 'BROTE_SANITARIO';
            eventLabel = `Riesgo Sanitario · ${diseaseTag}`;
            severityWeight = isOutbreak ? 1.0 : 0.62;
            priceDirection = 0.85;
        }
    } else if (isBorderBanOrTariff) {
        eventType = 'ARANCEL_FRONTERA';
        eventLabel = 'Restricción Comercial / Aranceles';
        severityWeight = 0.8;
        const isImportOpening = /\b(?:importar carne brasilena|cupo sin arancel|pacic|exencion arancelaria)\b/.test(norm);
        priceDirection = isImportOpening ? -0.45 : 0.65;
    } else if (isTradeDeal) {
        eventType = 'ACUERDO_COMERCIAL';
        eventLabel = 'Demanda / Acuerdo Comercial';
        severityWeight = 0.55;
        priceDirection = 0.45; // Mayor demanda de exportación tiende a sostener precios
    } else if (isWeatherFeed) {
        eventType = 'CLIMA_INSUMOS';
        eventLabel = 'Choque Climático / Insumos';
        severityWeight = 0.65;
        priceDirection = 0.7;
    }

    if (!eventType) return null;

    // Decaimiento exponencial por frescura (vida media 10 días)
    const recencyWeight = Math.exp(-Math.LN2 * (ageDays / HALF_LIFE_DAYS));
    const impactScore = Number((severityWeight * recencyWeight).toFixed(4));
    const signedSignal = Number((priceDirection * impactScore).toFixed(4));
    const severity = impactScore >= 0.55 ? 'ALTA' : impactScore >= 0.25 ? 'MEDIA' : 'BAJA';

    return {
        id: `${article.queryId}-${Buffer.from(article.title).toString('base64').slice(0, 12)}`,
        title: article.title,
        summary: (article.summary || '').slice(0, 260),
        source: article.source,
        url: article.url,
        publishedAt: article.publishedAt,
        ageDays: Number(ageDays.toFixed(1)),
        species,
        regions,
        eventType,
        eventLabel,
        severity,
        impactScore,
        signedSignal,
        priceImpact: signedSignal > 0.1 ? 'ALCISTA' : signedSignal < -0.1 ? 'BAJISTA' : 'NEUTRAL',
    };
}

function summarizeClassifiedEvents(events, { now = Date.now(), fetchedRawCount = 0 } = {}) {
    const SPECIES_LIST = ['cerdo', 'res', 'pollo', 'huevo'];
    const REGIONS_LIST = ['MX', 'US', 'EU', 'LATAM', 'GLOBAL'];

    const aggregateGroup = list => {
        if (!list.length) {
            return {
                eventCount: 0,
                riskScore: 0,
                riskLevel: 'BAJO',
                netPressure: 0,
                bias: 'ESTABLE',
                dominantType: null,
                topHeadlines: [],
            };
        }
        const totalImpact = list.reduce((a, e) => a + e.impactScore, 0);
        const netRaw = list.reduce((a, e) => a + e.signedSignal, 0);
        // Saturación diferenciada: discrimina limpiamente entre MODERADO (20-45), ELEVADO (46-74) y CRÍTICO (75-100)
        const riskScore = Math.round(Math.min(100, 100 * Math.tanh(totalImpact / 8.0)));
        const netPressure = Number(Math.tanh(netRaw / 4.5).toFixed(3));
        const riskLevel = riskScore >= 75 ? 'CRÍTICO' : riskScore >= 45 ? 'ELEVADO' : riskScore >= 18 ? 'MODERADO' : 'BAJO';
        const bias = netPressure >= 0.2 ? 'ALCISTA' : netPressure <= -0.2 ? 'BAJISTA' : riskScore >= 35 ? 'MIXTO' : 'ESTABLE';

        const typeCounts = new Map();
        for (const ev of list) typeCounts.set(ev.eventLabel, (typeCounts.get(ev.eventLabel) || 0) + ev.impactScore);
        const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        const topHeadlines = [...list]
            .sort((a, b) => b.impactScore - a.impactScore)
            .slice(0, 4)
            .map(ev => ({
                title: ev.title,
                source: ev.source,
                url: ev.url,
                publishedAt: ev.publishedAt,
                ageDays: ev.ageDays,
                eventType: ev.eventType,
                eventLabel: ev.eventLabel,
                severity: ev.severity,
                priceImpact: ev.priceImpact,
                regions: ev.regions,
                species: ev.species,
            }));

        return {
            eventCount: list.length,
            riskScore,
            riskLevel,
            netPressure,
            bias,
            dominantType,
            topHeadlines,
        };
    };

    const bySpecies = {};
    const bySpeciesRegion = {};
    for (const sp of SPECIES_LIST) {
        const spList = events.filter(e => e.species.includes(sp));
        bySpecies[sp] = aggregateGroup(spList);
        bySpeciesRegion[sp] = {};
        for (const reg of REGIONS_LIST) {
            const srList = spList.filter(e => e.regions.includes(reg));
            bySpeciesRegion[sp][reg] = aggregateGroup(srList);
        }
    }

    const sortedAll = [...events].sort((a, b) => b.impactScore - a.impactScore);

    return {
        version: 'marranas-nlp-events-v1.0',
        generatedAt: new Date(now).toISOString(),
        windowDays: MAX_AGE_DAYS,
        halfLifeDays: HALF_LIFE_DAYS,
        stats: {
            queriesExecuted: QUERIES.length,
            rawArticlesScanned: fetchedRawCount,
            relevantEventsDetected: events.length,
            sanitaryAlertsCount: events.filter(e => e.eventType === 'BROTE_SANITARIO').length,
            tradeEventsCount: events.filter(e => ['ARANCEL_FRONTERA', 'ACUERDO_COMERCIAL'].includes(e.eventType)).length,
        },
        bySpecies,
        bySpeciesRegion,
        topEvents: sortedAll.slice(0, 16),
    };
}

function saveNlpEventsCache(snapshot) {
    try {
        fs.mkdirSync(path.dirname(NLP_EVENTS_CACHE_FILE), { recursive: true });
        fs.writeFileSync(NLP_EVENTS_CACHE_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch { /* ignore cache write failures */ }
}

function loadCachedNlpEvents() {
    try {
        if (!fs.existsSync(NLP_EVENTS_CACHE_FILE)) return null;
        return JSON.parse(fs.readFileSync(NLP_EVENTS_CACHE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

async function fetchAndClassifyProteinNlpEvents({ now = Date.now(), persist = true } = {}) {
    const settled = await Promise.allSettled(
        QUERIES.map(async meta => {
            const url = `https://www.bing.com/news/search?q=${encodeURIComponent(meta.q)}&format=rss&mkt=${meta.mkt}&setlang=${meta.mkt.toLowerCase()}`;
            const res = await externalGet(url, { Accept: 'application/rss+xml, application/xml;q=0.9' }, 7000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return parseRssItems(await res.text(), meta);
        })
    );

    const raw = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    // Deduplicación por título normalizado
    const dedup = new Map();
    for (const art of raw) {
        const key = stripAccentsLower(art.title).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 75);
        if (!key) continue;
        const prev = dedup.get(key);
        if (!prev || (art.publishedMs || 0) > (prev.publishedMs || 0)) dedup.set(key, art);
    }

    const classified = [];
    for (const art of dedup.values()) {
        const ev = classifyProteinEvent(art, now);
        if (ev) classified.push(ev);
    }

    const snapshot = summarizeClassifiedEvents(classified, { now, fetchedRawCount: raw.length });
    if (persist && classified.length > 0) saveNlpEventsCache(snapshot);
    return snapshot;
}

/**
 * Calcula el ajuste causal acotado en puntos porcentuales (máx ±6.0 pts)
 * para un pronóstico específico según eventos NLP activos de su especie y región.
 */
function computeNlpEventOverlay(nlpEvents, species, region) {
    if (!nlpEvents?.bySpecies) return null;
    const regBucket = nlpEvents.bySpeciesRegion?.[species]?.[region];
    const spBucket = nlpEvents.bySpecies?.[species];
    if (!spBucket || spBucket.eventCount === 0) return null;

    // Prioriza eventos de la región exacta (70%) + spillover global de la especie (30%)
    const hasReg = regBucket && regBucket.eventCount > 0;
    const combinedPressure = hasReg
        ? 0.72 * regBucket.netPressure + 0.28 * spBucket.netPressure
        : 0.45 * spBucket.netPressure;
    const combinedRisk = hasReg
        ? Math.round(0.72 * regBucket.riskScore + 0.28 * spBucket.riskScore)
        : Math.round(0.5 * spBucket.riskScore);

    if (combinedRisk < 18 || Math.abs(combinedPressure) < 0.12) return null;

    // Ajuste estrictamente acotado en probabilidad (±6.0 pts máx) para complementar, no sobreescribir el ML
    const probDeltaPts = Number(Math.max(-6, Math.min(6, combinedPressure * (combinedRisk / 100) * 7.5)).toFixed(1));
    const leadEvent = (hasReg ? regBucket.topHeadlines[0] : spBucket.topHeadlines[0]) || null;

    return {
        riskScore: combinedRisk,
        riskLevel: combinedRisk >= 65 ? 'CRÍTICO' : combinedRisk >= 38 ? 'ELEVADO' : 'MODERADO',
        netPressure: Number(combinedPressure.toFixed(3)),
        probDeltaPts,
        dominantType: (hasReg ? regBucket.dominantType : spBucket.dominantType) || 'Evento Sanitario/Comercial',
        eventCount: hasReg ? regBucket.eventCount : spBucket.eventCount,
        leadHeadline: leadEvent ? {
            title: leadEvent.title,
            source: leadEvent.source,
            publishedAt: leadEvent.publishedAt,
            url: leadEvent.url,
            eventLabel: leadEvent.eventLabel,
        } : null,
    };
}

module.exports = {
    NLP_EVENTS_CACHE_FILE,
    classifyProteinEvent,
    summarizeClassifiedEvents,
    fetchAndClassifyProteinNlpEvents,
    loadCachedNlpEvents,
    saveNlpEventsCache,
    computeNlpEventOverlay,
};
