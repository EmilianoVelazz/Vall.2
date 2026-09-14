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
 *
 * EL ORDEN IMPORTA, y es la parte delicada. En los .html originales el bloque
 * <style> propio de la página iba DESPUÉS de todos los <link>, así que ganaba
 * cualquier conflicto. Al migrarlo, ese bloque pasó a ser un `import './X.css'`
 * que Vite agrupa y coloca en el <head> al arrancar la aplicación — es decir,
 * ANTES de que este hook llegue a añadir nada. Con un appendChild las hojas
 * heredadas quedaban por debajo en el documento y le pisaban el diseño a la
 * página: en Finanzas eso apagaba la tonalidad oscura, porque
 * finanzas-favro.css y finanzas-premium.css sobrescribían sus colores.
 *
 * Por eso se insertan ANTES del primer nodo que gestiona Vite, y no al final.
 * Así el orden vuelve a ser el del HTML: primero normalize y las fuentes (que
 * vienen de index.html), luego las hojas heredadas, y el CSS propio de la
 * sección al final.
 */
const refs = new Map();

/**
 * Primer nodo de estilo que pertenece al bundle. En desarrollo Vite marca sus
 * <style> con data-vite-dev-id; en producción emite un <link> a /vn-app/.
 */
function anclaDelBundle() {
  return document.head.querySelector('style[data-vite-dev-id], link[href*="/vn-app/"]');
}

export default function usePageStyles(hojas) {
  const clave = hojas.join('|');

  useEffect(() => {
    const propias = [];

    const ancla = anclaDelBundle();

    for (const href of hojas) {
      const n = refs.get(href) || 0;
      refs.set(href, n + 1);
      propias.push(href);
      if (n > 0) continue; // ya está en el head

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.vnPageCss = href;
      // insertBefore con el ancla conserva el orden de `hojas` entre ellas y las
      // deja por encima del CSS de la sección. Sin ancla (nada del bundle en el
      // head todavía) se cae al comportamiento anterior.
      if (ancla) document.head.insertBefore(link, ancla);
      else document.head.appendChild(link);
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
