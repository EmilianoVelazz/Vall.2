'use strict';

const mysql = require('mysql2/promise');

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const SYMBOL_RULES = [
    { re: /\b(?:usd\s*\/?\s*mxn|d[oó]lar(?:es)?(?: estadounidense)?(?: contra| frente al|\/)?(?: el)? peso|d[oó]lar(?:es)?|tipo de cambio)\b/i, symbol: 'USDMXN=X' },
    { re: /\b(?:bitcoin|btc)\b/i, symbol: 'BTC-USD' },
    { re: /\b(?:ethereum|ether|eth)\b/i, symbol: 'ETH-USD' },
    { re: /\bgruma\b/i, symbol: 'GRUMAB.MX' },
    { re: /\b(?:bimbo|grupo bimbo)\b/i, symbol: 'BIMBOA.MX' },
    { re: /\bfemsa\b/i, symbol: 'FEMSAUBD.MX' },
    { re: /\b(?:walmex|walmart m[eé]xico)\b/i, symbol: 'WALMEX.MX' },
    { re: /\b(?:cerdo|porcino|lean hogs?)\b/i, symbol: 'HE=F' },
    { re: /\b(?:petr[oó]leo|wti|crudo)\b/i, symbol: 'CL=F' },
    { re: /\bma[ií]z\b/i, symbol: 'CORN' },
    { re: /\b(?:soya|soja)\b/i, symbol: 'SOYBEANS' },
    { re: /\btrigo\b/i, symbol: 'WHEAT' },
    { re: /\bcobre\b/i, symbol: 'COPPER' },
    { re: /\bgas natural\b/i, symbol: 'NATURAL_GAS' },
    { re: /\baluminio\b/i, symbol: 'ALUMINUM' },
];
const ECONOMIC_RULES = [
    { re: /\binflaci[oó]n\b/i, search: '%inflación%' },
    { re: /\btiie\b/i, search: '%TIIE%' },
    { re: /\bcetes?\b/i, search: '%CETES%' },
    { re: /\b(?:tasas?|inter[eé]s)\b/i, search: '%TIIE%' },
    { re: /\b(?:tasas?|inter[eé]s)\b/i, search: '%CETES%' },
    { re: /\b(?:d[oó]lar|usd|tipo de cambio)\b/i, search: '%tipo de cambio%' },
    { re: /\bcripto/i, search: '%cripto%' },
];
const TERM_EXPANSIONS = [
    { re: /\b(?:d[oó]lar|usd|mxn|tipo de cambio|peso mexicano)\b/i, terms: ['dolar', 'usd', 'mxn', 'peso', 'cambio', 'divisa', 'forex'] },
    { re: /\b(?:inflaci[oó]n|inpc|precios)\b/i, terms: ['inflacion', 'inpc', 'precios', 'consumidor'] },
    { re: /\b(?:tiie|cetes?|tasas?|inter[eé]s|banxico)\b/i, terms: ['tiie', 'cetes', 'tasa', 'interes', 'banxico'] },
    { re: /\b(?:petr[oó]leo|wti|crudo|energ[ií]a)\b/i, terms: ['petroleo', 'wti', 'crudo', 'energia'] },
    { re: /\b(?:ma[ií]z|trigo|soya|soja|cerdo|porcino|prote[ií]na)\b/i, terms: ['maiz', 'trigo', 'soya', 'cerdo', 'porcino', 'agricola', 'proteina'] },
    { re: /\b(?:bitcoin|ethereum|cripto)\b/i, terms: ['bitcoin', 'ethereum', 'cripto', 'mercado'] },
    { re: /\b(?:geopol[ií]tica|conflicto|guerra|sanci[oó]n|arancel)\b/i, terms: ['geopolitica', 'conflicto', 'guerra', 'sancion', 'arancel', 'comercio'] },
];

function databaseConfig() {
    return {
        host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
        user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
        password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
        database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE || 'vall_',
        charset: 'utf8mb4',
        decimalNumbers: true,
        waitForConnections: true,
        connectionLimit: 12,
        queueLimit: 40,
        enableKeepAlive: true,
    };
}

function searchTerms(message) {
    const stop = new Set(['para', 'como', 'esta', 'este', 'estos', 'estas', 'contra', 'sobre', 'puedes',
        'crear', 'hacer', 'dame', 'quiero', 'grafica', 'gráfica', 'analiza', 'del', 'las', 'los', 'una']);
    return String(message || '').toLowerCase()
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}\s/-]/gu, ' ')
        .split(/\s+/)
        .filter(term => term.length >= 4 && !stop.has(term))
        .slice(0, 12)
        .join(' ');
}

