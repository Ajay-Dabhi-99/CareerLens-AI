import { useEffect, useRef, useState } from 'react';

export interface UseInViewOptions {
  /** Fraction of the element that must be visible before it counts as revealed. */
  threshold?: number;
  /** Shrinks the viewport so elements reveal slightly before they hit the edge. */
  rootMargin?: string;
}

/**
 * Reveals an element once it scrolls into view, then stops observing.
 * Falls back to "revealed" when IntersectionObserver is unavailable (e.g. jsdom),
 * so content is never stuck invisible.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.15,
  rootMargin = '0px 0px -80px 0px',
}: UseInViewOptions = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, inView };
}
