import { afterEach, describe, expect, it } from 'vitest';
import type { SceneId } from '@/experience/phases';
import { signalBus } from '@/utils/signal-bus';
import { TensionController, type TensionInput, type VisualTension } from './tension';
import {
  DEFAULT_FAILURE_SEED,
  activeEventIds,
  buildFailureTimeline,
  createEnvelopes,
  sampleEnvelopes,
  type TensionEventId,
} from './tension-events';

const STEP = 1 / 60;

function input(sceneId: SceneId, localProgress: number, extra: Partial<TensionInput> = {}) {
  return {
    sceneId,
    localProgress,
    scrollVelocity: 0,
    pointerSpeed: 0,
    still: false,
    ...extra,
  } satisfies TensionInput;
}

/**
 * Holds one input steady long enough for the damping to settle.
 *
 * The returned object is a copy: the controller hands out its live value,
 * which it rewrites every frame, so holding on to it would compare a sample
 * against itself.
 */
function settle(
  controller: TensionController,
  where: TensionInput,
  seconds = 2,
): VisualTension {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    controller.update(where, STEP);
  }
  return { ...controller.current };
}

/** Walks the whole piece and returns every value the controller produced. */
function sweep(controller: TensionController): VisualTension[] {
  const scenes: SceneId[] = ['void', 'current', 'form', 'chaos', 'silence', 'television'];
  const samples: VisualTension[] = [];

  for (const sceneId of scenes) {
    for (let t = 0; t <= 1; t += 0.01) {
      samples.push({ ...controller.update(input(sceneId, t), STEP) });
    }
  }
  return samples;
}

afterEach(() => {
  signalBus.clear();
});

