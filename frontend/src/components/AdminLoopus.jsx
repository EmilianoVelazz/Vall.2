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

export default function AdminLoopus() {
  const [view, setView] = useState('rules');
  const [rows, setRows] = useState([]);
  const [reviews, setReviews] = useState([]);
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
          ? `Se aprobaron ${data.approvedCount} reglas de alta confianza (≥90%) en Supabase.`
          : 'No había reglas pendientes con confianza ≥90% en este filtro.'
      );
      setRevision(v => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBatchApproving(false);
    }
  }

  return (
    <section className="ap-profiles" aria-label="Revisión de Proyecto Loopus">
      <div className="ap-intro">
        <div>
          <h3>Propuestas y Validaciones de Proyecto Loopus</h3>
          <p>Supervisa el conocimiento almacenado en Supabase para Chat ORION e Informes, inspecciona cadenas causales y valida auditorías de mercado.</p>
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
        <div className="ap-loopus-kpis" aria-label="Resumen en Supabase">
          <article className="ap-loopus-kpi">
            <span>Acervo en Supabase</span>
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
            <small>Activas en Chat / Informes</small>
          </article>
          <article className="ap-loopus-kpi">
            <span>Validación humana</span>
            <strong>{stats.byStatus?.approved || 0} aprob.</strong>
            <small>{stats.byStatus?.pending_human_review || 0} pendientes · {stats.byStatus?.rejected || 0} rech.</small>
          </article>
        </div>
      )}

      {loading && <p role="status">Consultando información de Loopus en Supabase…</p>}
      {error && <p className="ap-error" role="alert">{error}</p>}
      {notice && <p className="ap-notice" role="status">{notice}</p>}

      {view === 'rules' && !loading && !rows.length && !error && (
        <p>No hay propuestas {filter ? `con estado «${STATUS_LABELS[filter] || filter}»` : 'registradas'} con ese filtro.</p>
      )}

      {view === 'rules' && !!rows.length && (
        <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Tabla de propuestas Loopus">
          <table>
            <caption>Mostrando {rows.length} reglas sincronizadas con Supabase</caption>
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
        <p>No hay auditorías de integridad de mercado registradas aún en Supabase.</p>
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
    </section>
  );
}
