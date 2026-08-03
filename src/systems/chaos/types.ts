/** Controlled Chaos domain types. */

export type SignalState = 'stable' | 'drift' | 'alert' | 'chaos' | 'silence';

export type ChaosEventId =
  | 'glyph-substitution'
  | 'horizontal-tear'
  | 'checksum-failure'
  | 'clock-desync'
  | 'phantom-record'
  | 'dead-column'
  | 'temporary-redaction'
  | 'observer-detected'
  | 'signal-silence';

export type ChaosMagnitude = 'micro' | 'medium' | 'major';

export interface ChaosEventDefinition {
  id: ChaosEventId;
  magnitude: ChaosMagnitude;
  /** Minimum entropy required before this event becomes eligible. */
  threshold: number;
  /** Lifetime of the visual effect, in milliseconds. */
  duration: number;
  /** Per-event cooldown before the same id may fire again, in milliseconds. */
  cooldown: number;
  /** Human-readable label used by the console `entropy` command. */
  label: string;
}

export interface EntropyInputs {
  /** Normalised pointer speed, 0–1. */
  pointerVelocity: number;
  /** Normalised scroll speed, 0–1. */
  scrollVelocity: number;
  /** Route nesting depth — deeper routes read as "further into the archive". */
  routeDepth: number;
  /** Seconds since the last user input. */
  idleDuration: number;
  /** Additive boost from narrative triggers, 0–1. */
  anomalyBoost: number;
}

export interface ActiveChaosEvent {
  id: ChaosEventId;
  magnitude: ChaosMagnitude;
  /** Timestamp (ms) when the event started. */
  startedAt: number;
  /** Timestamp (ms) when the event should be cleared. */
  endsAt: number;
  /** Deterministic seed so effects render consistently for their lifetime. */
  seed: number;
}

export interface ChaosHistoryEntry {
  id: ChaosEventId;
  magnitude: ChaosMagnitude;
  firedAt: number;
}

export interface ChaosState {
  /** Smoothed global chaos value, 0–1. */
  entropy: number;
  /** Immediate (unsmoothed) target derived from inputs. */
  targetEntropy: number;
  signalState: SignalState;
  stabilised: boolean;
  active: ActiveChaosEvent[];
  history: ChaosHistoryEntry[];
  /** Timestamp until which no event of any kind may fire. */
  globalLockUntil: number;
  /** Per-event-id cooldown expiry timestamps. */
  cooldowns: Partial<Record<ChaosEventId, number>>;
  /** Count of anomalies fired since load — surfaced by the console. */
  totalFired: number;
  lastMagnitude: ChaosMagnitude | null;
}

export type ChaosAction =
  | { type: 'tick'; now: number; delta: number; inputs: EntropyInputs }
  | { type: 'set-stabilised'; enabled: boolean; now: number }
  | { type: 'force-event'; id: ChaosEventId; now: number }
  | { type: 'clear-expired'; now: number }
  | { type: 'boost'; amount: number };

export interface ChaosBudget {
  /** Rolling window in ms used for counting recent events. */
  windowMs: number;
  maxMicroPerWindow: number;
  maxMediumPerWindow: number;
  /** Lockout after a major event, in ms. */
  majorLockoutMs: number;
  /** Minimum gap between any two events, in ms. */
  minGapMs: number;
}
