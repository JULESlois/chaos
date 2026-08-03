import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { signalBus } from '@/utils/signal-bus';
import { detectCapabilities, type DeviceCapabilities, type RenderLevel } from './capabilities';

interface SystemContextValue {
  capabilities: DeviceCapabilities;
  /** Effective render level after user overrides. */
  renderLevel: RenderLevel;
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  /** Narrative flags unlocked during this session. */
  unlocked: readonly string[];
  unlock: (key: string) => void;
  hasUnlocked: (key: string) => boolean;
}

const SystemContext = createContext<SystemContextValue | null>(null);

const AUDIO_KEY = 'node07:audio';

function readStoredAudio(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUDIO_KEY) === 'true';
  } catch {
    return false;
  }
}

export function SystemProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities>(detectCapabilities);
  const [audioEnabled, setAudioEnabledState] = useState(readStoredAudio);
  const [unlocked, setUnlocked] = useState<readonly string[]>([]);

  // Re-evaluate viewport-dependent capabilities on resize and motion changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    const reevaluate = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCapabilities((previous) => {
          const next = detectCapabilities();
          if (
            previous.renderLevel === next.renderLevel &&
            previous.isNarrowViewport === next.isNarrowViewport &&
            previous.prefersReducedMotion === next.prefersReducedMotion &&
            previous.maxDpr === next.maxDpr
          ) {
            return previous;
          }
          return next;
        });
      });
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', reevaluate, { passive: true });
    motionQuery.addEventListener('change', reevaluate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', reevaluate);
      motionQuery.removeEventListener('change', reevaluate);
    };
  }, []);

  const setAudioEnabled = useCallback((enabled: boolean) => {
    setAudioEnabledState(enabled);
    try {
      window.localStorage.setItem(AUDIO_KEY, String(enabled));
    } catch {
      // Non-fatal.
    }
    signalBus.emit('system:audio', { enabled });
  }, []);

  const unlock = useCallback((key: string) => {
    setUnlocked((previous) => (previous.includes(key) ? previous : [...previous, key]));
    signalBus.emit('narrative:unlock', { key });
  }, []);

  const hasUnlocked = useCallback((key: string) => unlocked.includes(key), [unlocked]);

  const value = useMemo<SystemContextValue>(
    () => ({
      capabilities,
      renderLevel: capabilities.renderLevel,
      audioEnabled,
      setAudioEnabled,
      unlocked,
      unlock,
      hasUnlocked,
    }),
    [capabilities, audioEnabled, setAudioEnabled, unlocked, unlock, hasUnlocked],
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystem(): SystemContextValue {
  const context = useContext(SystemContext);
  if (!context) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
}
