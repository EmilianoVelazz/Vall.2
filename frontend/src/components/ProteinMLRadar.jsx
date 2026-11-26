import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buildMarranasOrionHandoff, writeOrionReportHandoff } from '../lib/orionHandoff.js';
import MarranasSimulator from './MarranasSimulator.jsx';

const REGIONES = [
  { id: 'ALL', label: 'Todas las regiones' },
  { id: 'MX', label: 'MX · México' },
  { id: 'US', label: 'US · EE. UU.' },
  { id: 'EU', label: 'EU · Europa' },
  { id: 'LATAM', label: 'LATAM' },
  { id: 'GLOBAL', label: 'Global / Asia' },
];

const HORIZONTES = [
  { id: '1w', label: '1 semana' },
  { id: '1m', label: '1 mes' },
  { id: '3m', label: '3 meses' },
];

const ESPECIES_ORDEN = [
  { id: 'cerdo', icono: '', nombre: 'Cerdo' },
  { id: 'res', icono: '', nombre: 'Res' },
  { id: 'pollo', icono: '', nombre: 'Pollo' },
  { id: 'huevo', icono: '', nombre: 'Huevo' },
];

function dirClass(dir) {
  if (dir === 'ALZA') return 'up';
  if (dir === 'BAJA') return 'down';
  return 'flat';
}

function dirLabel(dir) {
  if (dir === 'ALZA') return '▲ ALZA';
  if (dir === 'BAJA') return '▼ BAJA';
  return '● LATERAL';
}