function normalizeForScore(value) {
    return String(value || '').toLowerCase().normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function expandedSearchTerms(message) {
    const terms = new Set(searchTerms(message).split(/\s+/).filter(Boolean).map(normalizeForScore));
    for (const expansion of TERM_EXPANSIONS) {
        if (expansion.re.test(String(message || ''))) expansion.terms.forEach(term => terms.add(term));
    }
    return [...terms].slice(0, 24).join(' ');
}

function tokenSet(value) {
    return new Set(normalizeForScore(value).split(/\s+/).filter(term => term.length >= 3));
}

function jaccard(left, right) {
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection++;
    return intersection / (left.size + right.size - intersection);
}

function queryProfile(message) {
    const text = String(message || '');
    const year = requestedYear(text);
    const symbol = requestedSymbol(text);
    const asksEvents = /\b(?:noticias?|eventos?|causas?|impacto|afect[oó]|por qu[eé]|explica|contexto|geopol[ií]tica)\b/i.test(text);
    const asksContext = asksEvents
        || /\b(?:actual|reciente|hoy|panorama|perspectiva|riesgo|escenario|proyecci[oó]n)\b/i.test(text);
    const explicitEconomic = /\b(?:inflaci[oó]n|inpc|tiie|cetes?|tasas?|inter[eé]s|banxico)\b/i.test(text);
    return {
        year,
        symbol,
        historicalMarketOnly: Boolean(year && symbol && !asksEvents),
        includeEvents: asksContext,
        includeExternalDocuments: asksContext,
        includeEconomic: explicitEconomic || !year,
    };
}

function scoreDocument(row, message) {
    const queryTokens = tokenSet(expandedSearchTerms(message));
    const contentTokens = tokenSet(`${row.title} ${row.heading_path} ${row.tags || ''} ${row.content}`);
    let overlap = 0;
    for (const token of queryTokens) if (contentTokens.has(token)) overlap++;
    const coverage = queryTokens.size ? overlap / queryTokens.size : 0;
    const trust = Number(row.trust_score || 0) / 100;
    const sourceBoost = row.source_code === 'vallnews' ? 1.35 : 1;
    const typeBoost = row.document_type === 'site_page' ? 1.12 : 1;
    let freshness = 0;
    if (row.published_at && row.document_type === 'news_article') {
        const ageDays = Math.max(0, (Date.now() - new Date(row.published_at).getTime()) / 86400000);
        freshness = Math.max(0, 1 - ageDays / 730);
    }
    row._tokens = contentTokens;
    row.hybrid_score = Number(row.relevance || 0) * sourceBoost * typeBoost
        + coverage * 12 + trust * 2 + freshness;
    return row;
}

function diversifyDocuments(rows, message, limit = 8) {
    const candidates = rows.map(row => scoreDocument(row, message))
        .sort((a, b) => b.hybrid_score - a.hybrid_score);
    const selected = [];
    const documentCounts = new Map();
    const sourceCounts = new Map();
    const seenKeys = new Set();
    while (selected.length < limit) {
        let best = null;
        let bestScore = -Infinity;
        for (const row of candidates) {
            if (selected.includes(row)) continue;
            const key = `${row.canonical_url || ''}|${normalizeForScore(row.title)}`;
            if (seenKeys.has(key)) continue;
            if ((documentCounts.get(row.document_id) || 0) >= 2) continue;
            if ((sourceCounts.get(row.source_code) || 0) >= 4) continue;
            const similarity = selected.length
                ? Math.max(...selected.map(item => jaccard(row._tokens, item._tokens)))
                : 0;
            const mmrScore = row.hybrid_score - similarity * 4;
            if (mmrScore > bestScore) {
                best = row;
                bestScore = mmrScore;
            }
        }
        if (!best) break;
        selected.push(best);
        seenKeys.add(`${best.canonical_url || ''}|${normalizeForScore(best.title)}`);
        documentCounts.set(best.document_id, (documentCounts.get(best.document_id) || 0) + 1);
        sourceCounts.set(best.source_code, (sourceCounts.get(best.source_code) || 0) + 1);
    }
    return selected;
}

function requestedYear(message) {
    const match = String(message || '').match(/\b(20\d{2})\d?\b/);
    return match ? Number(match[1]) : null;
}

function requestedSymbol(message) {
    return requestedSymbols(message)[0] || null;
}

function requestedSymbols(message) {
    const text = String(message || '');
    const matches = SYMBOL_RULES.map(rule => {
        const match = text.match(rule.re);
        return match ? { symbol: rule.symbol, index: match.index ?? 0 } : null;
    }).filter(Boolean).sort((left, right) => left.index - right.index);
    return [...new Set(matches.map(match => match.symbol))];
}

function wantsChart(message) {
    return /\b(?:gr[aá]fica|gr[aá]fico|graficar|chart|visualiza|evoluci[oó]n)\b/i.test(String(message || ''));
}

function hasExplicitChartData(message) {
    const text = String(message || '');
    const numbers = text.match(/-?\d+(?:[.,]\d+)?/g) || [];
    const hasStructure = /\|.+\|/.test(text)
        || /;\s*\w+/.test(text)
        || /\b(?:meses|periodos|categor[ií]as|valores|datos)\s*:/i.test(text);
    return hasStructure && numbers.length >= 3;
}

function num(value, digits = 4) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

function dateOnly(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || '').slice(0, 10) : date.toISOString().slice(0, 10);
}

