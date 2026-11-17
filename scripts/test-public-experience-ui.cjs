'use strict';
/* global window, document, getComputedStyle, innerWidth */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const { createSiteSeo } = require('../backend/lib/site-seo');
const site = require('../shared/public-site.json');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/public-experience-tests');
const routes = Object.entries(site.pages).filter(([route]) => route !== '/');
const results = [];

async function contextFor(browser, base, options = {}) {
  const context = await browser.newContext(options);
  await context.route('**/*', request => request.request().url().startsWith(base + '/') ? request.continue() : request.abort());
  return context;
}

async function regressions(browser, base) {
  const failures = [];
  for (const scenario of ['direct-link', 'without-observer']) {
    const context = await contextFor(browser, base, { viewport: { width: 390, height: 844 } });
    if (scenario === 'without-observer') await context.addInitScript(() => { window.IntersectionObserver = undefined; });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + '/soluciones/finanzas' + (scenario === 'direct-link' ? '#public-details' : ''));
      await page.getByRole('heading', { level: 1, name: site.pages['/soluciones/finanzas'].heading }).waitFor();
      await page.waitForTimeout(900);
      if (scenario === 'direct-link') {
        const top = await page.locator('#public-details').evaluate(element => element.getBoundingClientRect().top);
        assert(top >= -10 && top < 100, 'A direct link must open the requested section instead of the page header');
      } else {
        assert.deepEqual(errors, [], 'Unsupported visibility observation must not crash the page');
        assert.equal(await page.locator('.public-experience-visual').getAttribute('data-motion'), 'true');
      }
      results.push({ scenario, passed: true });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      failures.push({ scenario, error: error.message.slice(0, 260) });
      await page.screenshot({ path: path.join(output, scenario + '-failure.png') }).catch(() => {});
    } finally { await context.close(); }
  }
  assert.deepEqual(failures, [], JSON.stringify(failures));
}

