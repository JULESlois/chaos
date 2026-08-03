import { useEffect, useRef } from 'react';
import type { ChannelManager } from './channels/ChannelManager';
import { advanceChannels, beginTransitionPhase } from './channels/channel-runtime';
import type { LiveValue, TVButtonId, TVSnapshot } from './types';

interface DomTVProps {
  manager: ChannelManager;
  snapshot: TVSnapshot;
  baseFps: number;
  active: boolean;
  reducedMotion: boolean;
  tensionRef: LiveValue<number>;
  onPress: (id: TVButtonId) => void;
}

/**
 * The no-WebGL television.
 *
 * The same ChannelManager and the same channels as the 3D scene — only the
 * cabinet changes, from geometry to three divs. Everything the reader can
 * find in the 3D set, including the unlisted channel, is reachable here.
 *
 * The three controls are real buttons because this is the path a screen
 * reader and a keyboard take. They are unlabelled in the 3D set for the feel
 * of it; here they carry names, since there is nothing to spoil for someone
 * who cannot see the cabinet in the first place.
 */
export function DomTV({
  manager,
  snapshot,
  baseFps,
  active,
  reducedMotion,
  tensionRef,
  onPress,
}: DomTVProps): React.JSX.Element {
  const mountRef = useRef<HTMLDivElement>(null);
  const phaseElapsed = useRef(0);
  const phase = snapshot.transitionPhase;

  // Move the shared canvas into the DOM frame.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const canvas = manager.canvas;
    canvas.className = 'dom-tv__canvas';
    mount.appendChild(canvas);
    manager.renderOnce();
    return () => {
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    };
  }, [manager]);

  useEffect(() => {
    phaseElapsed.current = 0;
    beginTransitionPhase(manager, phase);
  }, [manager, phase, snapshot.channelIndex]);

  // The fallback owns its own loop because there is no render loop to join.
  useEffect(() => {
    if (!active) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick);
      const delta = (now - last) / 1000;
      last = now;
      phaseElapsed.current = advanceChannels({
        manager,
        snapshot,
        delta,
        phaseElapsed: phaseElapsed.current,
        baseFps,
        tension: tensionRef.current ?? 0,
      });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [manager, snapshot, baseFps, active, tensionRef]);

  const handleScreenClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const canvas = manager.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    manager.hit(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  };

  return (
    <div className="dom-tv" data-powered={snapshot.powered} data-reduced={reducedMotion}>
      <div className="dom-tv__cabinet">
        {/*
          The click surface is the picture, exactly as in the 3D set. It is
          not a button: the channels decide whether the point they were given
          meant anything, and most of the time it does not.
        */}
        <div
          className="dom-tv__screen"
          ref={mountRef}
          onClick={handleScreenClick}
          role="presentation"
        >
          <span className="dom-tv__overlay" aria-hidden="true" />
        </div>
        <div className="dom-tv__strip">
          <button
            type="button"
            className="dom-tv__key"
            data-shape="round"
            onClick={() => onPress('prev')}
          >
            <span className="visually-hidden">previous channel</span>
          </button>
          <button
            type="button"
            className="dom-tv__key"
            data-shape="round"
            onClick={() => onPress('next')}
          >
            <span className="visually-hidden">next channel</span>
          </button>
          <button
            type="button"
            className="dom-tv__key"
            data-shape="square"
            data-on={snapshot.powered}
            onClick={() => onPress('power')}
          >
            <span className="visually-hidden">power</span>
          </button>
        </div>
      </div>
    </div>
  );
}
