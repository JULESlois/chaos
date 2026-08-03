/** Television chapter domain types. */

export type TVState =
  | 'dormant'
  | 'detected'
  | 'approaching'
  | 'aligning'
  | 'interactive'
  | 'switching'
  | 'powered-off'
  | 'departing';

export type TVButtonId = 'prev' | 'next' | 'power';

/** Scroll progress thresholds for each cinematography phase. */
export const PHASE_THRESHOLDS = {
  /** A: distant observation */
  detected: 0.02,
  /** B: approach */
  approaching: 0.18,
  /** C: signal lock */
  aligning: 0.55,
  /** D: interaction lock */
  interactive: 0.78,
} as const;

export interface TVSnapshot {
  state: TVState;
  channelIndex: number;
  channelId: string;
  powered: boolean;
  switching: boolean;
  /** Set while the CRT tear/compress transition plays. */
  transitionPhase: TransitionPhase;
}

export type TransitionPhase =
  | 'idle'
  | 'displace'
  | 'compress'
  | 'snow'
  | 'expand';

/** Timing of the channel-change sequence, in milliseconds from press. */
export const SWITCH_TIMELINE = {
  click: 60,
  displace: 80,
  compress: 110,
  snow: 150,
  update: 230,
  expand: 280,
  release: 420,
} as const;

export const SWITCH_DURATION = SWITCH_TIMELINE.release;
