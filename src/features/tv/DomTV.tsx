import { useEffect, useRef, type RefObject } from 'react';
import type { ChannelManager } from './channels/ChannelManager';
import { advanceChannels, beginTransitionPhase } from './channels/channel-runtime';
import type { TVSnapshot } from './types';

interface DomTVProps {
  manager: ChannelManager;
  snapshot: TVSnapshot;
  baseFps: number;
  active: boolean;
  reducedMotion: boolean;
  entropyRef: RefObject<number>;
}

/**
 * The no-WebGL television.
 *
 * The same ChannelManager and the same channels as the 3D scene — only the
 * frame and the CRT treatment change, from a shader to a CSS overlay. The
 * chapter therefore still *says* the same thing on a device that cannot
 * render it in 3D.
 */
export function DomTV({
  manager,
  snapshot,
  baseFps,
  active,
  reducedMotion,
  entropyRef,
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
        entropy: entropyRef.current ?? 0,
      });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [manager, snapshot, baseFps, active, entropyRef]);

  return (
    <div
      className="dom-tv"
      data-powered={snapshot.powered}
      data-reduced={reducedMotion}
      aria-hidden="true"
    >
      <div className="dom-tv__cabinet">
        <div className="dom-tv__screen" ref={mountRef}>
          <span className="dom-tv__overlay" />
          {!snapshot.powered && <span className="dom-tv__standby">standby</span>}
        </div>
        <div className="dom-tv__strip">
          <span className="dom-tv__grille" />
          <span className="dom-tv__lamp" data-on={snapshot.powered} />
        </div>
      </div>
      <p className="dom-tv__note">
        3D receiver unavailable on this device — channel signal shown directly.
      </p>
    </div>
  );
}