describe('VisualTension', () => {
  it('keeps all seven numbers inside 0–1 across the whole piece', () => {
    const samples = sweep(new TensionController());
    expect(samples.length).toBeGreaterThan(500);

    for (const sample of samples) {
      for (const [key, value] of Object.entries(sample)) {
        expect(Number.isFinite(value), `${key} is finite`).toBe(true);
        expect(value, `${key} >= 0`).toBeGreaterThanOrEqual(0);
        expect(value, `${key} <= 1`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('stays bounded even when the reader flings the page', () => {
    const controller = new TensionController();
    const violent = input('chaos', 0.7, { scrollVelocity: 40, pointerSpeed: 12 });
    const value = settle(controller, violent);

    for (const number of Object.values(value)) {
      expect(number).toBeLessThanOrEqual(1);
      expect(number).toBeGreaterThanOrEqual(0);
    }
  });

  it('escalates from void to the peak of chaos', () => {
    const quiet = settle(new TensionController(), input('void', 0.2));
    const loud = settle(new TensionController(), input('chaos', 0.8));

    expect(loud.density).toBeGreaterThan(quiet.density);
    expect(loud.flowDistortion).toBeGreaterThan(quiet.flowDistortion);
    expect(loud.feedbackAmount).toBeGreaterThan(quiet.feedbackAmount);
  });

  it('collapses the chaos screen into silence rather than fading it', () => {
    const controller = new TensionController();
    const peak = settle(controller, input('chaos', 0.8));
    const after = settle(controller, input('chaos', 0.99));

    expect(peak.density).toBeGreaterThan(0.5);
    expect(after.density).toBeLessThan(peak.density * 0.5);
  });

  it('leaves the feedback buffer unused on every screen but chaos', () => {
    for (const sceneId of ['void', 'current', 'form', 'silence', 'television'] as const) {
      const value = settle(new TensionController(), input(sceneId, 0.5));
      expect(value.feedbackAmount, `${sceneId} feedback`).toBeCloseTo(0, 3);
      expect(value.temporalOffset, `${sceneId} temporal`).toBeLessThan(0.4);
    }
  });

  it('holds a mask together while the reader is still and pulls it apart when not', () => {
    const still = settle(new TensionController(), input('form', 0.5, { still: true }));
    const moving = settle(
      new TensionController(),
      input('form', 0.5, { scrollVelocity: 1, pointerSpeed: 1 }),
    );

    expect(still.maskCoherence).toBeGreaterThan(moving.maskCoherence);
  });

  it('zeroes the envelopes when leaving chaos, so nothing leaks across', () => {
    const controller = new TensionController();
    settle(controller, input('chaos', 0.45), 0.2);

    controller.update(input('silence', 0.1), STEP);
    for (const strength of Object.values(controller.events)) {
      expect(strength).toBe(0);
    }
  });

  it('reset returns every number to zero', () => {
    const controller = new TensionController();
    settle(controller, input('chaos', 0.7));
    controller.reset();

    for (const value of Object.values(controller.current)) expect(value).toBe(0);
    for (const value of Object.values(controller.events)) expect(value).toBe(0);
  });
});

describe('the failure timeline', () => {
  it('produces an identical timeline for the same seed', () => {
    expect(buildFailureTimeline(0x1234)).toEqual(buildFailureTimeline(0x1234));
    expect(new TensionController(99).failures).toEqual(new TensionController(99).failures);
  });

  it('produces a different timeline for a different seed', () => {
    const a = buildFailureTimeline(0x1234);
    const b = buildFailureTimeline(0x5678);
    expect(a).not.toEqual(b);
    // The authored spine is shared; only the scatter differs.
    expect(a).toHaveLength(b.length);
  });

  it('is sorted, in range, and carries the authored spine', () => {
    const timeline = buildFailureTimeline(DEFAULT_FAILURE_SEED);

    for (let index = 1; index < timeline.length; index += 1) {
      expect(timeline[index]!.at).toBeGreaterThanOrEqual(timeline[index - 1]!.at);
    }

    for (const event of timeline) {
      expect(event.at).toBeGreaterThanOrEqual(0);
      expect(event.at + event.duration).toBeLessThanOrEqual(1.01);
      expect(event.strength).toBeGreaterThan(0);
      expect(event.strength).toBeLessThanOrEqual(1);
    }

    // The screen must always end in silence, whatever the seed scattered.
    expect(timeline.some((event) => event.id === 'signal-silence')).toBe(true);
  });

  it('drives the same visuals from the same seed, frame for frame', () => {
    const first = sweep(new TensionController(0xbeef));
    const second = sweep(new TensionController(0xbeef));
    expect(first).toEqual(second);
  });

  it('opens and closes each envelope at zero, so nothing pops', () => {
    const timeline = buildFailureTimeline(DEFAULT_FAILURE_SEED);
    const envelopes = createEnvelopes();

    // Sampled one event at a time: the timeline keeps the strongest envelope
    // per id, so two overlapping beats of the same kind would mask each
    // other's shape here.
    for (const event of timeline) {
      const only = [event];

      // Closeness rather than equality: the end of the window is reached by
      // floating-point addition, so it lands a fraction inside the raised
      // cosine rather than exactly on its zero.
      sampleEnvelopes(only, event.at, envelopes);
      expect(envelopes[event.id], 'silent at the start').toBeCloseTo(0, 10);

      sampleEnvelopes(only, event.at + event.duration, envelopes);
      expect(envelopes[event.id], 'silent at the end').toBeCloseTo(0, 10);

      sampleEnvelopes(only, event.at + event.duration / 2, envelopes);
      expect(envelopes[event.id], 'loudest in the middle').toBeCloseTo(event.strength, 6);
    }

    // Before the first beat nothing is active at all.
    expect(activeEventIds(timeline, 0)).toEqual([]);
  });

  it('reports the strongest of two overlapping beats, never their sum', () => {
    const envelopes = createEnvelopes();
    const overlapping = [
      { id: 'dead-column', at: 0.2, duration: 0.2, strength: 0.4, seed: 1 },
      { id: 'dead-column', at: 0.25, duration: 0.2, strength: 0.9, seed: 2 },
    ] as const;

    sampleEnvelopes(overlapping, 0.35, envelopes);
    expect(envelopes['dead-column']).toBeLessThanOrEqual(0.9);
    expect(envelopes['dead-column']).toBeGreaterThan(0.4);
  });
});

describe('rising-edge announcements', () => {
  it('announces a failure once as it becomes audible', () => {
    const heard: TensionEventId[] = [];
    signalBus.on('tension:event', ({ id }) => heard.push(id));

    const controller = new TensionController();
    // Walk the chaos screen the way a reader would.
    for (let t = 0; t <= 1; t += 0.002) {
      controller.update(input('chaos', t), STEP);
    }

    expect(heard.length).toBeGreaterThan(0);
    expect(heard).toContain('horizontal-tear');
    expect(heard).toContain('signal-silence');

    // Three tears are authored, and an envelope may only announce itself once
    // per crossing — so a fine-grained sweep must not produce a stream of them.
    const tears = heard.filter((id) => id === 'horizontal-tear');
    expect(tears).toHaveLength(3);
    expect(heard.filter((id) => id === 'signal-silence')).toHaveLength(1);
  });

  it('says nothing on the screens that have no failures', () => {
    const heard: TensionEventId[] = [];
    signalBus.on('tension:event', ({ id }) => heard.push(id));

    const controller = new TensionController();
    for (const sceneId of ['void', 'current', 'form', 'silence', 'television'] as const) {
      for (let t = 0; t <= 1; t += 0.01) controller.update(input(sceneId, t), STEP);
    }

    expect(heard).toEqual([]);
  });

  it('carries a strength with every announcement', () => {
    const strengths: number[] = [];
    signalBus.on('tension:event', ({ strength }) => strengths.push(strength));

    const controller = new TensionController();
    for (let t = 0; t <= 1; t += 0.002) controller.update(input('chaos', t), STEP);

    expect(strengths.length).toBeGreaterThan(0);
    for (const strength of strengths) {
      expect(strength).toBeGreaterThan(0);
      expect(strength).toBeLessThanOrEqual(1);
    }
  });
});
