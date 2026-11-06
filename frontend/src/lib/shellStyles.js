/** Hojas permanentes del HTML: no se duplican ni se retiran al cambiar de ruta. */
export function hojaDelMarco(href) {
  const target = new URL(href, document.baseURI);
  return [...document.querySelectorAll('link[data-vn-shell-css]')].find((link) => {
    const url = new URL(link.href, document.baseURI);
    // Las páginas antiguas usan versiones distintas del mismo archivo local.
    return url.origin === target.origin && url.pathname === target.pathname;
  });
}
