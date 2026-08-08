import { describe, expect, it } from 'vitest';
import { EXPERIENCE_PHASES } from '@/experience/phases';
import { RainField, makeRainConfig } from './rain-field';
import {
  RAIN_PRESETS,
  blendRainParams,
  createRainParams,
  type RainParams,
  type RainPreset,
} from './rain-preset';
import type { AsciiRuntime, AsciiViewport, PointerState } from '../types';

/**
 * What these tests are defending.
 *
 * Before this split, every screen owned its own `RainField` and the engine only
 * ticked the active one, so the rain the reader scrolled *into* had never run a
 * frame — it began cold at every boundary while the outgoing one faded over the
 * top of it. The fix is structural rather than visual: one field for the whole
 * visit, and screens reduced to parameters over it.
 *
 * That makes the invariants testable. A preset must be a pure function of the
 * frame (so it can be evaluated twice during a crossfade without leaking state
 * between the two evaluations), and the field must keep simulating through the
 * phases that show no rain at all — otherwise VOID would still hand CURRENT a
 * field that has never moved.
 */

const VIEW: AsciiViewport = {
  width: 1280,
  height: 800,
  dpr: 1,
  cellWidth: 8.06,
  cellHeight: 15.08,
  fontSize: 13,
  cols: 158,
  rows: 53,
};

const POINTER: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  speed: 0,
  active: false,
  idle: 10,
};

/** Only the fields the presets actually read. */
function runtime(overrides: Partial<AsciiRuntime> = {}): AsciiRuntime {
  return {
    view: VIEW,
    pointer: POINTER,
    experience: { localProgress: 0.5, scrollVelocity: 0 },
    tension: { flowDistortion: 0.4, maskCoherence: 0.5, tearAmount: 0.3 },
    events: { 'dead-column': 0.2, 'glyph-substitution': 0.3 },
    reducedMotion: false,
    time: 3.2,
    delta: 1 / 60,
    budget: 6000,
    quality: 0,
    ...overrides,
  } as unknown as AsciiRuntime;
}

function context(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  return ctx;
}

const ALL: RainPreset[] = Object.values(RAIN_PRESETS);

describe('the preset table', () => {
  it('covers every screen the experience can be on', () => {
    // A phase with no preset would throw on entry rather than degrade, so this
    // is the guard for adding a screen and forgetting its rain.
    for (const phase of EXPERIENCE_PHASES) {
      expect(RAIN_PRESETS[phase.id]).toBeDefined();
      expect(RAIN_PRESETS[phase.id]!.id).toBe(phase.id);
    }
  });

  it('files each preset under its own id', () => {
    for (const [id, preset] of Object.entries(RAIN_PRESETS)) {
      expect(preset.id).toBe(id);
    }
  });
});

