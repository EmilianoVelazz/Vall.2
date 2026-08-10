import { useEffect } from 'react';
import Header from '../components/Header.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { cargarCadaVez } from '../lib/loadScripts.js';

/*
 * VALL AI en React (antes pages/vall-ai.html).
 *
 * Esta página es casi todo marcado: la lógica —conversaciones, historial,
 * adjuntos, estudio de reportes, dictado por voz— vive entera en
 * assets/js/vall-ai-page-v4.js (74 KB). Migrar eso a hooks sería reescribir el
 * asistente, no migrar la página, así que el script se reutiliza tal cual y lo
 * que se migra es el marcado, la ruta y el ciclo de vida.
 *
 * Dos consecuencias de reutilizarlo, ambas resueltas:
 *
 *  1. Captura sus nodos al evaluarse (`const els = { … $('vaiInput') … }`), así
 *     que el JSX tiene que estar montado ANTES y conservar cada id tal cual. Por
 *     eso se carga con cargarCadaVez() desde un efecto, no con <script>.
 *
 *  2. Con el cacheado normal solo habría funcionado la primera visita. Ahora se
 *     reejecuta en cada montaje y el propio script desmonta su instancia
 *     anterior (window.VNVallAi.desmontar).
 *
 * El <body class="vall-ai-body"> del HTML original se aplica y se retira en un
 * efecto: en la SPA el body es compartido y esa clase no puede quedarse pegada
 * al navegar a otra sección.
 */

const HOJAS = [
  '/assets/css/base.css',
  '/assets/css/header.css',
  '/assets/css/responsive.css',
  '/assets/css/vall-ai-page.css?v=12',
];

const DEPENDENCIAS = ['/assets/js/data-service.js?v=22'];
const PAGINA_JS = '/assets/js/vall-ai-page-v4.js';

const SUGERENCIAS = [
  { prompt: 'Dame un panorama ejecutivo de los mercados globales hoy', icono: 'fa-earth-americas', titulo: 'Panorama global', nota: 'Mercados, tasas y riesgo' },
  { prompt: 'Analiza los principales riesgos para el peso mexicano', icono: 'fa-chart-line', titulo: 'Peso mexicano', nota: 'Catalizadores y escenarios' },
  { prompt: 'Compara petróleo, gas natural y metales industriales', icono: 'fa-oil-well', titulo: 'Materias primas', nota: 'Comparación estructurada' },
  { prompt: 'Crea un reporte técnico sobre renta fija global', icono: 'fa-file-lines', titulo: 'Reporte técnico', nota: 'Datos, riesgos y conclusión' },
];

const HERRAMIENTAS_EDITOR = [
  { cmd: 'undo', titulo: 'Deshacer', icono: 'fa-rotate-left' },
  { cmd: 'redo', titulo: 'Rehacer', icono: 'fa-rotate-right' },
  { separador: true },
  { cmd: 'bold', titulo: 'Negrita', texto: <b>B</b> },
  { cmd: 'italic', titulo: 'Cursiva', texto: <i>I</i> },
  { cmd: 'formatBlock', valor: 'h2', titulo: 'Título', icono: 'fa-heading' },
  { cmd: 'insertUnorderedList', titulo: 'Lista', icono: 'fa-list-ul' },
  { cmd: 'insertOrderedList', titulo: 'Lista numerada', icono: 'fa-list-ol' },
  { cmd: 'formatBlock', valor: 'blockquote', titulo: 'Cita', icono: 'fa-quote-left' },
];

const FORMATOS = [
  ['docx', 'Word (.docx)'], ['pdf', 'PDF (.pdf)'], ['html', 'Página HTML'],
  ['markdown', 'Markdown (.md)'], ['txt', 'Texto (.txt)'], ['json', 'Datos (.json)'],
];

