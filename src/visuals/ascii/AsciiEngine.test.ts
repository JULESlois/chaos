import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceStore } from '@/experience/experience-store';
import { EXPERIENCE_PHASES, type SceneId } from '@/experience/phases';
import { TensionController } from '@/systems/tension/tension';
import { signalBus } from '@/utils/signal-bus';
import { AsciiEngine } from './AsciiEngine';
import { GLYPH_COUNT, GLYPH_STRINGS } from './charset';
import type { QualityTier } from './types';

/**
 * A hand-driven animation clock.
 *
 * The engine owns its own rAF loop, so the only way to test it frame by frame
 * is to become the frame source. `step` runs exactly one callback with a
 * timestamp we choose, which makes frame-rate caps and per-frame damping
 * observable instead of a race against the real clock.
 */
class FrameClock {
  private callbacks = new Map<number, FrameRequestCallback>();
  private nextHandle = 1;
  private now = 0;

  readonly request = (callback: FrameRequestCallback): number => {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  };

  readonly cancel = (handle: number): void => {
    this.callbacks.delete(handle);
  };

  get pending(): number {
    return this.callbacks.size;
  }

  /** Runs every queued callback once, `ms` later. */
  step(ms = 16.7): void {
    this.now += ms;
    const due = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of due) callback(this.now);
  }

  run(frames: number, ms = 16.7): void {
    for (let index = 0; index < frames; index += 1) this.step(ms);
  }
}

let clock: FrameClock;
let canvas: HTMLCanvasElement;
let store: ExperienceStore;
let tension: TensionController;
let engines: AsciiEngine[] = [];

function createEngine(quality: QualityTier = 0, reducedMotion = false): AsciiEngine {
  const engine = new AsciiEngine({
    canvas,
    store,
    tension,
    quality,
    maxDpr: 2, // Deliberately above the cap, to prove it is enforced.
    reducedMotion,
  });
  engines.push(engine);
  return engine;
}

/** Scrolls into a screen and gives the engine a frame to notice. */
function goTo(id: SceneId, local = 0.5): void {
  const phase = EXPERIENCE_PHASES.find((entry) => entry.id === id)!;
  store.setProgress(phase.start + (phase.end - phase.start) * local);
  clock.step();
}

beforeEach(() => {
  clock = new FrameClock();
  vi.stubGlobal('requestAnimationFrame', clock.request);
  vi.stubGlobal('cancelAnimationFrame', clock.cancel);

  canvas = document.createElement('canvas');
  // jsdom reports zero for every layout box, so the engine's fallback to
  // window dimensions is what actually sizes the field here.
  Object.defineProperty(canvas, 'clientWidth', { value: 1280, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 800, configurable: true });
  document.body.appendChild(canvas);

  store = new ExperienceStore();
  tension = new TensionController();
});

afterEach(() => {
  for (const engine of engines) engine.dispose();
  engines = [];
  canvas.remove();
  signalBus.clear();
  vi.unstubAllGlobals();
});

