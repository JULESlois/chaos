import { PHASE_THRESHOLDS, type TVState } from '../types';

/**
 * Pure state machine for the television chapter.
 *
 * Every transition lives here so no component has to infer the TV's phase
 * from raw scroll numbers. Scroll drives forward *and* backward transitions,
 * which is what makes reverse scrolling work.
 */

export type TVEvent =
  | { type: 'scroll'; progress: number }
  | { type: 'switch-start' }
  | { type: 'switch-end' }
  | { type: 'power-off' }
  | { type: 'power-on' }
  | { type: 'leave' };

/** Maps raw scroll progress to the phase it implies. */
export function phaseForProgress(progress: number): TVState {
  if (progress >= PHASE_THRESHOLDS.interactive) return 'interactive';
  if (progress >= PHASE_THRESHOLDS.aligning) return 'aligning';
  if (progress >= PHASE_THRESHOLDS.approaching) return 'approaching';
  if (progress >= PHASE_THRESHOLDS.detected) return 'detected';
  return 'dormant';
}

/** States the scroll position is allowed to override directly. */
const SCROLL_DRIVEN: ReadonlySet<TVState> = new Set<TVState>([
  'dormant',
  'detected',
  'approaching',
  'aligning',
  'interactive',
  'departing',
]);

export function tvReducer(state: TVState, event: TVEvent): TVState {
  switch (event.type) {
    case 'scroll': {
      // While switching or powered off, scroll must not yank the state away.
      if (state === 'switching' || state === 'powered-off') return state;
      if (!SCROLL_DRIVEN.has(state)) return state;

      const next = phaseForProgress(event.progress);
      if (next === state) return state;

      // Moving backwards from interactive passes through the same phases.
      return next;
    }

    case 'switch-start':
      // Only meaningful while the viewer is actually at the set.
      return state === 'interactive' ? 'switching' : state;

    case 'switch-end':
      return state === 'switching' ? 'interactive' : state;

    case 'power-off':
      return state === 'powered-off' ? state : 'powered-off';

    case 'power-on':
      // Powering back on returns to the interactive phase.
      return state === 'powered-off' ? 'interactive' : state;

    case 'leave':
      return 'dormant';

    default:
      return state;
  }
}

/** True when the viewer may operate the physical controls. */
export function isInteractive(state: TVState): boolean {
  return state === 'interactive' || state === 'switching' || state === 'powered-off';
}

/** True when the channel canvas should be rendering at full rate. */
export function shouldRenderChannels(state: TVState): boolean {
  return state !== 'dormant' && state !== 'powered-off';
}

/** Channel canvas frame rate for the current phase — saves work when far away. */
export function channelFpsForState(state: TVState, baseFps: number): number {
  switch (state) {
    case 'dormant':
      return 0;
    case 'powered-off':
      return 0;
    case 'detected':
      return Math.min(baseFps, 8);
    case 'approaching':
      return Math.min(baseFps, 15);
    default:
      return baseFps;
  }
}
