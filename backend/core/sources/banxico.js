'use strict';   
// ── Source: Banxico SIE (rendimientos por serie) ─────────────────────────────
// Antes esta misma función vivía duplicada dentro de routes/external.js y era
// usada por /bond-yields y /mx-rates. Ahora es la única fuente de verdad para
// "leer una serie de Banxico y devolver el último valor + el previo".

const { externalGet } = require('../../lib/http');

// Devuelve { yield, prev } del último dato disponible de una serie SIE.
async function fetchBanxicoYield(serie) {
    const token = process.env.BANXICO_TOKEN || '';
    const end   = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fmt   = d => d.toISOString().slice(0, 10);
    const url   = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/${fmt(start)}/${fmt(end)}`;
    const r = await externalGet(url, { 'Bmx-Token': token }, 7000);
    if (!r.ok) throw new Error(`Banxico ${r.status}`);
    const json  = await r.json();
    const datos = json?.bmx?.series?.[0]?.datos || [];
    const vals  = datos.map(d => parseFloat(d.dato)).filter(v => !isNaN(v));
    if (!vals.length) throw new Error('sin dato');
    const curr = vals[vals.length - 1];
    const prev = vals.length >= 2 ? vals[vals.length - 2] : null;
    return { yield: curr, prev };
}

module.exports = { fetchBanxicoYield };
