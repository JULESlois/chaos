import type { TVButtonId } from '../types';

/**
 * The button ritual that reveals the channel which is not in the table.
 *
 * Kept as a standalone pure module for two reasons: it is the one piece of
 * hidden behaviour in the project, so it must be testable without mounting a
 * television, and it must exist in exactly one place — a sequence checked in
 * two components is a sequence that will eventually disagree with itself.
 */
export const UNLOCK_SEQUENCE: readonly TVButtonId[] = [
  'next',
  'next',
  'prev',
  'power',
  'next',
];

/** Presses further apart than this are treated as unrelated. */
export const SEQUENCE_TIMEOUT_MS = 3000;

/**
 * Tracks progress through the sequence.
 *
 * A wrong press does not simply reset to zero: it re-checks whether the press
 * could be the *start* of a fresh attempt, so `next next next prev power next`
 * still succeeds. Without that, a reader who overshoots by one press has to
 * notice and deliberately stop before trying again, which in practice means
 * they never find it.
 */
export class UnlockSequence {
  private index = 0;
  private lastPressAt = 0;

  /** How far through the sequence the reader is, 0–1. */
  get progress(): number {
    return this.index / UNLOCK_SEQUENCE.length;
  }

  reset(): void {
    this.index = 0;
    this.lastPressAt = 0;
  }

  /** Feeds a press. Returns true on the press that completes the sequence. */
  press(button: TVButtonId, now: number): boolean {
    if (this.index > 0 && now - this.lastPressAt > SEQUENCE_TIMEOUT_MS) {
      this.index = 0;
    }
    this.lastPressAt = now;

    if (button === UNLOCK_SEQUENCE[this.index]) {
      this.index += 1;
    } else {
      // Fall back to treating this press as a possible first press.
      this.index = button === UNLOCK_SEQUENCE[0] ? 1 : 0;
    }

    if (this.index >= UNLOCK_SEQUENCE.length) {
      this.index = 0;
      return true;
    }
    return false;
  }
}