export default function VallAi() {
  usePageStyles(HOJAS);

  useEffect(() => {
    document.body.classList.add('vall-ai-body');
    return () => document.body.classList.remove('vall-ai-body');
  }, []);

  useEffect(() => {
    let vivo = true;
    let quitarScript = null;

    (async () => {
      try {
        await loadScripts(DEPENDENCIAS);
      } catch (e) {
        console.error('VALL AI: no se pudo cargar data-service', e);
      }
      if (!vivo) return;
      quitarScript = cargarCadaVez(PAGINA_JS, 'vall-ai');
    })();

    return () => {
      vivo = false;
      window.VNVallAi?.desmontar?.();
      quitarScript?.();
    };
  }, []);

  return (
    <>
      <Header />

      <main className="vai-shell">
        <aside className="vai-sidebar" id="vaiSidebar" aria-label="Historial de conversaciones">
          <div className="vai-side-brand">
            <div className="vai-orb"><img src="/assets/img/robot.svg" alt="VALL AI" /></div>
            <div className="vai-side-brand-copy"><strong>VALL AI</strong><span><i /> Disponible</span></div>
            <button className="vai-side-close" id="vaiSideClose" type="button" aria-label="Cerrar historial"><i className="fas fa-xmark" /></button>
          </div>
          <button className="vai-sidebar-collapse" id="vaiSidebarCollapse" type="button" aria-label="Contraer historial" aria-expanded="true" title="Contraer historial"><i className="fas fa-chevron-left" /></button>

          <button className="vai-new" id="vaiNew" type="button" title="Nueva conversación"><i className="fas fa-plus" /><span>Nueva conversación</span></button>

          <label className="vai-search" htmlFor="vaiHistorySearch">
            <i className="fas fa-magnifying-glass" />
            <input id="vaiHistorySearch" type="search" placeholder="Buscar en el historial…" autoComplete="off" />
            <kbd id="vaiHistoryCount">0</kbd>
          </label>

          <div className="vai-history-head"><span>Conversaciones</span><small>Guardadas en este dispositivo</small></div>
          <div className="vai-history" id="vaiHistory" />

          <div className="vai-side-foot">
            <i className="fas fa-shield-halved" />
            <span>La clave de Gemini permanece protegida en el servidor.</span>
          </div>
        </aside>

        <section className="vai-workspace">
          <header className="vai-toolbar">
            <button className="vai-history-toggle" id="vaiHistoryToggle" type="button" aria-label="Abrir historial"><i className="fas fa-bars" /></button>
            <div className="vai-toolbar-title">
              <span>Asistente profesional <i className="vai-live-dot" /></span>
              <strong id="vaiConversationTitle">Nueva conversación</strong>
            </div>
            <div className="vai-toolbar-actions">
              <div className="vai-auto-route" id="vaiAutoRoute" title="VALL AI selecciona automáticamente la profundidad y el modelo">
                <i className="fas fa-wand-magic-sparkles" />
                <span><small>Selección automática</small><b>Modelo adaptativo</b></span>
              </div>
              <button className="vai-report-open" id="vaiReportOpen" type="button" title="Vista previa y exportación" aria-label="Abrir estudio de reportes"><i className="fas fa-file-pen" /><span>Reporte</span></button>
              <button id="vaiDelete" type="button" title="Eliminar conversación" aria-label="Eliminar conversación"><i className="fas fa-trash-can" /></button>
            </div>
          </header>

          <div className="vai-messages" id="vaiMessages" aria-live="polite">
            <section className="vai-welcome" id="vaiWelcome">
              <div className="vai-welcome-mark"><img src="/assets/img/robot.svg" alt="VALL AI" /></div>
              <span className="vai-eyebrow">INTELIGENCIA ECONÓMICA GENERATIVA</span>
              <h1>¿Qué quieres analizar hoy?</h1>
              <p>Consulta mercados, tasas, divisas, commodities, geopolítica o solicita un reporte estructurado.</p>
              <div className="vai-prompts">
                {SUGERENCIAS.map((s) => (
                  <button key={s.titulo} type="button" data-prompt={s.prompt}>
                    <i className={`fas ${s.icono}`} />
                    <span><b>{s.titulo}</b><small>{s.nota}</small></span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <footer className="vai-composer-wrap">
            <form className="vai-composer" id="vaiForm">
              <div className="vai-dropzone" id="vaiDropzone" hidden>
                <i className="fas fa-cloud-arrow-up" />
                <strong>Suelta tus archivos aquí</strong>
                <span>Imágenes, PDF, texto, CSV, Markdown o JSON</span>
              </div>
              <div className="vai-attachments" id="vaiAttachments" hidden aria-live="polite" />
              <textarea id="vaiInput" rows={1} maxLength={4000} placeholder="Pregunta a VALL AI…" aria-label="Mensaje para VALL AI" />
              <div className="vai-compose-bottom">
                <div className="vai-compose-context">
                  <button className="vai-attach" id="vaiAttach" type="button" title="Adjuntar archivos o imágenes" aria-label="Adjuntar archivos o imágenes"><i className="fas fa-paperclip" /></button>
                  <input id="vaiFileInput" type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown,application/json,.md,.csv,.json,.txt,.pdf" />
                  <span><i className="fas fa-sparkles" /> Contexto, tablas, gráficas y documentos</span>
                </div>
                <div>
                  <button className="vai-stop" id="vaiStop" type="button" hidden><i className="fas fa-stop" /></button>
                  <button className="vai-send" id="vaiSend" type="submit" aria-label="Enviar mensaje"><i className="fas fa-arrow-up" /></button>
                </div>
              </div>
            </form>
            <p className="vai-disclaimer">VALL AI puede cometer errores. Verifica cifras sensibles antes de tomar decisiones.</p>
          </footer>
        </section>
      </main>

      <div className="vai-overlay" id="vaiOverlay" />

      <section className="vai-report-studio" id="vaiReportStudio" hidden aria-modal="true" role="dialog" aria-labelledby="vaiReportStudioTitle">
        <div className="vai-report-backdrop" data-report-close />
        <div className="vai-report-window">
          <header className="vai-report-header">
            <div>
              <span>ESTUDIO DE DOCUMENTOS</span>
              <h2 id="vaiReportStudioTitle">Vista previa del reporte</h2>
              <p id="vaiReportScope"><i className="fas fa-crosshairs" /> Reporte solicitado detectado</p>
            </div>
            <div className="vai-report-status"><i /><span id="vaiReportStatus">Cambios guardados localmente</span></div>
            <button type="button" data-report-close aria-label="Cerrar"><i className="fas fa-xmark" /></button>
          </header>

          <div className="vai-report-toolbar">
            <label>Título<input id="vaiReportTitle" maxLength={120} defaultValue="Reporte VALL AI" /></label>
            <label>
              Formato
              <select id="vaiReportFormat" defaultValue="docx">
                {FORMATOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="vai-report-zoom-label">
              Zoom
              <select id="vaiReportZoom" defaultValue="100">
                <option value="85">85%</option>
                <option value="100">100%</option>
                <option value="115">115%</option>
              </select>
            </label>
            <div className="vai-report-modes" role="group" aria-label="Modo del estudio">
              <button type="button" data-report-view="edit"><i className="fas fa-pen" /> Editar</button>
              <button type="button" data-report-view="split" className="active"><i className="fas fa-columns" /> Dividido</button>
              <button type="button" data-report-view="preview"><i className="fas fa-eye" /> Vista previa</button>
            </div>
            <button id="vaiReportRefresh" type="button"><i className="fas fa-rotate" /> Actualizar</button>
            <button className="primary" id="vaiReportExport" type="button"><i className="fas fa-download" /> Exportar</button>
          </div>

          <div className="vai-report-body">
            <section className="vai-report-editor-pane">
              <div className="vai-pane-title">
                <span><i className="fas fa-pen-ruler" /> Editor del reporte</span>
                <div className="vai-editor-tools">
                  {HERRAMIENTAS_EDITOR.map((h, i) => (
                    h.separador
                      ? <span key={`sep-${i}`} className="vai-tool-separator" />
                      : (
                        <button
                          key={`${h.cmd}-${h.valor || ''}`}
                          type="button"
                          data-editor-command={h.cmd}
                          data-editor-value={h.valor}
                          title={h.titulo}
                        >
                          {h.icono ? <i className={`fas ${h.icono}`} /> : h.texto}
                        </button>
                      )
                  ))}
                  <button type="button" id="vaiReportSave" title="Guardar borrador"><i className="fas fa-floppy-disk" /><span>Guardar</span></button>
                </div>
              </div>
              {/* contentEditable lo gobierna el script legacy; React solo lo monta
                  vacío y no vuelve a tocar su contenido. */}
              <div
                className="vai-rich-editor"
                id="vaiReportEditor"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                spellCheck="true"
                aria-label="Editor visual del reporte"
              />
              <textarea id="vaiReportSource" hidden aria-hidden="true" />
            </section>

            <section className="vai-report-preview-pane">
              <div className="vai-pane-title">
                <span><i className="fas fa-eye" /> Vista previa final</span>
                <small><i className="fas fa-circle-check" /> <b id="vaiReportWords">0 palabras</b></small>
              </div>
              <article className="vai-report-paper" id="vaiReportPreview" />
            </section>
          </div>
        </div>
      </section>

      {/* Modo llamada inmersiva */}
      <div id="vaiVoiceOverlay" className="vai-voice-overlay" hidden>
        <div className="vai-voice-orb-container">
          <div className="vai-voice-orb" id="vaiVoiceOrb" />
          <div className="vai-voice-ring" />
        </div>
        <div className="vai-voice-status" id="vaiVoiceStatus">Escuchando...</div>
        <button type="button" className="vai-voice-hangup" id="vaiVoiceHangup" title="Terminar llamada">
          <i className="fas fa-phone-slash" />
        </button>
      </div>
    </>
  );
}
