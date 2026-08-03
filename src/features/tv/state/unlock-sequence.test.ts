import { describe, expect, it } from 'vitest';
import type { TVButtonId } from '../types';
import { SEQUENCE_TIMEOUT_MS, UNLOCK_SEQUENCE, UnlockSequence } from './unlock-sequence';

/** Feeds presses one second apart, well inside the timeout. */
function feed(sequence: UnlockSequence, buttons: readonly TVButtonId[]): boolean {
  let completed = false;
  buttons.forEach((button, index) => {
    completed = sequence.press(button, (index + 1) * 1000);
  });
  return completed;
}

describe('the sequence itself', () => {
  it('is the five presses the piece is built around', () => {
    expect(UNLOCK_SEQUENCE).toEqual(['next', 'next', 'prev', 'power', 'next']);
  });

  it('opens on the last press and not before', () => {
    const sequence = new UnlockSequence();

    for (let index = 0; index < UNLOCK_SEQUENCE.length - 1; index += 1) {
      expect(sequence.press(UNLOCK_SEQUENCE[index]!, index * 500)).toBe(false);
    }

    expect(sequence.press('next', 4000)).toBe(true);
  });

  it('reports how far through the reader is', () => {
    const sequence = new UnlockSequence();
    expect(sequence.progress).toBe(0);

    sequence.press('next', 100);
    sequence.press('next', 200);
    expect(sequence.progress).toBeCloseTo(2 / 5, 10);

    // Completing wraps back to zero rather than sitting at 1.
    feed(sequence, ['prev', 'power', 'next']);
    expect(sequence.progress).toBe(0);
  });

  it('rearms, so the sequence can be performed twice', () => {
    const sequence = new UnlockSequence();
    expect(feed(sequence, UNLOCK_SEQUENCE)).toBe(true);
    expect(feed(sequence, UNLOCK_SEQUENCE)).toBe(true);
  });
});

describe('recovering from a wrong press', () => {
  it('forgives an overshoot, because otherwise nobody finds it', () => {
    const sequence = new UnlockSequence();
    // One press too many at the start: the third "next" cannot continue the
    // run, but it is a perfectly good first press of a fresh attempt.
    expect(feed(sequence, ['next', 'next', 'next', 'next', 'prev', 'power', 'next'])).toBe(
      true,
    );
  });

  it('drops back to nothing on a press that cannot start an attempt', () => {
    const sequence = new UnlockSequence();
    sequence.press('next', 100);
    sequence.press('next', 200);

    // 'power' is neither the expected third press nor a valid opening.
    sequence.press('power', 300);
    expect(sequence.progress).toBe(0);

    // The remaining presses are now a partial run, not a completion.
    expect(feed(sequence, ['prev', 'power', 'next'])).toBe(false);
  });

  it('treats a stale attempt as abandoned', () => {
    const sequence = new UnlockSequence();
    sequence.press('next', 0);
    sequence.press('next', 100);
    sequence.press('prev', 200);
    sequence.press('power', 300);
    expect(sequence.progress).toBeCloseTo(4 / 5, 10);

    // The final press arrives long after the reader wandered off.
    expect(sequence.press('next', 300 + SEQUENCE_TIMEOUT_MS + 1)).toBe(false);
    // It counted as the opening press of a new attempt instead.
    expect(sequence.progress).toBeCloseTo(1 / 5, 10);
  });

  it('measures the timeout between presses, not from the first one', () => {
    const sequence = new UnlockSequence();
    let now = 0;
    let completed = false;

    // Slow but steady: each gap is inside the timeout, the total is not.
    for (const button of UNLOCK_SEQUENCE) {
      now += SEQUENCE_TIMEOUT_MS - 1;
      completed = sequence.press(button, now);
    }

    expect(completed).toBe(true);
  });

  it('reset abandons a run in progress', () => {
    const sequence = new UnlockSequence();
    sequence.press('next', 100);
    sequence.press('next', 200);

    sequence.reset();
    expect(sequence.progress).toBe(0);
    expect(feed(sequence, ['prev', 'power', 'next'])).toBe(false);
  });
});
