import { useEffect, useState } from 'react';

// Visibility is an optimization. Missing browser support must leave the page usable.
export default function useViewportVisibility(reference, refreshKey) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = reference.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true);
      return undefined;
    }
    let live = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (live && entry) setVisible(entry.isIntersecting);
    }, { threshold: .12 });
    observer.observe(element);
    return () => { live = false; observer.disconnect(); };
  }, [reference, refreshKey]);
  return visible;
}
