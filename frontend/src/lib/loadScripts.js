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
    const fail = () => {
      clearTimeout(timer);
      el.remove();
      cache.delete(src);
      reject(new Error(`No se pudo cargar ${src}`));
    };
    // Un script retirado puede terminar ejecutándose después. Al vencer el
    // plazo se informa del fallo, pero se conserva la carga pendiente para no
    // ejecutar dos veces bibliotecas que declaran const globales.
    const timer = setTimeout(() => reject(new Error(`La carga tardó demasiado: ${src}`)), 20_000);
    el.src = src;
    el.async = false;
    el.dataset.vnLib = src;
    el.onload = () => {
      clearTimeout(timer);
      cache.set(src, Promise.resolve());
      resolve();
    };
    el.onerror = fail;
    document.head.appendChild(el);
  });

  cache.set(src, p);
  return p;
}

export default async function loadScripts(fuentes) {
  for (const src of fuentes) {
     
    await cargarUno(src);
  }
}

/**
 * Carga un script REEJECUTÁNDOLO en cada llamada, y devuelve una función para
 * retirarlo.
 *
 * Hace falta para los scripts de página que capturan sus nodos al evaluarse
 * (`const els = { input: $('vaiInput'), … }`). Con el cacheado normal solo
 * funcionarían la primera vez: al volver a la sección el DOM es nuevo y sus
 * referencias apuntan a nodos ya desechados, así que la página queda inerte.
 *
 * El navegador sirve el archivo de su propia caché HTTP, así que reejecutar no
 * implica volver a descargarlo. El script debe ser reentrante: limpiar lo que
 * dejó la ejecución anterior (ver el desmontar() de vall-ai-page-v4.js).
 */
export function cargarCadaVez(src, marca, {onLoad,onError}={}) {
  document.querySelector(`script[data-vn-page-js="${marca}"]`)?.remove();

  const el = document.createElement('script');
  el.src = src;
  el.async = false;
  el.dataset.vnPageJs = marca;
  el.onload=onLoad || null;
  el.onerror=onError || null;
  document.body.appendChild(el);

  return () => el.remove();
}

// Download first, then execute synchronously only while this page is current.
// Inline classic scripts retain the global bindings required by the legacy bridge.
export async function mountPageScripts(entries,{signal,fetcher=fetch}={}) {
  const removers=[];
  const removeAll=()=>removers.splice(0).forEach(remove=>remove());
  signal?.addEventListener('abort',removeAll,{once:true});
  try {
    for(const [src,mark] of entries) {
      signal?.throwIfAborted();
      const url=new URL(src,window.location.href);
      if(url.origin!==window.location.origin || !url.pathname.startsWith('/assets/js/') || !url.pathname.endsWith('.js'))throw Error('La página sólo puede cargar sus scripts del sitio.');
      const deadline=AbortSignal.timeout(20000),requestSignal=signal?AbortSignal.any([signal,deadline]):deadline;
      const response=await fetcher(url.href,{signal:requestSignal,credentials:'same-origin',redirect:'error'});
      if(!response.ok || !/javascript/i.test(response.headers.get('Content-Type') || ''))throw Error('No se pudo cargar '+src);
      const source=await response.text();
      requestSignal.throwIfAborted();
      const script=document.createElement('script');
      script.dataset.vnPageJs=mark;
      script.text=source+'\n//# sourceURL='+url.href;
      removers.push(()=>script.remove());
      document.body.appendChild(script);
    }
  } catch(error) { removeAll();signal?.removeEventListener('abort',removeAll);throw error; }
  return ()=>{signal?.removeEventListener('abort',removeAll);removeAll();};
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
  if (typeof nombre !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(nombre)) {
    return undefined;
  }
  try {
    return new Function(`return typeof ${nombre} !== 'undefined' ? ${nombre} : undefined`)();
  } catch {
    return undefined;
  }
}
