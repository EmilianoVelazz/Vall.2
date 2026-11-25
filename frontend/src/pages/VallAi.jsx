import { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import ConstelacionOrion from '../components/ConstelacionOrion.jsx';
import OrionModelSelector from '../components/OrionModelSelector.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { cargarCadaVez } from '../lib/loadScripts.js';
import { startGeminiLive, supportsGeminiLive } from '../lib/geminiLive.js';
import {useAuth} from '../context/AuthContext.jsx';
import {createOrionSession} from '../lib/orionSession.js';
import {consumeOrionReportHandoff} from '../lib/orionHandoff.js';

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
  '/assets/css/vall-ai-redesign.css?v=47',
];

const DEPENDENCIAS = ['/assets/js/data-service.js?v=23', '/assets/js/report-artifacts.js?v=2'];
const PAGINA_JS = '/assets/js/vall-ai-page-v4.js?v=73';

const GRUPOS_SUGERENCIAS = [
  {
    id: 'proteinas',
    label: 'Proteínas y Paridad',
    icono: 'fa-drumstick-bite',
    items: [
      { prompt: 'Dame un panorama visual global hoy con tabla comparativa y gráfica: cómo están el cerdo, res, pollo y huevo en México, EE. UU., Brasil y Europa, y cómo les pega hoy el dólar y el maíz.', icono: 'fa-globe', titulo: 'Precios globales de proteínas', nota: 'MX, EE. UU., Brasil y UE + maíz' },
      { prompt: 'Compara la mediana SNIIM de México frente a la paridad de importación puesta en frontera desde EE. UU., Brasil y Europa en MXN/kg para cerdo, res, pollo y huevo.', icono: 'fa-ship', titulo: 'Paridad de importación MX', nota: 'SNIIM vs frontera en MXN/kg' },
      { prompt: 'Compara el precio físico del cerdo y pollo en Jalisco, Puebla, Nuevo León y Sonora según los datos más recientes del SNIIM y Porcicultura.', icono: 'fa-map-location-dot', titulo: 'Proteínas por estado (MX)', nota: 'Jalisco, Puebla, NL y Sonora' },
    ],
  },
  {
    id: 'mercados',
    label: 'Mercados y Tesorería',
    icono: 'fa-chart-line',
    items: [
      { prompt: 'Quiero una matriz comparativa de mercados globales hoy: bolsas (IPC, S&P 500, Europa, Asia), bonos (CETES, Treasury 10Y), divisas, energía (WTI/gas) y metales (oro/cobre).', icono: 'fa-earth-americas', titulo: 'Matriz global de mercados', nota: 'Bolsas, bonos, FX, energía y metales' },
      { prompt: 'Compara CETES 28 días frente al Treasury 10 años y dime cómo se mueve el WTI y el gas natural hoy; ¿conviene cubrir dólares y fletes este mes?', icono: 'fa-landmark', titulo: 'Bonos, tasas y cobertura FX', nota: 'CETES 28d, Treasury 10A y WTI' },
      { prompt: 'Compara el comportamiento reciente del S&P/BMV IPC y S&P 500 junto con Tyson Foods, Pilgrim\'s Pride y JBS.', icono: 'fa-building-columns', titulo: 'Bolsas y emisoras de proteína', nota: 'IPC, S&P 500, TSN, PPC y JBS' },
    ],
  },
  {
    id: 'riesgos',
    label: 'Riesgos y Noticias',
    icono: 'fa-shield-virus',
    items: [
      { prompt: '¿Qué riesgos macro, energéticos y sanitarios en el mundo debo vigilar esta semana que puedan mover el costo de proteína y mi tesorería en México?', icono: 'fa-triangle-exclamation', titulo: 'Riesgos de la semana', nota: 'Macro, energía y Radar NLP' },
      { prompt: 'Revisa el radar NLP de riesgo sanitario y comercial activo (0–100) por influenza aviar H5N1, peste porcina africana, gusano barrenador y aranceles.', icono: 'fa-shield-virus', titulo: 'Radar sanitario H5N1 / PPA', nota: 'SENASICA, brotes y aranceles' },
      { prompt: '¿Qué acuerdos comerciales, aranceles o restricciones sanitarias recientes entre China, Estados Unidos y México afectan la carne de cerdo y res?', icono: 'fa-handshake', titulo: 'Comercio y aranceles', nota: 'China, EE. UU., México y Rabobank' },
    ],
  },
  {
    id: 'calculos',
    label: 'Cálculos y ML',
    icono: 'fa-microchip',
    items: [
      { prompt: 'Analiza con tus modelos ML si tiende a subir o bajar el precio del cerdo, res, pollo y huevo en México y EE. UU. Muestra probabilidades, bandas P80 y factores SHAP.', icono: 'fa-microchip', titulo: 'Pronóstico ML y SHAP', nota: 'Walk-forward y bandas P80' },
      { prompt: 'Supuesto comercial: compro 10 toneladas de cerdo en canal a 58 MXN/kg, pago 3.50 MXN/kg de flete, tengo 6% de merma y vendo a 74 MXN/kg. Calcula margen y equilibrio. No busques precios.', icono: 'fa-calculator', titulo: 'Calcular margen y merma', nota: 'Costo vendible y equilibrio' },
      { prompt: 'Si el cutout de cerdo en EE. UU. está en 70.63 USD/cwt (por 100 libras), ¿cuánto equivale en MXN/kg usando el tipo de cambio actual?', icono: 'fa-scale-balanced', titulo: 'Convertir USD/cwt a MXN/kg', nota: 'Masa + tipo de cambio vigente' },
    ],
  },
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
  const {user}=useAuth();
  return <OrionWorkspace key={user} user={user} />;
}
function OrionWorkspace({user}) {
  const [persistenceNotice,setPersistenceNotice]=useState('');
  const [ready,setReady]=useState(false);
  const [loadError,setLoadError]=useState(false);
  const [orionMlLive,setOrionMlLive]=useState(null);
  const [promptTab,setPromptTab]=useState('proteinas');
  usePageStyles(HOJAS);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/marranas', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!ctrl.signal.aborted && json?.available) {
          setOrionMlLive({
            activeModels: json.stats?.activeModels || 0,
            wfAcc: json.stats?.avgWalkForwardDirectionalAccuracyPct ?? null,
            nlpCount: json.nlpEvents?.stats?.relevantEventsDetected || 0,
          });
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const triggerOrionMlBoard = () => {
    const sidebar = document.getElementById('vaiSidebar');
    if (sidebar?.classList.contains('open')) sidebar.classList.remove('open');
    const input = document.getElementById('vaiInput');
    if (!input || input.disabled) return;
    input.value = 'Entrégame el tablero ejecutivo de ORION apoyado en tus modelos ML para cerdo, res, pollo y huevo en México y el mundo: consenso direccional, factores SHAP, paridad de importación MXN/kg y alertas activas del radar NLP sanitario/comercial.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };

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
    const inspectPdf = async (file) => {
      const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      GlobalWorkerOptions.workerSrc = workerUrl;
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocument({ data }).promise;
      const pages = Number(pdf.numPages || 0);
      const chunks = [];
      for (let pageIndex = 1; pageIndex <= Math.min(pages, 2); pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const textContent = await page.getTextContent();
        const line = (textContent.items || []).map((entry) => entry?.str || '').join(' ').replace(/\s+/g, ' ').trim();
        if (line) chunks.push(`[Pág. ${pageIndex}] ${line}`);
        if (chunks.join('\n\n').length >= 900) break;
      }
      try { await pdf.destroy(); } catch { /* noop */ }
      return { pages, excerpt: chunks.join('\n\n').slice(0, 900) };
    };
    const consumeHandoff = () => consumeOrionReportHandoff(undefined, { owner: user });
    window.VNGeminiLive = bridge;
    window.VNInspectPdf = inspectPdf;
    window.VNConsumeOrionHandoff = consumeHandoff;
    return () => {
      if (window.VNGeminiLive === bridge) delete window.VNGeminiLive;
      if (window.VNInspectPdf === inspectPdf) delete window.VNInspectPdf;
      if (window.VNConsumeOrionHandoff === consumeHandoff) delete window.VNConsumeOrionHandoff;
    };
  }, [user]);

  useEffect(() => {
    let vivo = true;
    let quitarScript = null;
    setReady(false);setLoadError(false);setPersistenceNotice('');
    const session=createOrionSession(user,{onInvalid:()=>{if(vivo){setReady(false);window.dispatchEvent(new Event('vn:session-refresh'));}},onStorageUnavailable:()=>{if(vivo)setPersistenceNotice('El almacenamiento local no está disponible. Puedes continuar; el historial se intentará guardar en tu perfil.');}});
    window.VNOrionSession=session;

    (async () => {
      try {
        await loadScripts(DEPENDENCIAS);
      } catch (e) {
        console.error('ORION: no se pudo cargar data-service', e);
        if(vivo)setLoadError(true);
        return;
      }
      if (!vivo) return;
      quitarScript = cargarCadaVez(PAGINA_JS, 'vall-ai', {
        onLoad:()=>{if(vivo) {const initialized=Boolean(window.VNVallAi);setReady(initialized);setLoadError(!initialized);}},
        onError:()=>{if(vivo) setLoadError(true);},
      });
    })();

    return () => {
      vivo = false;
      session.close();
      window.VNVallAi?.desmontar?.();
      quitarScript?.();
      if(window.VNOrionSession===session)delete window.VNOrionSession;
    };
  }, [user]);

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
            <button
              className="vai-sidebar-command"
              type="button"
              disabled={!ready}
              onClick={triggerOrionMlBoard}
              title={orionMlLive ? `ORION asistido por ML: ${orionMlLive.activeModels} modelos activos · WF ${orionMlLive.wfAcc}% · ${orionMlLive.nlpCount} eventos NLP` : 'Abrir tablero cuantitativo ML de ORION'}
            >
              <i className="fas fa-microchip" aria-hidden="true" />
              <span>{orionMlLive ? `Tablero ML (${orionMlLive.activeModels})` : 'Tablero ML de ORION'}</span>
            </button>
            <div className="vai-export-wrap" id="vaiExportWrap">
              <button className="vai-sidebar-command vai-export-chat" id="vaiExportChat" type="button" title="Exportar conversación completa" aria-haspopup="menu" aria-expanded="false" disabled>
                <i className="fas fa-download" aria-hidden="true" /><span>Exportar chat</span>
              </button>
              <div className="vai-export-menu" id="vaiExportMenu" hidden role="menu" aria-label="Formato de exportación del chat">
                <button type="button" role="menuitem" data-chat-export="md"><i className="fas fa-file-code" aria-hidden="true" /><span>Markdown (.md)</span></button>
                <button type="button" role="menuitem" data-chat-export="txt"><i className="far fa-file-lines" aria-hidden="true" /><span>Texto plano (.txt)</span></button>
                <button type="button" role="menuitem" data-chat-export="pdf"><i className="far fa-file-pdf" aria-hidden="true" /><span>Documento PDF (.pdf)</span></button>
                <button type="button" role="menuitem" data-chat-export="docx"><i className="far fa-file-word" aria-hidden="true" /><span>Microsoft Word (.docx)</span></button>
              </div>
            </div>
          </div>

          <label className="vai-search" htmlFor="vaiHistorySearch">
            <i className="fas fa-magnifying-glass" />
            <input id="vaiHistorySearch" type="search" placeholder="Buscar conversaciones…" autoComplete="off" />
            <button type="button" className="vai-search-clear" id="vaiHistorySearchClear" hidden aria-label="Limpiar búsqueda"><i className="fas fa-xmark" /></button>
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
                <span><i className="fas fa-microchip" /> {orionMlLive ? `ORION + ML activo (${orionMlLive.activeModels} modelos · WF ${orionMlLive.wfAcc}%)` : 'ORION + Motores ML integrados'}</span>
                <span><i className="fas fa-database" /> Datos y contexto</span>
                <span><i className="fas fa-chart-column" /> Análisis estructurado</span>
                <span><i className="fas fa-diagram-project" /> Tablas, gráficas y mapas</span>
                <span><i className="fas fa-file-arrow-down" /> Reportes exportables</span>
              </div>
              <div className="vai-prompt-tabs" role="tablist" aria-label="Categorías de consultas rápidas">
                {GRUPOS_SUGERENCIAS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={promptTab === g.id}
                    className={`vai-prompt-tab${promptTab === g.id ? ' is-active' : ''}`}
                    onClick={() => setPromptTab(g.id)}
                  >
                    <i className={`fas ${g.icono}`} aria-hidden="true" />
                    <span>{g.label}</span>
                  </button>
                ))}
              </div>
              <div className="vai-prompts">
                {(GRUPOS_SUGERENCIAS.find((g) => g.id === promptTab) || GRUPOS_SUGERENCIAS[0]).items.map((s) => (
                  <button key={s.titulo} type="button" data-prompt={s.prompt} disabled={!ready}>
                    <i className={`fas ${s.icono}`} />
                    <span><b>{s.titulo}</b><small>{s.nota}</small></span>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <button type="button" className="vai-scroll-bottom" id="vaiScrollBottom" hidden aria-label="Ir al último mensaje" title="Ir al último mensaje">
            <i className="fas fa-arrow-down" aria-hidden="true" />
          </button>

          <footer className="vai-composer-wrap">
            <form className="vai-composer" id="vaiForm" aria-busy={!ready} onSubmit={event=>{if(!ready) event.preventDefault();}}>
              <div className="vai-compose-head">
                <div className="vai-compose-identity">
                  <ConstelacionOrion id="vaiConversationFace" className="vai-conversation-face" label="ORION disponible" />
                  <span><strong>ORION</strong><small>Inteligencia económica asistida por modelos ML</small></span>
                </div>
                <span className="vai-compose-mode"><i className="fas fa-wand-magic-sparkles" /> Análisis adaptativo</span>
              </div>
              <div className="vai-dropzone" id="vaiDropzone" hidden>
                <i className="fas fa-cloud-arrow-up" />
                <strong>Suelta tus archivos aquí</strong>
                <span>Imágenes, PDF, CSV, Excel (.xlsx), TXT, MD o JSON</span>
              </div>
              <div className="vai-slash-menu" id="vaiSlashMenu" hidden role="listbox" aria-label="Comandos rápidos de ORION" />
              <div className="vai-attachments" id="vaiAttachments" hidden aria-live="polite" />
              <textarea id="vaiInput" rows={1} maxLength={12000} placeholder={ready ? 'Pregunta a ORION o escribe / para comandos…' : 'Cargando ORION…'} disabled={!ready} aria-label="Mensaje para ORION" />
              <div className="vai-compose-bottom">
                <div className="vai-compose-context">
                  <button className="vai-attach" id="vaiAttach" type="button" disabled={!ready} title="Adjuntar archivos o imágenes" aria-label="Adjuntar archivos o imágenes"><i className="fas fa-paperclip" /></button>
                  <input id="vaiFileInput" type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.md,.csv,.tsv,.xlsx,.json,.txt,.pdf" />
                  <span><b>Adjuntar contexto</b><small>CSV, Excel, PDF, JSON o imágenes</small></span>
                </div>
                <div className="vai-compose-actions">
                  <span className="vai-char-count" id="vaiCharCount" hidden aria-live="polite" />
                  <span className="vai-compose-shortcut"><kbd>Enter</kbd> enviar · <kbd>Shift+Enter</kbd> línea</span>
                  <OrionModelSelector />
                  <button className="vai-stop" id="vaiStop" type="button" hidden aria-label="Detener generación"><i className="fas fa-stop" /></button>
                  <button className="vai-send" id="vaiSend" type="submit" disabled={!ready} aria-label="Enviar mensaje"><i className="fas fa-arrow-up" /></button>
                </div>
              </div>
            </form>
            {loadError && <p role="alert">No se pudo iniciar ORION. Recarga la página para volver a intentarlo.</p>}
            {persistenceNotice && <p role="status">{persistenceNotice}</p>}
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
