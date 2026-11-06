import { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import ConstelacionOrion from '../components/ConstelacionOrion.jsx';
import OrionModelSelector from '../components/OrionModelSelector.jsx';
import ChatUsageBar from '../components/ChatUsageBar.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { cargarCadaVez } from '../lib/loadScripts.js';
import { startGeminiLive, supportsGeminiLive } from '../lib/geminiLive.js';

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
  '/assets/css/header.css?v=9',
  '/assets/css/responsive.css',
  '/assets/css/vall-ai-page.css?v=14',
  '/assets/css/vall-ai-redesign.css?v=46',
];

const DEPENDENCIAS = ['/assets/js/data-service.js?v=23', '/assets/js/report-artifacts.js?v=2'];
const PAGINA_JS = '/assets/js/vall-ai-page-v4.js?v=70';

const SUGERENCIAS = [
  { prompt: 'Soy distribuidor mundial de res, cerdo, huevo y pollo. ¿Qué noticias, restricciones sanitarias y riesgos logísticos de los últimos siete días pueden afectar mis compras, ventas y margen? Da fechas y fuentes; separa hechos de escenarios.', icono: 'fa-truck', titulo: 'Compra y venta de proteínas', nota: 'Abasto, rutas y margen comercial' },
  { prompt: 'Vendo cerdo. Usa estos supuestos hipotéticos: compra 80 MXN/kg, flete 5 MXN/kg, merma de peso 4% y venta 100 MXN/kg. Calcula costo por kg vendible, margen sobre venta y recargo sobre costo. No busques precios.', icono: 'fa-calculator', titulo: 'Calcular margen y merma', nota: 'Ejercicio con supuestos explícitos' },
  { prompt: 'Dame un panorama ejecutivo de los mercados globales hoy', icono: 'fa-earth-americas', titulo: 'Panorama global', nota: 'Mercados, tasas y riesgo' },
  { prompt: 'Compara los últimos precios verificables de cerdo, pollo, huevo y res alrededor del mundo. Muestra país, categoría, etapa, moneda/unidad, fecha y fuente; separa referencias regionales de precios locales y señala brechas.', icono: 'fa-globe', titulo: 'Precios de proteínas', nota: 'Cerdo, pollo, huevo y res' },
  { prompt: 'Dame las tendencias y comentarios públicos más recientes de Mercolleida sobre porcino y cereales, con fechas y fuentes', icono: 'fa-wheat-awn', titulo: 'Mercolleida', nota: 'Tendencias y comentarios públicos' },
  { prompt: 'Resume los análisis públicos disponibles de Rabobank sobre proteínas y granos, con fechas, enlaces y diferencias entre datos y pronósticos', icono: 'fa-book-open', titulo: 'Rabobank', nota: 'Análisis sectorial y perspectivas' },
  { prompt: 'Investiga las noticias internacionales recientes sobre cerdo, pollo, huevo y res, y los acuerdos entre países que afectan su comercio. Contrasta fuentes oficiales, Mercolleida y Rabobank; distingue anuncios, permisos sanitarios y medidas vigentes, con fechas y enlaces.', icono: 'fa-handshake', titulo: 'Proteínas y comercio', nota: 'Noticias, acuerdos y riesgos' },
  { prompt: 'Compara petróleo, gas natural y metales industriales', icono: 'fa-oil-well', titulo: 'Materias primas', nota: 'Comparación estructurada' },
  { prompt: 'Calcula una regresión lineal del ASX 200 de Australia en el año 2023', icono: 'fa-globe', titulo: 'Mercados mundiales', nota: 'Índices y datos verificables' },
  { prompt: 'Dame las noticias financieras globales de hoy, con fuentes y riesgos a vigilar', icono: 'fa-newspaper', titulo: 'Noticias globales', nota: 'Hechos, fuentes y contexto' },
  { prompt: 'Crea un reporte técnico sobre renta fija global', icono: 'fa-file-lines', titulo: 'Reporte técnico', nota: 'Datos, riesgos y conclusión' },
  { prompt: 'Calcula una regresión lineal de USD/MXN para el último año y explica R², pendiente y límites estadísticos', icono: 'fa-square-poll-vertical', titulo: 'Modelo estadístico', nota: 'Regresión OLS verificable' },
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

export default function Orion() {
  const [ready,setReady]=useState(false);
  const [loadError,setLoadError]=useState(false);
  usePageStyles(HOJAS);

  useEffect(() => {
    document.body.classList.add('vall-ai-body');
    const previousTitle = document.title;
    document.title = 'ORION | VALLNews';
    return () => {
      document.body.classList.remove('vall-ai-body');
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const bridge = { start: startGeminiLive, isSupported: supportsGeminiLive };
    window.VNGeminiLive = bridge;
    return () => {
      if (window.VNGeminiLive === bridge) delete window.VNGeminiLive;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    let quitarScript = null;

    (async () => {
      try {
        await loadScripts(DEPENDENCIAS);
      } catch (e) {
        console.error('ORION: no se pudo cargar data-service', e);
      }
      if (!vivo) return;
      quitarScript = cargarCadaVez(PAGINA_JS, 'vall-ai', {
        onLoad:()=>{if(vivo) {const initialized=Boolean(window.VNVallAi);setReady(initialized);setLoadError(!initialized);}},
        onError:()=>{if(vivo) setLoadError(true);},
      });
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
            <ConstelacionOrion className="vai-orb vai-orion--brand" label="Constelación de ORION" />
            <div className="vai-side-brand-copy"><strong>ORION</strong><span><i /> Disponible</span></div>
            <button className="vai-side-close" id="vaiSideClose" type="button" aria-label="Cerrar historial"><i className="fas fa-xmark" /></button>
          </div>
          <div className="vai-sidebar-primary">
            <button className="vai-new" id="vaiNew" type="button" title="Nueva conversación"><i className="fas fa-plus" /><span>Nueva conversación</span></button>
            <button className="vai-sidebar-command" id="vaiQuickSearch" type="button" title="Buscar conversaciones"><i className="fas fa-magnifying-glass" /><span>Buscar chats</span></button>
            <button className="vai-sidebar-command vai-reports-command" id="vaiOpenReportStudio" type="button" title="Abrir editor de reportes"><i className="fas fa-file-pen" aria-hidden="true" /><span>Editor de reportes</span></button>
          </div>

          <label className="vai-search" htmlFor="vaiHistorySearch">
            <i className="fas fa-magnifying-glass" />
            <input id="vaiHistorySearch" type="search" placeholder="Buscar conversaciones…" autoComplete="off" />
          </label>

          <div className="vai-history-head">
            <div><span>Historial</span><small>Tus conversaciones</small></div>
            <kbd id="vaiHistoryCount">0</kbd>
          </div>
          <div className="vai-history" id="vaiHistory" />
          <div className="vai-sidebar-footer">
            <button className="vai-sidebar-collapse" id="vaiSidebarCollapse" type="button" aria-label="Contraer historial" aria-expanded="true" title="Contraer historial"><i className="fas fa-chevron-left" /><span className="vai-sidebar-collapse-copy">Contraer historial</span></button>
          </div>
        </aside>

        <section className="vai-workspace orion-composer-layout">
          <header className="vai-toolbar">
            <button className="vai-history-toggle" id="vaiHistoryToggle" type="button" aria-label="Abrir historial de conversaciones" aria-controls="vaiSidebar" aria-expanded="false">
              <i className="fas fa-clock-rotate-left" />
              <span>Historial</span>
            </button>
          </header>

          <div className="vai-messages" id="vaiMessages" aria-live="polite">
            <section className="vai-welcome" id="vaiWelcome">
              <ConstelacionOrion className="vai-welcome-mark vai-orion--welcome" label="Constelación de ORION" />
              <span className="vai-eyebrow">ORION · INTELIGENCIA ECONÓMICA</span>
              <h1>¿Qué quieres analizar hoy?</h1>
              <p>Conecta mercados y proteínas: precios de cerdo, pollo, huevo y res, noticias internacionales y comercio entre países, con fuentes y contexto.</p>
              <div className="vai-welcome-signals" aria-label="Capacidades de ORION">
                <span><i className="fas fa-database" /> Datos y contexto</span>
                <span><i className="fas fa-chart-column" /> Análisis estructurado</span>
                <span><i className="fas fa-diagram-project" /> Tablas, gráficas y mapas</span>
                <span><i className="fas fa-file-arrow-down" /> Reportes exportables</span>
              </div>
              <div className="vai-prompts">
                {SUGERENCIAS.map((s) => (
                  <button key={s.titulo} type="button" data-prompt={s.prompt} disabled={!ready}>
                    <i className={`fas ${s.icono}`} />
                    <span><b>{s.titulo}</b><small>{s.nota}</small></span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <footer className="vai-composer-wrap">
            <ChatUsageBar />
            <form className="vai-composer" id="vaiForm" aria-busy={!ready} onSubmit={event=>{if(!ready) event.preventDefault();}}>
              <div className="vai-compose-head">
                <div className="vai-compose-identity">
                  <ConstelacionOrion id="vaiConversationFace" className="vai-conversation-face" label="ORION disponible" />
                  <span><strong>Consulta con ORION</strong><small>Inteligencia económica en contexto</small></span>
                </div>
                <span className="vai-compose-mode"><i className="fas fa-wand-magic-sparkles" /> Análisis adaptativo</span>
              </div>
              <div className="vai-dropzone" id="vaiDropzone" hidden>
                <i className="fas fa-cloud-arrow-up" />
                <strong>Suelta tus archivos aquí</strong>
                <span>Imágenes, PDF, texto, CSV, Markdown o JSON</span>
              </div>
              <div className="vai-attachments" id="vaiAttachments" hidden aria-live="polite" />
              <textarea id="vaiInput" rows={1} maxLength={4000} placeholder={ready ? 'Pregunta a ORION…' : 'Cargando ORION…'} disabled={!ready} aria-label="Mensaje para ORION" />
              <div className="vai-compose-bottom">
                <div className="vai-compose-context">
                  <button className="vai-attach" id="vaiAttach" type="button" disabled={!ready} title="Adjuntar archivos o imágenes" aria-label="Adjuntar archivos o imágenes"><i className="fas fa-paperclip" /></button>
                  <input id="vaiFileInput" type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown,application/json,.md,.csv,.json,.txt,.pdf" />
                  <span><b>Adjuntar contexto</b><small>PDF, CSV, imágenes o datos</small></span>
                </div>
                <div className="vai-compose-actions">
                  <span className="vai-compose-shortcut"><kbd>Enter</kbd> enviar</span>
                  <OrionModelSelector />
                  <button className="vai-stop" id="vaiStop" type="button" hidden><i className="fas fa-stop" /></button>
                  <button className="vai-send" id="vaiSend" type="submit" disabled={!ready} aria-label="Enviar mensaje"><i className="fas fa-arrow-up" /></button>
                </div>
              </div>
            </form>
            {loadError && <p role="alert">No se pudo iniciar ORION. Recarga la página para volver a intentarlo.</p>}
            <p className="vai-disclaimer">ORION puede cometer errores. Verifica cifras sensibles antes de tomar decisiones.</p>
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
              <h2 id="vaiReportStudioTitle">Editor y vista previa del reporte</h2>
              <p id="vaiReportScope"><i className="fas fa-crosshairs" /> Reporte solicitado detectado</p>
            </div>
            <div className="vai-report-status"><i /><span id="vaiReportStatus" role="status" aria-live="polite">Cambios guardados localmente</span></div>
            <button type="button" data-report-close aria-label="Cerrar"><i className="fas fa-xmark" /></button>
          </header>

          <div className="vai-report-toolbar">
            <label>Título<input id="vaiReportTitle" maxLength={120} defaultValue="Reporte ORION" /></label>
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
              <button type="button" data-report-view="split" className="active"><i className="fas fa-columns" /> Editar y revisar</button>
              <button type="button" data-report-view="preview"><i className="fas fa-eye" /> Vista previa</button>
            </div>
            <button id="vaiReportRefresh" type="button"><i className="fas fa-rotate" /> Actualizar</button>
            <button className="primary" id="vaiReportExport" type="button"><i className="fas fa-download" /> Exportar</button>
            <a id="vaiReportLibrary" className="vai-report-library" href="/informes" hidden>Ver en Mis informes</a>
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
                  <button type="button" id="vaiReportSave" title="Guardar en Mis informes"><i className="fas fa-floppy-disk" /><span>Guardar</span></button>
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
          <ConstelacionOrion id="vaiVoiceOrb" className="vai-voice-orb vai-orion--voice" label="ORION está escuchando" />
          <div className="vai-voice-ring" />
        </div>
        <div className="vai-voice-status" id="vaiVoiceStatus">Escuchando...</div>
        <div className="vai-voice-transcript" aria-live="polite">
          <p id="vaiVoiceUserTranscript" />
          <p id="vaiVoiceAiTranscript" />
        </div>
        <button type="button" className="vai-voice-hangup" id="vaiVoiceHangup" title="Terminar llamada">
          <i className="fas fa-phone-slash" />
        </button>
      </div>
    </>
  );
}
