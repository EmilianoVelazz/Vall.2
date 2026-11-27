import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client.js';
import './AdminProfiles.css';

const STATUS_LABELS = {
  pending_human_review: 'Pendiente de revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

const REVIEW_STATUS_LABELS = {
  clean: 'Sin anomalías',
  ok: 'Validado',
  approved: 'Validado',
  flagged: 'Con observaciones',
  warning: 'Con observaciones',
  unknown: 'Registrado',
};

const DOMAIN_LABELS = {
  chat: 'Chat ORION',
  reports: 'Creación de informes',
  both: 'Chat + Informes',
};

const AUDIENCE_LABELS = {
  general: 'General',
  finance: 'Finanzas',
  purchasing: 'Compras',
  operations: 'Operaciones',
  commercial: 'Comercial',
};

const formatDate = value => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

const splitChainSteps = chain => String(chain || '')
  .split(/\s*(?:->|→)\s*/)
  .map(part => part.trim())
  .filter(Boolean);

const confidencePercent = score => {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return null;
  const pct = numeric > 1 ? Math.round(numeric) : Math.round(numeric * 100);
  return Math.max(0, Math.min(100, pct));
};

const METHOD_LABELS = {
  last_value: 'Persistencia (último valor)',
  ridge_all: 'Ridge Autorregresivo (histórico completo)',
  ridge_recent60: 'Ridge Autorregresivo (ventana 60)',
  ridge_changes60: 'Ridge Ponderado sobre Diferencias (ventana 60)',
  damped_drift20: 'Deriva Amortiguada (20 pasos)',
  damped_holt: 'Suavizamiento Exponencial Holt Amortiguado',
  log_ou_reversion: 'Reversión Estocástica Ornstein-Uhlenbeck (Log Ridge)',
  damped_holt_smoothing: 'Suavizamiento Exponencial Holt Amortiguado',
  log_ou_mean_reversion_ridge: 'Reversión Estocástica OU (Log Ridge)',
  fx_log_drift20: 'Deriva Logarítmica Cambiaria (FX)',
  fx_ou_ema20: 'Reversión Exponencial FX EMA-20',
  grain_damped60: 'Tendencia Amortiguada de Granos (60)',
  grain_seasonal252: 'Estacionalidad Agrícola Anual (252)',
  grain_reversion60: 'Reversión a la Media de Granos (60)',
  protein_reversion60: 'Reversión a la Media Pecuaria (60)',
  protein_ema20: 'Tendencia Exponencial Pecuaria EMA-20',
  general_ema20: 'Reversión Exponencial EMA-20',
  physical_level20: 'Nivel Físico Promedio (20)',
  physical_level12: 'Nivel Físico Semanal (12)',
  physical_seasonal52: 'Estacionalidad Semanal (52)',
};

const fmtNum = (val, digits = 2) => {
  const n = Number(val);
  return Number.isFinite(n) ? n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: digits }) : '—';
};

