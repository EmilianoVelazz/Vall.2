/**
 * Carga scripts clásicos (no módulos) en orden y una sola vez.
 *
 * Las páginas migradas siguen apoyándose en librerías del sitio que exponen
 * globales: data-service.js (window.VDS) y Chart.js por CDN. Reescribir esa capa
 * de datos no formaba parte de la migración —lo que se migra es el markup y el
 * estado—, así que se reutiliza tal cual.
 *
 * El orden importa: data-service.js espera que api-keys.js ya haya definido
 * VAPI, así que se cargan en serie y no en paralelo.
 */
const cache = new Map();

function cargarUno(src) {
  if (cache.has(src)) return cache.get(src);

  const p = new Promise((resolve, reject) => {
    // Puede existir ya si lo dejó otra página o el HTML legacy.
    const previo = document.querySelector(`script[data-vn-lib="${src}"]`);
    if (previo) return resolve();

    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.dataset.vnLib = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(el);
  });

  cache.set(src, p);
  return p;
}

export default async function loadScripts(fuentes) {
  for (const src of fuentes) {
    // eslint-disable-next-line no-await-in-loop
    await cargarUno(src);
  }
}

/**
 * Lee una global declarada por un script clásico del sitio (VDS, VAPI, Chart…).
 *
 * OJO: `window.VDS` NO funciona. data-service.js hace `const VDS = ...` en el
 * nivel superior, y en JavaScript un `const`/`let`/`class` de nivel superior no
 * se cuelga del objeto window — vive en el ámbito léxico global, que es un
 * espacio aparte. Solo `var` y las declaraciones de función crean propiedades
 * en window (por eso Chart.js sí aparecía como window.Chart y VDS no).
 *
 * Los scripts inline del HTML nunca notaron la diferencia porque usaban el
 * identificador pelado (`VDS.load(...)`). Desde un módulo ES hay que resolverlo
 * en tiempo de ejecución, y `new Function` evalúa en el ámbito global, que sí
 * ve ese binding.
 */
export function globalLegado(nombre) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return typeof ${nombre} !== 'undefined' ? ${nombre} : undefined`)();
  } catch {
    return undefined;
  }
}
