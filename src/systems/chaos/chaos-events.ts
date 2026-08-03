import type { ChaosBudget, ChaosEventDefinition, ChaosEventId } from './types';

/**
 * The complete anomaly table. Everything that may visually misbehave
 * must be declared here — components never invent their own events.
 */
export const CHAOS_EVENTS: readonly ChaosEventDefinition[] = [
  {
    id: 'glyph-substitution',
    magnitude: 'micro',
    threshold: 0.1,
    duration: 900,
    cooldown: 6000,
    label: 'Character substitution in non-essential text',
  },
  {
    id: 'dead-column',
    magnitude: 'micro',
    threshold: 0.12,
    duration: 2200,
    cooldown: 9000,
    label: 'ASCII field column failure',
  },
  {
    id: 'clock-desync',
    magnitude: 'micro',
    threshold: 0.12,
    duration: 3000,
    cooldown: 12000,
    label: 'System clock drift in status bar',
  },
  {
    id: 'checksum-failure',
    magnitude: 'micro',
    threshold: 0.15,
    duration: 2600,
    cooldown: 14000,
    label: 'Record checksum mismatch',
  },
  {
    id: 'horizontal-tear',
    magnitude: 'medium',
    threshold: 0.24,
    duration: 620,
    cooldown: 18000,
    label: 'Horizontal frame tear',
  },
  {
    id: 'temporary-redaction',
    magnitude: 'medium',
    threshold: 0.28,
    duration: 1800,
    cooldown: 22000,
    label: 'Temporary redaction of a text span',
  },
  {
    id: 'phantom-record',
    magnitude: 'medium',
    threshold: 0.34,
    duration: 5200,
    cooldown: 40000,
    label: 'Unlisted record appears in the index',
  },
  {
    id: 'observer-detected',
    magnitude: 'major',
    threshold: 0.52,
    duration: 4200,
    cooldown: 90000,
    label: 'Observer presence acknowledged',
  },
  {
    id: 'signal-silence',
    magnitude: 'major',
    threshold: 0.6,
    duration: 3200,
    cooldown: 120000,
    label: 'Total signal loss',
  },
] as const;

export const CHAOS_EVENT_MAP: ReadonlyMap<ChaosEventId, ChaosEventDefinition> = new Map(
  CHAOS_EVENTS.map((event) => [event.id, event]),
);

/**
 * Budget rules. These are the hard limits described in the brief:
 * at most two micro events and one medium event per 10s window,
 * a 45s lockout after any major event, and no two events back to back.
 */
export const DEFAULT_BUDGET: ChaosBudget = {
  windowMs: 10_000,
  maxMicroPerWindow: 2,
  maxMediumPerWindow: 1,
  majorLockoutMs: 45_000,
  minGapMs: 2_400,
};

export function getEventDefinition(id: ChaosEventId): ChaosEventDefinition | undefined {
  return CHAOS_EVENT_MAP.get(id);
}
