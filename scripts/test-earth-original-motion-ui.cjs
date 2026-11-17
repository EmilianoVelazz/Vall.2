'use strict';
/* global window, document, WebGL2RenderingContext, HTMLCanvasElement, getComputedStyle */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const express = require('express');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/earth-restore-20261113');
let base = process.env.VALL_UI_BASE || 'http://localhost:5273';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const referenceOnly = process.argv.includes('--reference-only');
const currentOnly = process.argv.includes('--current-only');
const fallbackOnly = process.argv.includes('--fallback-only');

async function runFallback(browser) {
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /^webgl/.test(type) ? null : getContext.call(this, type, ...args); };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base);
      await page.locator('.vp-space-viewport[data-status="fallback"]').waitFor();
      const background = page.locator('.vp-space-fallback > div');
      const pose = () => background.evaluate(element => getComputedStyle(element).backgroundPosition);
      if (reduced) {
        const before = await pose(); await page.waitForTimeout(300);
        assert.equal(await pose(), before, 'Reduced motion starts paused');
        await page.getByRole('button', { name: '▷ Activar movimiento', exact: true }).click();
        await page.locator('.vp-space-journey:not(.vp-space-reduced)').waitFor();
        await page.locator('.vp-space-viewport[data-status="fallback"]').waitFor();
      }
      const start = await pose(); await page.waitForTimeout(600);
      assert.notEqual(await pose(), start, 'The fallback must animate when WebGL cannot start');
      await page.getByRole('button', { name: 'Ⅱ Pausar movimiento', exact: true }).click();
      const paused = await pose(); await page.waitForTimeout(300);
      assert.equal(await pose(), paused, 'Fallback pause must work');
      await page.getByRole('button', { name: '▷ Activar movimiento', exact: true }).click();
      const resumed = await pose(); await page.waitForTimeout(300);
      assert.notEqual(await pose(), resumed);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, 'fallback-' + reduced + '.png') });
      console.log(JSON.stringify({ fallback: true, reduced, animation: true, pause: true, resume: true, errors }));
    } finally { await context.close(); }
  }
}

