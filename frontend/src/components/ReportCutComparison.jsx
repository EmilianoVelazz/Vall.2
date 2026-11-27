import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { reportChangeSnapshot, compareReportSnapshots } from '../lib/reportChanges.js';
import { reportJsonRequest, verifyReportOwner } from '../lib/reportRequest.js';
import { keepDialogFocus, restoreDialogFocus } from '../lib/reportDialog.js';
import './DecisionTools.css';

const CHANGE_KINDS = {
  movement: 'Movimiento',
  correction: 'Revisión del dato',
  publication: 'Nueva publicación',
  unavailable: 'Referencia no recuperada',
  news: 'Noticia nueva',
};

const formatCutDate = (value) =>
  new Date(value).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  });

const formatValue = (value, text, unit) =>
  Number.isFinite(value)
    ? `${value.toLocaleString('es-MX', { maximumFractionDigits: 4 })} ${unit || ''}`
    : text || 'No disponible en ese corte';

export default function ReportCutComparison({ report, owner, area, disabled }) {
  const [open, setOpen] = useState(false);
  const [editions, setEditions] = useState([]);
  const [selected, setSelected] = useState('');
  const [comparison, setComparison] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(0);

  const dialog = useRef(null);
  const trigger = useRef(null);
  const request = useRef(null);

  const allowed =
    ['finance', 'markets', 'mexico'].includes(area) &&
    report &&
    !report.userEdition &&
    !report.aiEdition;

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    const previous = trigger.current;
    node.showModal();
    return () => {
      request.current?.abort();
      node.close();
      restoreDialogFocus(previous);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setEditions([]);
    setComparison(null);
    setSelected('');
    setError('');
    setBusy(true);

    (async () => {
      await verifyReportOwner(owner, controller.signal);
      const query = new URLSearchParams({ area, key: report.key, limit: '20' });
      const response = await reportJsonRequest(`/api/report-history?${query}`, { signal: controller.signal }, { expectedOwner: owner });
      await verifyReportOwner(owner, controller.signal);
      const prior = (response.data || []).filter(
        (item) =>
          /^[a-f0-9]{64}$/.test(item.id || '') &&
          item.collection === area &&
          item.key === report.key &&
          Date.parse(item.generatedAt) < Date.parse(report.generatedAt)
      );
      if (!controller.signal.aborted) setEditions(prior);
    })()
      .catch((issue) => {
        if (!controller.signal.aborted) setError(issue.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });

    return () => controller.abort();
  }, [open, area, owner, report]);

  async function compare(id) {
    request.current?.abort();
    setSelected(id);
    setComparison(null);
    setError('');
    setPage(0);
    setKind('all');
    if (!id) return;

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      await verifyReportOwner(owner, controller.signal);
      const response = await reportJsonRequest(
        `/api/report-history/${encodeURIComponent(id)}`,
        { signal: controller.signal },
        { expectedOwner: owner }
      );
      await verifyReportOwner(owner, controller.signal);

      const previous = response.data;
      if (
        previous?.userEdition ||
        previous?.collection !== area ||
        previous?.key !== report.key ||
        !(Date.parse(previous.generatedAt) < Date.parse(report.generatedAt))
      ) {
        throw Error('La edición anterior no corresponde a este informe y periodo.');
      }

      const changes = compareReportSnapshots(
        reportChangeSnapshot({ ...previous, analysisPeriod: report.analysisPeriod }),
        reportChangeSnapshot(report)
      );
      if (!changes) throw Error('Las ediciones no son comparables.');
      if (!controller.signal.aborted) setComparison(changes);
    } catch (issue) {
      if (!controller.signal.aborted) setError(issue.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const filtered = useMemo(
    () => (comparison?.items || []).filter((item) => kind === 'all' || item.kind === kind),
    [comparison, kind]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 50));

  if (!allowed) return null;

  return (
    <>
      <button
        type="button"
        className="erh-secondary-button"
        disabled={disabled || !owner}
        ref={trigger}
        onClick={() => setOpen(true)}
      >
        Comparar cortes
      </button>

      {open &&
        createPortal(
          <dialog
            className="vn-cut-dialog"
            aria-labelledby="cut-comparison-title"
            ref={dialog}
            onCancel={() => setOpen(false)}
            onKeyDown={keepDialogFocus}
          >
            <section className="vn-decision-tool">
              <header>
                <div>
                  <span className="vn-tool-kicker">Ediciones base · historial de mercado</span>
                  <h2 id="cut-comparison-title">Comparar cortes de {report.title}</h2>
                  <p>
                    Elige una edición anterior del mismo informe. Las revisiones, nuevas publicaciones y referencias no recuperadas se muestran por separado.
                  </p>
                </div>
                <button type="button" autoFocus onClick={() => setOpen(false)}>
                  Cerrar comparación
                </button>
              </header>

              <label>
                Edición anterior{' '}
                <select
                  value={selected}
                  onChange={(event) => void compare(event.target.value)}
                  disabled={busy && !editions.length}
                >
                  <option value="">Selecciona un corte anterior</option>
                  {editions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatCutDate(item.generatedAt)}
                    </option>
                  ))}
                </select>
              </label>

              <p>
                Corte actual: {formatCutDate(report.generatedAt)}. Se consultan las últimas 20 ediciones de este informe.
              </p>

              {busy && <p role="status">Consultando el historial de la cuenta actual…</p>}
              {error && <p role="alert">{error}</p>}
              {!busy && !error && !editions.length && (
                <p className="vn-tool-notice">
                  Todavía no hay un corte anterior disponible para este informe. No se calcula una variación sin base verificable.
                </p>
              )}

              {comparison && (
                <>
                  <div className="vn-tool-metrics">
                    {Object.entries(CHANGE_KINDS).map(([key, label]) => (
                      <article key={key}>
                        {label}
                        <b>{comparison.items.filter((item) => item.kind === key).length}</b>
                      </article>
                    ))}
                  </div>

                  <label>
                    Mostrar{' '}
                    <select
                      value={kind}
                      onChange={(event) => {
                        setKind(event.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="all">Todos los cambios</option>
                      {Object.entries(CHANGE_KINDS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="vn-tool-table" role="region" tabIndex={0} aria-label="Diferencias entre cortes">
                    <table>
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Referencia</th>
                          <th>Corte anterior</th>
                          <th>Corte actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(page * 50, page * 50 + 50).map((item, index) => (
                          <tr key={item.label + index}>
                            <td>{CHANGE_KINDS[item.kind]}</td>
                            <th scope="row">
                              {item.label}
                              {item.detail && <small> · {item.detail}</small>}
                              {item.historyOnly && <small> · Revisión de historia; último valor sin cambio</small>}
                            </th>
                            <td>
                              {formatValue(item.before, item.beforeText, item.unit)}
                              {item.previousDate && <small> · {item.previousDate}</small>}
                            </td>
                            <td>
                              {item.kind === 'news'
                                ? 'Publicación incorporada'
                                : formatValue(item.after, item.afterText, item.unit)}
                              {item.date && <small> · {item.date}</small>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!filtered.length && <p>No hay cambios de este tipo entre las dos ediciones.</p>}

                  <div className="vn-tool-actions">
                    <button type="button" disabled={!page} onClick={() => setPage((value) => value - 1)}>
                      Anterior
                    </button>
                    <span>
                      Página {page + 1} de {pages}
                    </span>
                    <button type="button" disabled={page >= pages - 1} onClick={() => setPage((value) => value + 1)}>
                      Siguiente
                    </button>
                  </div>

                  <p>
                    Los precios conservan sus unidades y fechas de observación. Una nueva noticia o un cambio simultáneo de precios no demuestra una relación causal. Esta comparación usa informes base, sin datos personales ni supuestos de otras cuentas.
                  </p>
                </>
              )}
            </section>
          </dialog>,
          document.body
        )}
    </>
  );
}
