import { useEffect, useRef } from 'react';
import { animate, createScope, createTimeline, stagger, svg } from 'animejs';

const ORION_REVEAL_START = 240;
const ORION_REVEAL_DURATION = 360;

export default function useScrollScene(root, moving, reducedMotion, onProgress) {
  const callback = useRef(onProgress);
  useEffect(() => { callback.current = onProgress; }, [onProgress]);
  useEffect(() => {
    const section = root.current;
    const visual = section.querySelector('.sx-visual');
    const fill = section.querySelector('.sx-scene-progress i');
    const story = section.querySelector('[data-orion-story]');
    let timeline;
    let frame = 0;
    let seekFrame = 0;
    let targetProgress = 0;
    let renderedProgress = 0;
    let seekTime = 0;
    let positioned = false;
    let visible = false;
    const loops = [];
    const scope = createScope({ root }).add(() => {
      if (!moving || reducedMotion) return;
      timeline = createTimeline({ autoplay: false, defaults: { ease: 'out(3)' } });
      if (story) {
        timeline.add(story, { '--of-reveal': [0, 1], duration: ORION_REVEAL_DURATION, ease: 'inOut(2)' }, ORION_REVEAL_START);
      } else {
        timeline.add(visual, { y: [section.classList.contains('px-protein') || section.classList.contains('px-orion') ? 0 : 55, 0], scale: [.96, 1], opacity: [.95, 1], duration: 700 }, 0)
          .add(section.querySelector('.sx-scene-copy,[data-scene-copy]'), { y: [20, 0], opacity: [.95, 1], duration: 600 }, 0);
      }
      const paths = section.querySelectorAll('[data-draw]');
      if (paths.length) timeline.add(svg.createDrawable(paths, 0, 1), { draw: ['0 0', '0 1'], duration: 1300, ease: 'inOut(2)' }, 100);
      if (section.querySelector('.sx-candle')) timeline.add('.sx-candle', { scaleY: [.08, 1], opacity: [.1, 1], delay: stagger(18), duration: 550 }, 100);
      if (!story) timeline.add(visual, { y: 0, duration: 200 }, 1600)
        .add(visual, { y: -14, scale: .985, opacity: .75, duration: 200, ease: 'inOut(2)' }, 1800);
      section.querySelectorAll('[data-float]').forEach((node, i) => loops.push(animate(node, { y: [0, i % 2 ? 7 : -7], duration: 2500 + i * 400, alternate: true, loop: true, autoplay: false, ease: 'inOutSine' })));
      const stars = section.querySelectorAll('.vai-orion-star');
      if (stars.length) loops.push(animate(stars, { opacity: [.55, 1], duration: 1600, delay: stagger(130), alternate: true, loop: true, autoplay: false, ease: 'inOutSine' }));
      section.querySelectorAll('[data-breathe]').forEach(node => loops.push(animate(node, { scale: [1, 1.075], opacity: [.6, 1], duration: 5500, alternate: true, loop: true, autoplay: false, ease: 'inOutSine' })));
      section.querySelectorAll('[data-flow]').forEach((path, i) => {
        const particle = section.querySelector(`[data-particle="${i}"]`);
        const length = path.getTotalLength();
        const state = { progress: 0 };
        loops.push(animate(state, { progress: [0, 1], duration: Number(path.dataset.duration) || 2800, delay: i * 650, loop: true, autoplay: false, ease: 'linear', onUpdate: () => {
          const point = path.getPointAtLength(length * state.progress);
          particle.setAttribute('cx', point.x);
          particle.setAttribute('cy', point.y);
        } }));
      });
    });
    const seek = time => {
      seekFrame = 0;
      if (!visible || document.hidden) return;
      const elapsed = Math.min((time - seekTime) / 1000 || .016, .05);
      seekTime = time;
      renderedProgress += (targetProgress - renderedProgress) * (1 - Math.exp(-elapsed * (story ? 9 : 12)));
      if (Math.abs(targetProgress - renderedProgress) < .0003) renderedProgress = targetProgress;
      timeline?.seek(renderedProgress * 2000);
      fill.style.transform = `scaleX(${renderedProgress})`;
      if (renderedProgress !== targetProgress) seekFrame = requestAnimationFrame(seek);
    };
    const update = () => {
      frame = 0;
      const viewport = section.querySelector('.sx-scene-viewport');
      const travel = Math.max(1, section.offsetHeight - viewport.clientHeight);
      const bounds = section.getBoundingClientRect();
      const progress = reducedMotion ? 0 : Math.max(0, Math.min(1, -bounds.top / travel));
      const inView = bounds.top < window.innerHeight && bounds.bottom > 0;
      if (!inView) { callback.current?.(progress, false); return; }
      targetProgress = progress;
      if (!positioned) { renderedProgress = progress; positioned = true; }
      if (timeline && visible) {
        if (!seekFrame) { seekTime = performance.now(); seekFrame = requestAnimationFrame(seek); }
      } else {
        renderedProgress = progress;
        fill.style.transform = `scaleX(${progress})`;
        if (story) {
          const amount = Math.max(0, Math.min(1, (progress * 2000 - ORION_REVEAL_START) / ORION_REVEAL_DURATION));
          story.style.setProperty('--of-reveal', String(amount < .5 ? 2 * amount * amount : 1 - 2 * (1 - amount) ** 2));
        }
      }
      callback.current?.(progress, true);
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const syncLoops = () => loops.forEach(loop => { if (visible && !document.hidden) loop.resume(); else loop.pause(); });
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncLoops(); if (visible) update(); else { cancelAnimationFrame(seekFrame); seekFrame = 0; } });
    const resize = new ResizeObserver(scroll);
    observer.observe(section);
    resize.observe(section);
    window.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('visibilitychange', syncLoops);
    update();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(seekFrame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', scroll);
      document.removeEventListener('visibilitychange', syncLoops);
      scope.revert();
      section.querySelectorAll('[data-draw]').forEach(path => ['draw', 'pathLength', 'stroke-dasharray', 'stroke-dashoffset'].forEach(attribute => path.removeAttribute(attribute)));
    };
  }, [root, moving, reducedMotion]);
}
