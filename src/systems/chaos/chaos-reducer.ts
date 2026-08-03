import { hash01 } from '@/utils/math';
import { CHAOS_EVENTS, DEFAULT_BUDGET, getEventDefinition } from './chaos-events';
import { computeEntropy, entropyToSignalState, smoothEntropy } from './entropy';
import type {
  ActiveChaosEvent,
  ChaosAction,
  ChaosBudget,
  ChaosEventDefinition,
  ChaosEventId,
  ChaosMagnitude,
  ChaosState,
} from './types';

export function createInitialChaosState(stabilised = false): ChaosState {
  return {
    entropy: stabilised ? 0 : 0.08,
    targetEntropy: stabilised ? 0 : 0.08,
    signalState: 'stable',
    stabilised,
    active: [],
    history: [],
    globalLockUntil: 0,
    cooldowns: {},
    totalFired: 0,
    lastMagnitude: null,
  };
}

/** Drops history entries outside the rolling budget window. */
function pruneHistory(
  history: ChaosState['history'],
  now: number,
  windowMs: number,
): ChaosState['history'] {
  const cutoff = now - windowMs;
  // Keep a little extra history so `minGapMs` checks still work at the edge.
  return history.filter((entry) => entry.firedAt >= cutoff - 30_000);
}

function countInWindow(
  history: ChaosState['history'],
  now: number,
  windowMs: number,
  magnitude: ChaosMagnitude,
): number {
  const cutoff = now - windowMs;
  let count = 0;
  for (const entry of history) {
    if (entry.firedAt >= cutoff && entry.magnitude === magnitude) count += 1;
  }
  return count;
}

export interface EligibilityContext {
  state: ChaosState;
  now: number;
  budget: ChaosBudget;
}

/**
 * Determines whether a specific event may fire right now.
 * Pure and exported so the rules are directly unit-testable.
 */
export function canFireEvent(
  definition: ChaosEventDefinition,
  { state, now, budget }: EligibilityContext,
): boolean {
  if (state.stabilised) return false;
  if (now < state.globalLockUntil) return false;
  if (state.entropy < definition.threshold) return false;

  const cooldownUntil = state.cooldowns[definition.id] ?? 0;
  if (now < cooldownUntil) return false;

  // No two events immediately back to back.
  const last = state.history[state.history.length - 1];
  if (last && now - last.firedAt < budget.minGapMs) return false;

  // A major event may never directly follow another major event.
  if (definition.magnitude === 'major' && state.lastMagnitude === 'major') return false;

  if (definition.magnitude === 'micro') {
    return (
      countInWindow(state.history, now, budget.windowMs, 'micro') <
      budget.maxMicroPerWindow
    );
  }

  if (definition.magnitude === 'medium') {
    return (
      countInWindow(state.history, now, budget.windowMs, 'medium') <
      budget.maxMediumPerWindow
    );
  }

  // Major events additionally require that no event of any kind is active.
  return state.active.length === 0;
}

/** Returns every event that is currently allowed to fire. */
export function eligibleEvents(
  state: ChaosState,
  now: number,
  budget: ChaosBudget = DEFAULT_BUDGET,
): ChaosEventDefinition[] {
  return CHAOS_EVENTS.filter((definition) =>
    canFireEvent(definition, { state, now, budget }),
  );
}

/**
 * Probability that the director attempts to fire anything on a given tick.
 * Scales with entropy but stays low: quiet stretches are the point.
 */
export function ignitionChance(entropy: number, delta: number): number {
  if (entropy <= 0.08) return 0;
  const perSecond = (entropy - 0.08) * 0.55;
  return Math.max(0, perSecond * delta);
}

function applyEvent(
  state: ChaosState,
  definition: ChaosEventDefinition,
  now: number,
  budget: ChaosBudget,
): ChaosState {
  const event: ActiveChaosEvent = {
    id: definition.id,
    magnitude: definition.magnitude,
    startedAt: now,
    endsAt: now + definition.duration,
    seed: Math.floor(hash01(now ^ definition.id.length * 7919) * 0xffff),
  };

  const globalLockUntil =
    definition.magnitude === 'major'
      ? now + budget.majorLockoutMs
      : state.globalLockUntil;

  return {
    ...state,
    active: [...state.active, event],
    history: pruneHistory(
      [...state.history, { id: definition.id, magnitude: definition.magnitude, firedAt: now }],
      now,
      budget.windowMs,
    ),
    cooldowns: { ...state.cooldowns, [definition.id]: now + definition.cooldown },
    globalLockUntil,
    totalFired: state.totalFired + 1,
    lastMagnitude: definition.magnitude,
  };
}

function clearExpired(state: ChaosState, now: number): ChaosState {
  if (state.active.length === 0) return state;
  const remaining = state.active.filter((event) => event.endsAt > now);
  if (remaining.length === state.active.length) return state;
  return { ...state, active: remaining };
}

export interface ReducerOptions {
  budget?: ChaosBudget;
  /** Injectable randomness so tests are deterministic. */
  random?: () => number;
}

export function chaosReducer(
  state: ChaosState,
  action: ChaosAction,
  options: ReducerOptions = {},
): ChaosState {
  const budget = options.budget ?? DEFAULT_BUDGET;
  const random = options.random ?? Math.random;

  switch (action.type) {
    case 'set-stabilised': {
      if (action.enabled) {
        return {
          ...createInitialChaosState(true),
          totalFired: state.totalFired,
          history: state.history,
          cooldowns: state.cooldowns,
        };
      }
      return {
        ...state,
        stabilised: false,
        // Re-entering chaos mode starts calm, with a grace period.
        entropy: 0.08,
        targetEntropy: 0.08,
        signalState: 'stable',
        globalLockUntil: action.now + 4000,
      };
    }

    case 'clear-expired':
      return clearExpired(state, action.now);

    case 'boost': {
      if (state.stabilised) return state;
      const targetEntropy = Math.min(1, state.targetEntropy + action.amount);
      return { ...state, targetEntropy };
    }

    case 'force-event': {
      const definition = getEventDefinition(action.id);
      if (!definition || state.stabilised) return state;
      // Forced events bypass eligibility but still record cooldowns.
      return applyEvent(clearExpired(state, action.now), definition, action.now, budget);
    }

    case 'tick': {
      const { now, delta, inputs } = action;

      if (state.stabilised) {
        const cleared = clearExpired(state, now);
        if (cleared.entropy === 0 && cleared.active.length === 0) {
          return cleared === state ? state : cleared;
        }
        return { ...cleared, entropy: 0, targetEntropy: 0, signalState: 'stable' };
      }

      let next = clearExpired(state, now);

      const targetEntropy = computeEntropy(inputs);
      const entropy = smoothEntropy(next.entropy, targetEntropy, delta);
      const signalState = entropyToSignalState(entropy, false);

      next = { ...next, entropy, targetEntropy, signalState };

      // Attempt ignition.
      if (random() < ignitionChance(entropy, delta)) {
        const candidates = eligibleEvents(next, now, budget);
        if (candidates.length > 0) {
          const pick = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
          next = applyEvent(next, pick, now, budget);
        }
      }

      return next;
    }

    default:
      return state;
  }
}

/** Convenience selector: is a given event currently active? */
export function isEventActive(state: ChaosState, id: ChaosEventId): boolean {
  return state.active.some((event) => event.id === id);
}

/** Convenience selector: the active event record, if any. */
export function getActiveEvent(
  state: ChaosState,
  id: ChaosEventId,
): ActiveChaosEvent | undefined {
  return state.active.find((event) => event.id === id);
}
