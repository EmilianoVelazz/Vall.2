import { useEffect, useRef, useState } from 'react';

/*
 * Gráfica histórica de un commodity (LightweightCharts).
 *
 * En mercados.html había una sola función loadMktChart(ticker, pane) que
 * guardaba las instancias en un objeto global `_mktCharts` y las destruía "a
 * mano" antes de crear la siguiente. Funcionaba en una página que se recargaba
 * entera, pero en la SPA nada destruía la última instancia al salir de la
 * sección: quedaba viva con su ResizeObserver.
 *
 * Aquí cada gráfica es un componente con su propio ciclo de vida: se crea al
 * montar y se destruye —chart.remove() y observer.disconnect()— al desmontar o
 * al cambiar de instrumento.
 *
 * `range` es la ventana total; el intervalo de las velas se deriva de ella
 * (INTERVALO_POR_RANGO), igual que en el original.
 */

const INTERVALO_POR_RANGO = {
  '1mo': '1h', '3mo': '1d', '6mo': '1d', '1y': '1d',
  '3y': '1wk', '5y': '1wk', max: '1mo',
};

/* Acentos de la serie, uno por panel. Coinciden con --mk-{seccion} de
   mercados-redesign-v2.css, que es lo que pinta el filo y el icono de esa misma
   sección: la línea de la gráfica y la tarjeta de la que se abre son el mismo
   color. */
const ACENTO = {
  granos: { linea: '#e0b059', area: 'rgba(224,176,89,.28)' },
  energia: { linea: '#dd8468', area: 'rgba(221,132,104,.26)' },
  metales: { linea: '#a98ae0', area: 'rgba(169,138,224,.26)' },
};

/* LightweightCharts recibe colores ya resueltos, no acepta var(--…). En vez de
   copiar la paleta aquí —que es como se desincronizan las dos— se leen las
   custom properties del documento en el momento de crear la gráfica, con un
   valor de reserva por si la hoja aún no ha cargado. */
function token(nombre, reserva) {
  if (typeof window === 'undefined') return reserva;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return v || reserva;
}

export default function MktChart({ ticker, rango, modo, panel }) {
  const contenedor = useRef(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');

  useEffect(() => {
    const LWC = window.LightweightCharts;
    const nodo = contenedor.current;
    if (!LWC || !nodo) return undefined;

    let cancelado = false;
    let chart = null;
    let observer = null;
    const controller=new AbortController();

    (async () => {
      setEstado('cargando');
      const intervalo = INTERVALO_POR_RANGO[rango] || '1d';

      let velas = [];
      try {
        const r = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=${intervalo}&range=${rango}`,{signal:controller.signal});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        velas = (d.candles || []).filter((q) => q.open != null && q.close != null);
      } catch (e) {
        if (!cancelado) { setError(e.message); setEstado('error'); }
        return;
      }
      if (cancelado || !contenedor.current) return;

      if (!velas.length) { setEstado('vacio'); return; }

      const superficie = token('--mk-surface', '#243142');
      const linea = token('--mk-line-soft', '#374758');
      const rotulo = token('--mk-muted', '#9dacb9');

      chart = LWC.createChart(nodo, {
        width: nodo.clientWidth,
        height: nodo.clientHeight || 280,
        layout: { background: { color: superficie }, textColor: rotulo },
        grid: { vertLines: { color: linea }, horzLines: { color: linea } },
        crosshair: { mode: LWC.CrosshairMode.Normal },
        timeScale: { borderColor: linea, timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: linea },
      });

      const color = ACENTO[panel] || ACENTO.granos;

      if (modo === 'line') {
        chart.addLineSeries({ color: color.linea, lineWidth: 3, crosshairMarkerRadius: 5, priceLineColor: color.linea })
          .setData(velas.map((q) => ({ time: q.time, value: q.close })));
      } else if (modo === 'area') {
        chart.addAreaSeries({ lineColor: color.linea, topColor: color.area, bottomColor: 'rgba(23,120,138,.03)', lineWidth: 3, priceLineColor: color.linea })
          .setData(velas.map((q) => ({ time: q.time, value: q.close })));
      } else {
        const sube = token('--mk-up', '#59d2aa');
        const baja = token('--mk-down', '#fe7d8a');
        chart.addCandlestickSeries({
          upColor: sube, downColor: baja,
          borderUpColor: sube, borderDownColor: baja,
          wickUpColor: sube, wickDownColor: baja,
        }).setData(velas.map((q) => ({ time: q.time, open: q.open, high: q.high, low: q.low, close: q.close })));
      }

      chart.timeScale().fitContent();
      setEstado('listo');

      observer = new ResizeObserver(() => {
        try { chart.applyOptions({ width: nodo.clientWidth }); } catch { /* ya destruida */ }
      });
      observer.observe(nodo);
    })();

    return () => {
      cancelado = true;
      controller.abort();
      observer?.disconnect();
      if (chart) { try { chart.remove(); } catch { /* ya destruida */ } }
    };
  }, [ticker, rango, modo, panel]);

  return (
    <div className="grain-chart-canvas" style={{ position: 'relative' }}>
      <div ref={contenedor} style={{ width: '100%', height: '100%' }} />
      {estado !== 'listo' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '.5rem', fontSize: '.72rem',
          color: estado === 'error' ? 'var(--mk-down)' : 'var(--mk-muted)',
          background: 'var(--mk-surface)',
        }}
        >
          {estado === 'cargando' && <><i className="fas fa-spinner fa-spin" /> Cargando gráfico…</>}
          {estado === 'vacio' && 'Sin datos para este período'}
          {estado === 'error' && <><i className="fas fa-exclamation-circle" /> Error: {error}</>}
        </div>
      )}
    </div>
  );
}
