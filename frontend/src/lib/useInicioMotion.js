import { useEffect, useState } from 'react';
import { animate, createScope, stagger } from 'animejs';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export default function useInicioMotion(rootRef) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || !rootRef.current) return undefined;
    const scope = createScope({ root: rootRef.current }).add(() => {
      animate('.ih-hero-copy > *, .ih-carousel', { opacity: [0, 1], translateY: [20, 0],
        duration: 750, delay: stagger(75), ease: 'outCubic' });
    });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        scope.add(() => animate(entry.target, { opacity: [.35, 1], translateY: [20, 0], duration: 650, ease: 'outCubic' }));
        observer.unobserve(entry.target);
      });
    }, { threshold: .12 });
    rootRef.current.querySelectorAll('[data-ih-reveal]').forEach(element => observer.observe(element));
    return () => { observer.disconnect(); scope.revert(); };
  }, [rootRef, reduced]);
}
