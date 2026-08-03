import { createRng } from '@/utils/math';

/**
 * Structural failures.
 *
 * These are the only "anomalies" left in the project. Each one is a purely
 * visual malfunction of the character field — there is no warning text, no
 * observer count, and no claim that anything is watching the reader.
 */
export type TensionEventId =
  | 'glyph-substitution'
  | 'dead-column'
  | 'horizontal-tear'
  | 'signal-silence';

export interface TensionEvent {
  readonly id: TensionEventId;
  /** Position in the chaos screen's local 0–1 progress. */
  readonly at: number;
  /** Length of the event in local progress units. */
  readonly duration: number;
  /** Peak strength, 0–1. */
  readonly strength: number;
  /** Stable per-event seed so the event's own randomness is reproducible. */
  readonly seed: number;
}

export type EventEnvelopes = Record<TensionEventId, number>;

export const DEFAULT_FAILURE_SEED = 0x07_ac_11;

/**
 * The spine of the chaos screen. These beats are authored, not random — the
 * scroll position always produces the same failures in the same order, which
 * is what makes the screen feel like a recording rather than a toy.
 */
const AUTHORED: readonly Omit<TensionEvent, 'seed'>[] = [
  { id: 'glyph-substitution', at: 0.1, duration: 0.12, strength: 0.35 },
  { id: 'dead-column', at: 0.26, duration: 0.14, strength: 0.5 },
  { id: 'horizontal-tear', at: 0.44, duration: 0.06, strength: 0.7 },
  { id: 'glyph-substitution', at: 0.5, duration: 0.16, strength: 0.7 },
  { id: 'dead-column', at: 0.6, duration: 0.11, strength: 0.85 },
  { id: 'horizontal-tear', at: 0.71, duration: 0.05, strength: 1 },
  { id: 'horizontal-tear', at: 0.79, duration: 0.04, strength: 0.9 },
  { id: 'signal-silence', at: 0.87, duration: 0.13, strength: 1 },
];

/** How many extra seeded flickers are scattered between the authored beats. */
const SCATTER_COUNT = 5;

/**
 * Builds the failure timeline for a seed.
 *
 * Same seed in, same array out — the scatter is drawn from a mulberry32
 * stream, never from `Math.random`, so two visits with the same seed break in
 * exactly the same places.
 */
export function buildFailureTimeline(seed = DEFAULT_FAILURE_SEED): readonly TensionEvent[] {
  const rng = createRng(seed);
  const events: TensionEvent[] = AUTHORED.map((event, index) => ({
    ...event,
    seed: (seed ^ ((index + 1) * 0x9e37)) >>> 0,
  }));

  for (let index = 0; index < SCATTER_COUNT; index += 1) {
    const at = 0.06 + rng() * 0.76;
    const duration = 0.02 + rng() * 0.05;
    const strength = 0.18 + rng() * 0.34;
    events.push({
      id: rng() > 0.55 ? 'dead-column' : 'glyph-substitution',
      at,
      duration,
      strength,
      seed: (seed ^ ((index + 41) * 0x85eb)) >>> 0,
    });
  }

  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return events;
}

export function createEnvelopes(): EventEnvelopes {
  return {
    'glyph-substitution': 0,
    'dead-column': 0,
    'horizontal-tear': 0,
    'signal-silence': 0,
  };
}

/** Raised-cosine window — zero at both ends, so events never pop on or off. */
function envelope(local: number, event: TensionEvent): number {
  const t = (local - event.at) / event.duration;
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(t * Math.PI) * event.strength;
}

/**
 * Accumulates the strongest active envelope per event type into `out`.
 *
 * Writes into a caller-owned record rather than allocating, because this runs
 * once per frame.
 */
export function sampleEnvelopes(
  timeline: readonly TensionEvent[],
  local: number,
  out: EventEnvelopes,
): EventEnvelopes {
  out['glyph-substitution'] = 0;
  out['dead-column'] = 0;
  out['horizontal-tear'] = 0;
  out['signal-silence'] = 0;

  for (let index = 0; index < timeline.length; index += 1) {
    const event = timeline[index]!;
    const value = envelope(local, event);
    if (value > out[event.id]) out[event.id] = value;
  }

  return out;
}

/** The event ids that are non-zero at `local`. Used by tests and by audio. */
export function activeEventIds(
  timeline: readonly TensionEvent[],
  local: number,
): TensionEventId[] {
  const ids: TensionEventId[] = [];
  for (const event of timeline) {
    if (envelope(local, event) > 0 && !ids.includes(event.id)) ids.push(event.id);
  }
  return ids;
}
