import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateFeedCostScenarios } from '../../../shared/feed-cost-scenarios.mjs';
import { useAuth } from '../context/AuthContext.jsx';
import { buildProteinOrionHandoff, writeOrionReportHandoff } from '../lib/orionHandoff.js';
import './DecisionTools.css';

const EXAMPLE_USD = {
  usdMxn: '20',
  cornUnit: 'USD/t',
  soyUnit: 'USD/t',
  cornUsdTon: '200',
  soymealUsdTon: '350',
  cornSharePct: '60',
  soySharePct: '25',
  otherFeedMxnKg: '4',
  feedConversionKg: '2.7',
  operatingCostMxnKg: '8',
  volumeKg: '10000',
  fxShockPct: '5',
  cornShockPct: '10',
  soyShockPct: '10',
};

const createEmpty = () => ({
  usdMxn: '',
  cornUnit: 'USD/t',
  soyUnit: 'USD/t',
  cornUsdTon: '',
  soymealUsdTon: '',
  cornSharePct: '',
  soySharePct: '',
  otherFeedMxnKg: '',
  feedConversionKg: '',
  operatingCostMxnKg: '',
  volumeKg: '',
  fxShockPct: '5',
  cornShockPct: '10',
  soyShockPct: '10',
});

const fmtMoney = (value) =>
  Number(value).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function FeedCostScenarios({ onOpenInOrion }) {
  const navigate = useNavigate();
  const { user } = useAuth() || {};
  const [input, setInput] = useState(createEmpty);
  const [illustrative, setIllustrative] = useState(false);

  const result = useMemo(() => calculateFeedCostScenarios(input), [input]);

  const updateField = (key, value) => {
    setIllustrative(false);
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const fields = [
    ['usdMxn', 'Tipo de cambio · MXN por USD', 0.01, 1000],
    ['cornUsdTon', `Maíz físico · ${input.cornUnit}`, 0.01, 100000],
    ['soymealUsdTon', `Pasta de soya física · ${input.soyUnit}`, 0.01, 100000],
    ['cornSharePct', 'Maíz en la mezcla · %', 0, 100],
    ['soySharePct', 'Pasta de soya en la mezcla · %', 0, 100],
    ['otherFeedMxnKg', 'Resto de la mezcla · MXN/kg', 0, 10000],
    ['feedConversionKg', 'Conversión · kg alimento/kg peso ganado', 0.01, 100],
    ['operatingCostMxnKg', 'Otros costos · MXN/kg peso ganado', 0, 100000],
    ['volumeKg', 'Volumen de peso ganado · kg', 0.01, 1e9],
  ];

  const handleOpenInOrion = () => {
    if (!result.available) return;
    if (typeof onOpenInOrion === 'function') {
      onOpenInOrion({ kind: 'feed-scenarios', simulation: { result } });
      return;
    }
    const handoff = buildProteinOrionHandoff({
      kind: 'feed-scenarios',
      simulation: { result },
      accountEmail: user?.email || user || '',
    });
    if (writeOrionReportHandoff(handoff)) {
      navigate('/orion');
    }
  };

  const renderNumberField = ([key, label, min, max]) => (
    <label key={key}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        value={input[key]}
        onChange={(event) => updateField(key, event.target.value)}
      />
    </label>
  );

  return (
    <section className="vn-decision-tool" aria-labelledby="feed-scenarios-title">
      <header>
        <div>
          <span className="vn-tool-kicker">Planeación de costos</span>
          <h3 id="feed-scenarios-title">¿Cómo cambian tus costos si se mueven el dólar, el maíz o la soya?</h3>
          <p>
            Introduce tu mezcla y precios físicos en <b>USD/t</b> o <b>MXN/kg</b>. Los importes permanecen en esta pantalla y se borran al cambiar de cuenta.
          </p>
        </div>
        <div className="vn-tool-actions">
          <button
            type="button"
            onClick={() => {
              setInput(EXAMPLE_USD);
              setIllustrative(true);
            }}
          >
            Cargar ejemplo ilustrativo
          </button>
          <button
            type="button"
            onClick={() => {
              setInput(createEmpty());
              setIllustrative(false);
            }}
          >
            Limpiar supuestos
          </button>
          <button type="button" disabled={!result.available} onClick={handleOpenInOrion}>
            Analizar en ORION
          </button>
        </div>
      </header>

      {illustrative && (
        <p className="vn-tool-notice" role="status">
          Ejemplo sintético para conocer el cálculo; no contiene cotizaciones actuales ni costos de tu empresa.
        </p>
      )}

      <div className="vn-tool-inputs">
        <label>
          Unidad del maíz
          <select value={input.cornUnit} onChange={(e) => updateField('cornUnit', e.target.value)}>
            <option value="USD/t">USD/t (importación / futuro)</option>
            <option value="MXN/kg">MXN/kg (plaza física MX)</option>
          </select>
        </label>
        <label>
          Unidad de pasta de soya
          <select value={input.soyUnit} onChange={(e) => updateField('soyUnit', e.target.value)}>
            <option value="USD/t">USD/t (importación / futuro)</option>
            <option value="MXN/kg">MXN/kg (plaza física MX)</option>
          </select>
        </label>
        {fields.map(renderNumberField)}
      </div>

      <h4>Variaciones hipotéticas frente al caso base</h4>
      <div className="vn-tool-inputs">
        {[
          ['fxShockPct', 'Dólar · cambio %', -90, 300],
          ['cornShockPct', 'Maíz · cambio %', -90, 300],
          ['soyShockPct', 'Pasta de soya · cambio %', -90, 300],
        ].map(renderNumberField)}
      </div>

      <div aria-live="polite">
        {!result.available ? (
          <p className="vn-tool-notice">{result.reason}</p>
        ) : (
          <>
            <p>
              Resto de la mezcla: <b>{fmtMoney(result.otherSharePct)}%</b>. Unidad del resultado: <b>{result.unit}</b>.
            </p>
            <div className="vn-tool-table" tabIndex={0} role="region" aria-label="Resultados de escenarios de costos">
              <table>
                <thead>
                  <tr>
                    <th>Escenario</th>
                    <th>Alimento · MXN/kg</th>
                    <th>Costo · MXN/kg peso ganado</th>
                    <th>Cambio · MXN/kg</th>
                    <th>Cambio del lote · MXN</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{fmtMoney(row.feedMxnKg)}</td>
                      <td>{fmtMoney(row.costPerKg)}</td>
                      <td>
                        {row.deltaPerKg > 0 ? '+' : ''}
                        {fmtMoney(row.deltaPerKg)}
                      </td>
                      <td>
                        {row.deltaTotal > 0 ? '+' : ''}
                        {fmtMoney(row.deltaTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <details>
        <summary>Fórmula y alcance</summary>
        <p>
          Alimento/kg = (maíz convertido a MXN/kg × participación) + (pasta de soya convertida a MXN/kg × participación) + (resto MXN/kg × participación restante). Costo/kg de peso ganado = alimento/kg × conversión + otros costos.
        </p>
        <p>
          Los componentes cotizados en USD/t reciben ambos cambios de precio y moneda; los ingresados en MXN/kg responden sólo a su propia variación. Otros costos se mantienen fijos. No incluye impuestos ni financiamiento no incorporado. La mezcla es un supuesto económico, no una formulación nutricional ni un pronóstico.
        </p>
      </details>
    </section>
  );
}
