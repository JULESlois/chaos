import type { SceneId } from '@/experience/phases';
import { clamp01, damp, lerp, smoothstep } from '@/utils/math';
import { signalBus } from '@/utils/signal-bus';
import {
  buildFailureTimeline,
  createEnvelopes,
  sampleEnvelopes,
  DEFAULT_FAILURE_SEED,
  type EventEnvelopes,
  type TensionEvent,
  type TensionEventId,
} from './tension-events';

export interface TensionInput {
  sceneId: SceneId;
  /** Progress within the current screen, 0–1. */
  localProgress: number;
  /** Damped scroll speed, roughly 0–1 for normal use. */
  scrollVelocity: number;
  /** How fast the pointer is moving across the viewport, 0–1. */
  pointerSpeed: number;
  /** True once the reader has been still for a moment. */
  still: boolean;
}

/**
 * What the renderer is allowed to know about "chaos".
 *
 * Deliberately not a list of anomalies: the scenes never ask "did an event
 * fire", they ask "how distorted should this be right now". That keeps the
 * failure vocabulary in one place and stops the visual layers from growing
 * their own opinions about the narrative.
 */
export interface VisualTension {
  /** How much of the character budget is in play. */
  density: number;
  /** How far the flow field departs from its base direction. */
  flowDistortion: number;
  /** How completely a mask is able to hold its shape. */
  maskCoherence: number;
  /** Frame-feedback contribution, 0 means the buffer is unused. */
  feedbackAmount: number;
  /** Separation between the three same-hue time-offset layers. */
  temporalOffset: number;
  /** Horizontal displacement of a band of rows. */
  tearAmount: number;
  /** Brightness ceiling for the brightest glyphs. */
  lightIntensity: number;
}

interface SceneBase {
  density: (t: number) => number;
  flowDistortion: (t: number) => number;
  maskCoherence: (t: number) => number;
  feedbackAmount: (t: number) => number;
  temporalOffset: (t: number) => number;
  lightIntensity: (t: number) => number;
}

const constant =
  (value: number) =>
  (): number =>
    value;

const ramp =
  (from: number, to: number) =>
  (t: number): number =>
    lerp(from, to, t);

/**
 * Where the chaos screen stops escalating and drops into silence. The
 * denouement is a hard turn, not a fade — the field is loudest at 0.86 and
 * effectively gone by 0.95.
 */
const CHAOS_COLLAPSE_START = 0.86;
const CHAOS_COLLAPSE_END = 0.96;

function chaosCollapse(t: number): number {
  return 1 - smoothstep(CHAOS_COLLAPSE_START, CHAOS_COLLAPSE_END, t);
}

const SCENE_BASES: Record<SceneId, SceneBase> = {
  void: {
    density: ramp(0.06, 0.28),
    flowDistortion: ramp(0.02, 0.12),
    maskCoherence: constant(0),
    feedbackAmount: constant(0),
    temporalOffset: constant(0),
    lightIntensity: ramp(0.08, 0.22),
  },
  current: {
    density: ramp(0.42, 0.72),
    flowDistortion: ramp(0.3, 0.62),
    maskCoherence: constant(0),
    feedbackAmount: constant(0),
    temporalOffset: ramp(0.05, 0.18),
    lightIntensity: ramp(0.26, 0.4),
  },
  form: {
    density: ramp(0.62, 0.5),
    flowDistortion: ramp(0.34, 0.2),
    maskCoherence: (t) => smoothstep(0, 0.22, t) * (1 - smoothstep(0.82, 1, t) * 0.55),
    feedbackAmount: constant(0),
    temporalOffset: ramp(0.12, 0.24),
    lightIntensity: ramp(0.38, 0.5),
  },
  chaos: {
    density: (t) => lerp(0.66, 1, smoothstep(0, 0.8, t)) * chaosCollapse(t),
    flowDistortion: (t) => lerp(0.5, 1, smoothstep(0, 0.75, t)) * chaosCollapse(t),
    maskCoherence: (t) => (1 - smoothstep(0, 0.45, t)) * 0.45 * chaosCollapse(t),
    feedbackAmount: (t) => lerp(0.25, 0.92, smoothstep(0.05, 0.8, t)) * chaosCollapse(t),
    temporalOffset: (t) => lerp(0.3, 1, smoothstep(0, 0.7, t)) * chaosCollapse(t),
    lightIntensity: (t) => lerp(0.55, 0.95, smoothstep(0, 0.7, t)) * chaosCollapse(t),
  },
  silence: {
    density: ramp(0.16, 0.09),
    flowDistortion: constant(0.04),
    maskCoherence: constant(0),
    feedbackAmount: constant(0),
    temporalOffset: constant(0),
    lightIntensity: ramp(0.3, 0.85),
  },
  television: {
    density: ramp(0.08, 0.03),
    flowDistortion: constant(0.02),
    maskCoherence: constant(0),
    feedbackAmount: constant(0),
    temporalOffset: constant(0),
    lightIntensity: constant(1),
  },
};

/** Tear is impulsive, so it decays on its own clock rather than being damped. */
const TEAR_DECAY = 9;
const FIELD_DAMPING = 7;

