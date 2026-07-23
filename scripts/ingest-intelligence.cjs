'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, 'backend', '.env') });

const API_BASE = (process.env.VALL_API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');
const ONLY_JOB = process.argv.find(argument => argument.startsWith('--only='))?.split('=')[1]?.trim().toLowerCase() || '';
const DB_CONFIG = {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE || 'vall_',
    charset: 'utf8mb4',
    decimalNumbers: true,
};

const YAHOO_ASSETS = [
    ['GRUMAB.MX', 'Gruma', 'stock', 'BMV', 'MXN'],
    ['BIMBOA.MX', 'Grupo Bimbo', 'stock', 'BMV', 'MXN'],
    ['FEMSAUBD.MX', 'FEMSA', 'stock', 'BMV', 'MXN'],
    ['WALMEX.MX', 'Walmart de México', 'stock', 'BMV', 'MXN'],
    ['USDMXN=X', 'Dólar estadounidense / peso mexicano', 'currency', 'FX', 'MXN'],
    ['HE=F', 'Futuros de carne de cerdo', 'commodity', 'CME', 'USD'],
    ['CL=F', 'Petróleo WTI', 'commodity', 'NYMEX', 'USD'],
    ['BTC-USD', 'Bitcoin', 'crypto', 'CRYPTO', 'USD'],
    ['ETH-USD', 'Ethereum', 'crypto', 'CRYPTO', 'USD'],
];
const COMMODITIES = {
    CORN: 'Maíz', SOYBEANS: 'Soya', WHEAT: 'Trigo', CRUDE_OIL: 'Petróleo crudo WTI',
    COPPER: 'Cobre', NATURAL_GAS: 'Gas natural', ALUMINUM: 'Aluminio',
};
const LOCAL_PAGES = [
    ['inicio.html', 'Inicio VALLNews'],
    ['pages/finanzas.html', 'Finanzas'],
    ['pages/mercados.html', 'Mercados'],
    ['pages/geopolitica.html', 'Geopolítica'],
    ['pages/mercadoproteinas.html', 'Mercado de proteínas'],
    ['pages/mexico.html', 'México'],
    ['pages/vall-ai.html', 'VALL AI'],
];
const BANXICO_SERIES = [
    ['SF43718', 'Tipo de cambio FIX USD/MXN', 'exchange_rate', 'MXN por USD'],
    ['SF61745', 'TIIE 28 días', 'interest_rate', 'porcentaje'],
    ['SF43884', 'TIIE 91 días', 'interest_rate', 'porcentaje'],
    ['SF43885', 'TIIE 182 días', 'interest_rate', 'porcentaje'],
    ['SF43936', 'CETES 28 días', 'interest_rate', 'porcentaje'],
    ['SF43939', 'CETES 91 días', 'interest_rate', 'porcentaje'],
    ['SF43942', 'CETES 182 días', 'interest_rate', 'porcentaje'],
    ['SF43945', 'CETES 364 días', 'interest_rate', 'porcentaje'],
    ['SP74660', 'Inflación anual de México', 'inflation', 'porcentaje'],
];

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const json = value => JSON.stringify(value ?? null);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const sqlDateTime = value => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
};
const sqlDate = value => sqlDateTime(value)?.slice(0, 10) || null;

function decodeHtml(value) {
    const entities = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
        aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
        Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
        ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
    };
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
        .replace(/&([a-z]+);/gi, (all, name) => entities[name] ?? all);
}

