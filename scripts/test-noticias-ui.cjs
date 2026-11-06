'use strict';
/* global window, document, innerWidth */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/auditoria-codigo/noticias');
const iso = hours => new Date(Date.now() - hours * 3600000).toISOString();
const row = (title, slug, extra = {}) => ({ title, description: 'La fuente publicó esta información económica. Consulta los datos y el contexto de la cobertura original.',
  source: 'Diario económico', url: `https://medio.example/${slug}`, publishedAt: iso(2), ...extra });
const feeds = {
  '/api/daily-news': [row('Banxico mantiene la tasa y revisa la inflación', 'banxico', { source: 'Banco de México', impact: 'alto', publishedAt: iso(1) }),
    row('Las bolsas globales cierran con resultados mixtos', 'bolsa', { originalTitle: 'Wall Street stocks finish mixed', originalDescription: 'Stocks finish mixed in the US.', originalCategory: 'markets', editorial: true, summaryOrigin: 'assisted' }),
    row('Los bonos soberanos concentran la atención del mercado', 'bonos'),
    row('El dólar y las divisas reaccionan a los datos económicos', 'divisas'),
    ...Array.from({ length: 10 }, (_, i) => row(`Empresas revisan inversiones y empleo ${i + 1}`, 'empresas-' + i, { source: 'Diario de empresas', publishedAt: iso(5 + i) })),
    row('La inflación global cambia', 'original-a', { source: 'Fuente A' }), row('La inflación global cambia', 'original-b', { source: 'Fuente B' })],
  '/api/daily-news-markets': [row('El comercio de cerdo concentra las decisiones de abastecimiento', 'cerdo', { source: 'Diario agropecuario', impact: 'alto', publishedAt: iso(3) }),
    row('Los productores de maíz preparan la cosecha', 'maiz', { source: 'Diario agrícola' }),
    row('Bird flu affects poultry and egg production', 'avicola', { source: 'Animal health desk' }),
    row('Logística y fletes: seguimiento de las exportaciones', 'logistica'),
    row('El precio del cobre refleja la actividad industrial', 'cobre')],
  '/api/mexico-daily-news': [row('Empresas de México amplían las exportaciones', 'mexico'),
    row('La producción de ganado en Jalisco requiere seguimiento sanitario', 'jalisco', { source: 'Diario agropecuario' }),
    row('Una noticia económica sin fecha publicada', 'sin-fecha', { publishedAt: null }),
    row('Ganado: noticia con una fecha de publicación futura', 'futura', { publishedAt: '2099-10-01T12:00:00Z' })],
};
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const app = express(); app.use(express.static(path.join(root, 'dist'))); app.use((req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const checks = [], errors = [];
  const check = async (name, run) => { await run(); checks.push(name); console.log('OK · ' + name); };
  const fixture = async (context, state) => {
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/verify-token') return route.fulfill({ json: { success: true, email: state.owner, role: 'user' } });
      if (feeds[url.pathname]) {
        if (state.failure === 'auth') return route.fulfill({ status: 401, json: { success: false } });
        if (state.failure === 'markets' && url.pathname.includes('markets')) return route.fulfill({ status: 503, json: { success: false } });
        return route.fulfill({ json: { success: true, data: { noticias: feeds[url.pathname], generado: 'corte de prueba' } } });
      }
      return route.fulfill({ json: { success: true, data: [], profile: { preferences: {} } } });
    });
  };
  try {
    const state = { owner: 'reader-a@example.invalid', failure: null };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Mexico_City' });
    await fixture(context, state);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/noticias');
    await page.getByRole('heading', { name: 'En portada', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Actualizar noticias', exact: true }).waitFor();
    await check('portada con fuentes, fechas y sin publicaciones futuras', async () => {
      assert.equal(await page.getByRole('heading', { name: /fecha de publicación futura/ }).count(), 0);
      assert(await page.locator('.nt-news-metrics').innerText());
      await page.screenshot({ path: path.join(output, 'noticias-portada.png'), fullPage: false });
    });
    const firstTitle = feeds['/api/daily-news'][0].title;
    await check('guardar desde portada sin abrir el lector por accidente', async () => {
      await page.getByRole('button', { name: 'Guardar noticia: ' + firstTitle, exact: true }).click();
      await page.getByRole('button', { name: /^Guardadas 1$/ }).waitFor();
      assert.equal(await page.locator('dialog[open]').count(), 0);
    });
    await check('recuperar guardadas tras recargar y abrir su lectura', async () => {
      await page.reload(); await page.getByRole('button', { name: /^Guardadas 1$/ }).click();
      await page.getByRole('heading', { name: 'Tus noticias guardadas' }).waitFor();
      await page.getByRole('button', { name: firstTitle, exact: true }).click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Quitar de Guardadas', exact: true }).count(), 1);
      assert.equal(await page.getByRole('link', { name: /Leer en la fuente/ }).getAttribute('href'), 'https://medio.example/banxico');
      for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(() => !!document.activeElement.closest('dialog'))); }
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    });
    await check('quitar una guardada y recuperar una lista vacía útil', async () => {
      await page.getByRole('button', { name: 'Quitar noticia guardada: ' + firstTitle, exact: true }).click();
      await page.getByRole('heading', { name: 'Tu lista de lectura está vacía' }).waitFor();
      await page.getByRole('button', { name: 'Explorar actualidad' }).click();
    });
    await check('vista compacta conserva todos los titulares y controles', async () => {
      await page.getByRole('button', { name: 'Vista compacta' }).click();
      await page.locator('.nt-stories--compact').waitFor();
      assert.equal(await page.locator('.nt-frontpage').count(), 0);
      assert.equal(await page.locator('.nt-story').count(), 9);
      await page.getByRole('button', { name: /Ver más noticias/ }).click();
      assert.equal(await page.locator('.nt-story').count(), 18);
      await page.screenshot({ path: path.join(output, 'noticias-compacta.png'), fullPage: false });
    });
    await check('proteínas y agro incluyen sanidad avícola en inglés', async () => {
      await page.getByRole('button', { name: 'Proteínas y agro', exact: true }).click();
      await page.getByRole('button', { name: 'Bird flu affects poultry and egg production', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: firstTitle, exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    });
    await check('buscar sin acentos y separar dos medios con el mismo titular', async () => {
      const search = page.getByRole('searchbox', { name: 'Buscar noticias' });
      await search.fill('inflacion global');
      assert.equal(await page.getByRole('button', { name: 'La inflación global cambia', exact: true }).count(), 2);
      assert(await page.locator('.nt-stories').innerText().then(value => value.includes('Fuente A') && value.includes('Fuente B')));
      await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
    });
    await check('el lector distingue edición asistida y muestra el titular original', async () => {
      await page.getByRole('searchbox', { name: 'Buscar noticias' }).fill('bolsas globales');
      await page.getByRole('button', { name: 'Las bolsas globales cierran con resultados mixtos', exact: true }).click();
      await page.getByText('Edición asistida · comprueba la cobertura original', { exact: true }).waitFor();
      await page.getByText('Titular original de la fuente', { exact: true }).click();
      assert(await page.getByRole('dialog').innerText().then(value => value.includes('Wall Street stocks finish mixed')));
      await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    });
    await check('guardar desde el lector y sincronizar otra pestaña', async () => {
      await page.getByRole('button', { name: firstTitle, exact: true }).click();
      await page.getByRole('button', { name: 'Guardar para después', exact: true }).click();
      await page.keyboard.press('Escape');
      const other = await context.newPage(); await other.goto(origin + '/noticias');
      await other.getByRole('button', { name: /^Guardadas 1$/ }).waitFor();
      await other.getByRole('button', { name: 'Quitar noticia guardada: ' + firstTitle, exact: true }).click();
      await page.getByRole('button', { name: /^Guardadas 0$/ }).waitFor(); await other.close();
    });
    await check('fallo parcial conserva noticias y permite recuperar la fuente', async () => {
      state.failure = 'markets'; await page.getByRole('button', { name: 'Actualizar noticias', exact: true }).click();
      await page.getByText(/No se pudo consultar Mercados y agro/).waitFor();
      await page.getByRole('searchbox', { name: 'Buscar noticias' }).fill('comercio de cerdo');
      assert.equal(await page.getByRole('button', { name: feeds['/api/daily-news-markets'][0].title, exact: true }).count(), 1);
      state.failure = null; await page.getByRole('button', { name: 'Actualizar noticias', exact: true }).click();
      await page.getByText(/No se pudo consultar Mercados y agro/).waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    });
    await check('sesión vencida informa sin inventar noticias', async () => {
      state.failure = 'auth'; await page.getByRole('button', { name: 'Actualizar noticias', exact: true }).click();
      await page.getByText(/La sesión venció/).waitFor();
      state.failure = null; await page.getByRole('button', { name: 'Actualizar noticias', exact: true }).click();
      await page.getByText(/La sesión venció/).waitFor({ state: 'hidden' });
    });
    await check('noticias guardadas de una cuenta no aparecen al cambiar usuario', async () => {
      await page.getByRole('searchbox', { name: 'Buscar noticias' }).fill('Banxico mantiene');
      await page.getByRole('button', { name: 'Guardar noticia: ' + firstTitle, exact: true }).click();
      state.owner = 'reader-b@example.invalid'; await page.reload();
      await page.getByRole('button', { name: /^Guardadas 0$/ }).click();
      await page.getByRole('heading', { name: 'Tu lista de lectura está vacía' }).waitFor();
    });
    await check('biblioteca corrupta conserva la página y ofrece reintento', async () => {
      await page.evaluate(() => localStorage.setItem('vn_news_library:v1:reader-b%40example.invalid', '{broken'));
      await page.reload(); await page.getByText('No se pudo leer tu lista guardada. Puedes seguir consultando noticias.').waitFor();
      await page.getByRole('button', { name: 'Reintentar biblioteca' }).click();
      assert.equal(await page.getByRole('heading', { name: 'En portada', exact: true }).count(), 1);
    });
    assert.deepEqual(errors, []);
    await context.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Mexico_City' });
    await fixture(mobile, { owner: 'mobile@example.invalid', failure: null });
    const phone = await mobile.newPage(); phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(origin + '/noticias'); await phone.getByRole('heading', { name: 'En portada', exact: true }).waitFor();
    await check('móvil: portada y lista compacta sin desbordar', async () => {
      assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await phone.screenshot({ path: path.join(output, 'noticias-movil.png'), fullPage: false });
      await phone.getByRole('button', { name: 'Vista compacta' }).click();
      assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await phone.screenshot({ path: path.join(output, 'noticias-movil-compacta.png'), fullPage: false });
    });
    await check('móvil: lector, guardado y vuelta a noticias', async () => {
      await phone.getByRole('button', { name: firstTitle, exact: true }).click();
      await phone.getByRole('button', { name: 'Guardar para después', exact: true }).click();
      assert(await phone.evaluate(() => document.querySelector('dialog').getBoundingClientRect().width <= innerWidth));
      await phone.getByRole('button', { name: 'Cerrar noticia' }).click();
      await phone.getByRole('button', { name: /^Guardadas 1$/ }).click();
      await phone.getByRole('heading', { name: 'Tus noticias guardadas' }).waitFor();
    });
    await mobile.close();
    const blocked = await browser.newContext(); await fixture(blocked, { owner: 'blocked@example.invalid', failure: null });
    await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
    const blockedPage = await blocked.newPage(); blockedPage.on('pageerror', error => errors.push(error.message));
    await blockedPage.goto(origin + '/noticias'); await blockedPage.getByRole('heading', { name: 'En portada', exact: true }).waitFor();
    await check('almacenamiento bloqueado informa y conserva la selección en memoria', async () => {
      await blockedPage.getByRole('button', { name: 'Guardar noticia: ' + firstTitle, exact: true }).click();
      await blockedPage.getByText('Tu navegador no permite guardar los cambios. Se conservan mientras permanezcas en Noticias.', { exact: true }).waitFor();
      await blockedPage.getByRole('button', { name: /^Guardadas 1$/ }).click();
      assert.equal(await blockedPage.getByRole('button', { name: firstTitle, exact: true }).count(), 1);
    });
    await blocked.close(); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'usabilidad.json'), JSON.stringify({ generatedAt: new Date().toISOString(), checks,
      scope: 'Bundle y assets reales; navegador real; fuentes y autenticación simuladas. Sin correos ni proveedores reales.' }, null, 2));
    console.log(`Noticias UI: ${checks.length} recorridos correctos · guardado, lectura, fuentes, filtros, cuentas y móvil`);
  } finally { await browser.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
