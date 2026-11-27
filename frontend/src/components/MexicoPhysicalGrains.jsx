import { useEffect, useState } from 'react';
import { reportJsonRequest } from '../lib/reportRequest.js';
import './DecisionTools.css';

export default function MexicoPhysicalGrains() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });

  useEffect(() => {
    const controller = new AbortController();

    reportJsonRequest('/api/market-executive-reports', { signal: controller.signal })
      .then((payload) => {
        const report = payload.data?.find((item) => item.key === 'grains');
        const seen = new Set();
        const rows = (report?.sourceSnapshot?.grains || []).filter((item) => {
          const validCountry = ['MX', 'MEX', 'México', 'Mexico'].includes(item.country);
          const isPhysical = /f[ií]sico/i.test(item.exchange || '');
          const validPrice = Number.isFinite(item.value) && item.value > 0;
          const validDate = Date.parse(item.observedAt) <= Math.min(Date.now(), Date.parse(report.generatedAt));
          const validMeta = Boolean(item.unit && item.source && /^https?:\/\//.test(item.url || ''));
          if (!validCountry || !isPhysical || !validPrice || !validDate || !validMeta) return false;

          const key = [item.ticker, item.label, item.unit].join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (!controller.signal.aborted) {
          setState({ loading: false, rows, error: '' });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, rows: [], error: error.message });
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="vn-decision-tool" aria-labelledby="mx-physical-grains-title">
      <span className="vn-tool-kicker">Abastecimiento de alimento</span>
      <h3 id="mx-physical-grains-title">Granos físicos publicados para México</h3>
      <p>
        Referencias mayoristas por plaza de la colección de Mercados (FAO FPMA / SNIIM). Los promedios mensuales conservan su periodo; para maíz amarillo o pasta de soya de importación utiliza los supuestos en USD/t o MXN/kg en Escenarios de Ración.
      </p>

      {state.loading ? (
        <p role="status">Consultando referencias físicas…</p>
      ) : state.error ? (
        <p role="status">{state.error}</p>
      ) : !state.rows.length ? (
        <p className="vn-tool-notice">
          No hay referencias físicas mexicanas verificables en este corte. Los futuros internacionales y la producción agrícola no sustituyen un precio físico local.
        </p>
      ) : (
        <div className="vn-tool-table" tabIndex={0} role="region" aria-label="Precios físicos de granos de México">
          <table>
            <thead>
              <tr>
                <th>Producto / plaza</th>
                <th>Valor</th>
                <th>Unidad</th>
                <th>Periodo</th>
                <th>Presentación y fuente</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((item) => (
                <tr key={item.ticker + item.label}>
                  <th scope="row">{item.label}</th>
                  <td>{item.value.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                  <td>{item.unit}</td>
                  <td>
                    {item.cadence === 'monthly' ? item.observedAt.slice(0, 7) : item.observedAt} ·{' '}
                    {item.cadence === 'monthly' ? 'mensual' : item.cadence === 'weekly' ? 'semanal' : 'diaria'}
                  </td>
                  <td>
                    {item.basis}
                    <br />
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.source}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
