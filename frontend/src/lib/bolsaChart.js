const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
const CHART_LABELS = { candles:'Velas japonesas', line:'Línea de cierre', area:'Área de tendencia', ohlc:'Barras OHLC' };
const PERIOD_LABELS = { '15m':'15 minutos', '1h':'1 hora', '1mo':'1 mes', '1y':'1 año', '3y':'3 años', '5y':'5 años', '10y':'10 años', '20y':'20 años' };
export const chartNumber = value => Number(value).toLocaleString('es-MX', {
  minimumFractionDigits: Math.abs(value) < 10 ? 4 : 2,
  maximumFractionDigits: Math.abs(value) < 10 ? 4 : 2,
});

export function chartDate(time, intraday = false, year = false, timeOnly = false) {
  const date = new Date(typeof time === 'number' && time < 1e11 ? time * 1000 : time);
  if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC', ...(!timeOnly ? { day: '2-digit', month: 'short' } : {}),
    ...(year ? { year: '2-digit' } : {}),
    ...(intraday ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(date);
}

/** Usa el rango del instrumento, también para divisas de variación pequeña. */
export function priceGeometry(candles, availableWidth = 960, availableHeight = 420) {
  const rows = candles.filter(c => numeric(c.close)).map(c => {
    const close = Number(c.close), open = numeric(c.open) ? Number(c.open) : close;
    return { time: c.time, close, open,
      hasOpen: numeric(c.open), hasHigh: numeric(c.high), hasLow: numeric(c.low),
      high: Math.max(numeric(c.high) ? Number(c.high) : close, open, close),
      low: Math.min(numeric(c.low) ? Number(c.low) : close, open, close),
    };
  });
  if (!rows.length) return null;
  const width = Math.max(180, Math.round(availableWidth || 960));
  const height = Math.max(240, Math.round(availableHeight || 420));
  const low = Math.min(...rows.map(c => c.low)), high = Math.max(...rows.map(c => c.high));
  const range = Math.max(high - low, Math.abs(high) * .002, 1e-8);
  const floor = low - range * .08, ceiling = high + range * .08;
  const pad = { left: 16, top: 22, right: Math.max(76, chartNumber(high).length * 7 + 18), bottom: 36 };
  const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom;
  return { rows, width, height, pad, floor, ceiling, plotWidth, plotHeight,
    x: index => rows.length === 1 ? pad.left + plotWidth / 2 : pad.left + index / (rows.length - 1) * plotWidth,
    y: value => pad.top + (ceiling - value) / (ceiling - floor) * plotHeight,
  };
}

export function renderPriceChart(wrapper, candles, { type, instrument, period }) {
  const geometry = priceGeometry(candles, wrapper.clientWidth, wrapper.clientHeight);
  if (!geometry) return;
  const { rows, width, height, pad, floor, ceiling, plotWidth, plotHeight, x, y } = geometry;
  wrapper.querySelector('#ch-native-chart')?.remove();
  wrapper.querySelector('.fin-chart-tooltip')?.remove();
  const node = (tag, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    return el;
  };
  const svg = node('svg', { id: 'ch-native-chart', class: 'fin-native-market-chart',
    viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img', tabindex: 0,
    'aria-label': `${instrument}, ${PERIOD_LABELS[period] || period}. ${CHART_LABELS[type]}. Usa las flechas para consultar los precios y Escape para cerrar la lectura.`,
    'aria-describedby': 'ch-chart-help',
  });
  const title = node('title'); title.textContent = `${instrument} · ${PERIOD_LABELS[period] || period}`; svg.append(title);
  const last = rows.at(-1).close, tone = last >= rows[0].close ? '#59d2aa' : '#ff7f91';
  const defs = node('defs'), gradient = node('linearGradient', { id: 'ch-area-gradient', x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(node('stop', { offset: '0%', 'stop-color': tone, 'stop-opacity': .3 }), node('stop', { offset: '100%', 'stop-color': tone, 'stop-opacity': .015 }));
  const clip = node('clipPath', { id: 'ch-plot-clip' });
  clip.append(node('rect', { x: pad.left - 6, y: pad.top - 8, width: plotWidth + 12, height: plotHeight + 16 }));
  defs.append(gradient, clip); svg.append(defs);
  for (let tick = 0; tick < 5; tick++) {
    const gy = pad.top + plotHeight / 4 * tick;
    svg.append(node('line', { x1: pad.left, x2: width - pad.right, y1: gy, y2: gy, stroke: '#6b8aae', 'stroke-opacity': .17, 'stroke-dasharray': '3 6' }));
    const label = node('text', { x: width - pad.right + 10, y: gy + 4, class: 'fin-chart-axis' });
    label.textContent = chartNumber(ceiling - (ceiling - floor) / 4 * tick); svg.append(label);
  }
  const intraday = ['15m', '1h', '1mo'].includes(period);
  const dates = Math.min(rows.length, plotWidth < 100 ? 1 : Math.max(2, Math.floor(plotWidth / 150) + 1));
  for (let tick = 0; tick < dates; tick++) {
    const index = dates === 1 ? rows.length - 1 : Math.round(tick / (dates - 1) * (rows.length - 1));
    const label = node('text', { x: x(index), y: height - 11, class: 'fin-chart-axis', 'text-anchor': dates === 1 ? 'end' : tick === 0 ? 'start' : tick === dates - 1 ? 'end' : 'middle' });
    label.textContent = chartDate(rows[index].time, intraday, ['3y', '5y', '10y', '20y'].includes(period), intraday); svg.append(label);
  }
  const plot = node('g', { class: 'fin-chart-series', 'clip-path': 'url(#ch-plot-clip)' });
  if (type === 'candles' || type === 'ohlc') {
    const bodyWidth = Math.max(.6, Math.min(12, plotWidth / Math.max(rows.length, 2) * .6));
    rows.forEach((c, i) => {
      const cx = x(i), color = c.close >= c.open ? '#59d2aa' : '#ff7f91';
      plot.append(node('line', { x1: cx, x2: cx, y1: y(c.high), y2: y(c.low), stroke: color, 'stroke-width': 1.2 }));
      if (type === 'candles') plot.append(node('rect', { x: cx - bodyWidth / 2, y: Math.min(y(c.open), y(c.close)), width: bodyWidth, height: Math.max(1, Math.abs(y(c.open) - y(c.close))), rx: 1, fill: color }));
      else {
        plot.append(node('line', { x1: cx - bodyWidth / 2, x2: cx, y1: y(c.open), y2: y(c.open), stroke: color, 'stroke-width': 1.5 }));
        plot.append(node('line', { x1: cx, x2: cx + bodyWidth / 2, y1: y(c.close), y2: y(c.close), stroke: color, 'stroke-width': 1.5 }));
      }
    });
  } else {
    const path = rows.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(c.close)}`).join(' ');
    if (type === 'area') plot.append(node('path', { d: `${path} L ${x(rows.length - 1)},${height - pad.bottom} L ${x(0)},${height - pad.bottom} Z`, fill: 'url(#ch-area-gradient)' }));
    plot.append(node('path', { class: 'fin-chart-line', d: path, fill: 'none', stroke: tone, 'stroke-width': 2.3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    plot.append(node('circle', { cx: x(rows.length - 1), cy: y(last), r: 3.5, fill: tone }));
  }
  svg.append(plot);
  svg.append(node('line', { x1: pad.left, x2: width - pad.right, y1: y(last), y2: y(last), stroke: tone, 'stroke-opacity': .45, 'stroke-dasharray': '4 5' }));
  svg.append(node('rect', { x: width - pad.right + 4, y: y(last) - 12, width: pad.right - 8, height: 24, rx: 5, fill: tone }));
  const lastLabel = node('text', { x: width - pad.right + 10, y: y(last) + 4, class: 'fin-chart-last-price' });
  lastLabel.textContent = chartNumber(last); svg.append(lastLabel);

  const guide = node('g', { class: 'fin-chart-crosshair', visibility: 'hidden', 'pointer-events': 'none' });
  const vertical = node('line', { y1: pad.top, y2: height - pad.bottom });
  const horizontal = node('line', { x1: pad.left, x2: width - pad.right });
  const point = node('circle', { r: 4, fill: tone, stroke: '#ecf3ff', 'stroke-width': 2 });
  guide.append(vertical, horizontal, point); svg.append(guide);
  const tooltip = document.createElement('div'); tooltip.className = 'fin-chart-tooltip'; tooltip.hidden = true; tooltip.setAttribute('aria-hidden', 'true');
  const date = document.createElement('strong'), close = document.createElement('span'), ohlc = document.createElement('small');
  tooltip.append(date, close, ohlc);
  let selected = rows.length - 1;
  const hide = () => { guide.setAttribute('visibility', 'hidden'); tooltip.hidden = true; };
  const show = (index, announce = false) => {
    selected = Math.min(rows.length - 1, Math.max(0, index));
    const c = rows[selected], cx = x(selected), cy = y(c.close);
    guide.setAttribute('visibility', 'visible');
    vertical.setAttribute('x1', cx); vertical.setAttribute('x2', cx);
    horizontal.setAttribute('y1', cy); horizontal.setAttribute('y2', cy);
    point.setAttribute('cx', cx); point.setAttribute('cy', cy);
    date.textContent = chartDate(c.time, intraday, true);
    close.textContent = `Cierre ${chartNumber(c.close)}`;
    ohlc.textContent = `A ${c.hasOpen ? chartNumber(c.open) : '—'} · Máx ${c.hasHigh ? chartNumber(c.high) : '—'} · Mín ${c.hasLow ? chartNumber(c.low) : '—'}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(8, Math.min(width - tooltip.offsetWidth - 8, cx + 16))}px`;
    if (announce) {
      const status = document.getElementById('ch-chart-reading');
      if (status) status.textContent = `${date.textContent}. ${close.textContent}. ${ohlc.textContent}`;
    }
  };
  const inspect = event => {
    const rect = svg.getBoundingClientRect(), px = (event.clientX - rect.left) / rect.width * width;
    show(Math.round((px - pad.left) / plotWidth * (rows.length - 1)));
  };
  svg.addEventListener('pointermove', event => { if (event.pointerType !== 'touch') inspect(event); });
  svg.addEventListener('pointerdown', inspect);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(rows.length - 1, true));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', event => {
    if (event.key === 'Escape') { hide(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    show(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : selected + (event.key === 'ArrowLeft' ? -1 : 1), true);
  });
  wrapper.insertBefore(svg, wrapper.firstChild); wrapper.append(tooltip);
  wrapper.dispatchEvent(new CustomEvent('vn:bolsa-chart', { bubbles: true }));
}
