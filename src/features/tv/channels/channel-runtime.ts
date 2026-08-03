import { channelFpsForState } from '../state/tv-machine';
import { SWITCH_TIMELINE, type TVSnapshot, type TransitionPhase } from '../types';
import type { ChannelManager } from './ChannelManager';

/** Phase durations in seconds, derived from the switch timeline. */
export const PHASE_SECONDS = {
  displace: (SWITCH_TIMELINE.compress - SWITCH_TIMELINE.displace) / 1000,
  compress: (SWITCH_TIMELINE.snow - SWITCH_TIMELINE.compress) / 1000,
  snow: (SWITCH_TIMELINE.expand - SWITCH_TIMELINE.snow) / 1000,
  expand: (SWITCH_TIMELINE.release - SWITCH_TIMELINE.expand) / 1000,
} as const;

/**
 * Prepares the surface a transition phase will transform.
 *
 * Each phase captures the frame it starts from, so applying the effect over
 * several frames cannot compound its own output.
 */
export function beginTransitionPhase(
  manager: ChannelManager,
  phase: TransitionPhase,
): void {
  if (phase === 'displace' || phase === 'compress') {
    manager.captureFrame();
    return;
  }
  if (phase === 'expand') {
    // Give the incoming channel one frame so there is something to expand.
    manager.renderOnce();
    manager.captureFrame();
  }
}

/**
 * Advances the channel canvas by one frame.
 *
 * Shared by the WebGL scene (stepped from the Three.js loop) and the DOM
 * fallback (stepped from its own rAF loop) so the two can never drift apart.
 *
 * @returns the phase elapsed time to carry into the next frame.
 */
export function advanceChannels(options: {
  manager: ChannelManager;
  snapshot: TVSnapshot;
  delta: number;
  phaseElapsed: number;
  baseFps: number;
  entropy: number;
  pointer?: { x: number; y: number };
}): number {
  const { manager, snapshot, baseFps, entropy, pointer } = options;
  const delta = Math.min(options.delta, 0.1);

  if (!snapshot.powered) {
    manager.setPaused(true);
    return 0;
  }

  manager.setPaused(false);
  manager.setEntropy(entropy);
  if (pointer) manager.setPointer(pointer.x, pointer.y);
  manager.setFpsCap(channelFpsForState(snapshot.state, baseFps));
  manager.step(delta);

  const phase = snapshot.transitionPhase;
  if (phase === 'idle') return 0;

  const elapsed = options.phaseElapsed + delta;

  switch (phase) {
    case 'displace': {
      const progress = Math.min(1, elapsed / PHASE_SECONDS.displace);
      manager.renderDisplace(3 + progress * 9);
      break;
    }
    case 'compress': {
      manager.renderCompress(Math.min(1, elapsed / PHASE_SECONDS.compress));
      break;
    }
    case 'snow': {
      const progress = Math.min(1, elapsed / PHASE_SECONDS.snow);
      manager.renderSnow(1 - progress * 0.35);
      break;
    }
    case 'expand': {
      const progress = Math.min(1, elapsed / PHASE_SECONDS.expand);
      manager.renderCompress(1 - progress);
      break;
    }
    default:
      break;
  }

  return elapsed;
}
