import { useEffect, useRef, useState } from 'react';
import { animate } from 'animejs';

// @refresh reset

// Swap copy between the exit and entrance, instead of replacing a moving panel.
export function useAnimatedContent(value, moving) {
  const panel = useRef(null);
  const exitTween = useRef(null);
  const entryTween = useRef(null);
  const shown = useRef(value);
  const [displayed, setDisplayed] = useState(value);
  useEffect(() => {
    const element = panel.current;
    if (!element) return undefined;
    let canceled = false;
    exitTween.current?.cancel();
    entryTween.current?.cancel();
    const swap = () => { if (!canceled) { shown.current = value; setDisplayed(value); } };
    if (!moving) { swap(); panel.current.style.removeProperty('opacity'); panel.current.style.removeProperty('transform'); return undefined; }
    if (shown.current === value) {
      const restore = animate(panel.current, { opacity: 1, y: 0, duration: 300, ease: 'out(4)' });
      entryTween.current = restore;
      return () => restore.cancel();
    }
    const exit = animate(panel.current, { opacity: 0, y: -6, duration: 160, ease: 'in(2)', onComplete: swap });
    exitTween.current = exit;
    return () => { canceled = true; exit.cancel(); };
  }, [value, moving]);
  useEffect(() => {
    const element = panel.current;
    if (!element) return undefined;
    if (!moving) { element.style.removeProperty('opacity'); element.style.removeProperty('transform'); return undefined; }
    // A newer value may already be exiting while React commits an older swap.
    // Its entrance must never cancel the exit that will publish the latest copy.
    if (displayed !== value) return undefined;
    entryTween.current?.cancel();
    const entry = animate(element, { opacity: [.15, 1], y: [10, 0], duration: 500, ease: 'out(4)' });
    entryTween.current = entry;
    return () => entry.cancel();
  }, [displayed, moving, value]);
  return { panel, displayed };
}

export function useShowcasePointer(root, moving) {
  useEffect(() => {
    if (!moving || !window.matchMedia('(pointer: fine)').matches) return undefined;
    const visual = root.current.querySelector('[data-pointer-surface]');
    const target = visual.querySelector('[data-pointer-layer]');
    let tween;
    const move = event => {
      if (event.pointerType !== 'mouse') return;
      const bounds = visual.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      tween?.cancel();
      tween = animate(target, { x: x * 12, y: y * 8, rotate: x * 1.5, duration: 1100, ease: 'out(3)' });
    };
    const reset = () => {
      tween?.cancel();
      tween = animate(target, { x: 0, y: 0, rotate: 0, duration: 1400, ease: 'out(4)' });
    };
    visual.addEventListener('pointermove', move);
    visual.addEventListener('pointerleave', reset);
    return () => {
      visual.removeEventListener('pointermove', move);
      visual.removeEventListener('pointerleave', reset);
      tween?.cancel();
      target.style.removeProperty('transform');
    };
  }, [root, moving]);
}
