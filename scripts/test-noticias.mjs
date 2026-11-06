import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { destacarNoticias, enlaceSeguro, filtrarNoticias, normalizarNoticia, reunirNoticias, temaDeNoticia } from '../frontend/src/lib/noticias.js';
const require = createRequire(import.meta.url);
const { _inferMarketCategory, _selectMarketNews } = require('../backend/routes/finanzas.js')._test;

const article = (title, extra = {}) => ({ title, url: 'https://medio.example/noticia', description: 'Resumen de la fuente', publishedAt: '2026-10-01T13:00:00Z', ...extra });
assert.equal(enlaceSeguro('javascript:alert(1)'), '');
assert.equal(enlaceSeguro('//externo.example/noticia'), '');
assert.equal(normalizarNoticia(article('Noticia', { url: 'data:text/html,unsafe' }), 'finanzas'), null);
assert.equal(normalizarNoticia(article('Economía mundial', { publishedAt: '20261001T130000' }), 'finanzas').publishedAt, null);
assert.equal(normalizarNoticia(article('Healthy aging for grandparents', { category: 'markets' }), 'finanzas'), null, 'El respaldo markets no convierte una noticia de salud en bursátil');
assert.equal(normalizarNoticia(article('Nike shoes sold out', { category: 'markets' }), 'finanzas'), null);
assert.equal(normalizarNoticia(article('La cosecha', { description: 'Resumen sobre la producción. La entrada La cosecha aparece primero en Agroinformacion .' }), 'mercados').description, 'Resumen sobre la producción.');
assert.equal(normalizarNoticia(article('México: aumenta la cosecha de maíz'), 'mercados').scope, 'mexico');
assert.equal(normalizarNoticia(article('Sanidad del ganado en Jalisco'), 'mercados').scope, 'mexico');
assert.equal(normalizarNoticia(article('Wheat harvest in New Mexico'), 'mercados').scope, 'mundo');
assert.equal(normalizarNoticia(article('Economía regional'), 'mexico').scope, 'mexico');
assert.equal(temaDeNoticia(article('Precio del alimento para ganado: maíz')), 'ganaderia');
assert.equal(temaDeNoticia(article('Trigo y cosechas en el mundo')), 'cosechas');
assert.equal(temaDeNoticia(article('Nasdaq: suben las acciones')), 'bolsas');
assert.equal(temaDeNoticia(article('Banxico revisa la tasa de interés')), 'finanzas');
assert.equal(temaDeNoticia(article('El cobre en los mercados industriales')), 'materias');

const editions = [
  { id: 'finanzas', articles: [article('Economía regional', { url: 'https://medio.example/noticia?utm_source=feed', image: '' })] },
  { id: 'mexico', articles: [article('Economía regional', { image: '/api/img?u=example', publishedAt: '2026-10-01T14:00:00Z' })] },
  { id: 'mercados', articles: [article('Cosechas de trigo', { url: 'https://medio.example/agro', source: 'Diario Agrícola', publishedAt: '2026-10-01T15:00:00Z' })] },
];
const articles = reunirNoticias(editions);
assert.equal(articles.length, 2, 'La misma URL con seguimiento debe reunirse en una noticia');
assert.equal(articles[0].topic, 'cosechas', 'Ordena por fecha real');
assert.equal(articles[1].scope, 'mexico', 'Conserva la clasificación mexicana de una edición duplicada');
assert.equal(articles[1].image, '/api/img?u=example', 'Conserva la imagen disponible');
assert.equal(filtrarNoticias(articles, { query: 'agricola trigo', topic: 'cosechas', scope: 'mundo' }).length, 1);
assert.equal(filtrarNoticias(articles, { scope: 'mexico', topic: 'cosechas' }).length, 0);
const now = Date.parse('2026-10-01T15:00:00Z');
const dateArticles = [
  normalizarNoticia(article('Cosecha de maíz', { url: 'https://medio.example/maiz', publishedAt: '2026-10-01T03:00:00Z', impact: 'alto', image: 'https://medio.example/foto.jpg' }), 'mercados'),
  normalizarNoticia(article('Precio del trigo', { publishedAt: '2026-10-01T12:00:00Z', impact: 'medio', url: 'https://medio.example/trigo' }), 'mercados'),
  normalizarNoticia(article('Mercado de bonos', { publishedAt: null, url: 'https://medio.example/bonos' }), 'finanzas'),
  normalizarNoticia(article('Ganado bovino en México', { publishedAt: '2026-10-02T12:00:00Z', url: 'https://medio.example/ganado' }), 'mercados'),
];
assert.equal(filtrarNoticias(dateArticles, { period: 'today' }, now).length, 1, 'Hoy se calcula en CDMX, no en UTC');
assert.equal(filtrarNoticias(dateArticles, { period: '24h' }, now).length, 2, 'Fechas desconocidas o futuras no entran en una ventana reciente');
assert.equal(filtrarNoticias(dateArticles, { period: 'custom', from: '2026-09-30', until: '2026-09-30' }, now)[0].title, 'Cosecha de maíz');
assert.equal(filtrarNoticias(dateArticles, { period: 'custom', from: '2026-10-02', until: '2026-09-30' }, now).length, 0);
assert.equal(filtrarNoticias(dateArticles, { impact: 'alto', withImage: true, withSummary: true, subtopic: 'maiz' }, now).length, 1);
assert.equal(filtrarNoticias(dateArticles, { source: 'medio.example', subtopic: 'trigo' }, now).length, 1);
assert.equal(dateArticles[2].impact, null, 'No se fabrica una valoración editorial cuando falta');
const featured = destacarNoticias([...articles, ...dateArticles], 4);
assert.equal(featured[0].impact, 'alto');
assert.equal(featured.length, 4);
assert.equal(new Set(featured.map(item => item.id)).size, 4);
assert(featured.some(item => item.scope === 'mexico'));
assert(featured.some(item => item.topic === 'cosechas'));
assert.equal(destacarNoticias([], 6).length, 0);
assert.equal(destacarNoticias(articles, 1).length, 1);
assert.equal(_inferMarketCategory({ title: 'Sanidad pecuaria y producción de carne bovina' }).key, 'ganaderia');
assert.equal(_inferMarketCategory({ title: 'México: la cosecha de maíz' }).key, 'granos');
assert.equal(_inferMarketCategory({ title: 'Soybeans and wheat harvest outlook' }).key, 'granos');
const marketPool = Array.from({ length: 30 }, (_, i) => ({ title: `Stock market ${i}`, publishedAt: '2026-10-01T15:00:00Z' }));
marketPool.push({ title: 'Precios del ganado', publishedAt: '2026-09-30T15:00:00Z' }, { title: 'Cosechas de trigo', publishedAt: '2026-09-30T15:00:00Z' });
const selected = _selectMarketNews(marketPool);
assert.equal(selected.length, 24);
assert(selected.some(item => item.title === 'Precios del ganado'));
assert(selected.some(item => item.title === 'Cosechas de trigo'));
console.log('Noticias: clasificación, enlaces, fechas, filtros, deduplicación y cobertura agropecuaria verificados.');
