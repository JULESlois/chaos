import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExperienceStore } from '@/experience/experience-store';
import { EXPERIENCE_PHASES } from '@/experience/phases';
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
  const targetRef = useRef<HTMLSpanElement>(null);

  const { controller, snapshot } = useTVController({
    width: resolution.width,
    height: resolution.height,
    onDiscoverUnlisted: onUnlisted,
  });

  /**
   * Progress along the camera path, derived on read.
   *
   * A getter rather than a ref that something has to keep up to date: the
   * store is already advanced once per frame by the ASCII engine, so copying
   * its value into a second ref would only add a way for the two to disagree.
   */
  const progressRef = useMemo<LiveValue<number>>(
    () => ({
      get current(): number {
        const span = APPROACH_TO - APPROACH_FROM;
        return clamp01((store.current.progress - APPROACH_FROM) / span);
      },
    }),
    [store],
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

  // Feed scroll progress into the television's own state machine. This is a
  // subscription, not a frame loop: the store only publishes on scene change,
  // and the machine's thresholds are coarse enough to sample from scroll.
  useEffect(() => {
    if (!controller) return;
    let frame = 0;
    let queued = false;

    const measure = (): void => {
      queued = false;
      controller.store.setProgress(progressRef.current);
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
  }, [controller, progressRef]);

  /**
   * Hands the ASCII field the rectangle it should converge onto.
   *
   * The rect comes from a zero-size marker laid out by CSS at the place the
   * screen ends up in the final camera framing. Measuring a DOM element is
   * the only way to keep the 2D field and the 3D camera agreeing about where
   * the screen is without duplicating the projection maths.
   */
  useEffect(() => {
    if (!active) {
      signalBus.emit('tv:release');
      return;
    }

    const publish = (): void => {
      const element = targetRef.current;
      if (!element) return;
      signalBus.emit('tv:absorb', { rect: element.getBoundingClientRect() });
    };

    publish();
    window.addEventListener('resize', publish, { passive: true });
    return () => {
      window.removeEventListener('resize', publish);
      signalBus.emit('tv:release');
    };
  }, [active]);

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
      {/* Where the picture lands on screen. Never painted; only measured. */}
      <span className="television__target" ref={targetRef} aria-hidden="true" />

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