async function pages(browser, base) {
  for (const width of [1440, 390, 320]) {
    const context = await contextFor(browser, base, { viewport: { width, height: width === 1440 ? 1000 : 844 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      for (const [route, content] of routes) {
        await page.goto(base + route);
        await page.getByRole('heading', { level: 1, name: content.heading, exact: true }).waitFor();
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('.public-feature').count(), content.sections.length);
        assert.equal(await page.locator('.public-product-nav [aria-current="page"]').getAttribute('href'), route);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), site.origin + route);
        const tabs = page.locator('.pp-preview-tabs button');
        await tabs.last().click({ noWaitAfter: true });
        assert.equal(await tabs.last().getAttribute('aria-pressed'), 'true');
        await tabs.first().focus(); await page.keyboard.press('Enter');
        assert.equal(await tabs.first().getAttribute('aria-pressed'), 'true');
        await page.getByRole('button', { name: 'Pausar animaciones', exact: true }).click();
        const visual = page.locator('.public-experience-visual');
        assert.equal(await visual.getAttribute('data-motion'), 'false');
        const loop = visual.locator('[data-loop]').first();
        const pose = () => loop.evaluate(element => { const style = getComputedStyle(element); return [style.transform, style.strokeDashoffset]; });
        const paused = await pose(); await page.waitForTimeout(120); assert.deepEqual(await pose(), paused);
        await page.getByRole('button', { name: 'Activar animaciones', exact: true }).click();
        await visual.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('.public-experience-visual').dataset.motion === 'true');
        const before = await pose(); await page.waitForTimeout(180); assert.notDeepEqual(await pose(), before);
        // A tall viewport can still show the hero at the bottom of a short page.
        // Use a short viewport and the footer to test a genuinely hidden scene.
        await page.setViewportSize({ width, height: 480 });
        await page.locator('.public-footer').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('.public-experience-visual').dataset.motion === 'false');
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}px`);
        assert.equal(await page.locator('.public-header-actions a').getAttribute('href'), '/login');
        assert.equal(await page.locator('.public-product-cta a').getAttribute('href'), '/login');
        assert.deepEqual(errors, []);
        results.push({ route, width, preview: true, keyboard: true, pause: true, offscreen: true, fits: true });
      }
      console.log(JSON.stringify({ viewport: width, pages: routes.length, passed: true }));
    } catch (error) { await page.screenshot({ path: path.join(output, 'pages-' + width + '-failure.png') }).catch(() => {}); throw error; }
    finally { await context.close(); }
  }
}

async function lifecycle(browser, base) {
  const context = await contextFor(browser, base, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const observers = new Set(), timers = new Set();
    const OriginalObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends OriginalObserver {
      constructor(...args) { super(...args); observers.add(this); }
      disconnect() { observers.delete(this); return super.disconnect(); }
    };
    const setInterval = window.setInterval, clearInterval = window.clearInterval;
    window.setInterval = (...args) => { const id = setInterval(...args); timers.add(id); return id; };
    window.clearInterval = id => { timers.delete(id); return clearInterval(id); };
    window.__publicResources = () => ({ observers: observers.size, timers: timers.size });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/soluciones/informes');
    await page.locator('.public-experience-visual[data-motion="false"]').waitFor();
    await page.waitForTimeout(150);
    const baseline = await page.evaluate(() => window.__publicResources());
    for (let visit = 0; visit < 3; visit += 1) for (const [route, content] of routes) {
      await page.locator(`.public-product-nav a[href="${route}"]`).click({ noWaitAfter: true });
      await page.getByRole('heading', { level: 1, name: content.heading, exact: true }).waitFor();
      assert.equal(await page.locator('.pp-preview-tabs button').first().getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.public-experience-visual').getAttribute('data-motion'), 'false');
    }
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => window.__publicResources()), baseline, 'Navigation must release previous observers and timers');
    await page.getByRole('button', { name: 'Activar animaciones', exact: true }).click();
    await page.locator('.public-experience-visual').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.public-experience-visual').dataset.motion === 'true');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.locator('.public-experience-visual[data-motion="false"]').waitFor();
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.locator('.public-experience-visual[data-motion="true"]').waitFor();
    // Let the browser deliver the first preference change before changing it again.
    await page.evaluate(() => {
      window.__publicMediaChange = new Promise(resolve => {
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => window.requestAnimationFrame(resolve), { once: true });
      });
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__publicMediaChange);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.public-experience-visual[data-motion="false"]').waitFor();
    assert.deepEqual(errors, []);
    results.push({ scenario: 'lifecycle', visits: routes.length * 3, stableResources: true, reducedMotion: true, backgroundPause: true });
    console.log(JSON.stringify(results.at(-1)));
  } finally { await context.close(); }
}

async function staticContent(browser, base) {
  const context = await contextFor(browser, base, { javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const [route, content] of routes) {
      const response = await page.goto(base + route);
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('h1').textContent(), content.heading);
      assert.equal(await page.locator('.public-feature').count(), content.sections.length);
    }
    results.push({ scenario: 'without-javascript', pages: routes.length, passed: true });
  } finally { await context.close(); }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  let server, browser;
  let base = 'http://localhost:5273';
  if (!process.argv.includes('--local')) {
    const directory = path.join(root, 'dist');
    await fs.access(path.join(directory, 'index.html'));
    const app = express();
    app.use(createSiteSeo({ directory }));
    app.use('/api', (_request, response) => response.status(401).json({ success: false }));
    app.use(express.static(directory));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    base = 'http://127.0.0.1:' + server.address().port;
  }
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    await regressions(browser, base);
    if (!process.argv.includes('--regression-only')) {
      await pages(browser, base);
      await lifecycle(browser, base);
      if (!process.argv.includes('--local')) await staticContent(browser, base);
    }
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ checks: results.length, passed: true, localOnly: true }));
  } finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
