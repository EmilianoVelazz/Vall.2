import { useEffect } from 'react';

const QUIETO = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Revelado al entrar en pantalla.
 *
 * Marca con `.es-visible` todo lo que lleve `[data-revelar]` dentro del nodo
 * dado, en cuanto asoma. El CSS es quien decide el movimiento; aquí solo se
 * pone la clase.
 *
 * Se desconecta de cada elemento en cuanto lo revela: una portada tiene ~25
 * nodos animados y mantener el observador vivo sobre todos ellos cuesta más que
 * la animación. Además así nada vuelve a esconderse al subir, que es el tic más
 * molesto de este patrón.
 *
 * EL ESTADO OCULTO LO ACTIVA ESTE HOOK, NO EL CSS
 * El atributo `data-anima` sobre la raíz es el que hace que el CSS esconda los
 * `[data-revelar]`. Se pone aquí, justo antes de empezar a observar. Si este
 * módulo no llega a ejecutarse —error de JS, bundle que no carga— el atributo no
 * aparece, nada se esconde y la página se ve entera. Al revés (esconder desde el
 * CSS y confiar en que el JS lo deshaga) una pantalla en blanco es el modo de
 * fallo, y es peor que no animar.
 *
 * POR QUÉ data-* Y NO UNA CLASE — cuesta un rato encontrarlo
 * Esto marcaba antes con `classList.add('es-visible')`. React CONTROLA el
 * atributo `className` de los elementos que renderiza: en cuanto uno vuelve a
 * renderizarse, React reescribe className con lo que dice el JSX y se lleva por
 * delante cualquier clase añadida desde fuera. En el login, la tarjeta cambia de
 * className al sacudirse por credenciales incorrectas; perdía `es-visible`, el
 * CSS la devolvía a opacidad 0 y LA TARJETA DESAPARECÍA tras fallar el acceso.
 * Los `data-*` que React no renderiza no se tocan, así que sobreviven al render.
 *
 * Con `prefers-reduced-motion` no se esconde ni se observa nada.
 */
export function useRevelado(ref, deps = []) {
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return undefined;
    const nodos = [...raiz.querySelectorAll('[data-revelar]')];
    if (!nodos.length) return undefined;
    if (QUIETO() || !('IntersectionObserver' in window)) return undefined;

    raiz.dataset.anima = '1';

    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.dataset.visto = '1';
        obs.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    nodos.forEach((n) => obs.observe(n));
    return () => {
      obs.disconnect();
      delete raiz.dataset.anima;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Destello cuando una cifra cambia de valor.
 *
 * live-engine escribe en estos nodos con `textContent` desde fuera de React, así
 * que no hay render ni estado del que colgarse: la única forma de enterarse es
 * mirar el DOM. De ahí el MutationObserver.
 *
 * `subtree: true` es necesario porque `set()` sustituye el nodo de texto, no
 * solo su contenido. Se ignora el primer valor que llega (el marcado ya trae
 * uno de ejemplo) comparando contra lo que había: sin esa comparación toda la
 * fila parpadearía en cada refresco aunque ningún precio se hubiera movido.
 */
export function useCifrasVivas(ids) {
  const clave = ids.join('|');
  useEffect(() => {
    if (QUIETO() || !('MutationObserver' in window)) return undefined;

    const previos = new Map();
    const relojes = new Map();
    const nodos = ids.map((id) => document.getElementById(id)).filter(Boolean);
    nodos.forEach((n) => previos.set(n, n.textContent.trim()));

    const obs = new MutationObserver((cambios) => {
      const tocados = new Set();
      for (const c of cambios) {
        const n = c.target.nodeType === 1 ? c.target : c.target.parentElement;
        if (n && previos.has(n)) tocados.add(n);
      }
      for (const n of tocados) {
        const ahora = n.textContent.trim();
        if (ahora === previos.get(n)) continue;
        previos.set(n, ahora);
        // data-* y no clase, por lo mismo que en useRevelado: un re-render de
        // React reescribiría className y se llevaría la marca por delante.
        delete n.dataset.fresco;
        void n.offsetWidth;                       // reinicia la animación
        n.dataset.fresco = '1';
        clearTimeout(relojes.get(n));
        relojes.set(n, setTimeout(() => { delete n.dataset.fresco; }, 1400));
      }
    });

    nodos.forEach((n) => obs.observe(n, { childList: true, characterData: true, subtree: true }));
    return () => {
      obs.disconnect();
      relojes.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
}
