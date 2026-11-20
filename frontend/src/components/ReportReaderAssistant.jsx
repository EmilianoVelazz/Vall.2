import { useEffect, useRef, useState } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { apiPost } from '../api/client.js';
import { buildReportOrionHandoff, writeOrionReportHandoff } from '../lib/orionHandoff.js';

const PRESETS = [
  { id: 'summary', label: 'Resumen rápido', question: '' },
  { id: 'metrics', label: 'Métricas clave', question: '¿Cuáles son las métricas y cifras principales de este corte?' },
  { id: 'risks', label: 'Riesgos y brechas', question: '¿Qué riesgos, alertas o datos pendientes señala este informe?' },
  { id: 'implications', label: 'Implicaciones', question: '¿Qué implicaciones prácticas se desprenden de los hechos de este informe?' },
];

function resolveTarget(area, report) {
  if (!report) return null;
  if (report.historyId) return { historyId: report.historyId };
  if (report.editionId) return { userReportId: report.editionId };
  if (['finance', 'markets', 'mexico'].includes(area) && report.key) {
    return { collection: area, key: report.key };
  }
  return null;
}

function formatCut(value, locale) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(locale || 'es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function RouterOpenOrionButton({ className, disabled, title, onPrepare, children }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={title}
      onClick={() => { if (onPrepare()) navigate('/orion?from=report'); }}
    >
      {children}
    </button>
  );
}

function OpenOrionButton({ className, disabled, title, onPrepare, children }) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <RouterOpenOrionButton className={className} disabled={disabled} title={title} onPrepare={onPrepare}>
        {children}
      </RouterOpenOrionButton>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={title}
      onClick={() => { if (onPrepare()) window.location.assign('/orion?from=report'); }}
    >
      {children}
    </button>
  );
}

export default function ReportReaderAssistant({ area, report, reportDoc = null, accountEmail = '', language, t, onClose }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const target = resolveTarget(area, report);
  const analysisPeriod = ['daily', 'weekly', 'annual'].includes(report?.analysisPeriod) ? report.analysisPeriod : 'daily';

  const runRead = async nextQuestion => {
    if (!target) {
      setError(t('Este borrador aún no se puede consultar hasta guardarlo o seleccionar un corte publicado.'));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const res = await apiPost('/api/report-reader/read', {
        ...target,
        analysisPeriod,
        question: nextQuestion,
      }, { signal: controller.signal, timeoutMs: 32_000 });
      if (controller.signal.aborted) return;
      if (!res.ok || !res.data?.success) {
        setError(res.data?.error || t('No se pudo consultar el informe en este momento.'));
        return;
      }
      setResponse(res.data);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err?.message || t('No se pudo consultar el informe en este momento.'));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleSubmit = event => {
    event.preventDefault();
    void runRead(question.trim());
  };

  const reading = response?.reading;
  const digest = response?.digest;
  const effectiveGeneratedAt = digest?.generatedAt || reportDoc?.generatedAt || report?.generatedAt;
  const cutLabel = effectiveGeneratedAt ? formatCut(effectiveGeneratedAt, t.locale) : '';

  const prepareOrionHandoff = () => {
    const handoff = buildReportOrionHandoff({
      area,
      report,
      reportDoc,
      response,
      question,
      cutLabel,
      accountEmail,
    });
    if (!writeOrionReportHandoff(handoff)) {
      setError(t('No se pudo preparar el contexto del informe para abrir en ORION.'));
      return false;
    }
    abortRef.current?.abort();
    return true;
  };

  return (
    <section className="erh-reader-assistant notranslate" translate="no" lang={language} aria-label={t('Consultar este informe con el agente lector')}>
      <div className="erh-reader-assistant-head">
        <div>
          <span className="erh-reader-assistant-badge">
            <i className="fas fa-book-open-reader" aria-hidden="true" />
            {t('Lector verificado de informes')}
          </span>
          <p>{t('Responde usando únicamente las cifras, fechas, unidades y fuentes presentes en este informe.')}</p>
        </div>
        <div className="erh-reader-assistant-head-actions">
          <OpenOrionButton
            className="erh-reader-orion-btn"
            disabled={!target && !report}
            title={t('Abrir este informe con su contexto en el chat de ORION')}
            onPrepare={prepareOrionHandoff}
          >
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
            {t('Analizar en ORION')}
          </OpenOrionButton>
          <button type="button" className="erh-reader-assistant-close" aria-label={t('Cerrar consulta del informe')} onClick={onClose}>
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="erh-reader-assistant-presets" role="group" aria-label={t('Consultas rápidas')}>
        {PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            className="erh-secondary-button"
            disabled={loading}
            onClick={() => {
              setQuestion(preset.question);
              void runRead(preset.question);
            }}
          >
            {t(preset.label)}
          </button>
        ))}
      </div>

      <form className="erh-reader-assistant-form" onSubmit={handleSubmit}>
        <label className="erh-sr-only" htmlFor="erh-reader-question">{t('Pregunta sobre el informe')}</label>
        <input
          id="erh-reader-question"
          ref={inputRef}
          type="text"
          maxLength={1000}
          value={question}
          disabled={loading}
          placeholder={t('Pregunta una cifra, comparación o alerta de este informe…')}
          onChange={event => setQuestion(event.target.value)}
        />
        {loading ? (
          <button type="button" className="erh-secondary-button" onClick={() => abortRef.current?.abort()}>
            <i className="fas fa-stop" aria-hidden="true" />
            {t('Cancelar')}
          </button>
        ) : (
          <button type="submit" className="erh-primary-button" disabled={!target}>
            <i className="fas fa-paper-plane" aria-hidden="true" />
            {question.trim() ? t('Preguntar') : t('Resumir')}
          </button>
        )}
      </form>

      {loading && (
        <p className="erh-reader-assistant-status" role="status">
          <i className="fas fa-spinner fa-spin" aria-hidden="true" />
          {t('Leyendo y verificando cifras del corte…')}
        </p>
      )}

      {error && (
        <p className="erh-reader-assistant-error" role="alert">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          {error}
        </p>
      )}

      {reading && !loading && (
        <div className="erh-reader-assistant-result" aria-live="polite">
          <div className="erh-reader-assistant-meta">
            <span>{reading.agent}</span>
            {reading.model && <span>{reading.model}</span>}
            {cutLabel && <span>{t('Corte')}: {cutLabel}</span>}
          </div>
          <h4>{reading.headline}</h4>
          <p className="erh-reader-assistant-answer">{reading.answer}</p>
          {reading.keyPoints?.length > 0 && (
            <ul className="erh-reader-assistant-points">
              {reading.keyPoints.map((point, index) => <li key={index}>{point}</li>)}
            </ul>
          )}
          {reading.missingData?.length > 0 && (
            <div className="erh-reader-assistant-gaps" role="note">
              <strong>{t('Datos no presentes en este corte')}</strong>
              <ul>
                {reading.missingData.map((gap, index) => <li key={index}>{gap}</li>)}
              </ul>
            </div>
          )}
          <div className="erh-reader-assistant-actions">
            <OpenOrionButton
              className="erh-reader-orion-cta"
              disabled={!target && !report}
              title={t('Continuar analizando esta lectura y cruzar fuentes en ORION')}
              onPrepare={prepareOrionHandoff}
            >
              <i className="fas fa-comments" aria-hidden="true" />
              {t('Continuar esta lectura en ORION')}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </OpenOrionButton>
          </div>
        </div>
      )}
    </section>
  );
}