describe('a preset', () => {
  it('writes every field, so a reused buffer cannot leak the previous screen', () => {
    // The engine evaluates two presets per crossfade frame into two long-lived
    // buffers. If a preset left a field alone, CHAOS's faults would survive
    // into CURRENT for as long as the reader stayed there.
    const dirty = createRainParams();
    const clean = createRainParams();

    for (const preset of ALL) {
      RAIN_PRESETS.chaos.apply(dirty, runtime(), 0.95);
      preset.apply(dirty, runtime(), 0.4);
      preset.apply(clean, runtime(), 0.4);
      expect(dirty).toEqual(clean);
    }
  });

  it('is a pure function of the frame', () => {
    const a = createRainParams();
    const b = createRainParams();
    for (const preset of ALL) {
      preset.apply(a, runtime(), 0.63);
      preset.apply(b, runtime(), 0.63);
      expect(a).toEqual(b);
    }
  });

  it('keeps every value in range across the whole scroll', () => {
    const out = createRainParams();
    for (const preset of ALL) {
      for (let p = 0; p <= 1.0001; p += 0.05) {
        preset.apply(out, runtime(), p);
        for (const value of [
          out.weight,
          ...Object.values(out.formWeights),
          ...Object.values(out.chaos),
        ]) {
          // Epsilon: the schedules are products of smoothsteps, which land on
          // 0 and 1 with a few ulps of noise. Only a real excursion matters.
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(-1e-9);
          expect(value).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it('shows no rain on VOID start and full rain once it has arrived', () => {
    const out = createRainParams();
    RAIN_PRESETS.void.apply(out, runtime(), 0);
    expect(out.releaseStrength).toBe(0);
    RAIN_PRESETS.current.apply(out, runtime(), 0.5);
    expect(out.weight).toBe(1);
  });
});

describe('blending two screens', () => {
  it('returns the endpoints exactly at t=0 and t=1', () => {
    const a = createRainParams();
    const b = createRainParams();
    const out = createRainParams();
    RAIN_PRESETS.void.apply(a, runtime(), 1);
    RAIN_PRESETS.chaos.apply(b, runtime(), 0.5);

    blendRainParams(out, a, b, 0);
    expect(out).toEqual(a);
    blendRainParams(out, a, b, 1);
    expect(out).toEqual(b);
  });

  it('crosses the visibility of VOID into CURRENT rather than switching it', () => {
    // This is the density spike the old two-field crossfade produced, stated as
    // a property: halfway through, there is exactly one half-strength field —
    // not two full ones fading past each other.
    const a = createRainParams();
    const b = createRainParams();
    const out = createRainParams();
    RAIN_PRESETS.void.apply(a, runtime(), 0);
    RAIN_PRESETS.current.apply(b, runtime(), 0);

    blendRainParams(out, a, b, 0.5);
    expect(out.releaseStrength).toBeCloseTo(0.5, 5);
  });

  it('mutates the output in place, allocating nothing per frame', () => {
    const out = createRainParams();
    const forms = out.formWeights;
    const chaos = out.chaos;
    blendRainParams(out, createRainParams(), createRainParams(), 0.5);
    expect(out.formWeights).toBe(forms);
    expect(out.chaos).toBe(chaos);
  });
});

describe('one field across a boundary', () => {
  function step(field: RainField, ctx: CanvasRenderingContext2D, params: RainParams): void {
    field.render(
      ctx,
      makeRainConfig(runtime(), {
        seed: 2407,
        formWeights: params.formWeights,
        chaos: params.chaos,
        weight: params.weight,
        bootProgress: params.bootProgress,
        bootLineStrength: params.bootLineStrength,
        releaseStrength: params.releaseStrength,
        trailGrowth: params.trailGrowth,
      }),
    );
  }

  it('keeps simulating while VOID shows nothing, so CURRENT inherits a warm field', () => {
    // The whole point of the refactor. Under the old design the CURRENT field
    // had never been ticked when the reader reached it; here the invisible
    // phase is still moving the same columns.
    const field = new RainField(2407);
    const ctx = context();
    field.resize(VIEW, 0);

    const params = createRainParams();
    RAIN_PRESETS.void.apply(params, runtime(), 0);

    step(field, ctx, params);
    const before = Float32Array.from(field.engineInstance.heads);
    for (let i = 0; i < 60; i += 1) step(field, ctx, params);
    const after = field.engineInstance.heads;

    // `heads` is a fixed-capacity buffer; only the first `columnCount` entries
    // belong to the current grid.
    const live = field.columnCount;
    expect(live).toBeGreaterThan(0);

    let moved = 0;
    for (let i = 0; i < live; i += 1) {
      if (Math.abs(after[i]! - before[i]!) > 0.001) moved += 1;
    }
    expect(moved).toBe(live); // … and yet every column advanced.
  });

  it('does not reset the columns when the screen changes', () => {
    const ctx = context();
    const warm = new RainField(2407);
    warm.resize(VIEW, 0);
    // The field the old design would have handed to FORM: same seed, but its
    // first frame ever is the boundary frame.
    const cold = new RainField(2407);
    cold.resize(VIEW, 0);

    const params = createRainParams();
    RAIN_PRESETS.current.apply(params, runtime(), 1);
    for (let i = 0; i < 30; i += 1) step(warm, ctx, params);
    const atBoundary = Float32Array.from(warm.engineInstance.heads);

    RAIN_PRESETS.form.apply(params, runtime(), 0);
    step(warm, ctx, params);
    step(cold, ctx, params);

    const live = warm.columnCount;
    const rows = warm.rowCount;
    const after = warm.engineInstance.heads;
    const fresh = cold.engineInstance.heads;

    // One frame of travel and no more, measured around the wrap at `rows`.
    for (let i = 0; i < live; i += 1) {
      const raw = (((after[i]! - atBoundary[i]!) % rows) + rows) % rows;
      expect(Math.min(raw, rows - raw)).toBeLessThan(3);
    }

    // And it is demonstrably not the cold field: a majority of columns are
    // somewhere else entirely from where a fresh seed would have put them.
    let differing = 0;
    for (let i = 0; i < live; i += 1) {
      if (Math.abs(after[i]! - fresh[i]!) > 0.5) differing += 1;
    }
    expect(differing).toBeGreaterThan(live * 0.8);
  });

  it('is still drawing rain on the far side of the boundary', () => {
    const field = new RainField(2407);
    const ctx = context();
    field.resize(VIEW, 0);

    const params = createRainParams();
    RAIN_PRESETS.form.apply(params, runtime(), 0.5);
    step(field, ctx, params);
    expect(field.drawnCount).toBeGreaterThan(200);
  });
});
