import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client.js';
import './AdminProfiles.css';

const STATUS_LABELS = {
  pending_human_review: 'Pendiente de revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

const formatDate = value => value
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Sin fecha';

export default function AdminLoopus() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('pending_human_review');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState({});
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const qs = filter ? `status=${encodeURIComponent(filter)}&limit=80` : 'limit=80';
    apiGet(`/api/admin/loopus-proposals?${qs}`, { signal: controller.signal })
      .then(({ ok, data }) => {
        if (!ok || !data?.success) throw Error(data?.error || 'No se pudieron cargar las propuestas de Proyecto Loopus.');
        setRows(data.proposals || []);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, revision]);

  async function review(row, nextStatus) {
    if (savingId !== null) return;
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
      setNotice(`Propuesta #${row.id} marcada como "${STATUS_LABELS[nextStatus] || nextStatus}".`);
      setRevision(v => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="ap-profiles" aria-label="Revisión de Proyecto Loopus">
      <div className="ap-intro">
        <div>
          <h3>Propuestas de reglas (Proyecto Loopus)</h3>
          <p>Revisa, aprueba o rechaza las reglas aprendidas por el ciclo de entrenamiento ML antes de activarlas.</p>
        </div>
        <div className="ap-actions">
          <label className="ac-field">
            <span>Estado</span>
            <select value={filter} disabled={loading || savingId !== null} onChange={e => setFilter(e.target.value)}>
              <option value="pending_human_review">Pendientes</option>
              <option value="approved">Aprobadas</option>
              <option value="rejected">Rechazadas</option>
              <option value="">Todas</option>
            </select>
          </label>
          <button
            type="button"
            className="ac-btn ac-btn-secondary"
            disabled={loading || savingId !== null}
            onClick={() => setRevision(v => v + 1)}
          >
            Actualizar
          </button>
        </div>
      </div>

      {loading && <p role="status">Consultando propuestas de Loopus…</p>}
      {error && <p className="ap-error" role="alert">{error}</p>}
      {notice && <p className="ap-notice" role="status">{notice}</p>}
      {!loading && !rows.length && !error && (
        <p>No hay propuestas {filter ? `con estado «${STATUS_LABELS[filter] || filter}»` : 'registradas'}.</p>
      )}

      {!!rows.length && (
        <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Tabla de propuestas Loopus">
          <table>
            <caption>{rows.length} propuestas</caption>
            <thead>
              <tr>
                <th scope="col">Tema / Disparador</th>
                <th scope="col">Regla propuesta</th>
                <th scope="col">Confianza</th>
                <th scope="col">Estado</th>
                <th scope="col">Revisión</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <th scope="row">
                    <strong>#{row.id} · {row.topic || 'general'}</strong>
                    <span>{row.condition_trigger}</span>
                    <small>{formatDate(row.created_at)}</small>
                  </th>
                  <td data-label="Regla">{row.learned_rule}</td>
                  <td data-label="Confianza">
                    {Number.isFinite(Number(row.confidence_score))
                      ? `${Math.round(Number(row.confidence_score) * 100)}%`
                      : '—'}
                  </td>
                  <td data-label="Estado">
                    <strong>{STATUS_LABELS[row.status] || row.status}</strong>
                    {row.reviewed_at && <small> · {formatDate(row.reviewed_at)}</small>}
                  </td>
                  <td data-label="Acciones">
                    <div className="ap-actions">
                      <input
                        type="text"
                        aria-label={`Nota de revisión para propuesta ${row.id}`}
                        maxLength={500}
                        placeholder="Nota opcional…"
                        value={notes[row.id] ?? row.review_notes ?? ''}
                        disabled={savingId !== null}
                        onChange={e => setNotes(cur => ({ ...cur, [row.id]: e.target.value }))}
                      />
                      {row.status !== 'approved' && (
                        <button
                          type="button"
                          className="ac-btn"
                          disabled={savingId !== null}
                          onClick={() => void review(row, 'approved')}
                        >
                          {savingId === row.id ? 'Guardando…' : 'Aprobar'}
                        </button>
                      )}
                      {row.status !== 'rejected' && (
                        <button
                          type="button"
                          className="ac-btn ac-btn-secondary"
                          disabled={savingId !== null}
                          onClick={() => void review(row, 'rejected')}
                        >
                          Rechazar
                        </button>
                      )}
                    </div>
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
