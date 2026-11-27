import './DecisionTools.css';

const formatNumber = (value) =>
  Number.isFinite(value)
    ? Number(value).toLocaleString('es-MX', { maximumFractionDigits: 2 })
    : 'Pendiente';

const formatPercent = (value) => formatNumber(value) + (Number.isFinite(value) ? '%' : '');

const LABELS = {
  cerdo: 'Cerdo',
  res: 'Res',
  pollo: 'Pollo',
  huevo: 'Huevo',
  '1w': '1 semana',
  '1m': '1 mes',
  '3m': '3 meses',
};

export default function ForecastTrackRecord({ audit, modelVersion }) {
  const valid =
    Boolean(modelVersion) &&
    audit?.summary?.modelVersion === modelVersion &&
    audit?.summary?.evaluationScope === 'prospective_current_model_only';
  const summary = valid ? audit.summary : {};
  const count = summary.totalEvaluated || 0;

  return (
    <section className="vn-decision-tool" aria-labelledby="forecast-track-title">
      <header>
        <div>
          <span className="vn-tool-kicker">Seguimiento del modelo global</span>
          <h3 id="forecast-track-title">Lo que pronosticamos frente a lo que ocurrió</h3>
          <p>
            Solo objetivos emitidos antes de su fecha y evaluados con precios observados. Los ensayos históricos y modelos anteriores se excluyen de este resultado.
          </p>
        </div>
        <span>{modelVersion}</span>
      </header>

      {!count ? (
        <p className="vn-tool-notice">
          Todavía no hay resultados prospectivos evaluados para esta versión. Las fechas objetivo deben vencer y tener una observación publicada antes de medir aciertos. La validación histórica no sustituye este seguimiento.
        </p>
      ) : (
        <>
          <div className="vn-tool-metrics">
            <article>
              Resultados evaluados<b>{count}</b>
            </article>
            <article>
              Acierto direccional<b>{formatPercent(summary.directionalHitRatePct)}</b>
              <small>{summary.directionalEvaluations || 0} cambios no planos</small>
            </article>
            <article>
              Error porcentual medio<b>{formatPercent(summary.avgMapePct)}</b>
            </article>
            <article>
              Mejora del error porcentual frente a mantener el último precio
              <b>{formatPercent(summary.baselineImprovementPct)}</b>
            </article>
          </div>

          <div className="vn-tool-table" tabIndex={0} role="region" aria-label="Resultados por producto y plazo">
            <table>
              <thead>
                <tr>
                  <th>Producto / plazo</th>
                  <th>Evaluaciones</th>
                  <th>Acierto direccional</th>
                  <th>Error medio</th>
                </tr>
              </thead>
              <tbody>
                {[...Object.entries(audit.bySpecies || {}), ...Object.entries(audit.byHorizon || {})].map(
                  ([key, item]) => (
                    <tr key={key}>
                      <th scope="row">{LABELS[key] || key}</th>
                      <td>{item.evaluations}</td>
                      <td>{formatPercent(item.directionalHitRatePct)}</td>
                      <td>{formatPercent(item.avgMapePct)}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <details>
            <summary>Ver las últimas comparaciones publicadas</summary>
            <div className="vn-tool-table" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Mercado / serie</th>
                    <th>Emisión</th>
                    <th>Fecha objetivo</th>
                    <th>Fecha observada</th>
                    <th>Pronóstico</th>
                    <th>Observado</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit.recentEvaluations || []).map((row, index) => (
                    <tr key={row.symbol + row.targetAt + index}>
                      <th scope="row">
                        {row.symbol}
                        <small> {row.unit}</small>
                      </th>
                      <td>{row.generatedAt?.slice(0, 10)}</td>
                      <td>{row.targetAt?.slice(0, 10)}</td>
                      <td>{row.evaluatedAt?.slice(0, 10)}</td>
                      <td>{formatNumber(row.predictedValue)}</td>
                      <td>{formatNumber(row.actualValue)}</td>
                      <td>{formatNumber(row.percentageError)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p>
            Una mejora negativa significa que el modelo rindió peor que mantener el último precio en esa muestra. Los precios planos se excluyen del acierto direccional. No implica rentabilidad de una operación.
          </p>
        </>
      )}
    </section>
  );
}
