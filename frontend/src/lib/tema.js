/**
 * Tema claro único de VALLNews.
 *
 * frontend/index.html retira data-theme antes del primer render para evitar
 * destellos oscuros. Este módulo reafirma la decisión al montar React y carga
 * las hojas globales que armonizan las páginas heredadas.
 *
 * La hoja se añade desde aquí, y no con un <link> en index.html ni por
 * usePageStyles, porque TIENE QUE QUEDAR LA ÚLTIMA: compite con miles de
 * !important repartidos por las hojas heredadas, y a igualdad de peso gana la
 * que aparece más abajo en el documento. usePageStyles inserta las suyas antes
 * del bundle; esta se añade al final del <head> y ahí se queda.
 *
 * Ya no existe una variante oscura seleccionable: cualquier valor histórico
 * de vn_theme se reemplaza por light durante el arranque.
 */

const CLAVE = 'vn_theme';
const HOJA = '/assets/css/dark-theme.css';
const HOJA_ARMONIA = '/assets/css/background-harmony.css?v=2';

function aplicar() {
  document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem(CLAVE, 'light'); } catch { /* almacenamiento bloqueado */ }
}

function asegurarHoja() {
  if (!document.querySelector('link[data-vn-dark]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = HOJA;
    link.dataset.vnDark = '1';
    document.head.appendChild(link);
  }
  // Siempre después del tema y de las hojas de cada sección: así el fondo es
  // una decisión de plataforma, no la última página que declaró `body`.
  if (!document.querySelector('link[data-vn-background-harmony]')) {
    const harmony = document.createElement('link');
    harmony.rel = 'stylesheet';
    harmony.href = HOJA_ARMONIA;
    harmony.dataset.vnBackgroundHarmony = '1';
    document.head.appendChild(harmony);
  }
}

/**
 * Instala la hoja y el atributo sin necesidad de un componente. La llama la
 * aplicación al arrancar para que el tema valga en todas las rutas.
 */
export function iniciarTema() {
  asegurarHoja();
  aplicar();
}
