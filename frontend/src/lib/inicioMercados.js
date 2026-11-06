// Unidades de los contratos de futuros, tal como las entrega la fuente.
export const ACTIVOS_INICIO = [
  { ticker: '^GSPC', name: 'S&P 500', short: 'S&P 500', region: 'EE. UU.', group: 'bolsa', unit: 'puntos', icon: 'fa-chart-line', color: '#5dccad' },
  { ticker: '^NDX', name: 'Nasdaq 100', short: 'Nasdaq 100', region: 'EE. UU.', group: 'bolsa', unit: 'puntos', icon: 'fa-microchip', color: '#83b5ed' },
  { ticker: '^DJI', name: 'Dow Jones', short: 'Dow Jones', region: 'EE. UU.', group: 'bolsa', unit: 'puntos', icon: 'fa-building-columns', color: '#b2a1e1' },
  { ticker: '^MXX', name: 'S&P/BMV IPC', short: 'BMV IPC', region: 'México', group: 'bolsa', unit: 'puntos', icon: 'fa-flag', color: '#74c3b6' },
  { ticker: '^GDAXI', name: 'DAX', short: 'DAX', region: 'Alemania', group: 'bolsa', unit: 'puntos', icon: 'fa-globe', color: '#dca270' },
  { ticker: '^N225', name: 'Nikkei 225', short: 'Nikkei 225', region: 'Japón', group: 'bolsa', unit: 'puntos', icon: 'fa-globe', color: '#d291a3' },
  { ticker: 'AAPL', name: 'Apple', short: 'Apple', group: 'acciones', unit: 'USD', icon: 'fa-mobile-screen', color: '#a2b5ce' },
  { ticker: 'NVDA', name: 'NVIDIA', short: 'NVIDIA', group: 'acciones', unit: 'USD', icon: 'fa-microchip', color: '#89c37c' },
  { ticker: 'HE=F', name: 'Cerdo', short: 'Cerdo', group: 'agro', unit: '¢ USD/lb', icon: 'fa-piggy-bank', color: '#d68c91' },
  { ticker: 'LE=F', name: 'Ganado bovino', short: 'Res', group: 'agro', unit: '¢ USD/lb', icon: 'fa-cow', color: '#d8a087' },
  { ticker: 'ZC=F', name: 'Maíz', short: 'Maíz', group: 'agro', unit: '¢ USD/bu', icon: 'fa-wheat-awn', color: '#80b69a' },
  { ticker: 'ZW=F', name: 'Trigo', short: 'Trigo', group: 'agro', unit: '¢ USD/bu', icon: 'fa-wheat-awn', color: '#d3b46d' },
  { ticker: 'ZS=F', name: 'Soya', short: 'Soya', group: 'agro', unit: '¢ USD/bu', icon: 'fa-seedling', color: '#8fb486' },
  { ticker: 'GC=F', name: 'Oro', short: 'Oro', group: 'metales', unit: 'USD/oz troy', icon: 'fa-coins', color: '#d6b86f' },
  { ticker: 'SI=F', name: 'Plata', short: 'Plata', group: 'metales', unit: 'USD/oz troy', icon: 'fa-coins', color: '#a9bbd1' },
];

export const numeroValido = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export function normalizarCotizacion(payload) {
  const candles = (Array.isArray(payload?.candles) ? payload.candles : [])
    .filter(c => c && typeof c.time === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.time)
      && Number.isFinite(Date.parse(`${c.time}T12:00:00Z`))
      && ['open', 'high', 'low', 'close'].every(key => numeroValido(c[key])))
    .map(c => ({ ...c, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) }))
    .sort((a, b) => a.time.localeCompare(b.time));
  const price = numeroValido(payload?.meta?.regularMarketPrice) ? Number(payload.meta.regularMarketPrice) : candles.at(-1)?.close ?? null;
  const change = numeroValido(payload?.meta?.regularMarketChangePercent) ? Number(payload.meta.regularMarketChangePercent) : null;
  if (!candles.length && price === null) throw new Error('Sin cotización');
  return { candles, price, change, date: candles.at(-1)?.time || null };
}

export async function cargarCotizacion(ticker, range, signal) {
  const response = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=1d&range=${range}`, { signal });
  if (!response.ok) throw new Error('Fuente no disponible');
  return normalizarCotizacion(await response.json());
}

export function precio(value, digits = 2) {
  return numeroValido(value) ? new Intl.NumberFormat('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value)) : '—';
}
export function porcentaje(value) {
  return numeroValido(value) ? `${Number(value) > 0 ? '+' : ''}${precio(value)}%` : '—';
}
export function fechaCotizacion(value) {
  return value ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'Fecha no disponible';
}

// La escala siempre incluye toda la serie; un mercado plano no divide por cero.
export function geometriaSerie(candles, width, height, pad = 8, useWicks = false) {
  if (!candles.length) return null;
  const lows = candles.map(c => useWicks ? c.low : c.close);
  const highs = candles.map(c => useWicks ? c.high : c.close);
  const low = Math.min(...lows), high = Math.max(...highs);
  const margin = Math.max((high - low) * .12, Math.abs(high) * .001, .01);
  const min = low - margin, max = high + margin;
  const x = index => pad + index / Math.max(candles.length - 1, 1) * (width - pad * 2);
  const y = value => pad + (max - value) / (max - min) * (height - pad * 2);
  return { min, max, x, y, points: candles.map((c, i) => `${x(i)},${y(c.close)}`).join(' ') };
}
