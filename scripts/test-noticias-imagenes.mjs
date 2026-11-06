import assert from 'node:assert/strict';
import { imagenesNoticia, imagenReferenciaNoticia } from '../frontend/src/lib/noticiasImagenes.js';
import { normalizarNoticia, reunirNoticias } from '../frontend/src/lib/noticias.js';

const source = 'https://cdn.example.test/foto.jpg';
const proxy = `/api/img?u=${encodeURIComponent(source)}`;
assert.deepEqual(imagenesNoticia({ topic: 'ganaderia', image: proxy }), [source, proxy, '/assets/img/mercadoP.webp']);
assert.deepEqual(imagenesNoticia({ topic: 'cosechas' }), ['/assets/img/mexico-productivo-campo.jpg']);
assert.deepEqual(imagenesNoticia({ topic: 'bolsas', image: source, imageRaw: source }), [source, imagenReferenciaNoticia('bolsas')]);
for (const imageRaw of ['javascript:alert(1)', 'http://127.0.0.1/p.jpg', 'https://user:password@cdn.test/p.jpg', 'http://2130706433/p.jpg', 'https://cdn.test:8443/p.jpg', 'https://localhost./p.jpg', 'http://224.0.0.1/p.jpg']) {
  assert.deepEqual(imagenesNoticia({ topic: 'finanzas', imageRaw }), [imagenReferenciaNoticia('finanzas')]);
}
const article = { title: 'La economía', url: 'https://medio.test/nota', image: proxy, imageRaw: source };
assert.equal(normalizarNoticia(article, 'finanzas').imageRaw, source);
const editions = [{ id: 'finanzas', articles: [{ ...article, image: '', imageRaw: '' }] }, { id: 'mexico', articles: [article] }];
assert.equal(reunirNoticias(editions)[0].imageRaw, source, 'La deduplicación conserva el respaldo de la foto original');
console.log('Fotos del lector: fuente, respaldo original, referencia temática y enlaces seguros verificados.');
