import { useEffect } from 'react';
import { animate, svg as animeSvg } from 'animejs';
import { renderPriceChart } from './bolsaChart.js';

/** Anima únicamente Bolsa; los motores de cotizaciones conservan sus datos. */
export default function useBolsaExperience() {
  useEffect(() => {
    const renderer = { render: renderPriceChart };
    window.VNBolsaChart = renderer;
    document.body.classList.add('vn-bolsa-polish');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const running = new Set(), seenCharts = new WeakSet();
    let active = false, observer;
    const play = (targets, options) => {
      const animation = animate(targets, { ...options, onComplete: self => running.delete(self) });
      running.add(animation);
    };
    const draw = chart => {
      if (reduced.matches || !chart || seenCharts.has(chart)) return;
      const bounds = chart.getBoundingClientRect();
      if (!bounds.width || !bounds.height || bounds.top >= window.innerHeight || bounds.bottom <= 0) return;
      seenCharts.add(chart);
      const line = chart.querySelector('.fin-chart-line');
      if (line) play(animeSvg.createDrawable(line, 0, 1), { draw: ['0 0', '0 1'], duration: 650, ease: 'out(3)' });
      play(chart.querySelector('.fin-chart-series') || chart, { opacity: [.45, 1], duration: 400, ease: 'out(3)' });
    };
    const stop = () => {
      observer?.disconnect();
      for (const animation of running) animation.revert();
      running.clear();
    };
    const sync = () => {
      const next = document.body.classList.contains('ff-detail-bolsa');
      if (next === active) return;
      active = next; stop();
      if (!active || reduced.matches) return;
      const nodes = document.querySelectorAll('#ff-detail-navigation, #ff-world-map, #ff-exchange-board, #bvmx-panel, #ff-detail-supplement, #sectors-panel, .ff-exchange-row');
      observer = new IntersectionObserver(entries => {
        if (!active || reduced.matches) return;
        for (const entry of entries) {
          if (!entry.isIntersecting || !entry.target.getBoundingClientRect().height) continue;
          observer.unobserve(entry.target);
          play(entry.target, { opacity: [.6, 1], y: [12, 0], duration: 520, ease: 'out(4)' });
          entry.target.querySelectorAll('.fin-native-market-chart, .ff-exchange-native-chart').forEach(draw);
        }
      }, { threshold: .08 });
      nodes.forEach(node => observer.observe(node));
    };
    const rendered = event => {
      if (!active) return;
      event.target.querySelectorAll('.fin-native-market-chart, .ff-exchange-native-chart').forEach(draw);
    };
    const motionChange = () => { stop(); active = false; sync(); };
    const bodyObserver = new MutationObserver(sync);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('vn:bolsa-chart', rendered);
    reduced.addEventListener('change', motionChange);
    sync();
    return () => {
      stop(); bodyObserver.disconnect();
      document.removeEventListener('vn:bolsa-chart', rendered);
      reduced.removeEventListener('change', motionChange);
      document.body.classList.remove('vn-bolsa-polish');
      if (window.VNBolsaChart === renderer) delete window.VNBolsaChart;
    };
  }, []);
}
