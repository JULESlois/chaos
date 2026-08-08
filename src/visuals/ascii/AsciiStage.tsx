import { useEffect, useRef, useState } from 'react';
import type { ExperienceStore } from '@/experience/experience-store';
import type { TensionController } from '@/systems/tension/tension';
import { signalBus } from '@/utils/signal-bus';
import { AsciiEngine } from './AsciiEngine';
import type { QualityTier } from './types';

interface AsciiStageProps {
  store: ExperienceStore;
  tension: TensionController;
  quality: QualityTier;
  maxDpr: number;
  reducedMotion: boolean;
}

/**
 * The one canvas.
 *
 * A single fixed, full-viewport canvas sits behind the entire document for the
 * whole visit. It is never unmounted between screens, never duplicated, and
 * never re-created on scroll — the scenes swap inside it.
 *
 * The engine is constructed in an effect rather than during render so that a
 * StrictMode double-mount disposes the first instance cleanly instead of
 * leaving an orphaned animation frame running against a detached canvas.
 */
export function AsciiStage({
  store,
  tension,
  quality,
  maxDpr,
  reducedMotion,
}: AsciiStageProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crtState, setCrtState] = useState<'on' | 'off'>('on');

  useEffect(() => {
    const unsubOff = signalBus.on('scene:crt-power-off', () => setCrtState('off'));
    const unsubOn = signalBus.on('scene:crt-power-on', () => setCrtState('on'));
    return () => {
      unsubOff();
      unsubOn();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: AsciiEngine;
    try {
      engine = new AsciiEngine({ canvas, store, tension, quality, maxDpr, reducedMotion });
    } catch (error) {
      // A missing 2D context means the page still scrolls and the television
      // still works; it is not a reason to blank the document.
      console.warn('[ascii] stage unavailable', error);
      return;
    }

    engine.start();
    return () => engine.dispose();
  }, [store, tension, quality, maxDpr, reducedMotion]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`stage crt-power-${crtState}`} 
      aria-hidden="true" 
    />
  );
}
