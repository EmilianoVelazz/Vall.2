import { useEffect } from 'react';

// Inyecta hojas de estilo globales una sola vez (nunca se eliminan).
export function injectGlobalStyles(hrefs) {
  hrefs.forEach((href) => {
    if (document.querySelector(`link[data-vn-style="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.dataset.vnStyle = href;
    document.head.appendChild(l);
  });
}

// Hook: inyecta CSS específico de una página y lo elimina al desmontar,
// evitando que estilos de una sección afecten a otra.
export function usePageStyles(hrefs) {
  useEffect(() => {
    const created = [];
    hrefs.forEach((href) => {
      if (document.querySelector(`link[data-vn-page-style="${href}"]`)) return;
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.dataset.vnPageStyle = href;
      document.head.appendChild(l);
      created.push(l);
    });
    return () => created.forEach((l) => l.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Carga un script legacy una sola vez (idempotente). Preserva atributos como
// data-mascota que usan los widgets originales.
export function loadScript(src, attrs) {
  return new Promise((resolve, reject) => {
    // Deduplicamos por ruta base (ignorando ?v=…) para no cargar dos veces
    // scripts como data-service.js que definen globals con const de nivel raíz.
    const base = src.split('?')[0];
    if (document.querySelector(`script[data-vn-legacy="${base}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset.vnLegacy = base;
    if (attrs) Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.body.appendChild(s);
  });
}

// Carga varios scripts respetando el orden (algunos dependen de otros:
// data-service define window.VDS que usan live-engine e immersive).
export async function loadScriptsInOrder(list) {
  for (const item of list) {
    const [src, attrs] = Array.isArray(item) ? item : [item, null];
    try {
      await loadScript(src, attrs);
    } catch (e) {
      console.warn('[legacy]', e.message);
    }
  }
}
