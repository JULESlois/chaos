/**
 * When the controls become live, and how big they are.
 *
 * Split out of the button components because both answers are rules rather
 * than rendering: one is a race between a damped camera and a state machine,
 * the other is a claim about touch targets that is only true if the numbers
 * agree. Neither needs a scene graph to be checked.
 */
import { revealState } from '@/systems/signal/reveal-state';
import type { TVButtonId } from '../types';

/**
 * How far the camera must have backed out before the controls are live.
 *
 * Not the same question as "has the reader scrolled far enough", which is what
 * the state machine answers. The camera is damped and lags the scroll, so on a
 * fast flick to the bottom of the document the machine says *interactive* while
 * the set is still visibly flying toward its final framing. A button that is
 * live during that half second is a button the reader presses and misses.
 */
export const ARM_AT = 0.9;

export function armed(): boolean {
  // No camera publishing means no camera move to wait for.
  return !revealState.active || revealState.progress >= ARM_AT;
}

/** Where each control sits along the cabinet, in scene units. */
export const BUTTON_X: Readonly<Record<TVButtonId, number>> = {
  prev: 0.18,
  next: 0.32,
  power: 0.56,
};

export const BUTTON_Z = 0.305;
export const BUTTON_Y = 0.98;

interface HitSizes {
  /** Side of the square press target under each channel button. */
  step: number;
  /** Side of the square press target under the power button. */
  power: number;
}

/**
 * A finger is not a cursor. The two channel buttons sit 0.14 apart, so on a
 * touch screen the targets are grown to exactly meet and no further — an
 * overlap here would make the boundary between "previous" and "next" a coin
 * toss, which is worse than a small target.
 */
export function hitSizes(coarse: boolean): HitSizes {
  return coarse ? { step: 0.14, power: 0.185 } : { step: 0.115, power: 0.15 };
}
