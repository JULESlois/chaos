import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSystem } from '@/systems/telemetry/SystemProvider';
import { signalBus } from '@/utils/signal-bus';
import { AudioEngine, type AudioCue } from './audio-engine';

interface AudioContextValue {
  play: (cue: AudioCue) => void;
  startHum: () => void;
  stopHum: () => void;
  enabled: boolean;
}

const AudioReactContext = createContext<AudioContextValue | null>(null);

/**
 * Owns the AudioEngine lifecycle and enforces the global audio rules:
 * off until the reader asks for it, suspended when the tab hides.
 */
export function AudioProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { audioEnabled } = useSystem();
  const engineRef = useRef<AudioEngine | null>(null);

  if (engineRef.current === null && typeof window !== 'undefined') {
    engineRef.current = new AudioEngine();
  }

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    void engine.setEnabled(audioEnabled);
  }, [audioEnabled]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const onVisibility = (): void => {
      if (document.hidden) engine.suspend();
      else engine.resume();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Dispose only on unmount of the whole app.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Allow non-React systems (TV scene, tension controller) to request sounds.
  useEffect(() => {
    return signalBus.on('audio:play', ({ cue }) => {
      engineRef.current?.play(cue as AudioCue);
    });
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      enabled: audioEnabled,
      play: (cue) => engineRef.current?.play(cue),
      startHum: () => engineRef.current?.startHum(),
      stopHum: () => engineRef.current?.stopHum(),
    }),
    [audioEnabled],
  );

  return (
    <AudioReactContext.Provider value={value}>{children}</AudioReactContext.Provider>
  );
}

export function useAudio(): AudioContextValue {
  const context = useContext(AudioReactContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
