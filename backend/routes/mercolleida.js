'use strict';

/* Referencia europea de porcino almacenada en Supabase. Este endpoint sólo
 * expone cotizaciones y series ya ingresadas: no ejecuta el modelo ni mezcla
 * propuestas de ML con datos de mercado. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const express = require('express');
const { externalGet } = require('../lib/http');

const router = express.Router();

function getConnection() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key };
}

function numeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function loadLatest(connection, table, columns, query) {
    const response = await externalGet(
        `${connection.url}/rest/v1/${table}?select=${columns}&${query}`,
        { apikey: connection.key, Authorization: `Bearer ${connection.key}`, Accept: 'application/json' },
        12000,
    );
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function loadRows(connection, table, columns, query) {
    const response = await externalGet(
        `${connection.url}/rest/v1/${table}?select=${columns}&${query}`,
        { apikey: connection.key, Authorization: `Bearer ${connection.key}`, Accept: 'application/json' },
        12000,
    );
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
}

function numericRow(row, fields) {
    if (!row) return null;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? numeric(value) : value]));
}

// Es una referencia de mercado, igual que las cotizaciones que ya consume la
// pestaña Mercados. La respuesta se limita explícitamente a esos campos; la
// credencial de Supabase sigue sólo en el servidor y nunca se entrega al cliente.
router.get('/mercolleida/overview', async (req, res) => {
    const connection = getConnection();
    if (!connection) return res.status(503).json({ error: 'Mercolleida no está configurado en este entorno.' });

    try {
        const [session, pork, piglet, feed, series, seriesHistory, porkHistory, pigletHistory, feedHistory, production, beef] = await Promise.all([
            loadLatest(connection, 'mercolleida_sesiones', 'fecha_sesion,fecha_publicacion,semana,anio,resumen_ejecutivo,factores_clave', 'order=fecha_sesion.desc&limit=1'),
            loadLatest(connection, 'cotizaciones_porcino', 'anio,mes,precio_medio,variacion_semanal_pct,variacion_interanual_pct,tendencia,evento_clave', 'precio_medio=not.is.null&order=anio.desc,id.desc&limit=1'),
            loadLatest(connection, 'cotizaciones_lechon', 'anio,mes,precio_mercolleida_20kg,variacion_semanal_pct,tendencia', 'precio_mercolleida_20kg=not.is.null&order=anio.desc,id.desc&limit=1'),
            loadLatest(connection, 'cotizaciones_materias_primas', 'anio,mes,maiz_importacion_eur_t,harina_soja_47_eur_t,coste_medio_pienso_eur_t,margen_neto_ganadero_eur_kg', 'order=anio.desc,id.desc&limit=1'),
            loadLatest(connection, 'mercolleida_series_mensuales', 'mes,cerdo_normal_eur_kg,lechon_20kg_eur,maiz_eur_t,coste_pienso_eur_t,margen_neto_eur_kg,var_mensual_cerdo_pct', 'cerdo_normal_eur_kg=gt.0&order=mes.desc&limit=1'),
            loadRows(connection, 'mercolleida_series_mensuales', 'mes,cerdo_normal_eur_kg,lechon_20kg_eur,maiz_eur_t,soja_eur_t,coste_pienso_eur_t,margen_neto_eur_kg,var_mensual_cerdo_pct', 'order=mes.asc&limit=48'),
            loadRows(connection, 'cotizaciones_porcino', 'anio,mes,precio_medio,variacion_semanal_pct,variacion_interanual_pct', 'precio_medio=gt.0&order=anio.asc,id.asc&limit=36'),
            loadRows(connection, 'cotizaciones_lechon', 'anio,mes,precio_mercolleida_20kg,variacion_semanal_pct', 'precio_mercolleida_20kg=gt.0&order=anio.asc,id.asc&limit=36'),
            loadRows(connection, 'cotizaciones_materias_primas', 'anio,mes,maiz_importacion_eur_t,harina_soja_47_eur_t,coste_medio_pienso_eur_t,margen_neto_ganadero_eur_kg', 'coste_medio_pienso_eur_t=gt.0&order=anio.asc,id.asc&limit=36'),
            loadLatest(connection, 'pesos_y_sacrificios', 'anio,mes,peso_medio_vivo_kg,peso_medio_canal_kg,rendimiento_canal_pct,sacrificios_espana,sacrificios_cataluna,censo_espana,exportaciones_china_t', 'order=anio.desc,id.desc&limit=1'),
            loadLatest(connection, 'cotizaciones_vacuno', 'anio,macho_frison,macho_cruzado,hembra_cruzada,ternero_pastero_frison,tendencia', 'order=anio.desc,id.desc&limit=1'),
        ]);

        const latest = { session, pork, piglet, feed, series };

        const hasData = Object.values(latest).some(Boolean);
        // El cliente debe revalidar: al ampliar el contrato no queremos que una
        // respuesta anterior sin series deje las gráficas vacías durante 5 min.
        res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        res.json({
            available: hasData,
            source: 'Mercolleida · Supabase',
            retrievedAt: new Date().toISOString(),
            session: latest.session,
            pork: latest.pork && { ...latest.pork, precio_medio: numeric(latest.pork.precio_medio), variacion_semanal_pct: numeric(latest.pork.variacion_semanal_pct), variacion_interanual_pct: numeric(latest.pork.variacion_interanual_pct) },
            piglet: latest.piglet && { ...latest.piglet, precio_mercolleida_20kg: numeric(latest.piglet.precio_mercolleida_20kg), variacion_semanal_pct: numeric(latest.piglet.variacion_semanal_pct) },
            feed: latest.feed && { ...latest.feed, maiz_importacion_eur_t: numeric(latest.feed.maiz_importacion_eur_t), harina_soja_47_eur_t: numeric(latest.feed.harina_soja_47_eur_t), coste_medio_pienso_eur_t: numeric(latest.feed.coste_medio_pienso_eur_t), margen_neto_ganadero_eur_kg: numeric(latest.feed.margen_neto_ganadero_eur_kg) },
            mlSeries: latest.series && { ...latest.series, cerdo_normal_eur_kg: numeric(latest.series.cerdo_normal_eur_kg), lechon_20kg_eur: numeric(latest.series.lechon_20kg_eur), maiz_eur_t: numeric(latest.series.maiz_eur_t), coste_pienso_eur_t: numeric(latest.series.coste_pienso_eur_t), margen_neto_eur_kg: numeric(latest.series.margen_neto_eur_kg), var_mensual_cerdo_pct: numeric(latest.series.var_mensual_cerdo_pct) },
            history: {
                monthly: seriesHistory.map((row) => numericRow(row, ['cerdo_normal_eur_kg', 'lechon_20kg_eur', 'maiz_eur_t', 'soja_eur_t', 'coste_pienso_eur_t', 'margen_neto_eur_kg', 'var_mensual_cerdo_pct'])),
                pork: porkHistory.map((row) => numericRow(row, ['precio_medio', 'variacion_semanal_pct', 'variacion_interanual_pct'])),
                piglet: pigletHistory.map((row) => numericRow(row, ['precio_mercolleida_20kg', 'variacion_semanal_pct'])),
                feed: feedHistory.map((row) => numericRow(row, ['maiz_importacion_eur_t', 'harina_soja_47_eur_t', 'coste_medio_pienso_eur_t', 'margen_neto_ganadero_eur_kg'])),
            },
            production: numericRow(production, ['peso_medio_vivo_kg', 'peso_medio_canal_kg', 'rendimiento_canal_pct', 'sacrificios_espana', 'sacrificios_cataluna', 'censo_espana', 'exportaciones_china_t']),
            beef: numericRow(beef, ['macho_frison', 'macho_cruzado', 'hembra_cruzada', 'ternero_pastero_frison']),
        });
    } catch (error) {
        console.error('[Mercolleida] Error consultando Supabase:', error.message);
        res.status(502).json({ error: 'No fue posible consultar Mercolleida en este momento.' });
    }
});

module.exports = router;
