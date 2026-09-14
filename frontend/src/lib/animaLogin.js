import { useEffect, useRef, useState } from 'react';

const QUIETO = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cuenta ascendente hasta un número.
 *
 * Se usa en el tablero del login cuando llega el dato real de una API. Anima
 * SOLO la presentación: el valor de destino es el que devolvió el servidor, y el
 * componente deja de animar en cuanto lo alcanza. No inventa cifras — arranca en
 * cero, que es visiblemente "todavía no hay dato", y no en un número plausible.
 *
 * Devuelve `null` mientras no haya destino, para que quien lo use pinta un
 * marcador de carga en vez de un cero que parecería una cotización real.
 */
export function useContador(destino, ms = 1100) {
  const [valor, setValor] = useState(null);
  const raf = useRef(0);

  useEffect(() => {
    if (destino == null || !Number.isFinite(destino)) { setValor(null); return undefined; }
    if (QUIETO()) { setValor(destino); return undefined; }

    const t0 = performance.now();
    // easeOutExpo: casi todo el recorrido ocurre al principio, así que la cifra
    // se lee estable enseguida en vez de seguir moviéndose hasta el final.
    const suave = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

    const paso = (ahora) => {
      const k = Math.min((ahora - t0) / ms, 1);
      setValor(destino * suave(k));
      if (k < 1) raf.current = requestAnimationFrame(paso);
    };
    raf.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf.current);
  }, [destino, ms]);

  return valor;
}

/**
 * Inclinación 3D siguiendo al puntero.
 *
 * Escribe dos variables CSS (--rx y --ry) en el nodo y deja que el CSS decida
 * qué hace con ellas: así el efecto se puede apagar entero desde una media
 * query sin tocar este archivo.
 *
 * Se apaga en punteros gruesos (`pointer: coarse`): en un móvil no hay cursor
 * que seguir, y engancharse a `touchmove` sobre un formulario roba el gesto de
 * desplazamiento. Y se apaga con `prefers-reduced-motion`.
 */
export function useTilt(ref, grados = 4) {
  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return undefined;
    if (QUIETO() || window.matchMedia('(pointer: coarse)').matches) return undefined;

    let pendiente = 0;
    const mover = (e) => {
      if (pendiente) return;              // como mucho un cálculo por fotograma
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        const c = nodo.getBoundingClientRect();
        const x = (e.clientX - c.left) / c.width - 0.5;
        const y = (e.clientY - c.top) / c.height - 0.5;
        // Fuera de la tarjeta el efecto se desvanece con la distancia en vez de
        // cortarse en seco al salir del borde.
        const lejos = Math.max(Math.abs(x), Math.abs(y));
        const k = Math.max(0, 1 - Math.max(0, lejos - 0.5) * 1.4);
        nodo.style.setProperty('--ry', `${x * grados * k}deg`);
        nodo.style.setProperty('--rx', `${-y * grados * k}deg`);
      });
    };
    const salir = () => {
      nodo.style.setProperty('--ry', '0deg');
      nodo.style.setProperty('--rx', '0deg');
    };

    window.addEventListener('pointermove', mover, { passive: true });
    window.addEventListener('pointerleave', salir);
    return () => {
      cancelAnimationFrame(pendiente);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerleave', salir);
    };
  }, [ref, grados]);
}
