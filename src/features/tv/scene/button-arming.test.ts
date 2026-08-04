import { beforeEach, describe, expect, it } from 'vitest';
import { resetRevealState, revealState } from '@/systems/signal/reveal-state';
import { ARM_AT, armed, BUTTON_X, BUTTON_Y, BUTTON_Z, hitSizes } from './button-arming';
import { PHASE_THRESHOLDS } from '../types';

beforeEach(() => {
  resetRevealState();
});

describe('arming', () => {
  it('is open when no camera is publishing at all', () => {
    // The DOM-television fallback has no camera move to wait for, so refusing
    // presses there would leave the reader with an object that does nothing.
    expect(revealState.active).toBe(false);
    expect(armed()).toBe(true);
  });

  it('is shut while the camera is still flying', () => {
    revealState.active = true;
    for (const progress of [0, 0.25, 0.5, 0.78, 0.89]) {
      revealState.progress = progress;
      expect(armed()).toBe(false);
    }
  });

  it('opens at the arming point and stays open', () => {
    revealState.active = true;
    for (const progress of [ARM_AT, 0.95, 1]) {
      revealState.progress = progress;
      expect(armed()).toBe(true);
    }
  });

  /**
   * The reason this rule exists. The state machine calls the reader
   * interactive well before the damped camera has finished moving, so a button
   * gated on the machine alone is live while the set is still visibly flying.
   */
  it('waits longer than the state machine does', () => {
    expect(ARM_AT).toBeGreaterThan(PHASE_THRESHOLDS.interactive);
  });

  it('shuts again if the reader scrolls back up', () => {
    revealState.active = true;
    revealState.progress = 1;
    expect(armed()).toBe(true);
    revealState.progress = 0.4;
    expect(armed()).toBe(false);
  });

  it('reopens when the set is torn down mid-flight', () => {
    revealState.active = true;
    revealState.progress = 0.3;
    expect(armed()).toBe(false);
    resetRevealState();
    expect(armed()).toBe(true);
  });
});

describe('touch targets', () => {
  const CHANNEL_GAP = BUTTON_X.next - BUTTON_X.prev;

  it('grows every target for a finger', () => {
    const fine = hitSizes(false);
    const coarse = hitSizes(true);
    expect(coarse.step).toBeGreaterThan(fine.step);
    expect(coarse.power).toBeGreaterThan(fine.power);
  });

  it('lets the two channel targets meet but never overlap', () => {
    for (const coarse of [false, true]) {
      const { step } = hitSizes(coarse);
      const prevEdge = BUTTON_X.prev + step / 2;
      const nextEdge = BUTTON_X.next - step / 2;
      // Touching is fine; crossing would make the boundary a coin toss.
      expect(prevEdge).toBeLessThanOrEqual(nextEdge + 1e-9);
      expect(step).toBeLessThanOrEqual(CHANNEL_GAP + 1e-9);
    }
  });

  it('uses the whole gap on a touch screen and leaves nothing on the table', () => {
    expect(hitSizes(true).step).toBeCloseTo(CHANNEL_GAP, 6);
  });

  it('keeps power clear of the channel pair', () => {
    for (const coarse of [false, true]) {
      const { step, power } = hitSizes(coarse);
      const nextEdge = BUTTON_X.next + step / 2;
      const powerEdge = BUTTON_X.power - power / 2;
      expect(powerEdge).toBeGreaterThan(nextEdge);
    }
  });

  it('makes power the biggest target — it is the one that undoes everything', () => {
    for (const coarse of [false, true]) {
      const { step, power } = hitSizes(coarse);
      expect(power).toBeGreaterThan(step);
    }
  });
});

describe('the control layout', () => {
  it('sits the channel pair together and power apart', () => {
    const pair = BUTTON_X.next - BUTTON_X.prev;
    const apart = BUTTON_X.power - BUTTON_X.next;
    expect(apart).toBeGreaterThan(pair);
  });

  it('puts every control on the cabinet, below the picture', () => {
    // The screen plane is centred at y 1.56 with a half-height of 0.39, so its
    // bottom edge is 1.17. Controls belong under it, on the front of the box.
    expect(BUTTON_Y).toBeLessThan(1.17);
    expect(BUTTON_Z).toBeGreaterThan(0);
  });

  it('names exactly the three controls the set has', () => {
    expect(Object.keys(BUTTON_X).sort()).toEqual(['next', 'power', 'prev']);
  });
});