/** Envelope level at which an event counts as having "fired". */
const EDGE_THRESHOLD = 0.45;

const EVENT_IDS: readonly TensionEventId[] = [
  'glyph-substitution',
  'dead-column',
  'horizontal-tear',
  'signal-silence',
];

/**
 * Turns "where the reader is and how they are moving" into the seven numbers
 * the renderer actually needs.
 *
 * Every output is clamped to 0–1 and damped, so no scene can be handed a
 * value that would blow past its budget, and a violent scroll produces a
 * surge rather than a single-frame spike.
 */
export class TensionController {
  private readonly value: VisualTension = {
    density: 0,
    flowDistortion: 0,
    maskCoherence: 0,
    feedbackAmount: 0,
    temporalOffset: 0,
    tearAmount: 0,
    lightIntensity: 0,
  };

  private readonly envelopes: EventEnvelopes = createEnvelopes();
  /** Previous frame's envelopes, used purely for rising-edge detection. */
  private readonly previous: EventEnvelopes = createEnvelopes();
  private readonly timeline: readonly TensionEvent[];

  constructor(seed: number = DEFAULT_FAILURE_SEED) {
    this.timeline = buildFailureTimeline(seed);
  }

  get current(): Readonly<VisualTension> {
    return this.value;
  }

  /** Envelope strengths for the current frame. Read by the chaos scene. */
  get events(): Readonly<EventEnvelopes> {
    return this.envelopes;
  }

  get failures(): readonly TensionEvent[] {
    return this.timeline;
  }

  update(input: TensionInput, delta: number): Readonly<VisualTension> {
    const t = clamp01(input.localProgress);
    const base = SCENE_BASES[input.sceneId];
    const value = this.value;
    const k = damp(FIELD_DAMPING, delta);

    // Failures only exist on the chaos screen; elsewhere the envelopes are
    // zeroed so a stale value cannot leak across a screen boundary.
    if (input.sceneId === 'chaos') {
      sampleEnvelopes(this.timeline, t, this.envelopes);
    } else {
      this.envelopes['glyph-substitution'] = 0;
      this.envelopes['dead-column'] = 0;
      this.envelopes['horizontal-tear'] = 0;
      this.envelopes['signal-silence'] = 0;
    }

    this.announceEdges();

    const silence = this.envelopes['signal-silence'];
    const quiet = 1 - silence;
    const agitation = clamp01(input.scrollVelocity * 0.55 + input.pointerSpeed * 0.35);

    const targetDensity = clamp01(base.density(t) * quiet + agitation * 0.08);
    const targetFlow = clamp01(
      base.flowDistortion(t) * quiet + agitation * 0.25 + this.envelopes['dead-column'] * 0.1,
    );

    // Holding still lets a shape finish assembling; moving takes it apart.
    const coherenceBonus = input.still ? 0.25 : -0.3 * agitation;
    const targetCoherence = clamp01(base.maskCoherence(t) * quiet + coherenceBonus);

    const targetFeedback = clamp01(base.feedbackAmount(t) * quiet);
    const targetTemporal = clamp01(
      base.temporalOffset(t) * quiet + this.envelopes['glyph-substitution'] * 0.2,
    );
    const targetLight = clamp01(base.lightIntensity(t) * quiet + agitation * 0.06);

    value.density = lerp(value.density, targetDensity, k);
    value.flowDistortion = lerp(value.flowDistortion, targetFlow, k);
    value.maskCoherence = lerp(value.maskCoherence, targetCoherence, k);
    value.feedbackAmount = lerp(value.feedbackAmount, targetFeedback, k);
    value.temporalOffset = lerp(value.temporalOffset, targetTemporal, k);
    value.lightIntensity = lerp(value.lightIntensity, targetLight, k);

    // A tear is a step, then a fall. Damping it would turn a rip into a bulge.
    const tearTarget = clamp01(this.envelopes['horizontal-tear']);
    value.tearAmount =
      tearTarget > value.tearAmount
        ? tearTarget
        : value.tearAmount * (1 - damp(TEAR_DECAY, delta));

    return value;
  }

  /**
   * Announces the frame an envelope crosses into its audible range.
   *
   * Subscribers — audio, and the television's CRT tear — need a discrete
   * "this just happened" rather than a continuous strength. Detecting the
   * edge here rather than in each subscriber means one definition of when an
   * event has fired, and it can never fire twice for one envelope.
   */
  private announceEdges(): void {
    for (const id of EVENT_IDS) {
      const now = this.envelopes[id];
      const before = this.previous[id];
      this.previous[id] = now;
      if (before < EDGE_THRESHOLD && now >= EDGE_THRESHOLD) {
        signalBus.emit('tension:event', { id, strength: now });
      }
    }
  }

  /** Zeroes everything. Used when the stage is hidden or disposed. */
  reset(): void {
    const value = this.value;
    value.density = 0;
    value.flowDistortion = 0;
    value.maskCoherence = 0;
    value.feedbackAmount = 0;
    value.temporalOffset = 0;
    value.tearAmount = 0;
    value.lightIntensity = 0;

    for (const id of EVENT_IDS) {
      this.envelopes[id] = 0;
      this.previous[id] = 0;
    }
  }
}
