import mercolleidaData from './report-mercolleida-markets.json' with { type: 'json' };

const round = (value, decimals = 4) => {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(decimals)) : null;
};

function latestDateOnOrBefore(cutoffIso) {
  const parsed = Date.parse(cutoffIso || '');
  if (!Number.isFinite(parsed)) return null;
  const ref = new Date(parsed);
  return ref.toISOString().slice(0, 10);
}

function compactMercolleidaSeries(points) {
  if (points.length <= 120) return points;
  const byMonth = new Map();
  const kept = new Set();
  if (points[0]) kept.add(points[0].date);
  for (const pt of points) {
    if (pt.date >= '2025-10-01' || /-10-|-11-|-12-/.test(pt.date)) {
      kept.add(pt.date);
    }
    byMonth.set(pt.date.slice(0, 7), pt.date);
  }
  for (const d of byMonth.values()) kept.add(d);
  return points.filter(pt => kept.has(pt.date));
}

export function mercolleidaMarkets(cutoff = new Date().toISOString()) {
  const cutoffDate = latestDateOnOrBefore(cutoff);
  if (!cutoffDate) return [];
  const rawMarkets = Array.isArray(mercolleidaData?.markets) ? mercolleidaData.markets : [];
  return rawMarkets.map(market => {
    const baseSeries = Array.isArray(market.series) ? market.series : [];
    const filtered = baseSeries.filter(point => point && /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(Date.parse(point.date)) && new Date(Date.parse(point.date)).toISOString().slice(0,10)===point.date && point.date <= cutoffDate && Number.isFinite(point.value)).toSorted((a,b)=>a.date.localeCompare(b.date));
    const activeSeries = compactMercolleidaSeries(filtered);
    const last = activeSeries.at(-1);
    const prev = activeSeries.at(-2);
    const value = round(last?.value);
    const previous = round(prev?.value);
    const change = Number.isFinite(value) && Number.isFinite(previous) && previous !== 0
      ? round(((value - previous) / previous) * 100, 2)
      : null;
    return {
      ...market,
      bucket: 'proteins',
      quoteStatus: 'reference',
      evidenceOrigin: 'catalog',
      catalogUpdatedAt: mercolleidaData.updatedAt,
      value,
      previous,
      change,
      observedAt: last?.date || null,
      series: activeSeries
    };
  }).filter(item => Number.isFinite(item.value));
}

export function mercolleidaComparativeTables({ t = value => value } = {}) {
  const tables = mercolleidaData?.comparativeTables || {};
  const list = [
    tables.species2020ToDateMatrix,
    tables.homogeneousConversion,
    tables.annualBalance2020_2026,
    tables.internationalCuts
  ].filter(Boolean);
  return list.map(table => ({
    title: t(table.title),
    columns: (table.columns || []).map(col => t(col)),
    rows: (table.rows || []).map(row => row.map((cell, index) => index === 0 ? t(cell) : cell)),
    note: t(table.note || ''),
    mercolleidaTable: true,
    printGroup: 'mercolleida-comparative'
  }));
}