function marketUnit(row) {
    if (row.symbol === 'USDMXN=X') return 'MXN por USD';
    return row.unit || row.currency_code || '';
}

function buildMarketCharts(rows, year = null) {
    if (!rows.length) return [];
    const groups = new Map();
    for (const row of rows) {
        if (!groups.has(row.symbol)) groups.set(row.symbol, []);
        groups.get(row.symbol).push(row);
    }
    const series = [...groups.entries()].map(([symbol, points]) => ({
        symbol,
        name: points[0].name,
        unit: marketUnit(points[0]),
        source: points[0].source_name,
        points: points.sort((left, right) => String(left.period_key).localeCompare(String(right.period_key))),
    }));
    const periodText = year ? `Año ${year}` : 'Últimos 12 meses disponibles';
    if (series.length === 1) {
        const item = series[0];
        const values = item.points.map(point => num(point.average_value));
        return [{
            type: 'line',
            title: `${item.name}: promedio mensual`,
            subtitle: `${periodText}; ${item.points.reduce((sum, point) => sum + Number(point.observations), 0)} observaciones`,
            insight: `Promedio mensual mínimo ${Math.min(...values).toFixed(4)} y máximo ${Math.max(...values).toFixed(4)}.`,
            unit: item.unit,
            source: `${item.source}, histórico almacenado por VALLNews`,
            beginAtZero: false,
            labels: item.points.map(point => year ? MONTHS_ES[Number(point.month_number) - 1] : point.period_label),
            datasets: [{ label: item.symbol, data: values }],
        }];
    }
    const labels = [...new Set(rows.map(row => row.period_key))].sort();
    const labelMap = new Map(rows.map(row => [
        row.period_key,
        year ? MONTHS_ES[Number(row.month_number) - 1] : row.period_label,
    ]));
    const datasets = series.map(item => {
        const values = new Map(item.points.map(point => [point.period_key, num(point.average_value)]));
        const first = labels.map(label => values.get(label)).find(value => Number.isFinite(value) && value !== 0);
        return {
            label: item.name,
            data: labels.map(label => {
                const value = values.get(label);
                return Number.isFinite(value) && first ? num(value / first * 100, 2) : null;
            }),
        };
    });
    return [{
        type: 'line',
        title: 'Evolución comparativa de los activos solicitados',
        subtitle: `${periodText}; cada serie inicia en 100 para evitar escalas incompatibles`,
        insight: 'Un valor superior a 100 representa apreciación frente al primer mes disponible.',
        unit: 'Índice base 100',
        source: [...new Set(series.map(item => item.source))].join(', '),
        beginAtZero: false,
        labels: labels.map(label => labelMap.get(label) || label),
        datasets,
    }];
}

function buildEconomicCharts(rows, year = null) {
    if (!rows.length) return [];
    const groups = new Map();
    for (const row of rows) {
        if (!groups.has(row.series_code)) groups.set(row.series_code, []);
        groups.get(row.series_code).push(row);
    }
    const series = [...groups.values()].map(points => ({
        code: points[0].series_code,
        name: points[0].name,
        unit: points[0].unit,
        source: points[0].source_name,
        points: points.sort((left, right) => String(left.period_key).localeCompare(String(right.period_key))),
    })).filter(item => item.points.length >= 2).slice(0, 6);
    if (!series.length) return [];
    const periodText = year ? `Año ${year}` : 'Últimos 12 meses disponibles';
    const labels = [...new Set(rows.map(row => row.period_key))].sort();
    const labelMap = new Map(rows.map(row => [
        row.period_key,
        year ? MONTHS_ES[Number(row.month_number) - 1] : row.period_label,
    ]));
    const units = [...new Set(series.map(item => item.unit))];
    if (units.length === 1) {
        return [{
            type: 'line',
            title: series.length === 1 ? series[0].name : 'Comparativo de indicadores económicos',
            subtitle: periodText,
            insight: 'La gráfica utiliza promedios mensuales de las observaciones oficiales disponibles.',
            unit: units[0],
            source: [...new Set(series.map(item => item.source))].join(', '),
            beginAtZero: false,
            labels: labels.map(label => labelMap.get(label) || label),
            datasets: series.map(item => {
                const values = new Map(item.points.map(point => [point.period_key, num(point.value)]));
                return { label: item.name, data: labels.map(label => values.get(label) ?? null) };
            }),
        }];
    }
    return series.slice(0, 3).map(item => ({
        type: 'line',
        title: item.name,
        subtitle: periodText,
        insight: 'Promedios mensuales calculados con las observaciones oficiales disponibles.',
        unit: item.unit,
        source: item.source,
        beginAtZero: false,
        labels: item.points.map(point => year ? MONTHS_ES[Number(point.month_number) - 1] : point.period_label),
        datasets: [{ label: item.name, data: item.points.map(point => num(point.value)) }],
    }));
}

class RagRetriever {
    constructor({ pool = null } = {}) {
        this.pool = pool;
        this.disabledUntil = 0;
    }