function WalkForwardChart({ trace = [], forecast = null, unit = '' }) {
  if (!Array.isArray(trace) || trace.length < 3) return null;
  const W = 680;
  const H = 220;
  const PAD_L = 54;
  const PAD_R = 24;
  const PAD_T = 18;
  const PAD_B = 34;

  const points = trace.map((t, idx) => ({
    idx,
    date: t.targetDate,
    actual: Number(t.actual),
    predicted: Number(t.predicted),
    lower: Number(t.lowerBound),
    upper: Number(t.upperBound),
  })).filter(p => Number.isFinite(p.actual) && Number.isFinite(p.predicted));

  if (points.length < 3) return null;

  const hasNext = Number.isFinite(Number(forecast?.value));
  const totalCount = points.length + (hasNext ? 1 : 0);
  const allVals = points.flatMap(p => [p.actual, p.predicted, p.lower, p.upper]).filter(Number.isFinite);
  if (hasNext) {
    allVals.push(Number(forecast.value));
    if (Number.isFinite(Number(forecast.lowerBound))) allVals.push(Number(forecast.lowerBound));
    if (Number.isFinite(Number(forecast.upperBound))) allVals.push(Number(forecast.upperBound));
  }
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = Math.max(maxV - minV, 1e-6);

  const xAt = i => PAD_L + (i / Math.max(1, totalCount - 1)) * (W - PAD_L - PAD_R);
  const yAt = v => PAD_T + (1 - (v - minV) / span) * (H - PAD_T - PAD_B);

  const upperPts = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.upper).toFixed(1)}`);
  const lowerPts = [...points].reverse().map((p, revIdx) => {
    const i = points.length - 1 - revIdx;
    return `${xAt(i).toFixed(1)},${yAt(p.lower).toFixed(1)}`;
  });
  const bandPolygon = [...upperPts, ...lowerPts].join(' ');
  const actualLine = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.actual).toFixed(1)}`).join(' ');
  const predLine = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.predicted).toFixed(1)}`).join(' ');

  const lastPt = points.at(-1);
  const nextX = xAt(points.length);
  const nextY = hasNext ? yAt(Number(forecast.value)) : null;

  return (
    <div className="ap-wf-chart-wrap">
      <div className="ap-wf-chart-head">
        <strong>Demostración Walk-Forward Fuera de Muestra (Real vs Predicción ML y Banda P90)</strong>
        <div className="ap-wf-legend">
          <span className="ap-wf-leg-actual">● Observado real</span>
          <span className="ap-wf-leg-pred">● Predicción ML</span>
          <span className="ap-wf-leg-band">■ Banda de error fuera de muestra</span>
          {hasNext && <span className="ap-wf-leg-next">◆ Proyección activa</span>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ap-wf-svg" role="img" aria-label="Gráfica de validación walk-forward real vs predicción">
        {[0, 0.5, 1].map((t, idx) => {
          const val = maxV - t * span;
          const y = PAD_T + t * (H - PAD_T - PAD_B);
          return (
            <g key={idx}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#284057" strokeDasharray="3 3" />
              <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#8da9c4">
                {fmtNum(val, 2)}
              </text>
            </g>
          );
        })}
        <polygon points={bandPolygon} fill="rgba(56, 189, 248, 0.14)" stroke="none" />
        <polyline fill="none" stroke="#34d399" strokeWidth="2.2" points={actualLine} />
        <polyline fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="5 3" points={predLine} />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={xAt(i)} cy={yAt(p.actual)} r="3" fill="#34d399">
              <title>{`${p.date} · Real: ${fmtNum(p.actual, 4)} ${unit} | Pred: ${fmtNum(p.predicted, 4)} ${unit}`}</title>
            </circle>
            <circle cx={xAt(i)} cy={yAt(p.predicted)} r="2.6" fill="#38bdf8" />
            {(i === 0 || i === Math.floor(points.length / 2) || i === points.length - 1) && (
              <text x={xAt(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#8da9c4">
                {p.date}
              </text>
            )}
          </g>
        ))}
        {hasNext && lastPt && (
          <g>
            {Number.isFinite(Number(forecast.lowerBound)) && Number.isFinite(Number(forecast.upperBound)) && (
              <line
                x1={nextX}
                y1={yAt(Number(forecast.upperBound))}
                x2={nextX}
                y2={yAt(Number(forecast.lowerBound))}
                stroke="#fbbf24"
                strokeWidth="3"
                strokeLinecap="round"
              />
            )}
            <line
              x1={xAt(points.length - 1)}
              y1={yAt(lastPt.actual)}
              x2={nextX}
              y2={nextY}
              stroke="#fbbf24"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
            <circle cx={nextX} cy={nextY} r="4.5" fill="#fbbf24" stroke="#0f1d2b" strokeWidth="1.5">
              <title>{`Proyección h=${forecast.horizon}: ${fmtNum(forecast.value, 4)} ${unit}`}</title>
            </circle>
            <text x={nextX} y={H - 10} textAnchor="end" fontSize="10" fontWeight="700" fill="#fcd34d">
              +{forecast.horizon}p
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default function AdminLoopus() {
  const [view, setView] = useState('rules');
  const [rows, setRows] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showcase, setShowcase] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState('ZC=F');
  const [selectedHorizon, setSelectedHorizon] = useState(3);
  const [trainingPredictions, setTrainingPredictions] = useState(false);
  const [reindexingVector, setReindexingVector] = useState(false);
  const [exportingSft, setExportingSft] = useState(false);
  const [marranasHealth, setMarranasHealth] = useState(null);
  const [marranasJob, setMarranasJob] = useState(null);
  const [marranasBusy, setMarranasBusy] = useState('');
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('pending_human_review');
  const [domainFilter, setDomainFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [batchApproving, setBatchApproving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState({});
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    if (view === 'predictions') {
      Promise.all([
        apiGet('/api/admin/loopus-predictions', { signal: controller.signal }),
        apiGet('/api/admin/loopus-intelligence', { signal: controller.signal }).catch(() => ({ ok: false })),
      ])
        .then(([predRes, intelRes]) => {
          if (!predRes.ok || !predRes.data?.success) throw Error(predRes.data?.error || 'No se pudieron cargar las predicciones de Loopus ML.');
          const sc = predRes.data.showcase || null;
          setShowcase(sc);
          if (intelRes.ok && intelRes.data?.success) {
            setIntelligence(intelRes.data.intelligence || null);
          }
          if (sc?.assets?.length) {
            setSelectedSymbol(cur => {
              const found = sc.assets.find(a => a.symbol === cur) || sc.assets[0];
              const bestH = found.horizons?.find(h => h.eligible) || found.horizons?.[0];
              if (bestH) setSelectedHorizon(bestH.horizon);
              return found.symbol;
            });
          }
        })
        .catch(e => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }

    if (view === 'marranas') {
      apiGet('/api/admin/vall-proteinas/health', { signal: controller.signal })
        .then(({ ok, data }) => {
          if (!ok || !data?.success) throw Error(data?.error || 'No se pudo cargar el tablero de salud de VALL-Proteínas.');
          setMarranasHealth(data.health || null);
          setMarranasJob(data.jobStatus || null);
        })
        .catch(e => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }

    if (view === 'reviews') {
      apiGet('/api/admin/loopus-reviews?limit=30', { signal: controller.signal })
        .then(({ ok, data }) => {
          if (!ok || !data?.success) throw Error(data?.error || 'No se pudieron cargar las auditorías de mercado.');
          setReviews(data.reviews || []);
        })
        .catch(e => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }

    const params = new URLSearchParams({ limit: '80' });
    if (filter) params.set('status', filter);
    if (domainFilter) params.set('domain', domainFilter);
    if (debouncedSearch) params.set('q', debouncedSearch);
    apiGet(`/api/admin/loopus-proposals?${params.toString()}`, { signal: controller.signal })
      .then(({ ok, data }) => {
        if (!ok || !data?.success) throw Error(data?.error || 'No se pudieron cargar las propuestas de Proyecto Loopus.');
        setRows(data.proposals || []);
        if (data.stats) setStats(data.stats);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [view, filter, domainFilter, debouncedSearch, revision]);

  useEffect(() => {
    if (view !== 'marranas' || !marranasJob?.running) return undefined;
    const timer = setInterval(() => {
      apiGet('/api/admin/vall-proteinas/health')
        .then(({ ok, data }) => {
          if (ok && data?.success) {
            setMarranasHealth(data.health || null);
            setMarranasJob(data.jobStatus || null);
            if (!data.jobStatus?.running) {
              setNotice(
                data.jobStatus?.lastError
                  ? `Re-entrenamiento de VALL-Proteínas finalizado con error: ${data.jobStatus.lastError}`
                  : `VALL-Proteínas reentrenado (${data.jobStatus?.lastSummary?.activeModels || 0} modelos · WF ${data.jobStatus?.lastSummary?.avgWalkForwardDirectionalAccuracyPct ?? '—'}%).`
              );
            }
          }
        })
        .catch(() => {});
    }, 12000);
    return () => clearInterval(timer);
  }, [view, marranasJob?.running]);

  async function triggerMarranasAction(mode) {
    if (marranasBusy || marranasJob?.running) return;
    setMarranasBusy(mode);
    setError('');
    setNotice('');
    try {
      const { ok, data } = await apiPost('/api/admin/vall-proteinas/retrain', { mode }, { timeoutMs: 45_000 });
      if (!ok || !data?.success) throw Error(data?.error || 'No se pudo ejecutar la acción de VALL-Proteínas.');
      if (data.health) setMarranasHealth(data.health);
      if (data.jobStatus) setMarranasJob(data.jobStatus);
      if (mode === 'full') {
        setNotice(data.message || 'Re-entrenamiento completo de VALL-Proteínas iniciado en segundo plano.');
      } else if (mode === 'nlp') {
        setNotice(`Radar NLP actualizado: ${data.nlpEvents?.stats?.relevantEventsDetected || 0} eventos detectados (${data.nlpEvents?.stats?.sanitaryAlertsCount || 0} sanitarios).`);
      } else if (mode === 'audit') {
        setNotice(`Auditoría Closed-Loop en Dokploy completada (${data.auditResult?.totalEvaluated || 0} evaluaciones · P80 ${data.auditResult?.conformal80CoveragePct ?? '—'}% · MAPE ${data.auditResult?.avgMapePct ?? '—'}%).`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setMarranasBusy('');
    }
  }

  async function review(row, nextStatus) {
    if (savingId !== null || batchApproving) return;
    setSavingId(row.id);
    setError('');
    setNotice('');
    try {
      const reviewNotes = (notes[row.id] ?? row.review_notes ?? '').trim();
      const { ok, data } = await apiPost(`/api/admin/loopus-proposals/${row.id}/review`, {
        status: nextStatus,
        reviewNotes,
      });
      if (!ok || !data?.success) throw Error(data?.error || 'No se pudo guardar la revisión.');
      setNotes(cur => {
        if (!(row.id in cur)) return cur;
        const next = { ...cur };
        delete next[row.id];
        return next;
      });
      setNotice(`Propuesta #${String(row.id).slice(0, 8)} marcada como "${STATUS_LABELS[nextStatus] || nextStatus}".`);
      setRevision(v => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function approveHighConfidenceBatch() {
    if (savingId !== null || batchApproving) return;
    setBatchApproving(true);
    setError('');
    setNotice('');
    try {
      const { ok, data } = await apiPost('/api/admin/loopus-proposals/approve-high-confidence', {
        minConfidence: 90,
        limit: 50,
        ...(domainFilter ? { domain: domainFilter } : {}),
      });
      if (!ok || !data?.success) throw Error(data?.error || 'No se pudo completar la aprobación en lote.');
      setNotice(
        data.approvedCount > 0
          ? `Se aprobaron ${data.approvedCount} reglas de alta confianza (≥90%) en PostgreSQL (Dokploy).`
          : 'No había reglas pendientes con confianza ≥90% en este filtro.'
      );
      setRevision(v => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBatchApproving(false);
    }
  }

  async function retrainPredictions() {
    if (trainingPredictions || savingId !== null || batchApproving) return;
    setTrainingPredictions(true);
    setError('');
    setNotice('');
    try {
      const { ok, data } = await apiPost('/api/admin/loopus-predictions/train', {}, { timeoutMs: 90_000 });
      if (!ok || !data?.success) throw Error(data?.error || 'No se pudo ejecutar el entrenamiento predictivo.');
      if (data.showcase) setShowcase(data.showcase);
      setNotice(
        `Modelos predictivos re-entrenados (${data.showcase?.summary?.eligibleModelsCount || 0}/${data.showcase?.summary?.totalModelsEvaluated || 0} horizontes superan baseline; +${data.rulesDistilled || 0} reglas cuantitativas destiladas).`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setTrainingPredictions(false);
    }
  }

  async function reindexKnowledge() {
    if (reindexingVector || trainingPredictions || savingId !== null || batchApproving) return;
    setReindexingVector(true);
    setError('');
    setNotice('');
    try {
      const { ok, data } = await apiPost('/api/admin/loopus-knowledge/reindex', {}, { timeoutMs: 60_000 });
      if (!ok || !data?.success) throw Error(data?.error || 'No se pudo re-indexar la base vectorial RAG.');
      setIntelligence(cur => ({
        ...(cur || {}),
        vectorIndex: data.vectorIndex || cur?.vectorIndex,
        feedback: data.feedback || cur?.feedback,
      }));
      setNotice(
        `RAG vectorial actualizado: ${data.indexResult?.totalDocs || 0} documentos (${data.indexResult?.embeddedCount || 0} con embeddings); Closed-Loop: +${data.closedLoopResult?.proposalsCreated || 0} reglas, +${data.closedLoopResult?.exemplarsPromoted || 0} ejemplares.`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setReindexingVector(false);
    }
  }

  async function downloadSft(format = 'gemini') {
    if (exportingSft) return;
    setExportingSft(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/loopus-sft-export?format=${encodeURIComponent(format)}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Error(body.error || 'No se pudo exportar el dataset SFT.');
      }
      const blob = await res.blob();
      const count = res.headers.get('x-vall-sft-count') || '';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vallnews-orion-sft-${format}.jsonl`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Dataset SFT (${format}) exportado${count ? ` con ${count} ejemplos curados` : ''}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setExportingSft(false);
    }
  }

  const activeAsset = showcase?.assets?.find(a => a.symbol === selectedSymbol) || showcase?.assets?.[0] || null;
  const activeHorizonModel = activeAsset?.horizons?.find(h => h.horizon === Number(selectedHorizon))
    || activeAsset?.horizons?.find(h => h.eligible)
    || activeAsset?.horizons?.[0]
    || null;

  return (
    <section className="ap-profiles" aria-label="Revisión de Proyecto Loopus">
      <div className="ap-intro">
        <div>
          <h3>Propuestas y Validaciones de Proyecto Loopus</h3>
          <p>Supervisa el conocimiento almacenado en PostgreSQL (Dokploy) para Chat ORION e Informes, inspecciona cadenas causales y valida auditorías de mercado.</p>
          <p>La aprobación de una regla y el permiso para compartirla son revisiones distintas. Las conversaciones privadas y las preguntas de evaluación quedan fuera del conocimiento compartido.</p>
          <div className="ap-loopus-tabs" role="tablist" aria-label="Vistas de Loopus">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'rules'}
              className={`ap-tab-btn${view === 'rules' ? ' is-active' : ''}`}
              onClick={() => setView('rules')}
            >
              Reglas de raciocinio {stats ? `(${stats.total})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'reviews'}
              className={`ap-tab-btn${view === 'reviews' ? ' is-active' : ''}`}
              onClick={() => setView('reviews')}
            >
              Auditorías de mercado {stats?.reviewsCount != null ? `(${stats.reviewsCount})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'predictions'}
              className={`ap-tab-btn${view === 'predictions' ? ' is-active' : ''}`}
              onClick={() => setView('predictions')}
            >
              Predicciones y Demostraciones ML {showcase?.summary ? `(${showcase.summary.eligibleModelsCount}/${showcase.summary.totalModelsEvaluated})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'marranas'}
              className={`ap-tab-btn${view === 'marranas' ? ' is-active' : ''}`}
              onClick={() => setView('marranas')}
            >
              VALL-Proteínas ML {marranasHealth?.stats?.activeModels ? `(${marranasHealth.stats.activeModels})` : ''}
            </button>
          </div>
        </div>
        {view === 'rules' ? (
          <div className="ap-actions">
            <label className="ac-field">
              <span>Estado</span>
              <select value={filter} disabled={loading || savingId !== null || batchApproving} onChange={e => setFilter(e.target.value)}>
                <option value="pending_human_review">Pendientes</option>
                <option value="approved">Aprobadas</option>
                <option value="rejected">Rechazadas</option>
                <option value="">Todas</option>
              </select>
            </label>
            <label className="ac-field">
              <span>Dominio</span>
              <select value={domainFilter} disabled={loading || savingId !== null || batchApproving} onChange={e => setDomainFilter(e.target.value)}>
                <option value="">Todos</option>
                <option value="chat">Chat ORION</option>
                <option value="reports">Creación de informes</option>
                <option value="both">Chat + Informes</option>
              </select>
            </label>
            <label className="ac-field">
              <span>Buscar</span>
              <input
                type="search"
                placeholder="Tema, disparador o criterio…"
                value={search}
                disabled={savingId !== null || batchApproving}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ac-btn"
              disabled={loading || savingId !== null || batchApproving}
              onClick={() => void approveHighConfidenceBatch()}
            >
              {batchApproving ? 'Aprobando lote…' : 'Aprobar lote ≥90%'}
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading || savingId !== null || batchApproving}
              onClick={() => setRevision(v => v + 1)}
            >
              Actualizar
            </button>
          </div>
        ) : view === 'predictions' ? (
          <div className="ap-actions">
            <button
              type="button"
              className="ac-btn"
              disabled={loading || trainingPredictions || reindexingVector}
              onClick={() => void retrainPredictions()}
            >
              {trainingPredictions ? 'Entrenando modelos walk-forward…' : 'Re-entrenar Modelos ML'}
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading || trainingPredictions || reindexingVector}
              onClick={() => void reindexKnowledge()}
            >
              {reindexingVector ? 'Indexando RAG…' : 'Re-indexar RAG Vectorial'}
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading || exportingSft}
              onClick={() => void downloadSft('gemini')}
            >
              Exportar SFT Gemini (.jsonl)
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading || exportingSft}
              onClick={() => void downloadSft('openai_chat')}
            >
              Exportar SFT LoRA (.jsonl)
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading || trainingPredictions}
              onClick={() => setRevision(v => v + 1)}
            >
              Recargar demostraciones
            </button>
          </div>
        ) : view === 'marranas' ? (
          <div className="ap-actions">
            <button
              type="button"
              className="ac-btn"
              disabled={loading || Boolean(marranasBusy) || Boolean(marranasJob?.running)}
              onClick={() => void triggerMarranasAction('full')}
            >
              {marranasJob?.running || marranasBusy === 'full' ? 'Re-entrenando ORION ML…' : 'Re-entrenar ORION ML'}
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading || Boolean(marranasBusy) || Boolean(marranasJob?.running)}
              onClick={() => void triggerMarranasAction('audit')}
            >
              {marranasBusy === 'audit' ? 'Auditando Dokploy DB…' : 'Auditar Closed-Loop'}
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading || Boolean(marranasBusy) || Boolean(marranasJob?.running)}
              onClick={() => void triggerMarranasAction('nlp')}
            >
              {marranasBusy === 'nlp' ? 'Escaneando noticias…' : 'Refrescar Radar NLP'}
            </button>
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading}
              onClick={() => setRevision(v => v + 1)}
            >
              Actualizar
            </button>
          </div>
        ) : (
          <div className="ap-actions">
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              disabled={loading}
              onClick={() => setRevision(v => v + 1)}
            >
              Actualizar auditorías
            </button>
          </div>
        )}
      </div>

      {stats && (
        <div className="ap-loopus-kpis" aria-label="Resumen en PostgreSQL">
          <article className="ap-loopus-kpi">
            <span>Acervo en PostgreSQL</span>
            <strong>{stats.total}</strong>
            <small>{stats.runsCount} corridas · {stats.eventsCount} eventos</small>
          </article>
          <article className="ap-loopus-kpi">
            <span>Cadenas causales</span>
            <strong>{stats.withReasoningChain}</strong>
            <small>{stats.highConfidence} de alta confianza (≥82%)</small>
          </article>
          <article className="ap-loopus-kpi">
            <span>Cobertura por canal</span>
            <strong>{(stats.byDomain?.chat || 0) + (stats.byDomain?.both || 0)} / {(stats.byDomain?.reports || 0) + (stats.byDomain?.both || 0)}</strong>
            <small>Propuestas para Chat / Informes</small>
          </article>
          <article className="ap-loopus-kpi">
            <span>Validación humana</span>
            <strong>{stats.byStatus?.approved || 0} aprob.</strong>
            <small>{stats.byStatus?.pending_human_review || 0} pendientes · {stats.byStatus?.rejected || 0} rech.</small>
          </article>
        </div>
      )}

      {loading && <p role="status">Consultando información de Loopus en PostgreSQL (Dokploy)…</p>}
      {error && <p className="ap-error" role="alert">{error}</p>}
      {notice && <p className="ap-notice" role="status">{notice}</p>}

      {view === 'rules' && !loading && !rows.length && !error && (
        <p>No hay propuestas {filter ? `con estado «${STATUS_LABELS[filter] || filter}»` : 'registradas'} con ese filtro.</p>
      )}

      {view === 'rules' && !!rows.length && (
        <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Tabla de propuestas Loopus">
          <table>
            <caption>Mostrando {rows.length} reglas sincronizadas con PostgreSQL (Dokploy)</caption>
            <thead>
              <tr>
                <th scope="col">Tema / Disparador</th>
                <th scope="col">Criterio y Cadena Causal</th>
                <th scope="col">Confianza</th>
                <th scope="col">Validación</th>
                <th scope="col">Revisión</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const pct = confidencePercent(row.confidence_score);
                const chainSteps = splitChainSteps(row.reasoning_chain);
                return (
                  <tr key={row.id}>
                    <th scope="row">
                      <div className="ap-loopus-pills">
                        <span className={`ap-pill ap-pill--domain-${row.domain || 'both'}`}>
                          {DOMAIN_LABELS[row.domain] || 'Chat + Informes'}
                        </span>
                        {row.audience && row.audience !== 'general' && (
                          <span className="ap-pill ap-pill--audience">
                            {AUDIENCE_LABELS[row.audience] || row.audience}
                          </span>
                        )}
                        {row.model && (
                          <span className="ap-pill ap-pill--model">{row.model}</span>
                        )}
                      </div>
                      <strong>#{String(row.id).slice(0, 8)} · {row.topic || 'general'}</strong>
                      <span>{row.condition_trigger}</span>
                      <small>{formatDate(row.created_at)}</small>
                    </th>
                    <td data-label="Criterio y Cadena Causal">
                      <div className="ap-loopus-rule">{row.learned_rule}</div>
                      {chainSteps.length > 0 && (
                        <div className="ap-loopus-chain" aria-label="Cadena lógica causal">
                          {chainSteps.map((step, idx) => (
                            <span key={idx} className="ap-chain-step">{step}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td data-label="Confianza">
                      {pct !== null ? (
                        <div className="ap-confidence">
                          <strong>{pct}%</strong>
                          <div className="ap-confidence-bar" aria-hidden="true">
                            <span style={{ width: `${pct}%` }} className={pct >= 82 ? 'is-high' : 'is-mid'} />
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td data-label="Validación">
                      <span className={`ap-status-badge is-${row.status || 'pending_human_review'}`}>
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                      {row.reviewed_at && <small className="ap-reviewed-at">{formatDate(row.reviewed_at)}</small>}
                    </td>
                    <td data-label="Revisión">
                      <div className="ap-actions">
                        <input
                          type="text"
                          aria-label={`Nota de revisión para propuesta ${row.id}`}
                          maxLength={500}
                          placeholder="Nota opcional…"
                          value={notes[row.id] ?? row.review_notes ?? ''}
                          disabled={savingId !== null || batchApproving}
                          onChange={e => setNotes(cur => ({ ...cur, [row.id]: e.target.value }))}
                        />
                        {row.status !== 'approved' && (
                          <button
                            type="button"
                            className="ac-btn"
                            disabled={savingId !== null || batchApproving}
                            onClick={() => void review(row, 'approved')}
                          >
                            {savingId === row.id ? 'Guardando…' : 'Aprobar'}
                          </button>
                        )}
                        {row.status !== 'rejected' && (
                          <button
                            type="button"
                            className="ac-btn ac-btn-secondary"
                            disabled={savingId !== null || batchApproving}
                            onClick={() => void review(row, 'rejected')}
                          >
                            Rechazar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'reviews' && !loading && !reviews.length && !error && (
        <p>No hay auditorías de integridad de mercado registradas aún en PostgreSQL (Dokploy).</p>
      )}

      {view === 'reviews' && !!reviews.length && (
        <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Tabla de auditorías de mercado">
          <table>
            <caption>Últimas {reviews.length} auditorías estadísticas (`ml_market_reviews`)</caption>
            <thead>
              <tr>
                <th scope="col">Fuente / Fecha</th>
                <th scope="col">Estado</th>
                <th scope="col">Anomalías detectadas (z-score / IQR)</th>
                <th scope="col">Diagnóstico IA</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(rev => {
                const statusKey = String(rev.review_status || 'unknown').toLowerCase();
                const badgeClass = ['clean', 'ok', 'approved'].includes(statusKey)
                  ? 'is-approved'
                  : ['flagged', 'warning'].includes(statusKey)
                  ? 'is-pending_human_review'
                  : 'is-rejected';
                return (
                  <tr key={rev.id}>
                    <th scope="row">
                      <strong>{rev.source_name || 'Mercado'}</strong>
                      <small>{formatDate(rev.created_at)}</small>
                    </th>
                    <td data-label="Estado">
                      <span className={`ap-status-badge ${badgeClass}`}>
                        {REVIEW_STATUS_LABELS[statusKey] || rev.review_status}
                      </span>
                    </td>
                    <td data-label="Anomalías">
                      {rev.deterministicIssues?.length ? (
                        <ul className="ap-review-issues">
                          {rev.deterministicIssues.slice(0, 5).map((issue, idx) => (
                            <li key={idx}>{typeof issue === 'string' ? issue : JSON.stringify(issue)}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="ap-reviewed-at">Sin desviaciones estadísticas fuera de rango.</span>
                      )}
                    </td>
                    <td data-label="Diagnóstico IA">
                      <div>{rev.modelSummary || (rev.modelStatus ? `Estado modelo: ${rev.modelStatus}` : 'Revisión automática completada')}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'predictions' && !loading && showcase && (
        <div className="ap-pred-container" aria-label="Laboratorio de Predicciones y Demostraciones ML">
          <div className="ap-loopus-kpis" aria-label="KPIs Predictivos Walk-Forward">
            <article className="ap-loopus-kpi">
              <span>Horizontes Validados</span>
              <strong>{showcase.summary?.eligibleModelsCount || 0} / {showcase.summary?.totalModelsEvaluated || 0}</strong>
              <small>Superan baseline fuera de muestra (MAE)</small>
            </article>
            <article className="ap-loopus-kpi">
              <span>Mejora Media vs Baseline</span>
              <strong>+{fmtNum(showcase.summary?.avgImprovementPct, 2)}%</strong>
              <small>Reducción de error absoluto medio</small>
            </article>
            <article className="ap-loopus-kpi">
              <span>Precisión Direccional</span>
              <strong>{fmtNum(showcase.summary?.avgDirectionAccuracyPct, 1)}%</strong>
              <small>Acierto de signo en validación walk-forward</small>
            </article>
            <article className="ap-loopus-kpi">
              <span>Cobertura de Rango (P90)</span>
              <strong>{showcase.summary?.avgIntervalCoveragePct != null ? `${fmtNum(showcase.summary.avgIntervalCoveragePct, 1)}%` : '—'}</strong>
              <small>Observaciones dentro de banda empírica</small>
            </article>
            <article className="ap-loopus-kpi">
              <span>Vectores RAG</span>
              <strong>{intelligence?.vectorIndex?.total ?? 0}</strong>
              <small>{intelligence?.vectorIndex?.withEmbedding ?? 0} embeddings · {intelligence?.vectorIndex?.hasSupabase ? 'pgvector+local' : 'BM25+RRF local'}</small>
            </article>
            <article className="ap-loopus-kpi">
              <span>Modelos ARX Multivariables</span>
              <strong>{showcase.summary?.multivariateModelsCount ?? intelligence?.multivariateCount ?? 0}</strong>
              <small>{showcase.summary?.multivariateBeatsUnivariateCount ?? 0} superan al AR univariado</small>
            </article>
            <article className="ap-loopus-kpi">
              <span>Anomalías no supervisadas</span>
              <strong>{showcase.unsupervisedDiagnostics?.anomalyCount ?? intelligence?.unsupervised?.anomalyCount ?? 0}</strong>
              <small>Isolation Forest + z-MAD ({showcase.unsupervisedDiagnostics?.regimeCount ?? intelligence?.unsupervised?.regimeCount ?? 0} regímenes)</small>
            </article>
            <article className="ap-loopus-kpi">
              <span>Ejemplos SFT curados</span>
              <strong>{intelligence?.sftReadiness?.count ?? '—'}</strong>
              <small>Closed-Loop: {intelligence?.feedback?.pendingLoopusCount ?? 0} eventos pendientes</small>
            </article>
          </div>

          <div className="ap-pred-asset-bar" role="tablist" aria-label="Activos entrenados">
            {(showcase.assets || []).map(asset => {
              const wins = (asset.horizons || []).filter(h => h.eligible).length;
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  className={`ap-asset-pill${activeAsset?.symbol === asset.symbol ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedSymbol(asset.symbol);
                    const pref = asset.horizons?.find(h => h.eligible) || asset.horizons?.[0];
                    if (pref) setSelectedHorizon(pref.horizon);
                  }}
                >
                  <strong>{asset.symbol}</strong>
                  <span>{asset.label.split('·')[0].trim()}</span>
                  <small className={wins > 0 ? 'is-win' : ''}>{wins}/{asset.horizons?.length || 0} aptos</small>
                </button>
              );
            })}
          </div>

          {activeAsset && activeHorizonModel && (
            <div className="ap-pred-grid">
              <div className="ap-pred-card ap-pred-card--main">
                <div className="ap-pred-card-head">
                  <div>
                    <div className="ap-loopus-pills">
                      <span className="ap-pill ap-pill--domain-both">{activeAsset.category}</span>
                      <span className="ap-pill ap-pill--model">{activeAsset.source}</span>
                      <span className="ap-pill">Corte: {activeAsset.cutoff} ({activeAsset.observations} obs.)</span>
                    </div>
                    <h4>{activeAsset.label} ({activeAsset.symbol})</h4>
                  </div>
                  <div className="ap-horizon-tabs" role="group" aria-label="Horizonte de pronóstico">
                    {(activeAsset.horizons || []).map(h => (
                      <button
                        key={h.horizon}
                        type="button"
                        className={`ap-horizon-btn${activeHorizonModel.horizon === h.horizon ? ' is-active' : ''}${h.eligible ? ' is-eligible' : ''}`}
                        onClick={() => setSelectedHorizon(h.horizon)}
                      >
                        h={h.horizon} ({activeAsset.interval}) {h.eligible ? '✓' : '·'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ap-pred-numbers">
                  <div className="ap-pred-stat">
                    <span>Último cierre verificado</span>
                    <strong>{fmtNum(activeAsset.lastValue, 4)} <small>{activeAsset.unit}</small></strong>
                  </div>
                  <div className="ap-pred-stat">
                    <span>Proyección ML (h={activeHorizonModel.horizon})</span>
                    <strong>
                      {activeHorizonModel.forecast ? `${fmtNum(activeHorizonModel.forecast.value, 4)} ` : 'Abstención '}
                      <small>{activeHorizonModel.forecast ? activeAsset.unit : ''}</small>
                    </strong>
                    {activeHorizonModel.forecast && (
                      <small className={activeHorizonModel.forecast.changePct >= 0 ? 'is-up' : 'is-down'}>
                        {activeHorizonModel.forecast.changePct >= 0 ? '+' : ''}{fmtNum(activeHorizonModel.forecast.changePct, 2)}% esperado
                      </small>
                    )}
                  </div>
                  <div className="ap-pred-stat">
                    <span>Banda Fuera de Muestra (P90)</span>
                    <strong>
                      {activeHorizonModel.forecast
                        ? `${fmtNum(activeHorizonModel.forecast.lowerBound, 3)} – ${fmtNum(activeHorizonModel.forecast.upperBound, 3)}`
                        : '—'}
                    </strong>
                    <small>{activeAsset.unit} (errores históricos conocidos)</small>
                    {activeHorizonModel.forecast?.conformal90 && (
                      <div className="ap-conformal-row">
                        <span className="ap-pill">
                          Conformal 90%: {fmtNum(activeHorizonModel.forecast.conformal90.lowerBound, 3)}–{fmtNum(activeHorizonModel.forecast.conformal90.upperBound, 3)} ({fmtNum((activeHorizonModel.forecast.conformal90.empiricalCoverage || 0) * 100, 1)}%)
                        </span>
                        {activeHorizonModel.forecast?.conformal80 && (
                          <span className="ap-pill">
                            80%: {fmtNum(activeHorizonModel.forecast.conformal80.lowerBound, 3)}–{fmtNum(activeHorizonModel.forecast.conformal80.upperBound, 3)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="ap-pred-stat">
                    <span>Validación MAE (Modelo vs Baseline)</span>
                    <strong>{fmtNum(activeHorizonModel.evaluation?.modelMae, 4)} vs {fmtNum(activeHorizonModel.evaluation?.baselineMae, 4)}</strong>
                    <small className={activeHorizonModel.eligible ? 'is-up' : ''}>
                      {activeHorizonModel.eligible
                        ? `Supera baseline (+${fmtNum(activeHorizonModel.evaluation?.improvementPct, 2)}% | Dir: ${fmtNum(activeHorizonModel.evaluation?.directionAccuracyPct, 1)}%)`
                        : (activeHorizonModel.reason || 'Abstención prudente: no supera el umbral de 2% vs último valor')}
                    </small>
                  </div>
                </div>

                <WalkForwardChart
                  trace={activeHorizonModel.validationTrace}
                  forecast={activeHorizonModel.forecast}
                  unit={activeAsset.unit}
                />
              </div>

              <div className="ap-pred-side">
                <div className="ap-pred-card">
                  <h4>Pesos Aprendidos del Ensamble Adaptativo</h4>
                  <p className="ap-pred-sub">
                    Motor activo: <code>{activeHorizonModel.selectedStrategy}</code> (v{activeHorizonModel.modelVersion})
                  </p>
                  {activeHorizonModel.ensembleWeights ? (
                    <div className="ap-weight-list">
                      {Object.entries(activeHorizonModel.ensembleWeights)
                        .sort(([, a], [, b]) => Number(b) - Number(a))
                        .map(([method, weight]) => {
                          const pct = Math.round(Number(weight) * 1000) / 10;
                          const candidateVal = activeHorizonModel.candidateForecasts?.[method];
                          const biasVal = activeHorizonModel.biasCorrections?.[method];
                          return (
                            <div key={method} className="ap-weight-item">
                              <div className="ap-weight-row">
                                <span>{METHOD_LABELS[method] || method}</span>
                                <strong>{pct}%</strong>
                              </div>
                              <div className="ap-confidence-bar">
                                <span style={{ width: `${Math.min(100, pct)}%` }} className={pct >= 20 ? 'is-high' : 'is-mid'} />
                              </div>
                              {candidateVal != null && (
                                <small>
                                  Estimación: {fmtNum(candidateVal, 4)} {activeAsset.unit}
                                  {biasVal ? ` · Ajuste sesgo: ${biasVal >= 0 ? '+' : ''}${fmtNum(biasVal, 4)}` : ''}
                                </small>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="ap-pred-sub">Selección por malla cronológica Ridge (`temporal_grid_ridge`).</p>
                  )}
                </div>

                {activeAsset.regime && (
                  <div className="ap-pred-card">
                    <h4>Régimen Cuantitativo de Mercado</h4>
                    <div className="ap-loopus-pills">
                      <span className="ap-pill ap-pill--domain-chat">{activeAsset.regime.regimeLabel}</span>
                      <span className="ap-pill ap-pill--audience">{activeAsset.regime.trendLabel}</span>
                    </div>
                    <ul className="ap-regime-list">
                      <li><span>Promedio 20 / 60 pasos:</span> <strong>{fmtNum(activeAsset.regime.mean20, 3)} / {fmtNum(activeAsset.regime.mean60, 3)}</strong></li>
                      <li><span>Volatilidad 20p / 60p:</span> <strong>{fmtNum(activeAsset.regime.volatility20Pct, 2)}% / {fmtNum(activeAsset.regime.volatility60Pct, 2)}% (ratio {fmtNum(activeAsset.regime.volatilityRatio, 2)}x)</strong></li>
                      <li><span>Z-Score (20 pasos):</span> <strong>{fmtNum(activeAsset.regime.zScore20, 2)} σ</strong></li>
                      <li><span>Momentum (20 pasos):</span> <strong>{activeAsset.regime.momentum20Pct >= 0 ? '+' : ''}{fmtNum(activeAsset.regime.momentum20Pct, 2)}%</strong></li>
                      <li><span>Autocorrelación retorno (Lag-1):</span> <strong>{fmtNum(activeAsset.regime.returnAutocorrLag1, 3)}</strong></li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {showcase.crossAssetDemo && (
            <div className="ap-pred-card ap-pred-card--cross">
              <h4>{showcase.crossAssetDemo.title}</h4>
              <p className="ap-pred-sub">
                Fórmula encadenada: <code>{showcase.crossAssetDemo.formula}</code> · Conecta pronósticos cuantitativos con decisiones de compras pecuarias e informes ejecutivos.
              </p>
              <div className="ap-loopus-kpis">
                <article className="ap-loopus-kpi">
                  <span>Ración Balanceada Spot</span>
                  <strong>${fmtNum(showcase.crossAssetDemo.outputs?.feedCostMxnTonSpot, 2)} MXN/t</strong>
                  <small>70% Maíz + 30% Soya al tipo de cambio actual</small>
                </article>
                <article className="ap-loopus-kpi">
                  <span>Ración Proyectada ML</span>
                  <strong>${fmtNum(showcase.crossAssetDemo.outputs?.feedCostMxnTonPredicted, 2)} MXN/t</strong>
                  <small>Variación proyectada: {showcase.crossAssetDemo.outputs?.feedCostChangePct >= 0 ? '+' : ''}{fmtNum(showcase.crossAssetDemo.outputs?.feedCostChangePct, 2)}%</small>
                </article>
                <article className="ap-loopus-kpi">
                  <span>Banda Estrés P90 (Alimento)</span>
                  <strong>${fmtNum(showcase.crossAssetDemo.outputs?.feedCostMxnTonStressBand, 2)} MXN/t</strong>
                  <small>Techo de cobertura cambiaria + granos</small>
                </article>
                <article className="ap-loopus-kpi">
                  <span>Costo Alimento / kg Vivo</span>
                  <strong>Cerdo: ${fmtNum(showcase.crossAssetDemo.outputs?.estimatedPorkFeedCostMxnKgLive, 2)} · Pollo: ${fmtNum(showcase.crossAssetDemo.outputs?.estimatedPoultryFeedCostMxnKgLive, 2)}</strong>
                  <small>Conversión FCR 2.85x (cerdo) y 1.72x (pollo)</small>
                </article>
              </div>
              <div className="ap-table-wrap" style={{ marginTop: '.75rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Escenario Cuantitativo</th>
                      <th scope="col">Costo Ración (MXN/ton)</th>
                      <th scope="col">Paridad Porcina CME (MXN/kg)</th>
                      <th scope="col">Mecanismo de Transmisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showcase.crossAssetDemo.scenarios || []).map((sc, i) => (
                      <tr key={i}>
                        <th scope="row"><strong>{sc.name}</strong></th>
                        <td data-label="Costo Ración">${fmtNum(sc.feedMxnTon, 2)} MXN/t</td>
                        <td data-label="Paridad Porcina">${fmtNum(sc.porkParityMxnKg, 2)} MXN/kg</td>
                        <td data-label="Mecanismo">{sc.driver}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {Array.isArray(showcase.multivariateModels) && showcase.multivariateModels.length > 0 && (
            <div className="ap-pred-card ap-pred-card--cross">
              <h4>Modelos Multivariables (Ridge-ARX) vs Univariado y Conformal</h4>
              <p className="ap-pred-sub">
                Alineación estricta sin fuga futura (<code>exog.date ≤ target.date</code>) con estacionalidad Fourier y calibración conformal adaptativa.
              </p>
              <div className="ap-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Modelo / Objetivo</th>
                      <th scope="col">Último -&gt; ARX (h=1)</th>
                      <th scope="col">MAE ARX vs Uni vs Base</th>
                      <th scope="col">Conformal 80% / 90%</th>
                      <th scope="col">Principales Impulsores Exógenos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showcase.multivariateModels.map(mv => (
                      <tr key={mv.id}>
                        <th scope="row">
                          <strong>{mv.label}</strong>
                          <span>{mv.observations} obs. alineadas · corte {mv.cutoff}</span>
                        </th>
                        <td data-label="Proyección">
                          <strong>{fmtNum(mv.lastValue, 3)} -&gt; {fmtNum(mv.forecast?.value, 3)}</strong>
                          {mv.forecast && <small className="ap-reviewed-at">{mv.forecast.changePct >= 0 ? '+' : ''}{fmtNum(mv.forecast.changePct, 2)}%</small>}
                        </td>
                        <td data-label="MAE">
                          {fmtNum(mv.evaluation?.multivariateMae, 4)} vs {fmtNum(mv.evaluation?.univariateMae, 4)} vs {fmtNum(mv.evaluation?.baselineMae, 4)}
                          <small className="ap-reviewed-at">
                            {mv.beatsUnivariate ? `Supera univariado (+${fmtNum(mv.evaluation?.improvementVsUnivariatePct, 2)}%)` : `vs baseline (${fmtNum(mv.evaluation?.improvementVsBaselinePct, 2)}%)`}
                          </small>
                        </td>
                        <td data-label="Conformal">
                          80%: {mv.evaluation?.conformal80CoveragePct != null ? `${fmtNum(mv.evaluation.conformal80CoveragePct, 1)}%` : '—'}
                          {' · '}
                          90%: {mv.evaluation?.conformal90CoveragePct != null ? `${fmtNum(mv.evaluation.conformal90CoveragePct, 1)}%` : '—'}
                        </td>
                        <td data-label="Drivers">
                          {(mv.topDrivers || []).slice(0, 3).map(d => `${d.feature} (${d.importancePct}%)`).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(showcase.unsupervisedDiagnostics || intelligence?.unsupervised) && (
            <div className="ap-pred-card ap-pred-card--cross">
              <h4>Anomalías y Regímenes (Isolation Forest + z-MAD + K-Means++)</h4>
              {(() => {
                const unsup = showcase.unsupervisedDiagnostics || intelligence.unsupervised;
                const anomalies = unsup?.anomalies || [];
                const regimes = unsup?.regimes || [];
                return (
                  <div className="ap-intel-grid">
                    <div>
                      <p className="ap-pred-sub">Anomalías estadísticas detectadas: <strong>{anomalies.length}</strong></p>
                      {anomalies.length ? (
                        <ul className="ap-anomaly-list">
                          {anomalies.slice(0, 8).map((a, idx) => (
                            <li key={idx}>
                              <span className={`ap-pill ${a.severity === 'warning' ? 'is-warning' : ''}`}>{a.metric}</span>
                              <span>{a.detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="ap-pred-sub">Sin anomalías estadísticas severas en SNIIM ni series históricas.</p>
                      )}
                    </div>
                    <div>
                      <p className="ap-pred-sub">Clústeres de volatilidad actuales ({regimes.length} series):</p>
                      <ul className="ap-regime-list">
                        {regimes.slice(0, 8).map((r, idx) => (
                          <li key={idx}>
                            <span>{r.symbol} ({r.cutoff})</span>
                            <strong>{r.currentRegime}{r.regimeShift ? ' ↺ cambio' : ''}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {view === 'marranas' && !loading && marranasHealth && (
        <div className="ap-predictions">
          <div className="ap-pred-card ap-pred-card--cross">
            <h4>VALL-Proteínas · Modelo ML de predicción de proteínas animales ({marranasHealth.version || 'sin versión'})</h4>
            <p className="ap-pred-sub">
              Modelo especializado e integrado en ORION para predecir mercados de <strong>Cerdo, Res, Pollo y Huevo</strong>, con persistencia en PostgreSQL de Dokploy.
              Último corte entrenado: <strong>{formatDate(marranasHealth.generatedAt)}</strong>.
            </p>
            {marranasJob?.running && (
              <p className="ap-notice" role="status">
                Re-entrenamiento completo en curso desde {formatDate(marranasJob.startedAt)} (actualización automática cada 12 s).
              </p>
            )}
            {marranasJob?.lastError && !marranasJob?.running && (
              <p className="ap-error" role="alert">Último error de re-entrenamiento: {marranasJob.lastError}</p>
            )}
            <div className="ap-loopus-kpis" aria-label="Indicadores de salud de VALL-Proteínas">
              <article className="ap-loopus-kpi">
                <span>Modelos activos</span>
                <strong>{marranasHealth.stats?.activeModels || 0}</strong>
                <small>{marranasHealth.stats?.conformalAndAdaptiveModels || 0} Conformal P80 · {(marranasHealth.stats?.totalObservationsIngested || 0).toLocaleString('es-MX')} obs</small>
              </article>
              <article className="ap-loopus-kpi">
                <span>Exactitud Walk-Forward</span>
                <strong>{marranasHealth.stats?.avgWalkForwardDirectionalAccuracyPct != null ? `${marranasHealth.stats.avgWalkForwardDirectionalAccuracyPct}%` : '—'}</strong>
                <small>México SNIIM: {marranasHealth.summary?.byRegion?.MX?.avgDirectionalAccuracyPct ?? '—'}% · {marranasHealth.stats?.exogenousDriverSeries || 0} drivers</small>
              </article>
              <article className="ap-loopus-kpi">
                <span>Calibración y MAE</span>
                <strong>Brier {marranasHealth.stats?.avgBrierScore ?? '—'}</strong>
                <small>Mejora MAE vs baseline: {marranasHealth.stats?.avgMaeImprovementPct != null ? `+${marranasHealth.stats.avgMaeImprovementPct}%` : '—'}</small>
              </article>
              <article className="ap-loopus-kpi">
                <span>Auditoría Real (Dokploy DB)</span>
                <strong>{marranasHealth.closedLoopAudit?.summary?.conformal80CoveragePct != null ? `P80 ${marranasHealth.closedLoopAudit.summary.conformal80CoveragePct}%` : '—'}</strong>
                <small>{marranasHealth.closedLoopAudit?.summary?.totalEvaluated || 0} evals · MAPE {marranasHealth.closedLoopAudit?.summary?.avgMapePct ?? '—'}% · Acierto {marranasHealth.closedLoopAudit?.summary?.directionalHitRatePct ?? '—'}%</small>
              </article>
              <article className="ap-loopus-kpi">
                <span>Paridad Importación MX</span>
                <strong>USD/MXN {fmtNum(marranasHealth.importParity?.fxRates?.usdMxn, 3)}</strong>
                <small>EUR/MXN {fmtNum(marranasHealth.importParity?.fxRates?.eurMxn, 3)} · BRL/MXN {fmtNum(marranasHealth.importParity?.fxRates?.brlMxn, 3)}</small>
              </article>
              <article className="ap-loopus-kpi">
                <span>Radar NLP Sanidad/Comercio</span>
                <strong>{marranasHealth.nlpEvents?.stats?.relevantEventsDetected || 0} eventos</strong>
                <small>{marranasHealth.nlpEvents?.stats?.sanitaryAlertsCount || 0} sanitarios · {marranasHealth.nlpEvents?.stats?.tradeEventsCount || 0} comerciales</small>
              </article>
            </div>
          </div>

          <div className="ap-pred-card ap-pred-card--cross">
            <h4>Salud por Especie (Walk-Forward · Auditoría Closed-Loop · Riesgo NLP)</h4>
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>Especie</th>
                    <th>Mercados</th>
                    <th>Consenso ML</th>
                    <th>Exactitud WF</th>
                    <th>Auditoría Real (Dokploy)</th>
                    <th>Riesgo NLP (0–100)</th>
                  </tr>
                </thead>
                <tbody>
                  {['cerdo', 'res', 'pollo', 'huevo'].map(sp => {
                    const sum = marranasHealth.summary?.bySpecies?.[sp];
                    const aud = marranasHealth.closedLoopAudit?.bySpecies?.[sp];
                    const nlp = marranasHealth.nlpEvents?.bySpecies?.[sp];
                    if (!sum) return null;
                    return (
                      <tr key={sp}>
                        <th scope="row"><strong>{sum.label}</strong></th>
                        <td>{sum.seriesCount}</td>
                        <td>
                          <strong>{sum.consensusDirection}</strong>{' '}
                          <small className="ap-reviewed-at">(Subida {sum.avgProbUpPct}% · Alza {sum.counts?.alza}/Baja {sum.counts?.baja}/Lat {sum.counts?.lateral})</small>
                        </td>
                        <td>{sum.avgDirectionalAccuracyPct != null ? `${sum.avgDirectionalAccuracyPct}%` : '—'}</td>
                        <td>
                          {aud ? `P80 ${aud.conformal80CoveragePct}% · MAPE ${aud.avgMapePct}% (${aud.evaluations} evals)` : 'Sin evals aún'}
                        </td>
                        <td>
                          {nlp ? (
                            <>
                              <strong>{nlp.riskScore}/100 ({nlp.riskLevel})</strong>
                              <small className="ap-reviewed-at"> · {nlp.bias} · {nlp.dominantType || 'activo'}</small>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {marranasHealth.importParity?.bySpecies && (
            <div className="ap-pred-card ap-pred-card--cross">
              <h4>Monitor de Paridad de Importación → México (MXN/kg)</h4>
              <div className="ap-table-wrap">
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th>Especie</th>
                      <th>Mediana SNIIM MX</th>
                      <th>Origen Principal Puesto</th>
                      <th>Diferencial</th>
                      <th>Señal Comercial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['cerdo', 'res', 'pollo', 'huevo'].map(sp => {
                      const p = marranasHealth.importParity.bySpecies[sp];
                      if (!p) return null;
                      const prim = p.primaryParity;
                      return (
                        <tr key={sp}>
                          <th scope="row"><strong>{p.speciesLabel}</strong></th>
                          <td>
                            <strong>${fmtNum(p.mexicoBenchmark.priceMxnKg, 2)} MXN/kg</strong>
                            <small className="ap-reviewed-at"> ({p.mexicoBenchmark.plazasCount || 1} plazas)</small>
                          </td>
                          <td>
                            {prim ? `${prim.originCountry}: $${fmtNum(prim.landedMxnKg, 2)} MXN/kg (${prim.rawPrice} ${prim.rawUnit})` : '—'}
                          </td>
                          <td>{prim ? `${prim.spreadPct > 0 ? '+' : ''}${prim.spreadPct}% (${prim.spreadMxnKg > 0 ? '+' : ''}${prim.spreadMxnKg} MXN)` : '—'}</td>
                          <td><span className="ap-pill">{prim?.signal || '—'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="ap-pred-card ap-pred-card--cross">
            <h4>Persistencia Dokploy PostgreSQL y Alertas Tempranas Activas ({marranasHealth.alertsSummary?.total || 0})</h4>
            <div className="ap-intel-grid">
              <div>
                <p className="ap-pred-sub">Tablas alimentadas en Dokploy (`vallnews.com/_data`):</p>
                <ul className="ap-regime-list">
                  <li><span>orion_market_observations</span><strong>{(marranasHealth.stats?.dokployPersistence?.persistedObservations || 0).toLocaleString('es-MX')} filas</strong></li>
                  <li><span>forecast_observations</span><strong>{(marranasHealth.stats?.dokployPersistence?.persistedForecastObs || 0).toLocaleString('es-MX')} filas</strong></li>
                  <li><span>forecast_runs (VALL-Proteínas)</span><strong>{marranasHealth.stats?.dokployPersistence?.persistedForecastRuns || 0} corridas</strong></li>
                  <li><span>forecast_predictions (1w + 1m)</span><strong>{marranasHealth.stats?.dokployPersistence?.persistedPredictions || 0} pronósticos</strong></li>
                  <li><span>forecast_evaluations (Closed-Loop)</span><strong>{marranasHealth.closedLoopAudit?.summary?.totalEvaluated || 0} verificadas</strong></li>
                </ul>
              </div>
              <div>
                <p className="ap-pred-sub">
                  Alertas activas: <strong>{marranasHealth.alertsSummary?.critica || 0} críticas</strong> · <strong>{marranasHealth.alertsSummary?.alta || 0} altas</strong> · <strong>{marranasHealth.alertsSummary?.vigilancia || 0} vigilancia</strong>
                </p>
                <ul className="ap-anomaly-list">
                  {(marranasHealth.alertsSummary?.topAlerts || []).map(al => (
                    <li key={al.id}>
                      <span className={`ap-pill ${al.severity === 'CRÍTICA' ? 'is-warning' : ''}`}>{al.severity} · {al.species.toUpperCase()}</span>
                      <span><strong>{al.title}</strong> — {al.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
