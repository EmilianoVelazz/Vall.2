import { useCallback, useEffect, useState } from 'react';

/**
 * Tema claro / oscuro.
 *
 * El interruptor ya existía a medias: frontend/index.html trae un guion
 * anti-parpadeo que lee localStorage.vn_theme y pone data-theme="dark" en
 * <html> antes de pintar. Lo que faltaba era el CSS — no había una sola regla
 * [data-theme="dark"] en todo el proyecto, así que el atributo se ponía y no
 * pasaba nada. Ese CSS lo genera ahora scripts/build-dark-theme.mjs.
 *
 * La hoja se añade desde aquí, y no con un <link> en index.html ni por
 * usePageStyles, porque TIENE QUE QUEDAR LA ÚLTIMA: compite con miles de
 * !important repartidos por las hojas heredadas, y a igualdad de peso gana la
 * que aparece más abajo en el documento. usePageStyles inserta las suyas antes
 * del bundle; esta se añade al final del <head> y ahí se queda.
 *
 * Se deja cargada también en claro. Todas sus reglas cuelgan de
 * [data-theme="dark"], así que en claro no aplican ninguna, y tenerla ya
 * descargada evita el destello blanco al encender el modo oscuro.
 */

const CLAVE = 'vn_theme';
const HOJA = '/assets/css/dark-theme.css';

function leerTema() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'dark' || guardado === 'light') return guardado;
  } catch { /* almacenamiento bloqueado */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function aplicar(tema) {
  const raiz = document.documentElement;
  if (tema === 'dark') raiz.setAttribute('data-theme', 'dark');
  else raiz.removeAttribute('data-theme');
}

function asegurarHoja() {
  if (document.querySelector(`link[data-vn-dark]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HOJA;
  link.dataset.vnDark = '1';
  document.head.appendChild(link);
}

/* Estado compartido entre TODAS las instancias del hook.
   Antes cada `useTema()` llevaba su propio useState. Con un solo consumidor
   daba igual, pero ahora hay dos a la vez en /configuracion: el interruptor del
   rail y el <select> de la página. Al cambiar el tema desde el rail, <html> y
   localStorage se actualizaban pero el <select> seguía enseñando el valor
   viejo, porque su estado no se enteraba. Con esta lista, quien cambie el tema
   avisa al resto y las dos vistas dicen lo mismo. */
const oyentes = new Set();

function fijarTema(valor) {
  const tema = valor === 'dark' ? 'dark' : 'light';
  asegurarHoja();
  aplicar(tema);
  try { localStorage.setItem(CLAVE, tema); } catch { /* almacenamiento bloqueado */ }
  oyentes.forEach((avisar) => avisar(tema));
}

/** Devuelve [tema, alternar, fijar] y mantiene <html> y localStorage al día. */
export default function useTema() {
  const [tema, setTema] = useState(leerTema);

  useEffect(() => {
    oyentes.add(setTema);
    // Al montar se sincroniza con lo que ya hay puesto, por si otra instancia
    // lo cambió mientras este componente estaba desmontado.
    setTema(leerTema());
    asegurarHoja();
    return () => { oyentes.delete(setTema); };
  }, []);

  const fijar = useCallback((valor) => fijarTema(valor), []);
  const alternar = useCallback(() => fijarTema(leerTema() === 'dark' ? 'light' : 'dark'), []);
  return [tema, alternar, fijar];
}

/**
 * Instala la hoja y el atributo sin necesidad de un componente. La llama la
 * aplicación al arrancar para que el tema valga en todas las rutas, no solo en
 * la pantalla que tenga el interruptor.
 */
export function iniciarTema() {
  asegurarHoja();
  aplicar(leerTema());
}
