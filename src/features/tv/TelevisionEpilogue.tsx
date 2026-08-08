import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExperienceStore } from '@/experience/experience-store';
import { EXPERIENCE_PHASES } from '@/experience/phases';
import { resetRevealState } from '@/systems/signal/reveal-state';
import type { DeviceCapabilities } from '@/systems/telemetry/capabilities';
import { channelResolution } from '@/systems/telemetry/capabilities';
import type { TensionController } from '@/systems/tension/tension';
import { clamp01 } from '@/utils/math';
import { signalBus } from '@/utils/signal-bus';
import { DomTV } from './DomTV';
import { TVCanvas } from './TVCanvas';
import { useTVController } from './hooks/useTVController';
import type { LiveValue, TVButtonId } from './types';

/**
 * The approach starts during the silence screen, not at the television's own
 * phase — the set has to already be coming toward the reader by the time the
 * field thins out, or it arrives as a cut rather than as an arrival.
 */
const APPROACH_FROM = EXPERIENCE_PHASES.find((phase) => phase.id === 'silence')!.start;
const APPROACH_TO = EXPERIENCE_PHASES[EXPERIENCE_PHASES.length - 1]!.end;

/** Base channel frame rate per render level. */
const BASE_FPS: Record<0 | 1 | 2 | 3, number> = { 0: 30, 1: 24, 2: 15, 3: 20 };

interface TelevisionEpilogueProps {
  store: ExperienceStore;
  tension: TensionController;
  capabilities: DeviceCapabilities;
  /** Called the first time the reader reaches the channel that is not listed. */
  onUnlisted: () => void;
}

/**
 * The last thing in the piece.
 *
 * A fixed, full-viewport layer that is inert until the reader reaches the end
 * of the scroll. It carries the entire narrative payload of the site — who
 * made it, what they have made, how to reach them — none of which exists
 * anywhere else in the document.
 *
 * There is no control bar, no channel list, no progress readout and no
 * caption. The only controls are the three on the cabinet.
 */
