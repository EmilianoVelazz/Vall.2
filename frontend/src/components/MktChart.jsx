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

const ACENTO = {
  granos: { linea: '#2f7d32', area: 'rgba(94,139,44,.42)' },
  energia: { linea: '#17788a', area: 'rgba(23,120,138,.40)' },
  metales: { linea: '#a85d29', area: 'rgba(168,93,41,.38)' },
};

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

    (async () => {
      setEstado('cargando');
      const intervalo = INTERVALO_POR_RANGO[rango] || '1d';

      let velas = [];
      try {
        const r = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=${intervalo}&range=${rango}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        velas = (d.candles || []).filter((q) => q.open != null && q.close != null);
      } catch (e) {
        if (!cancelado) { setError(e.message); setEstado('error'); }
        return;
      }
      if (cancelado || !contenedor.current) return;

      if (!velas.length) { setEstado('vacio'); return; }

      chart = LWC.createChart(nodo, {
        width: nodo.clientWidth,
        height: nodo.clientHeight || 280,
        layout: { background: { color: '#fff' }, textColor: '#334155' },
        grid: { vertLines: { color: 'rgba(0,33,58,.05)' }, horzLines: { color: 'rgba(0,33,58,.05)' } },
        crosshair: { mode: LWC.CrosshairMode.Normal },
        timeScale: { borderColor: 'rgba(0,33,58,.08)', timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: 'rgba(0,33,58,.08)' },
      });

      const color = ACENTO[panel] || ACENTO.granos;

      if (modo === 'line') {
        chart.addLineSeries({ color: color.linea, lineWidth: 3, crosshairMarkerRadius: 5, priceLineColor: color.linea })
          .setData(velas.map((q) => ({ time: q.time, value: q.close })));
      } else if (modo === 'area') {
        chart.addAreaSeries({ lineColor: color.linea, topColor: color.area, bottomColor: 'rgba(23,120,138,.03)', lineWidth: 3, priceLineColor: color.linea })
          .setData(velas.map((q) => ({ time: q.time, value: q.close })));
      } else {
        chart.addCandlestickSeries({
          upColor: '#16a34a', downColor: '#dc2626',
          borderUpColor: '#16a34a', borderDownColor: '#dc2626',
          wickUpColor: '#16a34a', wickDownColor: '#dc2626',
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
          color: estado === 'error' ? '#dc2626' : '#94a3b8', background: '#fff',
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