function fmtNum(val) {
  if (!Number.isFinite(Number(val))) return '—';
  const n = Number(val);
  if (Math.abs(n) >= 1000) return n.toLocaleString('es-MX', { maximumFractionDigits: 1 });
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pickHorizon(row, targetCode) {
  const list = Array.isArray(row?.horizons) ? row.horizons : [];
  return list.find((h) => h.code === targetCode) || row.primaryForecast || list[0] || null;
}

function classifyClosedLoopTrust(slice) {
  if (!slice || !slice.evaluations) return null;
  const movs = slice.directionalEvaluations ?? slice.evaluations ?? 0;
  const hit = slice.directionalHitRatePct;
  const brier = slice.avgBrierScore;
  const cov = slice.conformal80CoveragePct;
  if (movs >= 8 && hit != null && hit >= 60 && (brier == null || brier <= 0.22)) {
    return {
      tier: 'validated',
      label: `✓ Dirección validada · ${hit}%`,
      title: `Auditoría real fuera de muestra: ${hit}% en ${movs} movimientos reales · Brier ${brier ?? '—'} · Cobertura P80 ${cov ?? '—'}%`,
    };
  }
  if (movs >= 4 && hit != null && hit >= 55) {
    return {
      tier: 'watch',
      label: `◔ En observación · ${hit}% (${movs} movs)`,
      title: `Muestra real en acumulación (${movs} movimientos). Priorizar banda Conformal P80 (${cov ?? '—'}%) y paridad de importación.`,
    };
  }
  return {
    tier: 'range-only',
    label: `◎ Solo rango P80 (${cov ?? '—'}%) · en calibración`,
    title: `Acierto direccional real ${hit ?? '—'}% (${movs} movs reales). No usar dirección aislada; apoyarse en banda P80 (${cov ?? '—'}%) y paridad.`,
  };
}

export default function ProteinMLRadar({ activeSpecies = 'all', onSelectSpecies }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  const openInOrion = (opts) => {
    const handoff = buildMarranasOrionHandoff({ ...opts, data, accountEmail: user || '' });
    writeOrionReportHandoff(handoff);
    navigate('/orion');
  };
  const [region, setRegion] = useState('ALL');
  const [horizon, setHorizon] = useState('1m');
  const [expandedSym, setExpandedSym] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/marranas', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!ctrl.signal.aborted && json?.available) setData(json);
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const filtered = useMemo(() => {
    const list = Array.isArray(data?.forecasts) ? data.forecasts : [];
    return list.filter((item) => {
      if (activeSpecies && activeSpecies !== 'all' && item.species !== activeSpecies) return false;
      if (region !== 'ALL' && item.region !== region) return false;
      return Boolean(pickHorizon(item, horizon));
    });
  }, [data, activeSpecies, region, horizon]);

  const visibleRows = showAll ? filtered : filtered.slice(0, 14);

  const visibleAlerts = useMemo(() => {
    const list = Array.isArray(data?.alerts) ? data.alerts : [];
    return list
      .filter((a) => {
        if (activeSpecies && activeSpecies !== 'all' && a.species !== activeSpecies) return false;
        if (region !== 'ALL' && a.region !== region) return false;
        return true;
      })
      .slice(0, 4);
  }, [data, activeSpecies, region]);

  if (loading && !data) {
    return (
      <section className="mp-ml-radar" aria-label="Radar Predictivo ML de Proteínas">
        <div className="mp-ml-empty">Cargando modelos predictivos ML de proteínas…</div>
      </section>
    );
  }

  if (!data?.available) return null;

  const stats = data.stats || {};
  const bySpecies = data.summary?.bySpecies || {};
  const auditBySpecies = data.closedLoopAudit?.bySpecies || {};
  const auditSummary = data.closedLoopAudit?.summary || null;

  return (
    <section className="mp-ml-radar" aria-label="Radar Predictivo ML de Proteínas">
      <div className="mp-ml-head">
        <div>
          <span className="mp-ml-kicker">
            <i className="fas fa-microchip" /> ORION · PROTEÍNAS · PRONÓSTICOS Y CONTEXTO DE MERCADO
          </span>
          <h2>ORION ML · Pronóstico Direccional de Proteínas (Subida / Baja)</h2>
          <p>
            Motor cuantitativo integrado de <b>ORION</b> entrenado con <b>{(stats.totalObservationsIngested || 0).toLocaleString('es-MX')}</b> observaciones reales
            (México SNIIM 2 años, EE. UU. USDA AMS/Primarios/PPI/CME, Europa DG AGRI 6 años, Latinoamérica y FMI Global), cruzado con
            <b> paridad de importación MXN/kg</b>, <b>radar NLP sanitario y comercial (H5N1 · PPA · Barrenador · Aranceles)</b>, <b>CFTC Commitments of Traders</b>, spreads Choice/Select y Belly/Carcass, sacrificio <b>IBGE Brasil</b>, ración balanceada, diésel, gas natural y divisas.
          </p>
        </div>
        <div className="mp-ml-badges">
          <span className="mp-ml-badge">
            <b>{stats.activeModels || 0}</b> series con pronóstico validado
          </span>
          {stats.avgWalkForwardDirectionalAccuracyPct != null && (
            <span className="mp-ml-badge accent">
              Acierto histórico: <b>{stats.avgWalkForwardDirectionalAccuracyPct}%</b>
            </span>
          )}
          {stats.avgBrierScore != null && (
            <span className="mp-ml-badge">
              Brier: <b>{stats.avgBrierScore}</b>
            </span>
          )}
          {auditSummary?.totalEvaluated > 0 && (
            <span
              className="mp-ml-badge accent"
              title={`Auditoría real fuera de muestra (${auditSummary.totalEvaluated} evals únicas, ${auditSummary.directionalEvaluations ?? auditSummary.totalEvaluated} movs reales, ${auditSummary.flatExcluded ?? 0} planos excluidos)`}
            >
              Audit Real: <b>P80 {auditSummary.conformal80CoveragePct}%</b> · MAPE <b>{auditSummary.avgMapePct}%</b> · Dir {auditSummary.directionalHitRatePct}% ({auditSummary.directionalEvaluations ?? auditSummary.totalEvaluated} movs)
            </span>
          )}
          <button
            type="button"
            className="mp-orion-cta"
            onClick={() => openInOrion({ kind: 'overview' })}
            title="Abrir el diagnóstico completo de ORION ML en el chat interactivo"
          >
            <i className="fas fa-sparkles" /> Analizar en ORION
          </button>
        </div>
      </div>

      <p className="mp-ml-cell-sub">
        La validación histórica no equivale a resultados comprobados en producción. {stats.abstainedSeries || 0} series
        {' '}quedaron sin pronóstico por datos atrasados o evidencia insuficiente. Noticias y paridad aportan contexto.
      </p>

      <div className="mp-ml-species-grid">
        {ESPECIES_ORDEN.map((sp) => {
          const item = bySpecies[sp.id];
          const dir = item?.consensusDirection || 'LATERAL';
          const probUp = item?.avgProbUpPct ?? 50;
          const isSelected = activeSpecies === sp.id;
          const trust = classifyClosedLoopTrust(auditBySpecies[sp.id]);
          return (
            <button
              key={sp.id}
              type="button"
              className={`mp-ml-sp-card${isSelected ? ' selected' : ''}`}
              onClick={() => onSelectSpecies?.(isSelected ? 'all' : sp.id)}
            >
              <div className="mp-ml-sp-top">
                <span className="mp-ml-sp-name">{sp.icono} {sp.nombre}</span>
                <span className={`mp-ml-dir ${dirClass(dir)}`}>{dirLabel(dir)}</span>
              </div>
              <div className="mp-ml-sp-prob">
                <span>Subida <b>{probUp}%</b></span>
                <span>Baja <b>{item?.avgProbDownPct ?? (100 - probUp).toFixed(1)}%</b></span>
              </div>
              <div className="mp-ml-prob-bar" aria-hidden="true">
                <div className="mp-ml-prob-fill" style={{ width: `${Math.max(8, Math.min(92, probUp))}%` }} />
              </div>
              <div className="mp-ml-sp-meta">
                <span>{item?.seriesCount || 0} mercados</span>
                <span>WF: {item?.avgDirectionalAccuracyPct != null ? `${item.avgDirectionalAccuracyPct}%` : '—'}</span>
              </div>
              {trust && (
                <div className={`mp-ml-trust ${trust.tier}`} title={trust.title}>
                  {trust.label}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {visibleAlerts.length > 0 && (
        <div className="mp-ml-alerts" aria-label="Radar de Alertas Tempranas ORION ML">
          <div className="mp-ml-alerts-head">
            <span><i className="fas fa-bell" /> ALERTAS TEMPRANAS ORION ML (PRECIO · MARGEN RACIÓN · CHOQUES DE VOLATILIDAD / SANIDAD)</span>
            <small>{visibleAlerts.length} activas en este filtro</small>
          </div>
          <div className="mp-ml-alerts-grid">
            {visibleAlerts.map((al) => (
              <div key={al.id} className={`mp-ml-alert-card sev-${al.severity === 'CRÍTICA' ? 'crit' : al.severity === 'ALTA' ? 'high' : 'watch'}`}>
                <div className="mp-ml-alert-top">
                  <span className="mp-ml-alert-sev">{al.severity}</span>
                  <span className="mp-ml-alert-tag">{al.region} · {al.species.toUpperCase()}</span>
                </div>
                <strong>{al.title}</strong>
                <p>{al.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mp-ml-toolbar">
        <div className="mp-ml-regions">
          {REGIONES.map((reg) => (
            <button
              key={reg.id}
              type="button"
              className={`mp-ml-rpill${region === reg.id ? ' active' : ''}`}
              onClick={() => { setRegion(reg.id); setShowAll(false); }}
            >
              {reg.label}
            </button>
          ))}
        </div>
        <div className="mp-ml-regions">
          {HORIZONTES.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`mp-ml-rpill${horizon === h.id ? ' active' : ''}`}
              onClick={() => setHorizon(h.id)}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mp-ml-table-wrap">
        <table className="mp-ml-table">
          <thead>
            <tr>
              <th>Mercado / Benchmark</th>
              <th>Región</th>
              <th>Último Corte</th>
              <th>Señal ML</th>
              <th>Prob. Subida</th>
              <th>Objetivo (Banda P80)</th>
              <th>Validación WF & Margen</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const p = pickHorizon(row, horizon);
              const chg = p.expectedChangePct;
              const exp = p.explainability;
              const isOpen = expandedSym === row.symbol;
              const maxAbs = Math.max(5, ...(exp?.factors || []).map((f) => Math.abs(f.impactPctPts || 0)));
              return (
                <Fragment key={row.symbol}>
                  <tr>
                    <td>
                      <div className="mp-ml-cell-title">{row.label}</div>
                      <div className="mp-ml-cell-sub">
                        {row.source} · {p.horizonLabel} · {row.observations} obs
                        {row.anomaly?.isAnomaly && <span className="mp-ml-shock"> · ⚠ Choque activo</span>}
                      </div>
                    </td>
                    <td>
                      <span className="mp-ml-reg-tag">{row.region}</span>
                      <div className="mp-ml-cell-sub">{row.country}</div>
                    </td>
                    <td className="mp-ml-mono">
                      <b>{fmtNum(row.lastValue)}</b> <small>{row.unit}</small>
                      <div className="mp-ml-cell-sub">{row.lastDate}</div>
                    </td>
                    <td>
                      <span className={`mp-ml-dir ${dirClass(p.direction)}`}>{dirLabel(p.direction)}</span>
                      <div className="mp-ml-cell-sub">
                        Confianza: {p.confidence}
                        {exp?.factors?.length > 0 && (
                          <>
                            {' · '}
                            <button
                              type="button"
                              className="mp-ml-shap-btn"
                              onClick={() => setExpandedSym(isOpen ? null : row.symbol)}
                            >
                              {isOpen ? 'Ocultar factores ▲' : 'Ver factores asociados ▼'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="mp-ml-mono">
                      <b>{p.probUpPct}%</b> / <small>{p.probDownPct}%</small>
                    </td>
                    <td className="mp-ml-mono">
                      <b>{fmtNum(p.projectedValue)}</b>{' '}
                      <span className={`mp-ml-chg ${chg >= 0 ? 'up' : 'down'}`}>
                        ({chg > 0 ? '+' : ''}{chg}%)
                      </span>
                      <div className="mp-ml-cell-sub">P80: [{fmtNum(p.low80)} – {fmtNum(p.high80)}]</div>
                    </td>
                    <td className="mp-ml-mono">
                      {p.validation?.walkForwardDirectionalAccuracyPct != null
                        ? <><b>{p.validation.walkForwardDirectionalAccuracyPct}%</b> <small>(Brier {p.validation.brierScore ?? '—'})</small></>
                        : '—'}
                      <div className="mp-ml-cell-sub">
                        {p.feedMarginZScore != null ? `Margen/Ración Z=${p.feedMarginZScore}` : (row.exogenousDriversUsed || []).slice(0, 3).join(', ')}
                      </div>
                    </td>
                  </tr>
                  {isOpen && exp && (
                    <tr className="mp-ml-shap-row">
                      <td colSpan={7}>
                        <div className="mp-ml-shap-panel">
                          <div className="mp-ml-shap-head">
                            <strong><i className="fas fa-diagram-project" /> Factores asociados al pronóstico · ORION ML</strong>
                            <div className="mp-ml-shap-right">
                              <span>Base neutra 50% → Prob. Subida <b>{exp.finalProbUpPct}%</b> ({exp.netDeltaPts > 0 ? '+' : ''}{exp.netDeltaPts} pts)</span>
                              <button
                                type="button"
                                className="mp-orion-cta sm"
                                onClick={() => openInOrion({ kind: 'series', row, horizon: p })}
                              >
                                <i className="fas fa-comments" /> Profundizar en ORION
                              </button>
                            </div>
                          </div>
                          <p className="mp-ml-shap-narrative">{exp.narrative}</p>
                          <div className="mp-ml-shap-bars">
                            {(exp.factors || []).map((f) => {
                              const pos = f.impactPctPts >= 0;
                              const widthPct = Math.max(4, Math.min(100, (Math.abs(f.impactPctPts) / maxAbs) * 100));
                              return (
                                <div className="mp-ml-shap-item" key={f.id}>
                                  <span className="mp-ml-shap-lbl">{f.label}</span>
                                  <div className="mp-ml-shap-track">
                                    <div className={`mp-ml-shap-fill ${pos ? 'up' : 'down'}`} style={{ width: `${widthPct}%` }} />
                                  </div>
                                  <span className={`mp-ml-shap-val ${pos ? 'up' : 'down'}`}>
                                    {pos ? '+' : ''}{f.impactPctPts} pts
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!visibleRows.length && (
              <tr>
                <td colSpan={7} className="mp-ml-empty">
                  {stats.activeModels === 0
                    ? 'Las series se revisaron, pero ningún modelo supera todavía la referencia con datos recientes y validación suficiente. Se conserva el histórico sin emitir una señal de compra o venta.'
                    : 'No hay pronósticos validados para la combinación seleccionada de especie y región.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 14 && (
        <div className="mp-ml-more">
          <button type="button" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Ver menos mercados' : `Ver todos los ${filtered.length} mercados entrenados`}
          </button>
        </div>
      )}

      {data.importParity?.bySpecies && (
        <div className="mp-parity-box" aria-label="Paridad de Importación hacia México">
          <div className="mp-parity-head">
            <div>
              <span className="mp-parity-kicker">
                <i className="fas fa-ship" /> PARIDAD DE IMPORTACIÓN Y ARBITRAJE INTERNACIONAL → MÉXICO (MXN/KG)
              </span>
              <p className="mp-parity-sub">
                Mediana nacional SNIIM México frente a paridad puesta en frontera (FOB origen convertido a MXN/kg + flete logístico de referencia).
              </p>
            </div>
            <div className="mp-parity-fx">
              {data.importParity.fxRates?.usdMxn && <span>USD/MXN <b>{fmtNum(data.importParity.fxRates.usdMxn)}</b></span>}
              {data.importParity.fxRates?.eurMxn && <span>EUR/MXN <b>{fmtNum(data.importParity.fxRates.eurMxn)}</b></span>}
              {data.importParity.fxRates?.brlMxn && <span>BRL/MXN <b>{fmtNum(data.importParity.fxRates.brlMxn)}</b></span>}
              <button
                type="button"
                className="mp-orion-cta sm"
                onClick={() => openInOrion({ kind: 'parity' })}
              >
                <i className="fas fa-comments" /> Arbitraje en ORION
              </button>
            </div>
          </div>

          <div className="mp-parity-grid">
            {ESPECIES_ORDEN
              .filter((sp) => activeSpecies === 'all' || activeSpecies === sp.id)
              .map((sp) => {
                const entry = data.importParity.bySpecies[sp.id];
                if (!entry) return null;
                const prim = entry.primaryParity;
                const sigCls = prim?.signal === 'TECHO_IMPORTACION'
                  ? 'ceiling'
                  : prim?.signal === 'DESCUENTO_MX'
                    ? 'discount'
                    : 'balanced';
                const sigLbl = prim?.signal === 'TECHO_IMPORTACION'
                  ? 'TECHO IMPORTACIÓN'
                  : prim?.signal === 'DESCUENTO_MX'
                    ? 'DESCUENTO MX'
                    : 'EQUILIBRIO';
                return (
                  <div className="mp-parity-card" key={sp.id}>
                    <div className="mp-parity-card-top">
                      <strong>{sp.icono} {sp.nombre}</strong>
                      {prim && <span className={`mp-parity-sig ${sigCls}`}>{sigLbl}</span>}
                    </div>
                    <div className="mp-parity-mx">
                      <span>🇲🇽 México SNIIM ({entry.mexicoBenchmark.plazasCount || 1} plazas)</span>
                      <b>${fmtNum(entry.mexicoBenchmark.priceMxnKg)} <small>MXN/kg</small></b>
                    </div>
                    <div className="mp-parity-origins">
                      {(entry.origins || []).slice(0, 3).map((orig) => (
                        <div className="mp-parity-row" key={orig.symbol} title={`${orig.label} · ${orig.rawPrice} ${orig.rawUnit} · ${orig.conversionFormula}`}>
                          <span className="mp-parity-orig">{orig.originCountry}</span>
                          <span className="mp-parity-val">${fmtNum(orig.landedMxnKg)}</span>
                          <span className={`mp-parity-spread ${orig.spreadPct >= 12 ? 'ceiling' : orig.spreadPct <= -12 ? 'discount' : 'balanced'}`}>
                            {orig.spreadPct > 0 ? '+' : ''}{orig.spreadPct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
          {data.importParity.disclaimer && (
            <div className="mp-parity-note"><i className="fas fa-scale-balanced" /> {data.importParity.disclaimer}</div>
          )}
        </div>
      )}

      {data.livestockMargins?.available && (
        <div className="mp-margin-box" aria-label="Motor de Margen Ganadero y Playbook de Compra México">
          <div className="mp-parity-head">
            <div>
              <span className="mp-parity-kicker">
                <i className="fas fa-wheat-awn" /> MOTOR DE MARGEN GANADERO · PERCENTIL 52 SEMANAS Y PLAYBOOK DE COMPRA (MÉXICO)
              </span>
              <p className="mp-parity-sub">
                Cruza mediana nacional SNIIM contra costo de ración balanceada (Maíz + Soya CBOT × USD/MXN + molienda ref.), rango histórico y arbitraje de importación.
              </p>
            </div>
            <div className="mp-parity-fx">
              {data.livestockMargins.inputs?.cornUsdTon && <span>Maíz <b>${fmtNum(data.livestockMargins.inputs.cornUsdTon)}/t</b></span>}
              {data.livestockMargins.inputs?.soyUsdTon && <span>Soya <b>${fmtNum(data.livestockMargins.inputs.soyUsdTon)}/t</b></span>}
              {data.livestockMargins.inputs?.usdMxn && <span>USD/MXN <b>{fmtNum(data.livestockMargins.inputs.usdMxn)}</b></span>}
            </div>
          </div>

          <div className="mp-margin-grid">
            {(data.livestockMargins.species || [])
              .filter((row) => activeSpecies === 'all' || row.species === activeSpecies)
              .map((row) => {
                const stanceCls = row.playbook?.stance === 'COMPRAR_OPORTUNIDAD'
                  ? 'buy'
                  : row.playbook?.stance === 'COTIZAR_IMPORTACION'
                    ? 'import'
                    : row.playbook?.stance === 'CUBRIR_RIESGO'
                      ? 'hedge'
                      : 'neutral';
                const pct52 = row.range52w?.percentile52w ?? 50;
                return (
                  <div className="mp-margin-card" key={row.species}>
                    <div className="mp-margin-top">
                      <strong>{row.icon} {row.label}</strong>
                      <span className={`mp-margin-stance ${stanceCls}`}>{row.playbook?.label}</span>
                    </div>

                    <div className="mp-margin-kpis">
                      <div>
                        <span>Precio SNIIM</span>
                        <b>${fmtNum(row.mexicoPriceMxnKg)}/kg</b>
                      </div>
                      <div>
                        <span>Alimento/kg prod.</span>
                        <b>${fmtNum(row.feedCostPerKgMeatMxn)}/kg</b>
                      </div>
                      <div>
                        <span>Margen s/alimento</span>
                        <b className="pos">${fmtNum(row.grossMarginOverFeedMxnKg)} ({row.marginOverFeedPct}%)</b>
                      </div>
                      <div>
                        <span>Ratio Alim./Carne</span>
                        <b>{fmtNum(row.feedToMeatRatio)}x</b>
                      </div>
                    </div>

                    <div className="mp-margin-range">
                      <div className="mp-margin-range-head">
                        <span>{row.range52w?.rangeBasis === 'historico_52s' ? 'Rango 52s MX' : 'Rango plazas MX'}: ${fmtNum(row.range52w?.min52w)} – ${fmtNum(row.range52w?.max52w)}</span>
                        <b>Percentil {pct52} · {row.range52w?.zone}</b>
                      </div>
                      <div className="mp-margin-range-bar" aria-hidden="true">
                        <div className="mp-margin-range-dot" style={{ left: `${Math.max(4, Math.min(96, pct52))}%` }} />
                      </div>
                    </div>

                    <p className="mp-margin-rationale">{row.playbook?.rationale}</p>
                    <div className="mp-margin-foot">{row.feedFormula} · Ración ${fmtNum(row.balancedFeedMxnTon)} MXN/t</div>
                  </div>
                );
              })}
          </div>
          <div className="mp-parity-note"><i className="fas fa-circle-info" /> {data.livestockMargins.methodology}</div>
        </div>
      )}

      {data.nlpEvents?.bySpecies && (
        <div className="mp-nlp-box" aria-label="Radar NLP de Eventos Sanitarios y Comerciales">
          <div className="mp-nlp-head">
            <div>
              <span className="mp-nlp-kicker">
                <i className="fas fa-shield-virus" /> RADAR NLP DE EVENTOS SANITARIOS Y COMERCIALES (H5N1 · PPA · GUSANO BARRENADOR · ARANCELES)
              </span>
              <p className="mp-nlp-sub">
                Noticias internacionales recientes (ventana {data.nlpEvents.windowDays || 35} días) para contextualizar riesgos sanitarios y comerciales. Este contexto no modifica las probabilidades validadas del modelo.
              </p>
            </div>
            <div className="mp-nlp-stats">
              <span><b>{data.nlpEvents.stats?.relevantEventsDetected || 0}</b> eventos activos</span>
              <span><b>{data.nlpEvents.stats?.sanitaryAlertsCount || 0}</b> sanitarios</span>
              <span><b>{data.nlpEvents.stats?.tradeEventsCount || 0}</b> comerciales</span>
              <button
                type="button"
                className="mp-orion-cta sm"
                onClick={() => openInOrion({ kind: 'nlp' })}
              >
                <i className="fas fa-comments" /> Evaluar en ORION
              </button>
            </div>
          </div>

          <div className="mp-nlp-grid">
            {ESPECIES_ORDEN
              .filter((sp) => activeSpecies === 'all' || activeSpecies === sp.id)
              .map((sp) => {
                const ev = data.nlpEvents.bySpecies[sp.id];
                if (!ev) return null;
                const lvlCls = ev.riskScore >= 75 ? 'crit' : ev.riskScore >= 45 ? 'high' : ev.riskScore >= 18 ? 'mod' : 'low';
                const biasCls = ev.bias === 'ALCISTA' ? 'up' : ev.bias === 'BAJISTA' ? 'down' : 'flat';
                return (
                  <div className="mp-nlp-card" key={sp.id}>
                    <div className="mp-nlp-card-top">
                      <strong>{sp.icono} {sp.nombre}</strong>
                      <span className={`mp-nlp-lvl ${lvlCls}`}>{ev.riskLevel} · {ev.riskScore}/100</span>
                    </div>
                    <div className="mp-nlp-bar" aria-hidden="true">
                      <div className={`mp-nlp-bar-fill ${lvlCls}`} style={{ width: `${Math.max(4, Math.min(100, ev.riskScore))}%` }} />
                    </div>
                    <div className="mp-nlp-meta">
                      <span className={`mp-nlp-bias ${biasCls}`}>Sesgo: {ev.bias}</span>
                      <span>{ev.eventCount} noticias</span>
                    </div>
                    {ev.dominantType && <div className="mp-nlp-dom">{ev.dominantType}</div>}
                  </div>
                );
              })}
          </div>

          {(() => {
            const headlines = (data.nlpEvents.topEvents || [])
              .filter((ev) => (activeSpecies === 'all' || ev.species?.includes(activeSpecies)) && (region === 'ALL' || ev.regions?.includes(region)))
              .slice(0, 5);
            if (!headlines.length) return null;
            return (
              <div className="mp-nlp-list">
                {headlines.map((ev) => (
                  <a
                    key={ev.id || ev.url}
                    className="mp-nlp-item"
                    href={/^https?:\/\//i.test(ev.url || '') ? ev.url : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className={`mp-nlp-pill ${ev.priceImpact === 'ALCISTA' ? 'up' : ev.priceImpact === 'BAJISTA' ? 'down' : 'flat'}`}>
                      {ev.priceImpact}
                    </span>
                    <span className="mp-nlp-title">{ev.title}</span>
                    <span className="mp-nlp-src">{ev.source} · {ev.publishedAt?.slice(0, 10)}</span>
                  </a>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      <MarranasSimulator
        forecasts={data.forecasts || []}
        activeSpecies={activeSpecies}
        horizon={horizon}
        onOpenInOrion={openInOrion}
      />

      <div className="mp-ml-foot">
        <span><i className="fas fa-circle-info" /> {data.notice}</span>
        <span>Corte entrenado: {data.generatedAt ? new Date(data.generatedAt).toLocaleString('es-MX') : '—'}</span>
      </div>
    </section>
  );
}
