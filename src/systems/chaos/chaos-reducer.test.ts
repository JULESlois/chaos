import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET, getEventDefinition } from './chaos-events';
import {
  canFireEvent,
  chaosReducer,
  createInitialChaosState,
  eligibleEvents,
  ignitionChance,
  isEventActive,
} from './chaos-reducer';
import type { ChaosEventId, ChaosState, EntropyInputs } from './types';

const BUSY: EntropyInputs = {
  pointerVelocity: 1,
  scrollVelocity: 1,
  routeDepth: 3,
  idleDuration: 0,
  anomalyBoost: 1,
};

function definition(id: ChaosEventId) {
  const found = getEventDefinition(id);
  if (!found) throw new Error(`missing event definition: ${id}`);
  return found;
}

/** Builds a state with a given entropy and no history. */
function stateAt(entropy: number, overrides: Partial<ChaosState> = {}): ChaosState {
  return { ...createInitialChaosState(), entropy, ...overrides };
}

describe('event eligibility', () => {
  const now = 100_000;

  it('refuses events below their entropy threshold', () => {
    const tear = definition('horizontal-tear'); // threshold 0.24
    expect(
      canFireEvent(tear, { state: stateAt(0.1), now, budget: DEFAULT_BUDGET }),
    ).toBe(false);
    expect(
      canFireEvent(tear, { state: stateAt(0.5), now, budget: DEFAULT_BUDGET }),
    ).toBe(true);
  });

  it('honours the per-event cooldown', () => {
    const glyph = definition('glyph-substitution');
    const state = stateAt(0.9, { cooldowns: { 'glyph-substitution': now + 1000 } });
    expect(canFireEvent(glyph, { state, now, budget: DEFAULT_BUDGET })).toBe(false);
    expect(
      canFireEvent(glyph, { state, now: now + 1001, budget: DEFAULT_BUDGET }),
    ).toBe(true);
  });

  it('enforces the minimum gap between any two events', () => {
    const state = stateAt(0.9, {
      history: [{ id: 'glyph-substitution', magnitude: 'micro', firedAt: now - 500 }],
    });
    expect(eligibleEvents(state, now)).toHaveLength(0);
    expect(eligibleEvents(state, now + DEFAULT_BUDGET.minGapMs).length).toBeGreaterThan(0);
  });

  it('caps micro events at two per rolling window', () => {
    const state = stateAt(0.9, {
      history: [
        { id: 'glyph-substitution', magnitude: 'micro', firedAt: now - 9000 },
        { id: 'dead-column', magnitude: 'micro', firedAt: now - 8000 },
      ],
    });

    const micros = eligibleEvents(state, now).filter(
      (event) => event.magnitude === 'micro',
    );
    expect(micros).toHaveLength(0);

    // Once the window has rolled past them, micro events return.
    const later = now + DEFAULT_BUDGET.windowMs;
    expect(
      eligibleEvents(state, later).filter((event) => event.magnitude === 'micro').length,
    ).toBeGreaterThan(0);
  });

  it('caps medium events at one per rolling window', () => {
    const state = stateAt(0.9, {
      history: [{ id: 'horizontal-tear', magnitude: 'medium', firedAt: now - 9000 }],
    });
    expect(
      eligibleEvents(state, now).filter((event) => event.magnitude === 'medium'),
    ).toHaveLength(0);
  });

  it('locks everything out for 45 seconds after a major event', () => {
    const after = chaosReducer(stateAt(0.9), {
      type: 'force-event',
      id: 'signal-silence',
      now,
    });

    expect(after.globalLockUntil).toBe(now + DEFAULT_BUDGET.majorLockoutMs);
    expect(eligibleEvents(after, now + 1000)).toHaveLength(0);
    expect(
      eligibleEvents(
        { ...after, active: [], history: [] },
        now + DEFAULT_BUDGET.majorLockoutMs + 1,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('never allows two major events back to back', () => {
    const state = stateAt(0.9, {
      lastMagnitude: 'major',
      globalLockUntil: 0,
    });
    const majors = eligibleEvents(state, now).filter(
      (event) => event.magnitude === 'major',
    );
    expect(majors).toHaveLength(0);
  });
});

describe('ignition', () => {
  it('is impossible while the system is calm', () => {
    expect(ignitionChance(0.08, 0.1)).toBe(0);
    expect(ignitionChance(0.5, 0.1)).toBeGreaterThan(0);
  });

  it('stays a low probability per tick even at maximum entropy', () => {
    expect(ignitionChance(1, 0.1)).toBeLessThan(0.06);
  });
});

describe('stabilised mode', () => {
  it('clears entropy and blocks every event', () => {
    let state = chaosReducer(stateAt(0.9), {
      type: 'set-stabilised',
      enabled: true,
      now: 0,
    });

    // Even a tick full of frantic input cannot raise entropy.
    for (let i = 0; i < 50; i += 1) {
      state = chaosReducer(
        state,
        { type: 'tick', now: i * 100, delta: 0.1, inputs: BUSY },
        { random: () => 0 },
      );
    }

    expect(state.entropy).toBe(0);
    expect(state.signalState).toBe('stable');
    expect(state.active).toHaveLength(0);
    expect(state.totalFired).toBe(0);
    expect(eligibleEvents(state, 10_000)).toHaveLength(0);
  });

  it('ignores forced events and boosts while stabilised', () => {
    const stabilised = chaosReducer(createInitialChaosState(true), {
      type: 'boost',
      amount: 0.9,
    });
    expect(stabilised.targetEntropy).toBe(0);

    const forced = chaosReducer(stabilised, {
      type: 'force-event',
      id: 'observer-detected',
      now: 1000,
    });
    expect(forced.active).toHaveLength(0);
  });

  it('re-enters chaos mode calm, with a grace period', () => {
    const stabilised = chaosReducer(stateAt(0.9), {
      type: 'set-stabilised',
      enabled: true,
      now: 0,
    });
    const resumed = chaosReducer(stabilised, {
      type: 'set-stabilised',
      enabled: false,
      now: 5000,
    });

    expect(resumed.stabilised).toBe(false);
    expect(resumed.entropy).toBe(0.08);
    expect(resumed.globalLockUntil).toBe(9000);
  });
});

describe('event lifecycle', () => {
  it('activates, then expires an event on its own schedule', () => {
    const now = 50_000;
    const fired = chaosReducer(stateAt(0.9), {
      type: 'force-event',
      id: 'glyph-substitution',
      now,
    });

    expect(isEventActive(fired, 'glyph-substitution')).toBe(true);
    expect(fired.totalFired).toBe(1);

    const during = chaosReducer(fired, { type: 'clear-expired', now: now + 500 });
    expect(isEventActive(during, 'glyph-substitution')).toBe(true);

    const after = chaosReducer(fired, { type: 'clear-expired', now: now + 5000 });
    expect(isEventActive(after, 'glyph-substitution')).toBe(false);
  });

  it('produces long quiet stretches under a realistic tick loop', () => {
    // A deterministic "random" that always tries to ignite. Even then the
    // budget must keep the count low over a simulated minute.
    let state = stateAt(0.08);
    for (let i = 0; i < 600; i += 1) {
      state = chaosReducer(
        state,
        { type: 'tick', now: i * 100, delta: 0.1, inputs: BUSY },
        { random: () => 0 },
      );
    }

    // 60 seconds at maximum provocation: still bounded by the budget.
    expect(state.totalFired).toBeGreaterThan(0);
    expect(state.totalFired).toBeLessThanOrEqual(12);
  });
});
