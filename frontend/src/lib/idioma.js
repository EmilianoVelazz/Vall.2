import { useCallback, useEffect, useSyncExternalStore } from 'react';

export const IDIOMAS = Object.freeze([
  { lang: 'es', code: 'ES', bandera: '🇲🇽', nombre: 'Español' },
  { lang: 'en', code: 'EN', bandera: '🇺🇸', nombre: 'English' },
  { lang: 'fr', code: 'FR', bandera: '🇫🇷', nombre: 'Français' },
  { lang: 'it', code: 'IT', bandera: '🇮🇹', nombre: 'Italiano' },
  { lang: 'de', code: 'DE', bandera: '🇩🇪', nombre: 'Deutsch' },
  { lang: 'ja', code: 'JA', bandera: '🇯🇵', nombre: '日本語' },
]);

const CLAVE = 'vn_lang';
// Un único estado por página, incluso cuando Vite carga otra revisión del
// módulo. La cabecera, el lector y las exportaciones comparten suscripciones.
const ESTADO = Symbol.for('vallnews.language.v1');
const estado = globalThis[ESTADO] ||= {
  oyentes:new Set(),traductorIniciado:false,idiomaSinAlmacenamiento:null,
  idiomaActual:null,sincronizacionIniciada:false,
};
const esIdioma = valor => IDIOMAS.some(item => item.lang === valor);

function idiomaGuardado() {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE));
    const codigo = typeof valor === 'string' ? valor : valor?.lang;
    return esIdioma(codigo) ? codigo : null;
  } catch { return null; }
}

export function leerIdioma() {
  const visible = typeof document === 'undefined' ? null : document.documentElement.lang;
  // La elección de la app es la fuente de verdad. El traductor puede restaurar
  // temporalmente lang="es" mientras reconstruye el DOM de la página.
  if (estado.idiomaActual) return estado.idiomaActual;
  if (estado.idiomaSinAlmacenamiento) return estado.idiomaSinAlmacenamiento;
  return idiomaGuardado() || (esIdioma(visible) ? visible : 'es');
}

function guardarIdioma(lang) {
  const idioma = IDIOMAS.find((item) => item.lang === lang) || IDIOMAS[0];
  try { localStorage.setItem(CLAVE, JSON.stringify({ code: idioma.code.toLowerCase(), lang: idioma.lang }));estado.idiomaSinAlmacenamiento=null; } catch { estado.idiomaSinAlmacenamiento=idioma.lang; }
  return idioma.lang;
}

function cookieTraduccion(lang) {
  const valor = lang === 'es' ? '' : `/es/${lang}`;
  const vence = lang === 'es' ? 'Thu, 01 Jan 1970 00:00:00 UTC' : 'Fri, 31 Dec 2099 23:59:59 UTC';
  document.cookie = `googtrans=${valor}; expires=${vence}; path=/; SameSite=Lax`;
  // Google también consulta la cookie con dominio en algunos navegadores.
  if (location.hostname.includes('.')) {
    document.cookie = `googtrans=${valor}; expires=${vence}; path=/; domain=${location.hostname}; SameSite=Lax`;
  }
}

function seleccionarEnGoogle(lang, intento = 0) {
  if (lang !== leerIdioma()) return;
  const select = document.querySelector('select.goog-te-combo');
  if (select) {
    if (select.value !== lang) {
      select.value = lang;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }
  if (intento < 24) window.setTimeout(() => seleccionarEnGoogle(lang, intento + 1), 250);
}

function sincronizarIdioma(lang) {
  if (!esIdioma(lang)) return;
  const cambio = estado.idiomaActual !== lang;
  estado.idiomaActual = guardarIdioma(lang);
  if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
  cookieTraduccion(lang);
  if (cambio) estado.oyentes.forEach(avisar => avisar());
}

function iniciarSincronizacion() {
  if (estado.sincronizacionIniciada) return;
  estado.sincronizacionIniciada = true;
  new MutationObserver(() => {
    if (estado.idiomaActual && document.documentElement.lang !== estado.idiomaActual) document.documentElement.lang = estado.idiomaActual;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  document.addEventListener('change', event => {
    // Los eventos automáticos del motor no cambian la preferencia elegida.
    if (event.isTrusted && event.target.matches?.('select.goog-te-combo') && esIdioma(event.target.value)) sincronizarIdioma(event.target.value);
  }, true);
  window.addEventListener('storage', event => {
    if (event.key !== CLAVE && event.key !== null) return;
    const lang = idiomaGuardado() || 'es';
    sincronizarIdioma(lang);
    seleccionarEnGoogle(lang);
  });
}

function iniciarTraductor() {
  if (estado.traductorIniciado) return;
  estado.traductorIniciado = true;

  let host = document.getElementById('google_translate_element');
  if (!host) {
    host = document.createElement('div');
    host.id = 'google_translate_element';
    host.hidden = true;
    document.body.appendChild(host);
  }

  const montar = () => {
    if (!window.google?.translate?.TranslateElement || host.dataset.ready) return;
    host.dataset.ready = '1';
    new window.google.translate.TranslateElement({
      pageLanguage: 'es',
      includedLanguages: IDIOMAS.map((item) => item.lang).join(','),
      autoDisplay: false,
    }, host.id);
    const idioma = leerIdioma();
    if (idioma !== 'es') seleccionarEnGoogle(idioma);
  };

  window.googleTranslateElementInit = montar;
  if (window.google?.translate?.TranslateElement) {
    montar();
    return;
  }
  if (!document.querySelector('script[data-vn-google-translate]')) {
    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.dataset.vnGoogleTranslate = '1';
    document.head.appendChild(script);
  }
}

export function fijarIdioma(valor, { recargar = true } = {}) {
  const lang = esIdioma(valor) ? valor : 'es';
  sincronizarIdioma(lang);
  fetch('/api/profile', {
    method: 'POST', credentials: 'include', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: { language: lang } }),
  }).catch(() => {});
  if (recargar && !estado.idiomaSinAlmacenamiento) window.location.reload();
  else seleccionarEnGoogle(lang);
}

export function iniciarIdioma() {
  sincronizarIdioma(leerIdioma());
  iniciarSincronizacion();
  iniciarTraductor();
}

const suscribir = avisar => {
  estado.oyentes.add(avisar);
  return () => estado.oyentes.delete(avisar);
};

export default function useIdioma() {
  const idioma = useSyncExternalStore(suscribir,leerIdioma,()=> 'es');
  useEffect(iniciarIdioma, []);
  const fijar = useCallback((lang) => fijarIdioma(lang), []);
  return [idioma, fijar];
}
