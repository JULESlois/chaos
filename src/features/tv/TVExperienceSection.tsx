import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChaos } from '@/systems/chaos/ChaosProvider';
import { channelResolution } from '@/systems/telemetry/capabilities';
import { useSystem } from '@/systems/telemetry/SystemProvider';
import { signalBus } from '@/utils/signal-bus';
import { DomTV } from './DomTV';
import { TVCanvas } from './TVCanvas';
import { TVControls } from './TVControls';
import { useTVController } from './hooks/useTVController';
import { useTVScroll } from './hooks/useTVScroll';
import { PHASE_THRESHOLDS, type TVButtonId, type TVState } from './types';

const PHASE_CAPTION: Record<TVState, string> = {
  dormant: 'signal source located — scroll to approach',
  detected: 'source detected · distance holding',
  approaching: 'approach in progress',
  aligning: 'signal lock · picture stabilising',
  interactive: 'receiver in reach · controls live',
  switching: 'changing channel',
  'powered-off': 'receiver in standby',
  departing: 'withdrawing',
};

/**
 * The television chapter.
 *
 * Owns the scroll driver, the store, the channel canvas and the two possible
 * presentations (WebGL scene, DOM receiver). Everything below this component
 * is presentation; everything above it is page content.
 */
export function TVExperienceSection(): React.JSX.Element {
  const { capabilities, renderLevel, unlock, hasUnlocked } = useSystem();
  const { director, stabilised } = useChaos();

  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const entropyRef = useRef(0);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });

  const [active, setActive] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [tearImpulse, setTearImpulse] = useState(0);

  const reducedMotion = stabilised || capabilities.prefersReducedMotion;
  const domMode = renderLevel === 3 || contextLost;
  const staticView = renderLevel === 2 || reducedMotion;
  const scrollDriven = !domMode && !staticView;

  const resolution = useMemo(() => channelResolution(capabilities), [capabilities]);
  const baseFps = renderLevel === 0 ? 30 : renderLevel === 1 ? 24 : 15;
  const quality: 0 | 1 | 2 = renderLevel === 0 ? 0 : renderLevel === 1 ? 1 : 2;

  const discoverDeadChannel = useCallback(() => {
    unlock('ch-04');
  }, [unlock]);

  const { controller, snapshot } = useTVController({
    width: resolution.width,
    height: resolution.height,
    onDiscoverDeadChannel: discoverDeadChannel,
  });

  // Entropy is read every frame by the scene; keep it in a ref, not in state.
  useEffect(() => {
    entropyRef.current = director.getState().entropy;
    return director.subscribe((state) => {
      entropyRef.current = state.entropy;
    });
  }, [director]);

  // The horizontal-tear anomaly is the only chaos event the CRT reacts to.
  useEffect(() => {
    return signalBus.on('chaos:event', ({ id }) => {
      if (id === 'horizontal-tear') setTearImpulse((value) => value + 1);
    });
  }, []);

  // Finding the unlisted route also reveals the unlisted channel.
  useEffect(() => {
    if (!controller) return;
    if (hasUnlocked('signal') || hasUnlocked('ch-04')) {
      controller.store.unlockUnlisted();
    }
  }, [controller, hasUnlocked]);

  const handleProgress = useCallback(
    (progress: number) => {
      progressRef.current = progress;
      if (scrollDriven) controller?.store.setProgress(progress);
    },
    [controller, scrollDriven],
  );

  const handleVisibility = useCallback((visible: boolean) => {
    setActive(visible);
  }, []);

  useTVScroll(sectionRef, {
    onProgress: handleProgress,
    onVisibility: handleVisibility,
  });

  // Devices that skip the cinematography start at the interaction phase.
  useEffect(() => {
    if (!controller || scrollDriven) return;
    progressRef.current = 1;
    controller.store.setProgress(1);
  }, [controller, scrollDriven]);

  const state = snapshot?.state ?? 'dormant';

  // Ask the ASCII field to converge on the screen once the signal locks.
  useEffect(() => {
    if (domMode) return;
    const locked =
      state === 'aligning' || state === 'interactive' || state === 'switching';

    if (!locked) {
      signalBus.emit('tv:release');
      return;
    }

    const emitRect = (): void => {
      const element = stageRef.current;
      signalBus.emit('tv:absorb', {
        rect: element ? element.getBoundingClientRect() : null,
      });
    };

    emitRect();
    window.addEventListener('resize', emitRect, { passive: true });
    window.addEventListener('scroll', emitRect, { passive: true });

    return () => {
      window.removeEventListener('resize', emitRect);
      window.removeEventListener('scroll', emitRect);
      signalBus.emit('tv:release');
    };
  }, [state, domMode]);

  const handlePress = useCallback(
    (id: TVButtonId) => {
      const store = controller?.store;
      if (!store) return;
      if (id === 'prev') store.previous();
      else if (id === 'next') store.next();
      else store.togglePower();
    },
    [controller],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const store = controller?.store;
      if (!store) return;

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        store.previous();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        store.next();
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        store.togglePower();
      }
    },
    [controller],
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerRef.current.x = (event.clientX - rect.left) / rect.width;
    pointerRef.current.y = (event.clientY - rect.top) / rect.height;
  }, []);

  const handleContextLost = useCallback(() => {
    console.warn('[tv] WebGL context lost — falling back to the DOM receiver');
    setContextLost(true);
  }, []);

  const channels = controller?.store.listedChannels ?? [];
  const progressPercent = Math.round((progressRef.current ?? 0) * 100);

  return (
    <section
      ref={sectionRef}
      className="tv-section"
      data-mode={domMode ? 'dom' : scrollDriven ? 'scroll' : 'static'}
      data-state={state}
      aria-labelledby="tv-heading"
      onKeyDown={handleKeyDown}
    >
      <div className="tv-section__pin">
        <div className="tv-section__intro shell-inner">
          <h2 className="section__title" id="tv-heading">
            receiver
          </h2>
          <p className="tv-section__caption">{PHASE_CAPTION[state]}</p>
        </div>

        <div
          ref={stageRef}
          className="tv-stage"
          onPointerMove={handlePointerMove}
          role="img"
          aria-label={`Retro television displaying ${
            snapshot?.channelId ?? 'no signal'
          }`}
        >
          {controller && snapshot ? (
            domMode ? (
              <DomTV
                manager={controller.manager}
                snapshot={snapshot}
                baseFps={baseFps}
                active={active}
                reducedMotion={reducedMotion}
                entropyRef={entropyRef}
              />
            ) : (
              <TVCanvas
                manager={controller.manager}
                snapshot={snapshot}
                quality={quality}
                maxDpr={capabilities.maxDpr}
                baseFps={baseFps}
                reducedMotion={reducedMotion}
                staticView={staticView}
                progressRef={progressRef}
                entropyRef={entropyRef}
                pointerRef={pointerRef}
                tearImpulse={tearImpulse}
                active={active}
                onPress={handlePress}
                onContextLost={handleContextLost}
              />
            )
          ) : (
            <p className="tv-stage__placeholder muted">initialising receiver…</p>
          )}

          {scrollDriven && (
            <p className="tv-stage__progress" aria-hidden="true">
              approach {String(progressPercent).padStart(3, '0')}%
              {progressRef.current < PHASE_THRESHOLDS.interactive
                ? ' · keep scrolling'
                : ' · locked'}
            </p>
          )}
        </div>

        <div className="tv-section__panel shell-inner">
          {controller && snapshot ? (
            <TVControls
              channels={channels}
              activeId={snapshot.channelId}
              powered={snapshot.powered}
              switching={snapshot.switching}
              onPrevious={() => controller.store.previous()}
              onNext={() => controller.store.next()}
              onTogglePower={() => controller.store.togglePower()}
              onSelect={(id) => controller.store.goToChannelId(id)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
