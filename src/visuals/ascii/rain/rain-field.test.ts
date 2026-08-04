import { beforeEach, describe, expect, it } from 'vitest';
import { RainEngine } from './rain-engine';
import { RainField, makeRainConfig } from './rain-field';
import { configFor, gridFor } from './rain-presets';
import {
  NORMAL_CHAOS,
  clamp01,
  trailEnvelope,
  type ChaosFaults,
  type RainRenderConfig,
} from './rain-types';
import type { AsciiViewport, PointerState, QualityTier } from '../types';

/**
 * What these tests are actually defending.
 *
 * The rain has one property that the whole piece rests on and that no
 * screenshot can prove: it never stops moving, and it never stops being rain.
 * A silhouette assembled out of parked characters would look correct in a
 * still and be wrong in every frame that matters. So the assertions here are
 * about *behaviour over time* — heads advance, columns keep their identity,
 * the same seed replays the same field — rather than about what any single
 * frame contains.
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

function config(overrides: Partial<RainRenderConfig> = {}): RainRenderConfig {
  return {
    width: VIEW.width,
    height: VIEW.height,
    cell: 13,
    time: 0,
    delta: 1 / 60,
    progress: 0.5,
    seed: 2407,
    quality: 0,
    pointer: POINTER,
    reducedMotion: false,
    formWeights: { face: 0, figure: 0, hand: 0 },
    chaos: NORMAL_CHAOS,
    weight: 1,
    bootProgress: 1,
    bootLineStrength: 0,
trajectoryDistortion: 0,
trajectoryAnomaly: 0,
mutationIntensity: 0.25,
glyphPoolMix: 0,
    releaseStrength: 1,
    trailGrowth: 1,
    debug: false,
    frameId: 0,
    ...overrides,
  };
}

function faults(overrides: Partial<ChaosFaults>): ChaosFaults {
  return { ...NORMAL_CHAOS, ...overrides };
}

function context(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  return ctx;
}

describe('the rain engine', () => {
  it('lays out the same field from the same seed, every time', () => {
    const grid = gridFor(VIEW.width, VIEW.height, 0);
    const build = (): number[] => {
      const engine = new RainEngine(configFor(0), 2407);
      engine.resize(grid.cols, grid.rows);
      engine.populate();
      const out: number[] = [];
      for (let i = 0; i < engine.columnCount; i += 1) {
        out.push(engine.getSpeed(i), engine.getLength(i), engine.getDirection(i));
      }
      return out;
    };
    expect(build()).toEqual(build());
  });

  it('lays out a different field from a different seed', () => {
    const grid = gridFor(VIEW.width, VIEW.height, 0);
    const speeds = (seed: number): number[] => {
      const engine = new RainEngine(configFor(0), seed);
      engine.resize(grid.cols, grid.rows);
      engine.populate();
      return Array.from({ length: engine.columnCount }, (_, i) => engine.getSpeed(i));
    };
    expect(speeds(2407)).not.toEqual(speeds(918));
  });

  it('keeps speed and length inside the configured range', () => {
    const cfg = configFor(0);
    const engine = new RainEngine(cfg, 2407);
    engine.resize(140, 60);
    engine.populate();
    const range = engine.ranges();
    expect(range.speedMin).toBeGreaterThanOrEqual(1.0);
    expect(range.speedMax).toBeLessThanOrEqual(35.0);
    expect(range.lengthMin).toBeGreaterThanOrEqual(cfg.lengthMin);
    expect(range.lengthMax).toBeLessThanOrEqual(cfg.lengthMax);
  });

  it('runs a minority of columns upward', () => {
    const cfg = configFor(0);
    const engine = new RainEngine(cfg, 2407);
    engine.resize(400, 60);
    engine.populate();
    const ratio = engine.reverseCount / engine.columnCount;
    // The spec asks for a few, not a symmetrical field: a rain that is half
    // upward stops reading as gravity and starts reading as noise.
    expect(ratio).toBeGreaterThan(0.02);
    expect(ratio).toBeLessThan(0.2);
  });

  it('advances every head and never leaves the grid', () => {
    const engine = new RainEngine(configFor(0), 2407);
    engine.resize(60, 40);
    engine.populate();
    const before = Array.from(engine.heads.slice(0, 60));

    for (let i = 0; i < 30; i += 1) engine.update(1 / 60);

    let moved = 0;
    for (let i = 0; i < 60; i += 1) {
      const head = engine.heads[i]!;
      expect(head).toBeGreaterThanOrEqual(0);
      expect(head).toBeLessThan(40);
      if (head !== before[i]) moved += 1;
    }
    expect(moved).toBe(60);
  });

  it('holds frozen columns in place and releases them on reset', () => {
    const engine = new RainEngine(configFor(0), 2407);
    engine.resize(20, 40);
    engine.populate();
    engine.setFrozen(3, true);
    const held = engine.heads[3]!;

    for (let i = 0; i < 20; i += 1) engine.update(1 / 60);
    expect(engine.heads[3]).toBe(held);

    engine.resetChaos();
    engine.update(1 / 60);
    expect(engine.heads[3]).not.toBe(held);
  });

  it('sends a column backwards when chaos inverts it', () => {
    const engine = new RainEngine(configFor(0), 2407);
    engine.resize(20, 400);
    engine.populate();

    // Pick a downward column and place its head mid-grid so neither direction
    // wraps within the window under test.
    let column = -1;
    for (let i = 0; i < 20; i += 1) {
      if (engine.getDirection(i) === 1) {
        column = i;
        break;
      }
    }
    expect(column).toBeGreaterThanOrEqual(0);
    engine.nudgeHead(column, 200 - engine.heads[column]!);

    const start = engine.heads[column]!;
    engine.setChaosDirection(column, -1);
    for (let i = 0; i < 10; i += 1) engine.update(1 / 60);
    expect(engine.heads[column]!).toBeLessThan(start);
  });
});

describe('the trail envelope', () => {
  it('is brightest at the head and gone by the tail', () => {
    const head = trailEnvelope(0, 20, 0.5);
    const mid = trailEnvelope(10, 20, 0.5);
    const tail = trailEnvelope(19, 20, 0.5);
    expect(head).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(tail);
    expect(tail).toBeLessThan(0.5);
  });

  it('holds the tail longer at higher persistence', () => {
    expect(trailEnvelope(14, 20, 0.9)).toBeGreaterThan(trailEnvelope(14, 20, 0.1));
  });
});

describe('the grid', () => {
  it('stays inside the desktop bounds the spec asks for', () => {
    const grid = gridFor(1920, 1080, 0);
    expect(grid.cols).toBeGreaterThanOrEqual(80);
    expect(grid.cols).toBeLessThanOrEqual(150);
    expect(grid.rows).toBeGreaterThanOrEqual(45);
    expect(grid.rows).toBeLessThanOrEqual(90);
  });

  it('stays inside the mobile bounds on a narrow viewport', () => {
    const grid = gridFor(390, 844, 0);
    expect(grid.cols).toBeGreaterThanOrEqual(35);
    expect(grid.cols).toBeLessThanOrEqual(70);
    expect(grid.rows).toBeGreaterThanOrEqual(45);
    expect(grid.rows).toBeLessThanOrEqual(85);
  });

  it('thins the field on the lowest tier', () => {
    const full = gridFor(1440, 900, 0);
    const minimal = gridFor(1440, 900, 2);
    expect(minimal.cols).toBeLessThan(full.cols);
    expect(minimal.rows).toBeLessThan(full.rows);
  });
});

describe('the rain field', () => {
  let field: RainField;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    field = new RainField(2407);
    ctx = context();
    field.resize(VIEW, 0);
  });

  it('draws characters and reports how many', () => {
    field.render(ctx, config());
    expect(field.drawnCount).toBeGreaterThan(200);
  });

  it('bumps its frame id once per render', () => {
    const before = field.frameId;
    field.render(ctx, config());
    field.render(ctx, config());
    expect(field.frameId).toBe(before + 2);
  });

  it('keeps falling while a form is present', () => {
    // The one thing that must never happen: characters parking to hold a
    // shape. Heads are sampled across a form-heavy stretch and every column
    // must still have moved.
    const weights = { face: 1, figure: 0.8, hand: 0.4 };
    field.render(ctx, config({ formWeights: weights }));
    const engine = field.engineInstance;
    const before = Array.from(engine.heads.slice(0, field.columnCount));

    for (let i = 0; i < 20; i += 1) {
      field.render(ctx, config({ formWeights: weights, time: i / 60 }));
    }

    let stalled = 0;
    for (let i = 0; i < field.columnCount; i += 1) {
      if (engine.heads[i] === before[i]) stalled += 1;
    }
    expect(stalled).toBe(0);
  });

  it('drags the columns falling through a form, without stopping any of them', () => {
    // The claim this defends is the one the piece rests on: a form is
    // something the rain *does*, not something drawn on top of it. Before this
    // was wired, the form-slowed speed reached only the glyph mutation phase —
    // characters inside a face churned differently but fell at exactly the
    // same rate as characters outside it, so the face existed only in texture.
    //
    // Measured as accumulated travel rather than final position, because heads
    // wrap and a wrapped column would otherwise read as having gone backwards.
    const travel = (weights: { face: number; figure: number; hand: number }): number[] => {
      const fresh = new RainField(2407);
      fresh.resize(VIEW, 0);
      const rows = fresh.rowCount;
      const heads = fresh.engineInstance.heads;
      const live = fresh.columnCount;
      const previous = new Float64Array(live);
      const total = new Float64Array(live);

      fresh.render(ctx, config({ formWeights: weights }));
      for (let i = 0; i < live; i += 1) previous[i] = heads[i]!;

      for (let frame = 0; frame < 40; frame += 1) {
        fresh.render(ctx, config({ formWeights: weights, time: frame / 60 }));
        for (let i = 0; i < live; i += 1) {
          const raw = (((heads[i]! - previous[i]!) % rows) + rows) % rows;
          total[i]! += Math.min(raw, rows - raw);
          previous[i] = heads[i]!;
        }
      }
      fresh.dispose();
      return Array.from(total);
    };

    const open = travel({ face: 0, figure: 0, hand: 0 });
    const formed = travel({ face: 1, figure: 1, hand: 1 });

    // Somewhere under the masks, the rain is genuinely running slower …
    let dragged = 0;
    for (let i = 0; i < open.length; i += 1) {
      if (formed[i]! < open[i]! - 0.01) dragged += 1;
    }
    expect(dragged).toBeGreaterThan(open.length * 0.1);

    // … and nowhere is it running slower than the floor allows, which is what
    // keeps a silhouette from being assembled out of parked characters.
    for (let i = 0; i < open.length; i += 1) {
      expect(formed[i]!).toBeGreaterThan(open[i]! * 0.5);
      expect(formed[i]!).toBeGreaterThan(0);
    }
  });

  it('renders form regions from slightly further in the past', () => {
    // `temporalDelay` was produced by the modulator and read by nothing. With
    // it routed into the history buffer, a column under dense form draws from
    // an earlier head than the live simulation is at, so the shape reads as
    // marginally out of time with the field around it.
    const lagAt = (
      weights: { face: number; figure: number; hand: number },
      progress: number,
    ): number => {
      const probe = new RainField(2407);
      probe.resize(VIEW, 0);
      // Fill the history ring; against an empty buffer a delay is a no-op.
      for (let i = 0; i < 20; i += 1) {
        probe.render(ctx, config({ formWeights: weights, progress, time: i / 60 }));
      }
      const lag = probe.laggedFrames;
      probe.dispose();
      return lag;
    };

    const none = { face: 0, figure: 0, hand: 0 };
    const full = { face: 1, figure: 1, hand: 1 };

    // No form, no lag: nothing else in a fault-free field asks for history.
    expect(lagAt(none, 0.5)).toBe(0);
    expect(lagAt(full, 0.5)).toBeGreaterThan(0);

    // And the shape falls further out of time as the screen runs on.
    expect(lagAt(full, 1)).toBeGreaterThan(lagAt(full, 0));
  });

  it('draws fewer characters as a form carves void into the field', () => {
    // Averaged over frames, and with all three masks up. A single frame with a
    // single mask moves the count by well under a percent — the face's void is
    // one socket, which is a handful of cells out of a couple of thousand —
    // and asserting on that would be asserting on noise. What is actually
    // being claimed is that void removes rain rather than darkening it, and
    // that claim only has a measurable signature at full form weight.
    const average = (weights: { face: number; figure: number; hand: number }): number => {
      const fresh = new RainField(2407);
      fresh.resize(VIEW, 0);
      let total = 0;
      for (let i = 0; i < 10; i += 1) {
        fresh.render(ctx, config({ formWeights: weights, time: i / 60 }));
        total += fresh.drawnCount;
      }
      fresh.dispose();
      return total / 10;
    };

    const open = average({ face: 0, figure: 0, hand: 0 });
    const carved = average({ face: 1, figure: 1, hand: 1 });
    expect(carved).toBeLessThan(open);
  });

  it('does not exceed its sample capacity under any fault combination', () => {
    const everything = faults({
      intensity: 1,
      phaseError: 1,
      maskDrift: 1,
      frozen: 1,
      directionInversion: 1,
      collapse: 1,
      repeat: 1,
    });
    for (let i = 0; i < 10; i += 1) {
      field.render(
        ctx,
        config({
          chaos: everything,
          formWeights: { face: 1, figure: 1, hand: 1 },
          time: i / 60,
        }),
      );
    }
    // Capacity is cols × maxLength; the loop that fills it breaks on capacity,
    // so exceeding it is a corruption rather than a slowdown.
    const capacity = field.columnCount * Math.ceil(field.engineInstance.maxLength());
    expect(field.drawnCount).toBeLessThanOrEqual(capacity);
  });

  it('slows the whole field toward a stop as collapse arrives', () => {
    const engine = field.engineInstance;
    const travelled = (collapse: number): number => {
      const fresh = new RainField(2407);
      fresh.resize(VIEW, 0);
      const chaos = faults({ intensity: 1, collapse });
      const start = Array.from(fresh.engineInstance.heads.slice(0, 20));
      for (let i = 0; i < 12; i += 1) {
        fresh.render(ctx, config({ chaos, delta: 1 / 60, time: i / 60 }));
      }
      let total = 0;
      for (let i = 0; i < 20; i += 1) {
        total += Math.abs(fresh.engineInstance.heads[i]! - start[i]!);
      }
      fresh.dispose();
      return total;
    };
    expect(travelled(1)).toBeLessThan(travelled(0));
    void engine;
  });

  it('re-grids without losing the field when the viewport changes', () => {
    field.render(ctx, config());
    const wide = field.columnCount;
    field.resize({ ...VIEW, width: 390, height: 844 }, 0);
    field.render(ctx, config({ width: 390, height: 844 }));
    expect(field.columnCount).toBeLessThan(wide);
    expect(field.drawnCount).toBeGreaterThan(50);
  });

  it('renders the same first frame for the same seed', () => {
    const a = new RainField(2407);
    const b = new RainField(2407);
    a.resize(VIEW, 0);
    b.resize(VIEW, 0);
    a.render(ctx, config());
    b.render(ctx, config());
    expect(a.drawnCount).toBe(b.drawnCount);
    a.dispose();
    b.dispose();
  });
});

describe('quality tiers', () => {
  it('gives the minimal tier a smaller, slower field', () => {
    const tier = (quality: QualityTier): number => {
      const field = new RainField(2407);
      field.resize(VIEW, quality);
      const count = field.columnCount;
      field.dispose();
      return count;
    };
    expect(tier(2)).toBeLessThan(tier(0));
  });
});

describe('makeRainConfig', () => {
  it('carries the runtime through and defaults the faults to none', () => {
    const runtime = {
      view: VIEW,
      time: 3,
      delta: 1 / 60,
      experience: { localProgress: 0.4 },
      quality: 1 as QualityTier,
      pointer: POINTER,
      reducedMotion: true,
    };
    const built = makeRainConfig(runtime as never, {
      seed: 99,
      formWeights: { face: 0.5, figure: 0, hand: 0 },
    });
    expect(built.width).toBe(VIEW.width);
    expect(built.cell).toBe(VIEW.cellWidth);
    expect(built.progress).toBe(0.4);
    expect(built.seed).toBe(99);
    expect(built.reducedMotion).toBe(true);
    expect(built.chaos).toBe(NORMAL_CHAOS);
    expect(built.debug).toBe(false);
  });
});

describe('clamp01', () => {
  it('pins values into the unit range', () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(9)).toBe(1);
  });
});
