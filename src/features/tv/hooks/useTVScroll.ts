import { useEffect, useRef, type RefObject } from 'react';
import { clamp01 } from '@/utils/math';

interface TVScrollOptions {
  /** Receives 0–1 progress through the pinned section. Called at most once per frame. */
  onProgress: (progress: number) => void;
  /** Fired when the section enters or leaves the viewport. */
  onVisibility?: (visible: boolean) => void;
}

/**
 * Turns the height of a pinned section into a 0–1 progress value.
 *
 * Scroll listeners are passive and coalesced into a single rAF callback, so
 * the handler cost is one rect read per frame no matter how many scroll
 * events the browser fires. Nothing here touches React state.
 */
export function useTVScroll(
  ref: RefObject<HTMLElement | null>,
  { onProgress, onVisibility }: TVScrollOptions,
): void {
  const progressRef = useRef(onProgress);
  const visibilityRef = useRef(onVisibility);
  progressRef.current = onProgress;
  visibilityRef.current = onVisibility;

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === 'undefined') return;

    let frame = 0;
    let queued = false;
    let lastReported = -1;
    let visible = false;

    const measure = (): void => {
      queued = false;
      const rect = element.getBoundingClientRect();
      // The travel distance is the section height minus the pinned viewport.
      const travel = Math.max(1, rect.height - window.innerHeight);
      const progress = clamp01(-rect.top / travel);

      // Ignore sub-pixel churn; the state machine has coarse thresholds.
      if (Math.abs(progress - lastReported) < 0.0008) return;
      lastReported = progress;
      progressRef.current(progress);
    };

    const request = (): void => {
      if (queued || !visible) return;
      queued = true;
      frame = requestAnimationFrame(measure);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting === visible) return;
        visible = entry.isIntersecting;
        visibilityRef.current?.(visible);
        if (visible) {
          // Re-measure immediately so the phase is correct on entry.
          lastReported = -1;
          request();
        }
      },
      { rootMargin: '10% 0px' },
    );

    observer.observe(element);
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });

    // Initial measurement in case the section is already on screen.
    visible = true;
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, [ref]);
}
