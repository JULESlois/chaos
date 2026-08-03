import { useEffect } from 'react';
import type { ExperienceStore } from './experience-store';

function readProgress(): number {
  const doc = document.documentElement;
  const travel = Math.max(1, doc.scrollHeight - window.innerHeight);
  return window.scrollY / travel;
}

/**
 * Feeds document scroll into the store.
 *
 * Scroll events are passive and coalesced into a single rAF callback, so no
 * matter how many the browser fires the cost is one layout read per frame.
 * Resizes snap rather than ease, because the underlying travel distance has
 * changed and easing toward a moved goalpost reads as a lurch.
 */
export function useExperienceProgress(store: ExperienceStore): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    let queued = false;

    const measure = (): void => {
      queued = false;
      store.setProgress(readProgress());
    };

    const request = (): void => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(measure);
    };

    const snap = (): void => {
      store.snap(readProgress());
    };

    snap();

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', snap, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', snap);
    };
  }, [store]);
}