async function prepareReference() {
  const directory = path.join(output, 'reference');
  for (const file of ['lib/createEarthJourney.js', 'lib/earthJourneyData.js', 'lib/useShowcaseInteraction.js', 'components/SpaceJourney.jsx', 'components/SpaceJourney.css', 'pages/Presentacion.css']) {
    const target = path.join(directory, 'frontend/src', file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, execFileSync('git', ['show', '82cd91a:frontend/src/' + file], { cwd: root }));
  }
  await fs.writeFile(path.join(directory, 'entry.jsx'), `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {BrowserRouter} from 'react-router-dom';
    import SpaceJourney from './frontend/src/components/SpaceJourney.jsx';
    import './frontend/src/pages/Presentacion.css';
    function Reference() { const [paused, setPaused] = useState(false); return <BrowserRouter><div className="vn-presentacion"><SpaceJourney moving={!paused} paused={paused} reducedMotion={false} onToggleMotion={()=>setPaused(value=>!value)}/></div></BrowserRouter>; }
    createRoot(document.getElementById('root')).render(<Reference/>);
  `);
  await require(path.join(root, 'frontend/node_modules/esbuild')).build({
    entryPoints: [path.join(directory, 'entry.jsx')], bundle: true, splitting: true,
    format: 'esm', jsx: 'automatic', external: ['/assets/*'],
    nodePaths: [path.join(root, 'frontend/node_modules')], outdir: path.join(directory, 'dist'), logLevel: 'silent',
  });
  await fs.writeFile(path.join(directory, 'dist/index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/entry.css"><style>html,body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');
}

async function instrument(context) {
  await context.addInitScript(() => {
    window.__earthFrames = [];
    window.__earthCapture = false;
    let timestamp = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => raf.call(window, time => { timestamp = time; callback(time); });
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (...args) {
      if (window.__earthCapture && this.canvas.closest('.vp-space-render')) {
        const label = document.querySelector('.vp-earth-label');
        window.__earthFrames.push({ time: timestamp, pose: label?.style.transform });
      }
      return clear.apply(this, args);
    };
  });
}

async function capture(page, duration, action) {
  await page.evaluate(() => { window.__earthFrames = []; window.__earthCapture = true; });
  if (action) await action();
  await page.waitForTimeout(duration);
  const frames = await page.evaluate(() => { window.__earthCapture = false; return window.__earthFrames; });
  const stamps = [...new Set(frames.map(frame => frame.time))];
  const intervals = stamps.slice(1).map((time, i) => time - stamps[i]).sort((a, b) => a - b);
  return {
    renders: frames.length, uniqueFrames: stamps.length, duplicateRenders: frames.length - stamps.length,
    fps: Math.round((stamps.length - 1) * 10000 / Math.max(1, stamps.at(-1) - stamps[0])) / 10,
    medianMs: Math.round(intervals[Math.floor(intervals.length * .5)] || 0),
    p95Ms: Math.round(intervals[Math.floor(intervals.length * .95)] || 0),
    frames,
  };
}

async function progress(page, value) {
  await page.evaluate(p => {
    const section = document.querySelector('.vp-space-journey'), viewport = document.querySelector('.vp-space-viewport');
    window.scrollTo({ top: section.offsetTop + (section.offsetHeight - viewport.clientHeight) * p, behavior: 'instant' });
  }, value);
  await page.waitForFunction(p => Math.abs(Number.parseInt(document.querySelector('.vp-space-progress > span').textContent, 10) - p * 100) <= 1, value);
}

async function poses(page) {
  return page.locator('.vp-earth-label').evaluateAll(labels => labels.map(label => label.style.transform));
}
function poseDifference(before, after) {
  return Math.max(...before.map((pose, i) => {
    const a = pose.match(/[-\d.]+/g).map(Number), b = after[i].match(/[-\d.]+/g).map(Number);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }));
}

async function run(browser, url, name, { mobile = false, reduced = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await instrument(context);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let completed = false;
  try {
    await page.goto(url);
    await page.locator('.vp-space-viewport[data-status="ready"]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    const gpu = await page.locator('.vp-space-render canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    console.log(JSON.stringify({ name, gpu, started: true }));
    if (reduced) {
      assert.equal(await page.locator('.vp-space-viewport').getAttribute('data-moving'), 'false');
      const paused = await poses(page);
      await page.waitForTimeout(300);
      assert.deepEqual(await poses(page), paused);
      await page.getByRole('button', { name: '▷ Activar movimiento', exact: true }).click();
      await page.locator('.vp-space-journey:not(.vp-space-reduced)').waitFor();
      await page.locator('.vp-space-viewport[data-status="ready"]').waitFor();
      await progress(page, 0);
    }
    const initial = await capture(page, 1200);
    await page.screenshot({ path: path.join(output, name + '-space.png') });
    const approach = await capture(page, 1400, () => progress(page, .58));
    await page.getByRole('heading', { level: 1, name: 'Un planeta. Muchas perspectivas.' }).waitFor();
    const automaticCities = await capture(page, 1900, () => progress(page, .92));
    const cities = [];
    for (const city of ['Nueva York', 'Barcelona', 'Tokio']) {
      cities.push({ city, ...await capture(page, 1750, () => page.locator('.vp-location-picker').getByRole('button', { name: city, exact: true }).click()) });
    }
    await page.waitForTimeout(900);
    const holdStart = await poses(page);
    await page.waitForTimeout(4300);
    const holdEnd = await poses(page);
    // The original scene keeps the chosen city in place, without a timed restart.
    const cityHeld = poseDifference(holdStart, holdEnd) < .1;
    await page.locator('.vp-location-picker').getByRole('button', { name: 'Barcelona', exact: true }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(output, name + '-earth.png') });
    const canvas = page.locator('.vp-space-render canvas');
    const bounds = await canvas.boundingBox(), x = bounds.x + bounds.width * .76, y = bounds.y + bounds.height * .46;
    const drag = await capture(page, 1500, async () => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 18; i += 1) {
        await page.mouse.move(x - i * 5, y + i * .5);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
    });
    await page.waitForTimeout(1100);
    const dragHoldStart = await poses(page);
    await page.waitForTimeout(2300);
    const dragHoldEnd = await poses(page);
    const manualHeld = poseDifference(dragHoldStart, dragHoldEnd) < .1;
    const reset = await capture(page, 1450, () => page.getByRole('button', { name: 'Restablecer vista' }).click());
    await progress(page, 0);
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Ⅱ Pausar movimiento', exact: true }).click();
    await page.waitForTimeout(150);
    const paused = await poses(page);
    await page.waitForTimeout(350);
    assert.deepEqual(await poses(page), paused, 'Pause must stop the scene');
    await canvas.press('ArrowRight');
    await page.waitForFunction(before => [...document.querySelectorAll('.vp-earth-label')].some((label, i) => label.style.transform !== before[i]), paused);
    assert.notDeepEqual(await poses(page), paused, 'Keyboard control must work while paused');
    await page.getByRole('button', { name: '▷ Activar movimiento', exact: true }).click();
    await page.getByRole('button', { name: 'Restablecer vista' }).click();
    await page.waitForTimeout(1400);
    const resume = await capture(page, 1000);
    assert(resume.frames.some(frame => frame.pose !== resume.frames[0]?.pose), 'Reset and resume must restore the original slow rotation');
    if (name === 'restored') {
      await progress(page, .92);
      for (const city of ['Tokio', 'Londres', 'Nueva York', 'Barcelona']) {
        await page.locator('.vp-location-picker').getByRole('button', { name: city, exact: true }).click();
        await page.waitForTimeout(70);
      }
      await page.getByRole('heading', { name: 'Barcelona, una perspectiva europea.' }).waitFor();
      const extension = await canvas.evaluateHandle(element => element.getContext('webgl2').getExtension('WEBGL_lose_context'));
      await extension.evaluate(value => value.loseContext());
      await page.locator('.vp-space-viewport[data-status="fallback"]').waitFor();
      await page.waitForTimeout(350);
      await extension.evaluate(value => value.restoreContext());
      await extension.dispose();
      await page.locator('.vp-space-viewport[data-status="ready"]').waitFor();
      assert.equal(await page.locator('.vp-space-render canvas').count(), 1);
      const recovered = await capture(page, 600);
      assert.equal(recovered.duplicateRenders, 0);
      for (let visit = 0; visit < 2; visit += 1) {
        await page.locator('.public-overview .public-card[href="/soluciones/informes"]').click();
        await page.getByRole('heading', { level: 1, name: 'Informes ejecutivos que conectan datos y contexto.' }).waitFor();
        await page.locator('.public-brand').click();
        await page.locator('.vp-space-viewport[data-status="ready"]').waitFor();
        assert.equal(await page.locator('.vp-space-render canvas').count(), 1);
      }
    }
    const all = [initial, approach, automaticCities, ...cities, drag, reset, resume];
    const duplicateRenders = all.reduce((sum, value) => sum + value.duplicateRenders, 0);
    if (name !== 'reference') {
      assert.equal(duplicateRenders, 0, 'Only one Earth render is allowed per animation frame');
      assert(cityHeld, 'A city must remain in place, like the original');
      assert(manualHeld, 'Manual rotation must settle without a timed restart');
    }
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    const result = { name, mobile, reduced, gpu, cityHeld, manualHeld, duplicateRenders,
      initial, approach, automaticCities, cities, drag, reset, resume, errors };
    await fs.writeFile(path.join(output, name + '-metrics.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ name, gpu, cityHeld, manualHeld, duplicateRenders, initial: { fps: initial.fps, p95Ms: initial.p95Ms }, automaticCities: { fps: automaticCities.fps, duplicateRenders: automaticCities.duplicateRenders }, cityFps: cities.map(city => city.fps), drag: { fps: drag.fps, p95Ms: drag.p95Ms }, errors }));
    completed = true;
    return result;
  } finally {
    if (!completed) await page.screenshot({ path: path.join(output, name + '-failure.png') }).catch(() => {});
    await context.close();
  }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  if (!currentOnly && !fallbackOnly) await prepareReference();
  const app = express();
  app.use('/assets', express.static(path.join(root, 'assets')));
  app.use(express.static(path.join(output, 'reference/dist')));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  let builtServer;
  if (process.argv.includes('--dist')) {
    const built = express(), directory = path.join(root, 'dist');
    built.use(require('../backend/lib/site-seo').createSiteSeo({ directory }));
    built.use('/api', (_request, response) => response.status(401).json({ success: false }));
    built.use(express.static(directory));
    builtServer = await new Promise(resolve => { const listener = built.listen(0, '127.0.0.1', () => resolve(listener)); });
    base = 'http://127.0.0.1:' + builtServer.address().port;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: process.argv.includes('--software') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
    if (!currentOnly && !fallbackOnly) await run(browser, 'http://127.0.0.1:' + server.address().port, 'reference');
    if (!referenceOnly && !fallbackOnly) {
      // Render duplication is deterministic. FPS is reported, since software GPU
      // emulation and the full app's loading work vary independently of this fix.
      await run(browser, base, 'restored');
      await run(browser, base, 'restored-mobile', { mobile: true });
      await run(browser, base, 'restored-reduced', { reduced: true });
    }
    if (!referenceOnly) await runFallback(browser);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    if (builtServer) await new Promise(resolve => builtServer.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
