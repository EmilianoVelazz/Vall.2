import { enlaceSeguro } from './noticias.js';

const REFERENCES = {
  bolsas: '/assets/img/bolsa-mexico-centro-bursatil.jpg',
  finanzas: '/assets/img/fallback/finanzas.webp',
  cosechas: '/assets/img/mexico-productivo-campo.jpg',
  ganaderia: '/assets/img/fallback/ganaderia.webp',
  materias: '/assets/img/fallback/materias-primas.webp',
};

function originalPublico(value) {
  const safe = enlaceSeguro(value);
  if (!safe) return '';
  const url = new URL(safe), host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.port || host.includes(':') || host === 'localhost' || /\.(local|internal)$/.test(host)
    || /^(0|10|127|169\.254|192\.168|198\.(18|19))\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[78]\d|9\d|1[01]\d|12[0-7])\./.test(host)
    || (/^\d+\./.test(host) && Number(host.split('.')[0]) >= 224)) return '';
  return safe;
}

export function imagenReferenciaNoticia(topic) {
  return REFERENCES[topic] || REFERENCES.finanzas;
}

export function imagenesNoticia(article) {
  const proxy = String(article.image || '').startsWith('/api/img?u=') ? article.image : '';
  let proxiedOriginal = '';
  if (proxy) {
    const value = new URL(proxy, 'https://vallnews.invalid').searchParams.get('u');
    proxiedOriginal = originalPublico(value);
  }
  const first = proxy || originalPublico(article.image);
  const original = originalPublico(article.imageRaw) || proxiedOriginal;
  // La foto pública carga directamente desde su CDN. El proxy queda como
  // respaldo para las fuentes que impiden cargarla desde el navegador.
  return [...new Set([original || first, first, imagenReferenciaNoticia(article.topic)].filter(Boolean))];
}
