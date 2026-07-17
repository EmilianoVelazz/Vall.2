import { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { usePageStyles, loadScriptsInOrder } from '../lib/assets.js';
import MERCADOS_HTML from './mercadosMarkup.js';

const LWC = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';

// Mercados: React posee la ruta y monta el markup verbatim + su lógica (js/mercados-page.js).
export default function Mercados() {
  usePageStyles(['/css/header.css?v=6', '/css/footer.css', '/css/mercados-page.css']);
  const [err, setErr] = useState('');

  useEffect(() => {
    let disposed = false;

    // Captura de errores JS (de mercados-page.js u otros) para mostrarlos en
    // pantalla y poder diagnosticar sin abrir la consola.
    const onErr = (ev) => {
      const msg = ev?.error?.message || ev?.message || 'Error desconocido';
      const src = ev?.filename ? ` · ${ev.filename.split('/').pop()}:${ev.lineno}` : '';
      if (!disposed) setErr(`${msg}${src}`);
    };
    window.addEventListener('error', onErr);

    // Fallback: garantizar que la pestaña "General" se vea siempre.
    const ensurePane = () => {
      if (disposed) return;
      try {
        if (typeof window.mktTab === 'function') {
          window.mktTab('general', document.querySelector('[data-tab="general"]'));
        } else {
          const p = document.getElementById('pane-general');
          if (p && getComputedStyle(p).display === 'none') p.style.display = 'block';
        }
      } catch (e) { console.warn('[Mercados] ensurePane', e); }
    };

    (async () => {
      try {
        await loadScriptsInOrder([
          '/js/api-keys.js?v=3',
          '/js/data-service.js?v=15',
          LWC,
          '/js/mercados-page.js',
        ]);
      } catch (e) { if (!disposed) setErr(`Carga de scripts: ${e?.message || e}`); }
      if (disposed) return;
      window.scrollTo(0, 0);
      ensurePane();
    })();

    const t1 = setTimeout(ensurePane, 800);
    const t2 = setTimeout(ensurePane, 2000);
    return () => {
      disposed = true;
      window.removeEventListener('error', onErr);
      clearTimeout(t1); clearTimeout(t2);
    };
  }, []);

  return (
    <>
      <Header />
      {err && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
          background: '#dc2626', color: '#fff', padding: '.6rem 1rem',
          fontSize: '.8rem', fontFamily: 'monospace', textAlign: 'center',
        }}>
          ⚠️ Error en Mercados: {err}
        </div>
      )}
      <div className="vn-mkt-clear" dangerouslySetInnerHTML={{ __html: MERCADOS_HTML }} />
      <Footer />
    </>
  );
}
