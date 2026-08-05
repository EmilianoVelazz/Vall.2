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
  'vall-ai.html': '/vall-ai',
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

      // 2. Cuerpo + reescritura de enlaces internos.
      //
      // Los <script> del cuerpo se sustituyen por una marca en su MISMA
      // posición en vez de borrarse. Esa posición importa: algunos scripts
      // legacy usan document.write, que inserta justo donde está el script.
      const bodyClone = doc.body.cloneNode(true);
      const scriptsCuerpo = [];
      bodyClone.querySelectorAll('script').forEach((s, i) => {
        const marca = doc.createElement('span');
        marca.dataset.vnScriptSlot = String(i);
        marca.style.display = 'none';
        s.replaceWith(marca);
        scriptsCuerpo.push(s);
      });
      bodyClone.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        const file = href && href.split('/').pop().split('?')[0];
        if (file && ROUTE_BY_FILE[file]) a.setAttribute('href', ROUTE_BY_FILE[file]);
      });
      ref.current.innerHTML = bodyClone.innerHTML;

      // 3. document.write deja de ser destructivo mientras se reejecuta.
      //
      // Durante la carga normal de una página, document.write inserta texto en
      // el punto donde está el script. Aquí los scripts corren DESPUÉS de que el
      // documento esté cargado, y en ese momento document.write abre un
      // documento nuevo y borra todo lo que hubiera — incluido el propio nodo
      // de React. Es lo que vaciaba la pantalla: del login solo sobrevivía el
      // año que escribía su pie de página.
      //
      // Se sustituye por una versión que inserta el HTML en la marca del script
      // que se está ejecutando, que es donde el original lo habría puesto.
      const writeOriginal = document.write;
      const writelnOriginal = document.writeln;
      let anclaActual = null;
      const escribir = (...trozos) => {
        const html = trozos.join('');
        if (!html) return;
        const destino = anclaActual && anclaActual.isConnected ? anclaActual : null;
        const frag = document.createRange().createContextualFragment(html);
        if (destino) destino.parentNode.insertBefore(frag, destino);
        else if (ref.current) ref.current.appendChild(frag);
      };
      document.write = escribir;
      document.writeln = (...t) => escribir(...t, '\n');

      // 4. Reejecutar TODOS los scripts (head + cuerpo) en orden de documento.
      //    El head trae dependencias críticas (chart.js, api-keys, data-service
      //    → window.VDS) de las que dependen los scripts del cuerpo.
      const scriptsCabecera = Array.from(doc.head.querySelectorAll('script'));
      const enOrden = [
        ...scriptsCabecera.map((s) => ({ s, marca: null })),
        ...scriptsCuerpo.map((s, i) => ({
          s,
          marca: ref.current.querySelector(`[data-vn-script-slot="${i}"]`),
        })),
      ];

      try {
        for (const { s, marca } of enOrden) {
          if (cancelled) return;
          anclaActual = marca;
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
      } finally {
        document.write = writeOriginal;
        document.writeln = writelnOriginal;
        anclaActual = null;
      }
      if (cancelled) return;

      // Los scripts que escuchan DOMContentLoaded (ya disparado en la SPA) se
      // inicializan al re-emitir el evento.
      //
      // `bubbles: true` NO es opcional: sin él el evento se queda en `document`
      // y no alcanza a los listeners registrados en `window`. Varios scripts de
      // finanzas escuchan ahí — uno de ellos traslada paneles enteros a la
      // sección Mercados — y sin burbujeo esa sección se renderiza vacía.
      document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
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