    getPool() {
        if (!this.pool) this.pool = mysql.createPool(databaseConfig());
        return this.pool;
    }

    async safeQuery(sql, params = []) {
        if (Date.now() < this.disabledUntil) return [];
        let attempt = 0;
        while (attempt < 2) {
            try {
                const [rows] = await this.getPool().execute(sql, params);
                return rows;
            } catch (error) {
                attempt++;
                if (attempt >= 2 || !['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(error.code)) {
                    this.disabledUntil = Date.now() + 60_000;
                    console.warn('[rag] MariaDB no disponible temporalmente:', error.message);
                    return [];
                }
                // Breve pausa antes de reintentar
                await new Promise(res => setTimeout(res, 300));
            }
        }
        return [];
    }

    async retrieveMemory(message, userKeyHash) {
        if (!userKeyHash || !message) return [];
        const terms = expandedSearchTerms(message);
        if (!terms) return [];
        
        return this.safeQuery(
            `SELECT q.question_text, q.response_text, f.rating, f.correction_text,
                    MATCH(q.question_text) AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance
             FROM ai_queries q
             JOIN ai_feedback f ON f.query_id = q.id
             WHERE q.user_key_hash = ? 
             AND (f.correction_text IS NOT NULL OR f.rating IS NOT NULL)
             AND MATCH(q.question_text) AGAINST (? IN NATURAL LANGUAGE MODE)
             ORDER BY relevance DESC, q.created_at DESC
             LIMIT 5`,
            [terms, userKeyHash, terms]
        );
    }

    async retrieveDocuments(message) {
        const terms = expandedSearchTerms(message);
        if (!terms) return [];
        let rows = await this.safeQuery(
            `SELECT kd.id document_id, kc.id chunk_id, ds.id source_id,
                    kd.title, kd.canonical_url,
                    kd.published_at, kd.document_type,
                    ds.code source_code, ds.name source_name, ds.trust_score,
                    kc.heading_path, LEFT(kc.content, 1800) content,
                    (SELECT GROUP_CONCAT(kt.slug ORDER BY kdt.relevance_score DESC)
                     FROM knowledge_document_tags kdt
                     JOIN knowledge_tags kt ON kt.id=kdt.tag_id
                     WHERE kdt.document_id=kd.id) tags,
                    MATCH(kc.heading_path, kc.content) AGAINST (? IN NATURAL LANGUAGE MODE)
                      AS relevance
             FROM knowledge_chunks kc
             JOIN knowledge_documents kd ON kd.id=kc.document_id AND kd.status='active'
             JOIN data_sources ds ON ds.id=kd.source_id AND ds.is_active=1
             WHERE MATCH(kc.heading_path, kc.content) AGAINST (? IN NATURAL LANGUAGE MODE)
             ORDER BY relevance DESC, ds.trust_score DESC, kd.published_at DESC
             LIMIT 48`,
            [terms, terms]
        );
        if (!rows.length) {
            const fallback = terms.split(/\s+/).filter(Boolean).slice(0, 4);
            if (fallback.length) {
                const clauses = fallback.map(() => '(kc.content LIKE ? OR kd.title LIKE ?)').join(' OR ');
                const params = fallback.flatMap(term => [`%${term}%`, `%${term}%`]);
                rows = await this.safeQuery(
                    `SELECT kd.id document_id, kc.id chunk_id, ds.id source_id,
                            kd.title, kd.canonical_url,
                            kd.published_at, kd.document_type,
                            ds.code source_code, ds.name source_name, ds.trust_score,
                            kc.heading_path, LEFT(kc.content, 1800) content, 0.1 relevance
                            ,(SELECT GROUP_CONCAT(kt.slug ORDER BY kdt.relevance_score DESC)
                              FROM knowledge_document_tags kdt
                              JOIN knowledge_tags kt ON kt.id=kdt.tag_id
                              WHERE kdt.document_id=kd.id) tags
                     FROM knowledge_chunks kc
                     JOIN knowledge_documents kd ON kd.id=kc.document_id AND kd.status='active'
                     JOIN data_sources ds ON ds.id=kd.source_id AND ds.is_active=1
                     WHERE ${clauses}
                     ORDER BY ds.trust_score DESC, kd.published_at DESC
                     LIMIT 48`,
                    params
                );
            }
        }
        return diversifyDocuments(rows, message);
    }

    async retrieveEvents(message, profile = queryProfile(message)) {
        if (!profile.includeEvents) return [];
        const terms = expandedSearchTerms(message);
        if (!terms) return [];
        const yearClause = profile.year ? 'AND YEAR(ke.occurred_at)=?' : 'AND ke.occurred_at >= DATE_SUB(NOW(), INTERVAL 730 DAY)';
        const params = profile.year ? [terms, profile.year] : [terms];
        const rows = await this.safeQuery(
            `SELECT ke.id event_id, ds.id source_id, ke.title, LEFT(ke.summary, 900) summary,
                    ke.event_type, ke.occurred_at,
                    ke.country_code, ke.sentiment_score, ke.confidence_score,
                    ds.code source_code, ds.name source_name, ds.trust_score, kd.canonical_url,
                    MATCH(ke.title, ke.summary) AGAINST (? IN NATURAL LANGUAGE MODE) relevance
             FROM knowledge_events ke
             JOIN data_sources ds ON ds.id=ke.source_id AND ds.is_active=1
             LEFT JOIN knowledge_documents kd ON kd.id=ke.document_id
             WHERE MATCH(ke.title, ke.summary) AGAINST (? IN NATURAL LANGUAGE MODE)
             ${yearClause}
             ORDER BY relevance DESC, ke.occurred_at DESC, ke.confidence_score DESC
             LIMIT 24`,
            [terms, ...params]
        );
        const queryTokens = tokenSet(terms);
        const seen = new Set();
        return rows.map(row => {
            const itemTokens = tokenSet(`${row.title} ${row.summary}`);
            let overlap = 0;
            for (const token of queryTokens) if (itemTokens.has(token)) overlap++;
            row.hybrid_score = Number(row.relevance || 0)
                + (queryTokens.size ? overlap / queryTokens.size : 0) * 8
                + Number(row.confidence_score || 0) / 100
                + Number(row.trust_score || 0) / 100;
            return row;
        }).sort((a, b) => b.hybrid_score - a.hybrid_score).filter(row => {
            const key = row.canonical_url || normalizeForScore(row.title);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 5);
    }

    async retrieveEconomic(message, profile = queryProfile(message)) {
        if (!profile.includeEconomic) return [];
        const searches = ECONOMIC_RULES.filter(rule => rule.re.test(String(message || ''))).map(rule => rule.search);
        if (!searches.length) return [];
        const clauses = searches.map(() => 'es.name LIKE ?').join(' OR ');
        if (wantsChart(message)) {
            const periodFilter = profile.year
                ? 'YEAR(eo.period_date)=?'
                : "eo.period_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)";
            const params = profile.year ? [...searches, profile.year] : searches;
            const rows = await this.safeQuery(
                `SELECT es.id economic_series_id, ds.id source_id,
                        es.series_code, es.name, es.unit, es.frequency_code,
                        STR_TO_DATE(CONCAT(DATE_FORMAT(eo.period_date, '%Y-%m'), '-01'), '%Y-%m-%d') period_date,
                        DATE_FORMAT(eo.period_date, '%Y-%m') period_key,
                        DATE_FORMAT(eo.period_date, '%Y-%m') period_label,
                        MONTH(eo.period_date) month_number, COUNT(*) observations,
                        AVG(eo.value) value, AVG(eo.quality_score) quality_score,
                        ds.name source_name, ds.code source_code
                 FROM economic_series es
                 JOIN data_sources ds ON ds.id=es.source_id
                 JOIN economic_observations eo ON eo.series_id=es.id
                 WHERE (${clauses}) AND ${periodFilter}
                 GROUP BY es.id, ds.id, DATE_FORMAT(eo.period_date, '%Y-%m'), MONTH(eo.period_date)
                 ORDER BY es.name, period_key`,
                params
            );
            const allowedSeries = [...new Set(rows.map(row => row.series_code))].slice(0, 6);
            return rows.filter(row => allowedSeries.includes(row.series_code));
        }
        return this.safeQuery(
            `SELECT es.id economic_series_id, ds.id source_id,
                    es.series_code, es.name, es.unit, es.frequency_code, eo.period_date,
                    eo.value, eo.quality_score, ds.name source_name, ds.code source_code
             FROM economic_series es
             JOIN data_sources ds ON ds.id=es.source_id
             JOIN economic_observations eo ON eo.series_id=es.id
             JOIN (
                SELECT series_id, MAX(period_date) max_date
                FROM economic_observations GROUP BY series_id
             ) latest ON latest.series_id=eo.series_id AND latest.max_date=eo.period_date
             WHERE ${clauses}
             ORDER BY ds.trust_score DESC, es.name
             LIMIT 12`,
            searches
        );
    }

    async retrieveMarket(message) {
        const symbols = requestedSymbols(message);
        const symbol = symbols[0];
        if (!symbol) return { rows: [], charts: [], chart: null, chartStatus: wantsChart(message) ? 'unsupported_subject' : 'not_requested' };
        const year = requestedYear(message);
        if (year || wantsChart(message)) {
            const placeholders = symbols.map(() => '?').join(',');
            const periodFilter = year
                ? 'YEAR(mo.observed_at)=?'
                : "mo.observed_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)";
            const params = year ? [...symbols, year] : symbols;
            const rows = await this.safeQuery(
                `SELECT mi.id instrument_id, ds.id source_id, mi.symbol, mi.name,
                        mi.unit, mi.currency_code, ds.name source_name, ds.code source_code,
                        DATE_FORMAT(mo.observed_at, '%Y-%m') period_key,
                        DATE_FORMAT(mo.observed_at, '%Y-%m') period_label,
                        MONTH(mo.observed_at) month_number, COUNT(*) observations,
                        AVG(COALESCE(mo.close_value, mo.value)) average_value,
                        MIN(COALESCE(mo.close_value, mo.value)) minimum_value,
                        MAX(COALESCE(mo.close_value, mo.value)) maximum_value,
                        AVG(mo.quality_score) quality_score
                 FROM market_instruments mi
                 JOIN data_sources ds ON ds.id=mi.source_id
                 JOIN market_observations mo ON mo.instrument_id=mi.id
                 WHERE mi.symbol IN (${placeholders}) AND ${periodFilter}
                 GROUP BY mi.id, ds.id, ds.code, DATE_FORMAT(mo.observed_at, '%Y-%m'), MONTH(mo.observed_at)
                 ORDER BY period_key, mi.symbol`,
                params
            );
            const charts = buildMarketCharts(rows, year);
            return {
                rows,
                charts,
                chart: charts[0] || null,
                chartStatus: charts.length ? 'verified' : 'insufficient_data',
            };
        }
        const placeholders = symbols.map(() => '?').join(',');
        const rows = await this.safeQuery(
            `SELECT mi.id instrument_id, ds.id source_id, mi.symbol, mi.name,
                    mi.unit, mi.currency_code, mo.observed_at,
                    COALESCE(mo.close_value, mo.value) value, mo.change_pct,
                    mo.quality_score, ds.name source_name, ds.code source_code
             FROM latest_market_observations mo
             JOIN market_instruments mi ON mi.id=mo.instrument_id
             JOIN data_sources ds ON ds.id=mo.source_id
             WHERE mi.symbol IN (${placeholders})
             ORDER BY mo.quality_score DESC, mi.symbol LIMIT ${Math.min(18, symbols.length * 3)}`,
            symbols
        );
        return { rows, charts: [], chart: null, chartStatus: 'not_requested' };
    }

    formatContext({ documents, events, economic, market, memory = [] }) {
        const sections = [];
        if (memory.length) {
            sections.push('[MEMORIA DE INTERACCIONES PREVIAS]\n' + memory.map((row, index) =>
                `[Feedback Anterior ${index + 1}]
Pregunta original: ${row.question_text}
Respuesta dada: ${String(row.response_text).slice(0, 300)}...
Calificación del usuario: ${row.rating !== null ? row.rating : 'N/A'}
Corrección del usuario: ${row.correction_text || 'Ninguna'}
-> INSTRUCCIÓN: Si la corrección aplica a la pregunta actual, obedece la corrección del usuario por encima de tus cálculos o conocimiento previo.`
            ).join('\n\n'));
        }
        if (market.rows.length) {
            sections.push('[SERIE DE MERCADO VERIFICADA EN VALL]\n' + market.rows.map((row, index) => {
                if (row.month_number) {
                    return `[M${index + 1}] ${MONTHS_ES[row.month_number - 1]}: promedio=${num(row.average_value)}, mínimo=${num(row.minimum_value)}, máximo=${num(row.maximum_value)}, n=${row.observations}; fuente=${row.source_name}`;
                }
                return `[M${index + 1}] ${row.symbol} ${row.observed_at.toISOString?.() || row.observed_at}: valor=${num(row.value)} ${row.unit || row.currency_code || ''}; calidad=${row.quality_score}; fuente=${row.source_name}`;
            }).join('\n'));
        }
        if (economic.length) {
            sections.push('[INDICADORES ECONÓMICOS VERIFICADOS]\n' + economic.map((row, index) =>
                `[I${index + 1}] ${row.name}: ${num(row.value)} ${row.unit}; periodo=${dateOnly(row.period_date)}; fuente=${row.source_name}; calidad=${row.quality_score}`
            ).join('\n'));
        }
        if (documents.length) {
            sections.push('[CONOCIMIENTO RECUPERADO]\n' + documents.map((row, index) =>
                `[E${index + 1}] ${row.title} | fuente=${row.source_name} | confianza=${row.trust_score} | relevancia=${num(row.hybrid_score, 2)}` +
                `${row.published_at ? ` | fecha=${dateOnly(row.published_at)}` : ''}` +
                `${row.canonical_url ? ` | url=${row.canonical_url}` : ''}\n${row.content}`
            ).join('\n\n'));
        }
        if (events.length) {
            sections.push('[EVENTOS Y NOTICIAS RELACIONADOS]\n' + events.map((row, index) =>
                `[N${index + 1}] ${row.occurred_at?.toISOString?.() || row.occurred_at} | ${row.title} | tipo=${row.event_type}` +
                ` | fuente=${row.source_name} | confianza=${row.confidence_score}` +
                `${row.canonical_url ? ` | url=${row.canonical_url}` : ''}\n${row.summary || ''}`
            ).join('\n\n'));
        }
        return sections.join('\n\n').slice(0, 14000);
    }

    async retrieve(message, userKeyHash = null) {
        const started = Date.now();
        const profile = queryProfile(message);
        const [documents, events, economic, market, memory] = await Promise.all([
            this.retrieveDocuments(message),
            this.retrieveEvents(message, profile),
            this.retrieveEconomic(message, profile),
            this.retrieveMarket(message),
            this.retrieveMemory(message, userKeyHash)
        ]);
        let filteredDocuments = documents;
        if (profile.historicalMarketOnly) {
            filteredDocuments = documents.filter(row => row.document_type === 'site_page'
                || (row.published_at && new Date(row.published_at).getUTCFullYear() === profile.year)).slice(0, 5);
        } else if (!profile.includeExternalDocuments) {
            filteredDocuments = documents.filter(row => row.document_type === 'site_page').slice(0, 6);
        }
        const documentKeys = new Set(filteredDocuments.map(row =>
            row.canonical_url || normalizeForScore(row.title)
        ));
        const filteredEvents = events.filter(row =>
            !documentKeys.has(row.canonical_url || normalizeForScore(row.title))
        );
        const verifiedCharts = market.charts?.length
            ? market.charts
            : buildEconomicCharts(economic, profile.year);
        const sourceCodes = [...new Set([
            ...filteredDocuments.map(row => row.source_code),
            ...filteredEvents.map(row => row.source_code),
            ...economic.map(row => row.source_code),
            ...market.rows.map(row => row.source_code).filter(Boolean),
        ])];
        const citations = [
            ...market.rows.map((row, index) => ({
                id: `M${index + 1}`, title: row.name, source: row.source_name,
                date: row.month_number && profile.year
                    ? `${profile.year}-${String(row.month_number).padStart(2, '0')}`
                    : dateOnly(row.observed_at),
                type: 'market_series',
            })),
            ...economic.map((row, index) => ({
                id: `I${index + 1}`, title: row.name, source: row.source_name,
                date: dateOnly(row.period_date), type: 'economic_indicator',
            })),
            ...filteredDocuments.map((row, index) => ({
                id: `E${index + 1}`, title: row.title, source: row.source_name,
                url: row.canonical_url || null,
                date: row.published_at ? dateOnly(row.published_at) : null,
                type: row.document_type,
            })),
            ...filteredEvents.map((row, index) => ({
                id: `N${index + 1}`, title: row.title, source: row.source_name,
                url: row.canonical_url || null, date: dateOnly(row.occurred_at), type: 'event',
            })),
        ];
        const evidenceRecords = [
            ...market.rows.map((row, index) => ({
                referenceCode: `M${index + 1}`, evidenceKind: 'market_series',
                sourceId: row.source_id, instrumentId: row.instrument_id,
                rankOrder: index + 1, finalScore: row.quality_score,
                evidenceDate: row.month_number && profile.year
                    ? `${profile.year}-${String(row.month_number).padStart(2, '0')}-01`
                    : dateOnly(row.observed_at),
                metadata: row.month_number ? {
                    month: row.month_number, observations: row.observations,
                    average: num(row.average_value), minimum: num(row.minimum_value),
                    maximum: num(row.maximum_value),
                } : { value: num(row.value) },
            })),
            ...economic.map((row, index) => ({
                referenceCode: `I${index + 1}`, evidenceKind: 'economic_indicator',
                sourceId: row.source_id, economicSeriesId: row.economic_series_id,
                rankOrder: market.rows.length + index + 1,
                finalScore: row.quality_score, evidenceDate: dateOnly(row.period_date),
                metadata: { value: num(row.value), unit: row.unit },
            })),
            ...filteredDocuments.map((row, index) => ({
                referenceCode: `E${index + 1}`, evidenceKind: 'knowledge_chunk',
                sourceId: row.source_id, documentId: row.document_id, chunkId: row.chunk_id,
                rankOrder: market.rows.length + economic.length + index + 1,
                lexicalScore: row.relevance, finalScore: row.hybrid_score,
                evidenceDate: row.published_at ? dateOnly(row.published_at) : null,
                metadata: { tags: row.tags || '', documentType: row.document_type },
            })),
            ...filteredEvents.map((row, index) => ({
                referenceCode: `N${index + 1}`, evidenceKind: 'event',
                sourceId: row.source_id, eventId: row.event_id,
                rankOrder: market.rows.length + economic.length + filteredDocuments.length + index + 1,
                lexicalScore: row.relevance, finalScore: row.hybrid_score,
                evidenceDate: dateOnly(row.occurred_at),
                metadata: { eventType: row.event_type },
            })),
        ];
        return {
            context: this.formatContext({ documents: filteredDocuments, events: filteredEvents, economic, market, memory }),
            chart: verifiedCharts[0] || null,
            charts: verifiedCharts,
            chartRequested: wantsChart(message),
            chartStatus: hasExplicitChartData(message)
                ? 'user_supplied'
                : (verifiedCharts.length
                    ? 'verified'
                    : (wantsChart(message) ? market.chartStatus || 'insufficient_data' : 'not_requested')),
            citations,
            sourceCodes,
            retrievedChunks: filteredDocuments.length,
            evidenceCount: citations.length,
            retrievalStrategy: 'hybrid_lexical_mmr_v2',
            retrievalLatencyMs: Date.now() - started,
            evidenceRecords,
        };
    }

    async recordQuery(entry) {
        if (Date.now() < this.disabledUntil) return null;
        try {
            const [result] = await this.getPool().execute(
                `INSERT INTO ai_queries
                    (user_key_hash, question_text, normalized_intent, domain_allowed,
                     retrieval_query, retrieval_strategy, retrieved_chunks, evidence_count,
                     api_sources_used, model_name, response_text, response_sha256,
                     latency_ms, retrieval_latency_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, SHA2(?, 256), ?, ?)`,
                [entry.userKeyHash || null, String(entry.message || '').slice(0, 12000),
                    entry.intent || null, entry.domainAllowed ? 1 : 0,
                    entry.retrievalQuery || null, entry.retrievalStrategy || null,
                    entry.retrievedChunks || 0, entry.evidenceCount || 0,
                    JSON.stringify(entry.sourceCodes || []), entry.model || null,
                    String(entry.responseText || '').slice(0, 16777215),
                    String(entry.responseText || ''), Math.max(0, Number(entry.latencyMs) || 0),
                    Math.max(0, Number(entry.retrievalLatencyMs) || 0)]
            );
            return result.insertId;
        } catch (error) {
            console.warn('[rag] No se pudo registrar ai_queries:', error.message);
            return null;
        }
    }

    async recordEvidence(queryId, records, responseText = '') {
        if (!queryId || !Array.isArray(records) || !records.length || Date.now() < this.disabledUntil) return 0;
        const connection = await this.getPool().getConnection();
        try {
            await connection.beginTransaction();
            let written = 0;
            for (const record of records) {
                if (!record.sourceId) continue;
                const wasCited = String(responseText).includes(`[${record.referenceCode}]`) ? 1 : 0;
                await connection.execute(
                    `INSERT INTO retrieval_evidence
                        (query_id, source_id, reference_code, evidence_kind,
                         document_id, chunk_id, event_id, instrument_id, economic_series_id,
                         rank_order, lexical_score, final_score, was_cited, evidence_date, metadata)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE source_id=VALUES(source_id),
                        evidence_kind=VALUES(evidence_kind), document_id=VALUES(document_id),
                        chunk_id=VALUES(chunk_id), event_id=VALUES(event_id),
                        instrument_id=VALUES(instrument_id), economic_series_id=VALUES(economic_series_id),
                        rank_order=VALUES(rank_order), lexical_score=VALUES(lexical_score),
                        final_score=VALUES(final_score), was_cited=VALUES(was_cited),
                        evidence_date=VALUES(evidence_date), metadata=VALUES(metadata)`,
                    [queryId, record.sourceId, record.referenceCode, record.evidenceKind,
                        record.documentId || null, record.chunkId || null, record.eventId || null,
                        record.instrumentId || null, record.economicSeriesId || null,
                        record.rankOrder, num(record.lexicalScore, 8), num(record.finalScore, 8),
                        wasCited, record.evidenceDate || null, JSON.stringify(record.metadata || null)]
                );
                written++;
            }
            await connection.commit();
            return written;
        } catch (error) {
            await connection.rollback();
            console.warn('[rag] No se pudo registrar retrieval_evidence:', error.message);
            return 0;
        } finally {
            connection.release();
        }
    }

    async recordFeedback(entry) {
        if (Date.now() < this.disabledUntil) return false;
        try {
            const [result] = await this.getPool().execute(
                `INSERT INTO ai_feedback
                    (query_id, rating, is_helpful, accuracy_score, relevance_score,
                     feedback_text, correction_text)
                 SELECT id, ?, ?, ?, ?, ?, ?
                 FROM ai_queries
                 WHERE id=? AND user_key_hash=?
                 ON DUPLICATE KEY UPDATE rating=VALUES(rating), is_helpful=VALUES(is_helpful),
                    accuracy_score=VALUES(accuracy_score), relevance_score=VALUES(relevance_score),
                    feedback_text=VALUES(feedback_text), correction_text=VALUES(correction_text)`,
                [entry.rating ?? null, entry.isHelpful == null ? null : Number(Boolean(entry.isHelpful)),
                    entry.accuracyScore ?? null, entry.relevanceScore ?? null,
                    String(entry.feedbackText || '').slice(0, 10000) || null,
                    String(entry.correctionText || '').slice(0, 10000) || null,
                    entry.queryId, entry.userKeyHash]
            );
            return result.affectedRows > 0;
        } catch (error) {
            console.warn('[rag] No se pudo registrar ai_feedback:', error.message);
            return false;
        }
    }
}

const ragRetriever = new RagRetriever();
module.exports = {
    RagRetriever, ragRetriever, requestedYear, requestedSymbol, requestedSymbols, searchTerms,
    wantsChart, hasExplicitChartData, buildMarketCharts, buildEconomicCharts,
    expandedSearchTerms, queryProfile, diversifyDocuments,
};
