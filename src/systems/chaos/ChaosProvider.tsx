import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { clamp01 } from '@/utils/math';
import { ChaosDirector } from './chaos-director';
import type { ChaosEventId, ChaosState, SignalState } from './types';

interface ChaosContextValue {
  director: ChaosDirector;
  /** Throttled snapshot — updates at most a few times per second. */
  signalState: SignalState;
  entropy: number;
  stabilised: boolean;
  activeEventIds: readonly ChaosEventId[];
  totalFired: number;
  setStabilised: (enabled: boolean) => void;
  forceEvent: (id: ChaosEventId) => boolean;
  boost: (amount: number) => void;
}

const ChaosContext = createContext<ChaosContextValue | null>(null);

const STORAGE_KEY = 'node07:stabilised';

function readStoredStabilised(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === 'true') return true;
  } catch {
    // Storage can throw in private mode — treat as "not set".
  }
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

/**
 * Bridges the imperative director into React.
 *
 * The director ticks at 10Hz but this provider only re-renders when a value
 * the UI actually displays changes (state name, rounded entropy, active ids).
 */
export function ChaosProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [initialStabilised] = useState(readStoredStabilised);
  const directorRef = useRef<ChaosDirector | null>(null);
  if (directorRef.current === null) {
    directorRef.current = new ChaosDirector({ stabilised: initialStabilised });
  }
  const director = directorRef.current;

  const [snapshot, setSnapshot] = useState(() => ({
    signalState: director.getState().signalState,
    entropy: director.getState().entropy,
    stabilised: director.getState().stabilised,
    activeEventIds: [] as readonly ChaosEventId[],
    totalFired: 0,
  }));

  const location = useLocation();

  useEffect(() => {
    const depth = location.pathname.split('/').filter(Boolean).length;
    director.reportRouteDepth(depth);
  }, [director, location.pathname]);

  useEffect(() => {
    director.start();

    const unsubscribe = director.subscribe((state: ChaosState) => {
      setSnapshot((previous) => {
        const roundedEntropy = Math.round(state.entropy * 100) / 100;
        const ids = state.active.map((event) => event.id);
        const sameIds =
          ids.length === previous.activeEventIds.length &&
          ids.every((id, index) => previous.activeEventIds[index] === id);

        if (
          previous.signalState === state.signalState &&
          previous.entropy === roundedEntropy &&
          previous.stabilised === state.stabilised &&
          previous.totalFired === state.totalFired &&
          sameIds
        ) {
          return previous;
        }

        return {
          signalState: state.signalState,
          entropy: roundedEntropy,
          stabilised: state.stabilised,
          activeEventIds: ids,
          totalFired: state.totalFired,
        };
      });
    });

    return () => {
      unsubscribe();
      director.stop();
    };
  }, [director]);

  // Telemetry listeners. All passive, all ref-based — never setState here.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lastX = 0;
    let lastY = 0;
    let lastPointerAt = performance.now();
    let lastScrollY = window.scrollY;
    let lastScrollAt = performance.now();
    let primed = false;

    const onPointerMove = (event: PointerEvent): void => {
      const now = performance.now();
      const dt = Math.max(16, now - lastPointerAt);
      if (primed) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        const speed = Math.hypot(dx, dy) / dt; // px per ms
        director.reportPointerVelocity(clamp01(speed / 2.2));
      }
      lastX = event.clientX;
      lastY = event.clientY;
      lastPointerAt = now;
      primed = true;
    };

    const onScroll = (): void => {
      const now = performance.now();
      const dt = Math.max(16, now - lastScrollAt);
      const dy = Math.abs(window.scrollY - lastScrollY);
      director.reportScrollVelocity(clamp01(dy / dt / 3.5));
      lastScrollY = window.scrollY;
      lastScrollAt = now;
    };

    const onVisibility = (): void => {
      if (document.hidden) director.stop();
      else director.start();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [director]);

  const setStabilised = useCallback(
    (enabled: boolean) => {
      director.setStabilised(enabled);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(enabled));
      } catch {
        // Ignore storage failures — the setting still applies for this session.
      }
    },
    [director],
  );

  const forceEvent = useCallback((id: ChaosEventId) => director.forceEvent(id), [director]);
  const boost = useCallback((amount: number) => director.boost(amount), [director]);

  // Reflect the global state on <html> so CSS can respond without prop drilling.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.signal = snapshot.signalState;
    root.dataset.stabilised = String(snapshot.stabilised);
    root.style.setProperty('--entropy', snapshot.entropy.toFixed(2));
    return () => {
      delete root.dataset.signal;
      delete root.dataset.stabilised;
      root.style.removeProperty('--entropy');
    };
  }, [snapshot.signalState, snapshot.stabilised, snapshot.entropy]);

  const value = useMemo<ChaosContextValue>(
    () => ({
      director,
      signalState: snapshot.signalState,
      entropy: snapshot.entropy,
      stabilised: snapshot.stabilised,
      activeEventIds: snapshot.activeEventIds,
      totalFired: snapshot.totalFired,
      setStabilised,
      forceEvent,
      boost,
    }),
    [director, snapshot, setStabilised, forceEvent, boost],
  );

  return <ChaosContext.Provider value={value}>{children}</ChaosContext.Provider>;
}

export function useChaos(): ChaosContextValue {
  const context = useContext(ChaosContext);
  if (!context) {
    throw new Error('useChaos must be used within a ChaosProvider');
  }
  return context;
}

/** Returns true while the given anomaly is active. */
export function useChaosEvent(id: ChaosEventId): boolean {
  const { activeEventIds } = useChaos();
  return activeEventIds.includes(id);
}
