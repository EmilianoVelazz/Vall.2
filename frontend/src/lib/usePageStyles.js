import { useEffect } from 'react';

/**
 * Inyecta en el <head> las hojas de estilo que una página React necesita.
 *
 * Las páginas migradas reutilizan el CSS que ya existe en /assets/css en vez de
 * reescribirlo: así el aspecto es idéntico al de la versión HTML y un ajuste de
 * diseño sigue viviendo en un solo archivo. Lo que cambia en la migración es el
 * markup y el estado (ahora JSX + hooks), no la capa visual.
 *
 * Las hojas se marcan con data-vn-page-css para poder retirarlas al desmontar y
 * evitar que el CSS de una sección se filtre a la siguiente. Si otra página ya
 * inyectó la misma hoja se reutiliza y solo se lleva la cuenta de referencias.
 */
const refs = new Map();

export default function usePageStyles(hojas) {
  const clave = hojas.join('|');

  useEffect(() => {
    const propias = [];

    for (const href of hojas) {
      const n = refs.get(href) || 0;
      refs.set(href, n + 1);
      propias.push(href);
      if (n > 0) continue; // ya está en el head

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.vnPageCss = href;
      document.head.appendChild(link);
    }

    return () => {
      for (const href of propias) {
        const n = (refs.get(href) || 1) - 1;
        refs.set(href, n);
        if (n > 0) continue;
        document.querySelector(`link[data-vn-page-css="${href}"]`)?.remove();
      }
    };
    // `hojas` suele ser un literal nuevo en cada render; la clave estable evita
    // desmontar y reinyectar el CSS (y el parpadeo que eso provoca).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
}