function htmlToText(html) {
    return decodeHtml(html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|svg|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/?(h[1-6]|p|article|section|li|tr|div|main|header|footer|nav)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\r/g, '').replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function makeChunks(text, maxLength = 1400) {
    const paragraphs = text.split(/\n{2,}/).map(item => item.trim()).filter(item => item.length >= 30);
    const chunks = [];
    let current = '';
    for (const paragraph of paragraphs) {
        if (current && current.length + paragraph.length + 2 > maxLength) {
            chunks.push(current);
            current = '';
        }
        if (paragraph.length > maxLength) {
            if (current) chunks.push(current);
            current = '';
            for (let start = 0; start < paragraph.length; start += maxLength) {
                chunks.push(paragraph.slice(start, start + maxLength));
            }
        } else current += `${current ? '\n\n' : ''}${paragraph}`;
    }
    if (current) chunks.push(current);
    return chunks;
}

async function fetchJson(route, timeoutMs = 30000) {
    const response = await fetch(`${API_BASE}${route}`, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${body.error || ''}`.trim());
    return body;
}

async function sourceMap(connection) {
    const [rows] = await connection.query('SELECT id, code FROM data_sources');
    return Object.fromEntries(rows.map(row => [row.code, row.id]));
}

async function runJob(connection, sourceId, jobType, work) {
    const [result] = await connection.execute(
        'INSERT INTO ingestion_runs (source_id, job_type, status, metadata) VALUES (?, ?, "running", ?)',
        [sourceId, jobType, json({ apiBase: API_BASE })]
    );
    const run = { id: result.insertId, read: 0, written: 0, rejected: 0 };
    try {
        await work(run);
        await connection.execute(
            `UPDATE ingestion_runs SET status="completed", finished_at=NOW(6),
             records_read=?, records_written=?, records_rejected=? WHERE id=?`,
            [run.read, run.written, run.rejected, run.id]
        );
        await connection.execute(
            `INSERT INTO ingestion_cursors
                (source_id, job_type, cursor_value, last_success_at, last_run_id,
                 consecutive_failures, metadata)
             VALUES (?, ?, ?, NOW(6), ?, 0, ?)
             ON DUPLICATE KEY UPDATE cursor_value=VALUES(cursor_value),
                last_success_at=VALUES(last_success_at), last_run_id=VALUES(last_run_id),
                consecutive_failures=0, metadata=VALUES(metadata)`,
            [sourceId, jobType, new Date().toISOString(), run.id,
                json({ recordsRead: run.read, recordsWritten: run.written, recordsRejected: run.rejected })]
        );
        console.log(`✓ ${jobType}: ${run.written}/${run.read} registros`);
    } catch (error) {
        await connection.execute(
            `UPDATE ingestion_runs SET status="failed", finished_at=NOW(6),
             records_read=?, records_written=?, records_rejected=?, error_message=? WHERE id=?`,
            [run.read, run.written, run.rejected, error.message.slice(0, 65000), run.id]
        );
        await connection.execute(
            `INSERT INTO ingestion_cursors
                (source_id, job_type, last_run_id, consecutive_failures, metadata)
             VALUES (?, ?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE last_run_id=VALUES(last_run_id),
                consecutive_failures=consecutive_failures+1, metadata=VALUES(metadata)`,
            [sourceId, jobType, run.id, json({ lastError: error.message.slice(0, 1000) })]
        );
        console.warn(`! ${jobType}: ${error.message}`);
    }
}

async function upsertInstrument(connection, sourceId, asset) {
    const [symbol, name, assetClass, exchangeCode, currencyCode, unit = null] = asset;
    await connection.execute(
        `INSERT INTO market_instruments
            (source_id, symbol, name, asset_class, exchange_code, currency_code, unit, timezone_name, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, "UTC", ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), asset_class=VALUES(asset_class),
            exchange_code=VALUES(exchange_code), currency_code=VALUES(currency_code),
            unit=VALUES(unit), metadata=VALUES(metadata), is_active=1`,
        [sourceId, symbol, name, assetClass, exchangeCode, currencyCode, unit, json({ providerSymbol: symbol })]
    );
    const [rows] = await connection.execute(
        'SELECT id FROM market_instruments WHERE source_id=? AND symbol=?', [sourceId, symbol]
    );
    return rows[0].id;
}

async function ingestYahoo(connection, sources) {
    await runJob(connection, sources.yahoo_finance, 'market_history_daily', async run => {
        for (const asset of YAHOO_ASSETS) {
            try {
                const payload = await fetchJson(`/api/stock-history?ticker=${encodeURIComponent(asset[0])}&interval=1d&range=10y`, 45000);
                const instrumentId = await upsertInstrument(connection, sources.yahoo_finance, asset);
                for (const candle of payload.candles || []) {
                    run.read++;
                    const values = [candle.open, candle.high, candle.low, candle.close].map(finite);
                    if (!candle.time || values.some(value => value === null)) {
                        run.rejected++;
                        continue;
                    }
                    await connection.execute(
                        `INSERT INTO market_observations
                            (instrument_id, source_id, ingestion_run_id, observed_at, interval_code,
                             open_value, high_value, low_value, close_value, value, quality_score, raw_payload)
                         VALUES (?, ?, ?, ?, "1d", ?, ?, ?, ?, ?, 90, ?)
                         ON DUPLICATE KEY UPDATE open_value=VALUES(open_value), high_value=VALUES(high_value),
                            low_value=VALUES(low_value), close_value=VALUES(close_value), value=VALUES(value),
                            ingestion_run_id=VALUES(ingestion_run_id), raw_payload=VALUES(raw_payload)`,
                        [instrumentId, sources.yahoo_finance, run.id, `${candle.time} 00:00:00`,
                            ...values, values[3], json(candle)]
                    );
                    run.written++;
                }
            } catch (error) {
                run.rejected++;
                console.warn(`  · ${asset[0]} omitido: ${error.message}`);
            }
        }
    });
}

async function ingestCommodities(connection, sources) {
    await runJob(connection, sources.alpha_vantage, 'commodity_history_monthly', async run => {
        for (const [code, name] of Object.entries(COMMODITIES)) {
            try {
                const payload = await fetchJson(`/api/commodity?fn=${code}`, 20000);
                const instrumentId = await upsertInstrument(
                    connection, sources.alpha_vantage,
                    [code, name, 'commodity', 'GLOBAL', 'USD', payload.unit || null]
                );
                for (const point of payload.data || []) {
                    run.read++;
                    const value = finite(point.value);
                    if (!point.date || value === null) {
                        run.rejected++;
                        continue;
                    }
                    await connection.execute(
                        `INSERT INTO market_observations
                            (instrument_id, source_id, ingestion_run_id, observed_at, interval_code,
                             close_value, value, quality_score, raw_payload)
                         VALUES (?, ?, ?, ?, "1mo", ?, ?, 85, ?)
                         ON DUPLICATE KEY UPDATE close_value=VALUES(close_value), value=VALUES(value),
                            ingestion_run_id=VALUES(ingestion_run_id), raw_payload=VALUES(raw_payload)`,
                        [instrumentId, sources.alpha_vantage, run.id, `${point.date} 00:00:00`,
                            value, value, json(point)]
                    );
                    run.written++;
                }
            } catch (error) {
                run.rejected++;
                console.warn(`  · ${code} omitido: ${error.message}`);
            }
        }
    });
}

async function upsertEconomicSeries(connection, sourceId, definition) {
    const [code, name, category, unit, country = null, frequency = 'daily'] = definition;
    await connection.execute(
        `INSERT INTO economic_series
            (source_id, series_code, name, category, country_code, frequency_code, unit, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category),
            country_code=VALUES(country_code), frequency_code=VALUES(frequency_code),
            unit=VALUES(unit), metadata=VALUES(metadata), is_active=1`,
        [sourceId, code, name, category, country, frequency, unit, json({ providerSeries: code })]
    );
    const [rows] = await connection.execute(
        'SELECT id FROM economic_series WHERE source_id=? AND series_code=?', [sourceId, code]
    );
    return rows[0].id;
}

async function putEconomicObservation(connection, seriesId, run, date, value, quality, payload) {
    await connection.execute(
        `INSERT INTO economic_observations
            (series_id, ingestion_run_id, period_date, value, release_at, quality_score, raw_payload)
         VALUES (?, ?, ?, ?, NOW(), ?, ?)
         ON DUPLICATE KEY UPDATE value=VALUES(value), release_at=VALUES(release_at),
            ingestion_run_id=VALUES(ingestion_run_id), quality_score=VALUES(quality_score),
            raw_payload=VALUES(raw_payload)`,
        [seriesId, run.id, date, value, quality, json(payload)]
    );
    run.written++;
}

async function ingestBanxico(connection, sources) {
    await runJob(connection, sources.banxico_sie, 'economic_history_banxico', async run => {
        const end = new Date();
        const start = new Date(Date.UTC(end.getUTCFullYear() - 10, end.getUTCMonth(), end.getUTCDate()));
        const startDate = start.toISOString().slice(0, 10);
        const endDate = end.toISOString().slice(0, 10);
        for (const definition of BANXICO_SERIES) {
            try {
                const seriesId = await upsertEconomicSeries(
                    connection, sources.banxico_sie, [...definition, 'MX', 'daily']
                );
                const payload = await fetchJson(
                    `/api/banxico/${definition[0]}/history?start=${startDate}&end=${endDate}`, 30000
                );
                for (const point of payload?.bmx?.series?.[0]?.datos || []) {
                    run.read++;
                    const value = finite(String(point?.dato || '').replace(/,/g, ''));
                    const date = point?.fecha?.match(/^\d{2}\/\d{2}\/\d{4}$/)
                        ? point.fecha.split('/').reverse().join('-') : sqlDate(point?.fecha);
                    if (!date || value === null) {
                        run.rejected++;
                        continue;
                    }
                    await putEconomicObservation(connection, seriesId, run, date, value, 100, point);
                }
            } catch (error) {
                run.rejected++;
                console.warn(`  · Banxico ${definition[0]} omitido: ${error.message}`);
            }
        }
    });
}

async function ingestExchangeRates(connection, sources) {
    await runJob(connection, sources.open_exchange_rates, 'exchange_rates_current', async run => {
        const payload = await fetchJson('/api/exchange-rates');
        const date = sqlDate((payload.time_last_update_unix || Math.floor(Date.now() / 1000)) * 1000);
        for (const currency of ['MXN', 'EUR', 'CAD', 'BRL', 'JPY', 'GBP', 'CNY', 'CHF']) {
            run.read++;
            const value = finite(payload.rates?.[currency]);
            if (value === null) {
                run.rejected++;
                continue;
            }
            const instrumentId = await upsertInstrument(
                connection, sources.open_exchange_rates,
                [`USD/${currency}`, `Dólar estadounidense / ${currency}`, 'currency', 'FX', currency, `${currency} por USD`]
            );
            await connection.execute(
                `INSERT INTO market_observations
                    (instrument_id, source_id, ingestion_run_id, observed_at, interval_code,
                     close_value, value, quality_score, raw_payload)
                 VALUES (?, ?, ?, ?, "1d", ?, ?, 80, ?)
                 ON DUPLICATE KEY UPDATE close_value=VALUES(close_value), value=VALUES(value),
                    ingestion_run_id=VALUES(ingestion_run_id), raw_payload=VALUES(raw_payload)`,
                [instrumentId, sources.open_exchange_rates, run.id, `${date} 00:00:00`,
                    value, value, json({ base: 'USD', quote: currency, value })]
            );
            run.written++;
        }
    });
}

async function ingestCryptoGlobal(connection, sources) {
    await runJob(connection, sources.coingecko, 'crypto_global_current', async run => {
        const data = (await fetchJson('/api/crypto-global')).data || {};
        const date = sqlDate((data.updated_at || Math.floor(Date.now() / 1000)) * 1000);
        const definitions = [
            ['CRYPTO_MARKET_CAP_USD', 'Capitalización global de criptomonedas', 'market_cap', 'USD', finite(data.total_market_cap?.usd)],
            ['CRYPTO_VOLUME_24H_USD', 'Volumen global de criptomonedas 24 h', 'volume', 'USD', finite(data.total_volume?.usd)],
            ['BTC_DOMINANCE', 'Dominancia de Bitcoin', 'market_share', 'porcentaje', finite(data.market_cap_percentage?.btc)],
            ['ACTIVE_CRYPTOCURRENCIES', 'Criptomonedas activas', 'market_structure', 'conteo', finite(data.active_cryptocurrencies)],
        ];
        for (const [code, name, category, unit, value] of definitions) {
            run.read++;
            if (value === null) {
                run.rejected++;
                continue;
            }
            const seriesId = await upsertEconomicSeries(
                connection, sources.coingecko, [code, name, category, unit, null, 'daily']
            );
            await putEconomicObservation(connection, seriesId, run, date, value, 85, { value, updated_at: data.updated_at });
        }
    });
}

async function upsertDocument(connection, sourceId, document) {
    const body = (document.body || document.title || '').trim();
    const hash = sha256(`${document.canonicalUrl || document.externalId || ''}\n${body}`);
    await connection.execute(
        `INSERT INTO knowledge_documents
            (source_id, external_id, canonical_url, title, document_type, language_code,
             published_at, body_text, body_sha256, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "active", ?)
         ON DUPLICATE KEY UPDATE canonical_url=VALUES(canonical_url), title=VALUES(title),
            document_type=VALUES(document_type), language_code=VALUES(language_code),
            published_at=COALESCE(VALUES(published_at), published_at), body_text=VALUES(body_text),
            body_sha256=VALUES(body_sha256), status="active", metadata=VALUES(metadata)`,
        [sourceId, document.externalId, document.canonicalUrl || null, document.title.slice(0, 500),
            document.type, document.language || 'es', document.publishedAt || null, body, hash, json(document.metadata)]
    );
    const [rows] = await connection.execute(
        'SELECT id FROM knowledge_documents WHERE source_id=? AND external_id=?',
        [sourceId, document.externalId]
    );
    const documentId = rows[0]?.id;
    if (!documentId) throw new Error(`No se recuperó documento ${document.externalId}`);
    await connection.execute('DELETE FROM knowledge_chunks WHERE document_id=?', [documentId]);
    const chunks = makeChunks(body);
    for (let index = 0; index < chunks.length; index++) {
        await connection.execute(
            `INSERT INTO knowledge_chunks
                (document_id, chunk_index, heading_path, content, token_count, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [documentId, index, document.title.slice(0, 1000), chunks[index],
                Math.ceil(chunks[index].length / 4), json({ strategy: 'paragraph-v1' })]
        );
    }
    return { documentId, chunks: chunks.length };
}

async function ingestLocalKnowledge(connection, sources) {
    await runJob(connection, sources.vallnews, 'local_knowledge_pages', async run => {
        for (const [relativePath, fallbackTitle] of LOCAL_PAGES) {
            run.read++;
            const html = await fs.readFile(path.join(ROOT, relativePath), 'utf8');
            const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || fallbackTitle).trim();
            const body = htmlToText(html);
            if (body.length < 100) {
                run.rejected++;
                continue;
            }
            const result = await upsertDocument(connection, sources.vallnews, {
                externalId: `page:${relativePath.replace(/\\/g, '/')}`,
                canonicalUrl: `/${relativePath.replace(/\\/g, '/')}`,
                title, type: 'site_page', language: 'es', body,
                metadata: { localPath: relativePath, ownership: 'vallnews', priority: 100 },
            });
            run.written += 1 + result.chunks;
        }
    });
}

function classifyEvent(text) {
    const value = String(text).toLowerCase();
    if (/ma[ií]z|trigo|soya|cerdo|ganad|prote[ií]na|agr[ií]col/.test(value)) return 'agri_food';
    if (/petr[oó]leo|gas natural|cobre|commodity|commodit/.test(value)) return 'commodity';
    if (/bitcoin|ethereum|cripto/.test(value)) return 'crypto';
    if (/guerra|conflicto|sanci[oó]n|geopol/.test(value)) return 'geopolitics';
    if (/peso|d[oó]lar|forex|tipo de cambio/.test(value)) return 'fx';
    return 'financial_news';
}

async function putNewsItem(connection, sourceId, run, item) {
    const title = String(item.title || '').trim();
    const url = String(item.url || '').trim();
    const summary = String(item.summary || '').trim();
    if (!title || (!url && !summary)) {
        run.rejected++;
        return;
    }
    const externalId = sha256(url || `${title}|${item.publishedAt || ''}`).slice(0, 64);
    const document = await upsertDocument(connection, sourceId, {
        externalId, canonicalUrl: url || null, title,
        body: `${title}\n\n${summary}`.trim(), type: 'news_article',
        language: item.language || 'es', publishedAt: sqlDateTime(item.publishedAt),
        metadata: item.metadata,
    });
    const occurredAt = sqlDateTime(item.publishedAt) || sqlDateTime(new Date());
    await connection.execute(
        `INSERT INTO knowledge_events
            (source_id, document_id, external_id, event_type, title, summary, occurred_at,
             country_code, sentiment_score, impact_score, confidence_score, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE document_id=VALUES(document_id), event_type=VALUES(event_type),
            title=VALUES(title), summary=VALUES(summary), occurred_at=VALUES(occurred_at),
            sentiment_score=VALUES(sentiment_score), confidence_score=VALUES(confidence_score),
            metadata=VALUES(metadata)`,
        [sourceId, document.documentId, externalId, classifyEvent(`${title} ${summary}`),
            title.slice(0, 500), summary || null, occurredAt, item.country || null,
            item.sentiment ?? null, item.impact ?? null, item.confidence || 70, json(item.metadata)]
    );
    run.written += 2 + document.chunks;
}

async function ingestFinnhub(connection, sources) {
    await runJob(connection, sources.finnhub, 'news_finnhub', async run => {
        for (const category of ['general', 'forex', 'crypto', 'merger']) {
            try {
                const items = await fetchJson(`/api/finnhub-news?category=${category}`);
                for (const item of Array.isArray(items) ? items.slice(0, 35) : []) {
                    run.read++;
                    await putNewsItem(connection, sources.finnhub, run, {
                        title: item.headline, summary: item.summary, url: item.url,
                        publishedAt: Number(item.datetime) * 1000, language: 'en',
                        metadata: { category, publisher: item.source, image: item.image || null },
                        confidence: 72,
                    });
                }
            } catch (error) {
                run.rejected++;
                console.warn(`  · Finnhub ${category} omitido: ${error.message}`);
            }
        }
    });
}

async function ingestAlphaNews(connection, sources) {
    await runJob(connection, sources.alpha_vantage, 'news_alpha_vantage', async run => {
        for (const topic of ['commodities', 'economy_macro', 'financial_markets']) {
            try {
                const payload = await fetchJson(`/api/alphavantage-news?topics=${topic}&limit=20`);
                for (const item of payload.feed || []) {
                    run.read++;
                    await putNewsItem(connection, sources.alpha_vantage, run, {
                        title: item.title, summary: item.summary, url: item.url,
                        publishedAt: String(item.time_published || '').replace(
                            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
                            '$1-$2-$3T$4:$5:$6Z'
                        ),
                        language: 'en', sentiment: finite(item.overall_sentiment_score),
                        metadata: { topic, publisher: item.source, topics: item.topics || [] },
                        confidence: 78,
                    });
                }
            } catch (error) {
                run.rejected++;
                console.warn(`  · Alpha News ${topic} omitido: ${error.message}`);
            }
        }
    });
}

async function ingestGdelt(connection, sources) {
    await runJob(connection, sources.gdelt, 'news_events_gdelt', async run => {
        const queries = [
            ['Mexico economy peso inflation', 'economia_mexico'],
            ['geopolitics conflict trade sanctions', 'geopolitica'],
            ['corn wheat soy livestock pork market', 'agro_proteinas'],
            ['oil natural gas copper commodities', 'commodities'],
        ];
        for (const [query, topic] of queries) {
            try {
                const payload = await fetchJson(
                    `/api/gdelt?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=20`, 60000
                );
                for (const item of payload.articles || []) {
                    run.read++;
                    await putNewsItem(connection, sources.gdelt, run, {
                        title: item.title,
                        summary: `${item.domain || ''} ${item.sourcecountry || ''}`.trim(),
                        url: item.url,
                        publishedAt: String(item.seendate || '').replace(
                            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
                            '$1-$2-$3T$4:$5:$6Z'
                        ),
                        language: item.language === 'Spanish' ? 'es' : 'en',
                        country: item.sourcecountry === 'Mexico' ? 'MX' : null,
                        metadata: { topic, domain: item.domain, sourceCountry: item.sourcecountry, image: item.socialimage || null },
                        confidence: 68,
                    });
                }
            } catch (error) {
                run.rejected++;
                console.warn(`  · GDELT ${topic} omitido: ${error.message}`);
            }
        }
    });
}

async function main() {
    const connection = await mysql.createConnection(DB_CONFIG);
    console.log(`Carga VALL → ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    try {
        const sources = await sourceMap(connection);
        const required = ['yahoo_finance', 'banxico_sie', 'open_exchange_rates', 'alpha_vantage',
            'coingecko', 'finnhub', 'gdelt', 'vallnews'];
        const missing = required.filter(code => !sources[code]);
        if (missing.length) throw new Error(`Faltan fuentes en data_sources: ${missing.join(', ')}`);
        const jobs = [
            ['knowledge', ingestLocalKnowledge],
            ['yahoo', ingestYahoo],
            ['commodities', ingestCommodities],
            ['banxico', ingestBanxico],
            ['exchange', ingestExchangeRates],
            ['crypto', ingestCryptoGlobal],
            ['finnhub', ingestFinnhub],
            ['alpha-news', ingestAlphaNews],
            ['gdelt', ingestGdelt],
        ];
        const selected = ONLY_JOB ? jobs.filter(([name]) => name === ONLY_JOB) : jobs;
        if (!selected.length) throw new Error(`Trabajo desconocido en --only=${ONLY_JOB}`);
        for (const [, execute] of selected) await execute(connection, sources);
    } finally {
        await connection.end();
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(`Carga incompleta: ${error.stack || error.message}`);
        process.exit(1);
    });