export function TelevisionEpilogue({
  store,
  tension,
  capabilities,
  onUnlisted,
}: TelevisionEpilogueProps): React.JSX.Element {
  const { renderLevel, maxDpr, prefersReducedMotion } = capabilities;
  const resolution = useMemo(() => channelResolution(capabilities), [capabilities]);

  // A WebGL context that dies mid-visit drops to the DOM set rather than
  // leaving a black rectangle where the ending should be.
  const [contextLost, setContextLost] = useState(false);
  const [active, setActive] = useState(false);
  const [tearImpulse, setTearImpulse] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);

  const { controller, snapshot } = useTVController({
    width: resolution.width,
    height: resolution.height,
    initialPowered: ((store.current.progress - APPROACH_FROM) / (APPROACH_TO - APPROACH_FROM)) > 0.5,
    onDiscoverUnlisted: onUnlisted,
  });

  /**
   * Progress along the camera path, derived on read.
   *
   * A getter rather than a ref that something has to keep up to date: the
   * store is already advanced once per frame by the ASCII engine, so copying
   * its value into a second ref would only add a way for the two to disagree.
   */
  const rawProgressRef = useMemo<LiveValue<number>>(
    () => ({
      get current(): number {
        const span = APPROACH_TO - APPROACH_FROM;
        return clamp01((store.current.progress - APPROACH_FROM) / span);
      },
    }),
    [store],
  );

  const snapStateRef = useRef<'signal' | 'powering-off' | 'tv' | 'powering-on'>('signal');
  const snapTargetRef = useRef(0);

  const progressRef = useMemo<LiveValue<number>>(
    () => ({
      get current(): number {
        return snapTargetRef.current;
      },
    }),
    [],
  );

  const tensionRef = useMemo<LiveValue<number>>(
    () => ({
      get current(): number {
        return tension.current.flowDistortion;
      },
    }),
    [tension],
  );

  // Mount the heavy renderer only while the ending is on screen.
  useEffect(() => {
    return store.subscribeScene((scene) => {
      setActive(scene === 'silence' || scene === 'television');
    });
  }, [store]);

  // Also evaluate once on mount, in case the visit starts at the bottom of
  // the document — a reload halfway down should not show an empty ending.
  useEffect(() => {
    const scene = store.current.sceneId;
    setActive(scene === 'silence' || scene === 'television');
  }, [store]);

  /**
   * The set stops rendering when the reader scrolls back off it, which stops
   * the camera, which would otherwise leave the reveal frozen at whatever
   * progress it had reached. The silence screen reads that number to decide
   * how much of its own faked glass to draw, so a stale one means scrolling
   * back up loses the boundary leak entirely.
   */
  useEffect(() => {
    if (!active) resetRevealState();
  }, [active]);

  // Feed scroll progress into the television's own state machine. This is a
  // subscription, not a frame loop: the store only publishes on scene change,
  // and the machine's thresholds are coarse enough to sample from scroll.
  useEffect(() => {
    if (!controller) return;
    let frame = 0;
    let queued = false;

    const measure = (): void => {
      queued = false;
      const raw = rawProgressRef.current;
      const state = snapStateRef.current;

      if (raw > 0.05 && state === 'signal') {
        snapStateRef.current = 'powering-off';
        
        // 1. ASCII collapses to a bright line
        signalBus.emit('scene:crt-power-off');
        
        // 2. TV turns on immediately to serve as the flash
        controller.store.bootPowerOnSequence();
        
        // 3. Move camera into the TV right after the line forms
        setTimeout(() => {
          snapTargetRef.current = 1;
          controller.store.setProgress(1);
          
          setTimeout(() => {
            snapStateRef.current = 'tv';
          }, 600);
        }, 150);
      } else if (raw < 0.05 && state === 'tv') {
        snapStateRef.current = 'powering-on';
        
        // 1. TV collapses to a bright line
        controller.store.setPower(false);
        
        // 2. Wait for TV to collapse (~150ms)
        setTimeout(() => {
          // 3. Move camera out
          snapTargetRef.current = 0;
          controller.store.setProgress(0); 
          
          // 4. As soon as the camera finishes zooming out, expand ASCII
          setTimeout(() => {
            signalBus.emit('scene:crt-power-on');
            setTimeout(() => {
              snapStateRef.current = 'signal';
            }, 600);
          }, 500); 
        }, 150);
      } else if (state === 'signal' || state === 'tv') {
        controller.store.setProgress(snapTargetRef.current);
      }
    };
    const request = (): void => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, [controller, rawProgressRef]);

  // A structural failure large enough to be heard also rips the picture.
  useEffect(() => {
    return signalBus.on('tension:event', ({ id }) => {
      if (id !== 'horizontal-tear') return;
      setTearImpulse((value) => value + 1);
    });
  }, []);

  const handlePress = useCallback(
    (id: TVButtonId) => {
      controller?.store.press(id);
    },
    [controller],
  );

  const handleContextLost = useCallback(() => setContextLost(true), []);

  const useFallback = renderLevel === 3 || contextLost;
  const level = (renderLevel === 3 ? 2 : renderLevel) as 0 | 1 | 2;

  return (
    <div
      className="television"
      data-active={active}
      data-fallback={useFallback}
      ref={rootRef}
    >
      {controller && snapshot && !useFallback && (
        <TVCanvas
          manager={controller.manager}
          snapshot={snapshot}
          quality={level}
          maxDpr={maxDpr}
          baseFps={BASE_FPS[renderLevel]}
          reducedMotion={prefersReducedMotion}
          staticView={renderLevel === 2}
          progressRef={progressRef}
          tensionRef={tensionRef}
          tearImpulse={tearImpulse}
          active={active}
          onPress={handlePress}
          onContextLost={handleContextLost}
        />
      )}

      {controller && snapshot && useFallback && (
        <DomTV
          manager={controller.manager}
          snapshot={snapshot}
          baseFps={BASE_FPS[3]}
          active={active}
          reducedMotion={prefersReducedMotion}
          tensionRef={tensionRef}
          onPress={handlePress}
        />
      )}
    </div>
  );
}
