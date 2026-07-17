import { useEffect, useRef, useState } from 'react';

// Mapa de páginas legacy → rutas React, para reescribir los enlaces internos
// del HTML montado y mantener la navegación dentro de la app.
const ROUTE_BY_FILE = {
  'inicio.html': '/inicio',
  'finanzas.html': '/finanzas',
  'mercados.html': '/mercados',
  'geopolitica.html': '/geopolitica',
  'mexico.html': '/mexico',
  'mercadoproteinas.html': '/mercado-proteinas',
  'configuracion.html': '/configuracion',
};

// Resuelve una URL relativa del HTML legacy a una ruta same-origin (para que
// pase por el proxy de Vite en dev y por el mismo host en prod).
function toSameOrigin(value, base) {
  if (!value) return value;
  if (/^https?:/i.test(value) || value.startsWith('data:')) return value;
  const u = new URL(value, base);
  return u.pathname + u.search;
}

/**
 * Monta una página HTML legacy dentro del SPA de React (patrón Strangler Fig):
 * trae el HTML, inyecta su CSS, monta el <body>, reescribe enlaces internos y
 * reejecuta sus scripts en orden. Preserva el diseño y el comportamiento al 100%.
 */
export default function LegacyPage({ src }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const injected = [];

    (async () => {
      let html;
      try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
      } catch (e) {
        if (!cancelled) setError(e.message);
        return;
      }
      if (cancelled || !ref.current) return;

      const base = new URL(src, window.location.origin).href;
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // 1. Hojas de estilo e <style> del <head> original.
      doc.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
        const href = l.getAttribute('href');
        if (!href) return;
        const abs = toSameOrigin(href, base);
        if (document.querySelector(`link[data-vn-legacy-css="${abs}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = abs;
        link.dataset.vnLegacyCss = abs;
        document.head.appendChild(link);
        injected.push(link);
      });
      doc.querySelectorAll('head > style').forEach((s) => {
        const st = document.createElement('style');
        st.textContent = s.textContent;
        st.dataset.vnLegacyStyle = '1';
        document.head.appendChild(st);
        injected.push(st);
      });

      // 2. Cuerpo (sin scripts) + reescritura de enlaces internos.
      const bodyClone = doc.body.cloneNode(true);
      bodyClone.querySelectorAll('script').forEach((s) => s.remove());
      bodyClone.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        const file = href && href.split('/').pop().split('?')[0];
        if (file && ROUTE_BY_FILE[file]) a.setAttribute('href', ROUTE_BY_FILE[file]);
      });
      ref.current.innerHTML = bodyClone.innerHTML;

      // 3. Reejecutar TODOS los scripts (head + body) en orden de documento.
      //    El head trae dependencias críticas (chart.js, api-keys, data-service
      //    → window.VDS) de las que dependen los scripts del body.
      const scripts = Array.from(doc.querySelectorAll('script'));
      for (const s of scripts) {
        if (cancelled) return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          const el = document.createElement('script');
          for (const attr of s.attributes) el.setAttribute(attr.name, attr.value);
          el.dataset.vnLegacyScript = '1';
          const srcAttr = s.getAttribute('src');
          if (srcAttr) {
            el.src = toSameOrigin(srcAttr, base);
            el.async = false;
            el.onload = resolve;
            el.onerror = resolve;
            document.body.appendChild(el);
          } else {
            el.textContent = s.textContent;
            document.body.appendChild(el);
            resolve();
          }
          injected.push(el);
        });
      }
      if (cancelled) return;

      // Los scripts que escuchan DOMContentLoaded (ya disparado en la SPA)
      // se inicializan al re-emitir el evento.
      document.dispatchEvent(new Event('DOMContentLoaded'));
      window.scrollTo(0, 0);
    })();

    return () => {
      cancelled = true;
      injected.forEach((el) => el.remove());
    };
  }, [src]);

  if (error) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <h2>No se pudo cargar esta sección</h2>
        <p style={{ color: '#888' }}>{error}. Verifica que el backend esté corriendo en el puerto 3001.</p>
        <a href="/inicio">← Volver al inicio</a>
      </div>
    );
  }

  return <div ref={ref} className="vn-legacy-root" />;
}
