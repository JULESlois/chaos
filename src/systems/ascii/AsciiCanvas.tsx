import { useEffect, useRef } from 'react';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import { useSystem } from '@/systems/telemetry/SystemProvider';
import { asciiCellBudget } from '@/systems/telemetry/capabilities';
import { signalBus } from '@/utils/signal-bus';
import type { AsciiEngine} from './ascii-engine';
import { createAsciiEngine } from './ascii-engine';

/**
 * Mounts the ASCII field.
 *
 * The component renders exactly one <canvas> and never re-renders in response
 * to pointer, scroll or animation activity — all of that reaches the engine
 * through refs and the signal bus.
 */
export function AsciiCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AsciiEngine | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { capabilities } = useSystem();
  const { director, stabilised } = useChaos();

  const cellBudget = asciiCellBudget(capabilities);
  const reducedMotion = capabilities.prefersReducedMotion || stabilised;

  // Create the engine once; subsequent capability changes are applied as options.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = createAsciiEngine(canvas, {
      cellBudget,
      maxDpr: capabilities.maxDpr,
      targetFps: 45,
      reducedMotion,
    });

    if (!engine) return;
    engineRef.current = engine;
    engine.resize(window.innerWidth, window.innerHeight);
    engine.start();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Intentionally created once — see the separate effects below for updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply capability / stabilise changes without recreating the engine.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setReducedMotion(reducedMotion);
    engine.setCellBudget(cellBudget, window.innerWidth, window.innerHeight);
  }, [reducedMotion, cellBudget]);

  // Resize handling, throttled to one rAF.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const handleResize = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        engineRef.current?.resize(window.innerWidth, window.innerHeight);
      });
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(document.documentElement);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Pointer + scroll telemetry. Passive listeners, no state updates.
  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let lastAt = performance.now();
    let primed = false;
    let lastScrollY = window.scrollY;
    let lastScrollAt = performance.now();

    const onPointerMove = (event: PointerEvent): void => {
      const engine = engineRef.current;
      if (!engine) return;
      const now = performance.now();
      const dt = Math.max(16, now - lastAt);
      let speed = 0;
      if (primed) {
        speed = Math.hypot(event.clientX - lastX, event.clientY - lastY) / dt / 2.2;
      }
      lastX = event.clientX;
      lastY = event.clientY;
      lastAt = now;
      primed = true;
      engine.setPointer(
        event.clientX / window.innerWidth,
        event.clientY / window.innerHeight,
        speed,
      );
    };

    const onPointerLeave = (): void => engineRef.current?.clearPointer();

    const onScroll = (): void => {
      const engine = engineRef.current;
      if (!engine) return;
      const now = performance.now();
      const dt = Math.max(16, now - lastScrollAt);
      const dy = Math.abs(window.scrollY - lastScrollY);
      engine.setScroll(window.scrollY, dy / dt / 3.5);
      lastScrollY = window.scrollY;
      lastScrollAt = now;
    };

    const onVisibility = (): void => {
      if (document.hidden) engineRef.current?.stop();
      else engineRef.current?.start();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Feed entropy to the engine at the director's tick rate, not per frame.
  useEffect(() => {
    const unsubscribe = director.subscribe((state) => {
      engineRef.current?.setEntropy(state.entropy);
    });
    return unsubscribe;
  }, [director]);

  // Respond to chaos anomalies and TV absorb/release.
  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number): void => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const offEvent = signalBus.on('chaos:event', ({ id }) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (id === 'glyph-substitution') {
        engine.setGlyphCorruption(0.7);
        later(() => engineRef.current?.setGlyphCorruption(0), 900);
      }
      if (id === 'dead-column') {
        engine.killColumns(Math.floor(performance.now()) & 0xff, 2);
        later(() => engineRef.current?.restoreColumns(), 2200);
      }
    });

    const offAbsorb = signalBus.on('tv:absorb', ({ rect }) => {
      engineRef.current?.absorbTo(rect);
    });

    const offRelease = signalBus.on('tv:release', () => {
      engineRef.current?.release();
    });

    return () => {
      offEvent();
      offAbsorb();
      offRelease();
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="ascii-field"
      aria-hidden="true"
      data-absorbing="false"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
