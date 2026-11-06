import { useEffect, useRef } from 'react';

// Cada gráfica conserva su altura natural, también al abrir tablas o metodología.
// Las filas pequeñas permiten aprovechar los huecos sin cambiar el orden del DOM.
export default function ReportVisualGrid({ children, className }) {
  const grid = useRef(null);
  useEffect(() => {
    const element = grid.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    let frame;
    const cards = [...element.children];
    const arrange = () => {
      const style = getComputedStyle(element);
      const row = Number.parseFloat(style.gridAutoRows);
      const gap = Number.parseFloat(style.rowGap) || 0;
      const gutter = Number.parseFloat(style.getPropertyValue('--erh-card-gap')) || gap;
      const packed = style.display === 'grid' && Number.isFinite(row) && row > 0;
      cards.forEach(card => {
        const span = packed ? `span ${Math.ceil((card.getBoundingClientRect().height + gutter) / (row + gap))}` : '';
        if (card.style.gridRowEnd !== span) card.style.gridRowEnd = span;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(arrange);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    cards.forEach(card => observer.observe(card));
    element.classList.add('erh-visual-grid-packed');
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.classList.remove('erh-visual-grid-packed');
      cards.forEach(card => { card.style.gridRowEnd = ''; });
    };
  }, [children]);
  return <div ref={grid} className={className}>{children}</div>;
}