describe('the animation loop', () => {
  it('runs exactly one frame loop, and only while started', () => {
    const engine = createEngine();
    expect(engine.isRunning).toBe(false);
    expect(clock.pending).toBe(0);

    engine.start();
    expect(engine.isRunning).toBe(true);

    clock.run(5);
    // One in flight at a time, no matter how many frames have elapsed.
    expect(clock.pending).toBe(1);

    engine.stop();
    clock.step();
    expect(engine.isRunning).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it('ignores a second start rather than opening a second loop', () => {
    const engine = createEngine();
    engine.start();
    engine.start();
    engine.start();

    clock.run(3);
    expect(clock.pending).toBe(1);
  });

  it('stops the loop when the tab is hidden and resumes when it returns', () => {
    const engine = createEngine();
    engine.start();
    clock.run(2);

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.isRunning).toBe(false);

    clock.step();
    expect(clock.pending).toBe(0);

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.isRunning).toBe(true);
    expect(clock.pending).toBe(1);
  });

  it('stops the loop on dispose and cannot be restarted', () => {
    const engine = createEngine();
    engine.start();
    clock.run(2);

    engine.dispose();
    expect(engine.isRunning).toBe(false);
    expect(clock.pending).toBe(0);

    engine.start();
    expect(engine.isRunning).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it('survives dispose being called twice', () => {
    const engine = createEngine();
    engine.start();
    engine.dispose();
    expect(() => engine.dispose()).not.toThrow();
  });

  it('detaches its listeners on dispose', () => {
    const engine = createEngine();
    engine.start();
    engine.dispose();

    // Nothing may still be reacting to input or to the television.
    expect(() => {
      window.dispatchEvent(new Event('pointermove'));
      document.dispatchEvent(new Event('visibilitychange'));
      signalBus.emit('tv:absorb', { rect: null });
      signalBus.emit('tv:release');
    }).not.toThrow();
    expect(engine.isRunning).toBe(false);
    expect(clock.pending).toBe(0);
  });
});

describe('the character budget', () => {
  it('never exceeds the desktop ceiling of 7000', () => {
    const engine = createEngine(0);
    engine.start();

    let peak = 0;
    for (const id of ['void', 'current', 'form', 'chaos', 'silence'] as const) {
      goTo(id, 0.8);
      clock.run(40);
      peak = Math.max(peak, engine.currentBudget);
    }

    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(7000);
  });

  it('holds the mobile tier under 2200', () => {
    const engine = createEngine(2);
    engine.start();

    let peak = 0;
    for (const id of ['current', 'chaos'] as const) {
      goTo(id, 0.8);
      clock.run(40);
      peak = Math.max(peak, engine.currentBudget);
    }

    expect(peak).toBeLessThanOrEqual(2200);
  });

  it('spends less on a reduced tier than on a full one', () => {
    const full = createEngine(0);
    full.start();
    goTo('chaos', 0.8);
    clock.run(60);
    const fullBudget = full.currentBudget;
    // Stopped before the next engine starts: two loops sharing one store
    // would advance it twice per frame and make the comparison meaningless.
    full.stop();
    store.snap(0);
    tension.reset();

    const reduced = createEngine(1);
    reduced.start();
    goTo('chaos', 0.8);
    clock.run(60);

    expect(reduced.currentBudget).toBeLessThan(fullBudget);
  });

  it('drops no glyphs — the painter is sized above the ceiling', () => {
    const engine = createEngine(0);
    engine.start();
    goTo('chaos', 0.85);
    clock.run(80);

    // Overflow would mean the field silently thinned itself.
    expect(engine.painterOverflow).toBe(0);
  });

  it('caps the backing store at 1.5x however dense the display claims to be', () => {
    const engine = createEngine(0);
    // maxDpr was passed as 2 and devicePixelRatio is 1 under jsdom.
    expect(engine.viewport.dpr).toBeLessThanOrEqual(1.5);
    expect(canvas.width).toBeLessThanOrEqual(1280 * 1.5);
  });
});

describe('scene lifecycle', () => {
  it('starts on the void screen', () => {
    const engine = createEngine();
    engine.start();
    clock.run(2);
    expect(engine.activeSceneId).toBe('void');
  });

  it('follows the reader through all six screens', () => {
    const engine = createEngine();
    engine.start();

    const seen: SceneId[] = [];
    for (const id of [
      'void',
      'current',
      'form',
      'chaos',
      'silence',
      'television',
    ] as const) {
      goTo(id);
      clock.run(50);
      seen.push(engine.activeSceneId);
    }

    // The television has no ASCII scene of its own; the field holds silence
    // while the set takes over.
    expect(seen).toEqual(['void', 'current', 'form', 'chaos', 'silence', 'silence']);
  });

  it('enters and exits a scene exactly once per visit', () => {
    const engine = createEngine();
    engine.start();

    const scene = engine.sceneFor('form')!;
    const enter = vi.spyOn(scene, 'enter');
    const exit = vi.spyOn(scene, 'exit');

    goTo('form');
    clock.run(60);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    goTo('chaos');
    clock.run(60);
    expect(exit).toHaveBeenCalledTimes(1);

    // A screen must survive being entered again later.
    goTo('form');
    clock.run(60);
    expect(enter).toHaveBeenCalledTimes(2);
  });

  it('never stacks a third scene when the reader scrubs mid-transition', () => {
    const engine = createEngine();
    engine.start();

    // Jump between screens faster than a crossfade can finish.
    for (const id of ['current', 'form', 'chaos', 'silence', 'form'] as const) {
      goTo(id);
      clock.step();
    }

    clock.run(60);
    expect(engine.activeSceneId).toBe('form');
    expect(engine.isTransitioning).toBe(false);
  });

  it('disposes every scene when the engine goes away', () => {
    const engine = createEngine();
    const disposals = (['void', 'current', 'form', 'chaos', 'silence'] as const).map(
      (id) => vi.spyOn(engine.sceneFor(id)!, 'dispose'),
    );

    engine.start();
    clock.run(4);
    engine.dispose();

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('zeroes the tension on dispose, so nothing survives the stage', () => {
    const engine = createEngine();
    engine.start();
    goTo('chaos', 0.8);
    clock.run(60);
    expect(tension.current.density).toBeGreaterThan(0);

    engine.dispose();
    for (const value of Object.values(tension.current)) expect(value).toBe(0);
  });
});

describe('the restricted alphabets', () => {
  it('gives every screen its own subset of the one glyph table', () => {
    const engine = createEngine();

    for (const id of ['void', 'current', 'form', 'chaos', 'silence'] as const) {
      const charset = engine.sceneFor(id)!.charset;
      expect(charset.length, `${id} has glyphs`).toBeGreaterThan(0);

      for (const glyph of charset) {
        expect(glyph, `${id} indexes the global table`).toBeLessThan(GLYPH_COUNT);
      }
    }
  });

  it('reserves the block characters for the failure screen', () => {
    const engine = createEngine();
    const blocks = [...'█▓▒░'].map((char) => GLYPH_STRINGS.indexOf(char));
    expect(blocks.every((index) => index >= 0)).toBe(true);

    const chaos = new Set(engine.sceneFor('chaos')!.charset);
    for (const glyph of blocks) expect(chaos.has(glyph)).toBe(true);

    for (const id of ['void', 'current', 'form', 'silence'] as const) {
      const charset = new Set(engine.sceneFor(id)!.charset);
      for (const glyph of blocks) {
        expect(charset.has(glyph), `${id} must not use blocks`).toBe(false);
      }
    }
  });
});

describe('the television bridge', () => {
  it('converges onto the rect it is handed and lets go on release', () => {
    const engine = createEngine();
    engine.start();
    goTo('silence');
    clock.run(30);
    expect(engine.absorbing).toBe(false);

    const rect = new DOMRect(320, 180, 640, 480);
    signalBus.emit('tv:absorb', { rect });
    clock.run(60);
    expect(engine.absorbing).toBe(true);

    signalBus.emit('tv:release');
    clock.run(120);
    expect(engine.absorbing).toBe(false);
  });
});

describe('resize', () => {
  it('re-measures without dropping the active scene or leaking a buffer', () => {
    const engine = createEngine();
    engine.start();
    goTo('chaos', 0.6);
    clock.run(40);

    const before = engine.activeSceneId;
    Object.defineProperty(canvas, 'clientWidth', { value: 420, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 900, configurable: true });
    window.dispatchEvent(new Event('resize'));
    engine.remeasure();
    clock.run(40);

    expect(engine.activeSceneId).toBe(before);
    expect(engine.viewport.cols).toBeGreaterThan(0);
    expect(engine.viewport.rows).toBeGreaterThan(0);
    // Narrow viewports drop to 1x and use a larger cell.
    expect(engine.viewport.dpr).toBe(1);
    expect(engine.viewport.fontSize).toBe(15);
  });

  it('survives a degenerate viewport', () => {
    Object.defineProperty(canvas, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 0, configurable: true });

    const engine = createEngine();
    engine.start();
    expect(() => clock.run(10)).not.toThrow();
    expect(engine.viewport.cols).toBeGreaterThanOrEqual(1);
    expect(engine.viewport.rows).toBeGreaterThanOrEqual(1);
  });
});

describe('determinism', () => {
  it('draws the same frame twice from the same seed and the same scroll', () => {
    const trace = (): number[] => {
      const localStore = new ExperienceStore();
      const localTension = new TensionController(0x1234);
      const localClock = new FrameClock();
      vi.stubGlobal('requestAnimationFrame', localClock.request);
      vi.stubGlobal('cancelAnimationFrame', localClock.cancel);

      const engine = new AsciiEngine({
        canvas,
        store: localStore,
        tension: localTension,
        quality: 0,
        maxDpr: 1,
        reducedMotion: false,
      });
      engine.start();

      const phase = EXPERIENCE_PHASES.find((entry) => entry.id === 'chaos')!;
      const budgets: number[] = [];
      for (let frame = 0; frame < 40; frame += 1) {
        localStore.setProgress(phase.start + (phase.end - phase.start) * (frame / 40));
        localClock.step(16.7);
        budgets.push(engine.currentBudget);
      }

      engine.dispose();
      return budgets;
    };

    expect(trace()).toEqual(trace());
  });
});
