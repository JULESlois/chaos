import { describe, expect, it } from 'vitest';
import { CHARSETS } from '../charset';
import { GlyphAtlas } from './glyph-atlas';
import { FlowRenderer, defaultLayerIntensity, type FlowRenderConfig } from './flow-renderer';

function makeConfig(over: Partial<FlowRenderConfig> = {}): FlowRenderConfig {
  return {
    width: 1440,
    height: 900,
    dpr: 1,
    time: 6,
    progress: 0.52,
    seed: 1204,
    quality: 0,
    pointer: { x: 0.5, y: 0.5, active: false },
    scrollVelocity: 0,
    density: 1,
    sizeScale: 1,
    layerIntensity: defaultLayerIntensity(),
    debug: false,
    delta: 1 / 60,
    ...over,
  };
}

function fakeCtx(): CanvasRenderingContext2D {
  return document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
}

function arraysClose(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i]! - b[i]!) > 1e-6) return false;
  }
  return true;
}

describe('GlyphAtlas lifecycle', () => {
  it('builds once and reuses on repeat ensure', () => {
    const atlas = new GlyphAtlas(CHARSETS.current);
    atlas.ensure();
    expect(atlas.isBuilt).toBe(true);
    const first = atlas.entry(0, 0)!.canvas;
    atlas.ensure();
    expect(atlas.entry(0, 0)!.canvas).toBe(first); // reused, not rebuilt
  });

  it('rebuild produces a fresh set of canvases', () => {
    const atlas = new GlyphAtlas(CHARSETS.current);
    atlas.ensure();
    const first = atlas.entry(0, 0)!.canvas;
    atlas.rebuild();
    expect(atlas.isBuilt).toBe(true);
    expect(atlas.entry(0, 0)!.canvas).not.toBe(first);
  });

  it('releases on dispose', () => {
    const atlas = new GlyphAtlas(CHARSETS.current);
    atlas.ensure();
    atlas.dispose();
    expect(atlas.isBuilt).toBe(false);
  });
});

describe('FlowRenderer', () => {
  it('builds within the capacity ceiling and draws glyphs', () => {
    const renderer = new FlowRenderer(CHARSETS.current);
    renderer.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig());
    expect(renderer.builtCapacity).toBeGreaterThanOrEqual(350);
    expect(renderer.builtCapacity).toBeLessThanOrEqual(1400);
    expect(renderer.debugU0.length).toBe(renderer.builtCapacity);
    expect(renderer.drawn).toBeGreaterThan(0);
    expect(renderer.drawn).toBeLessThanOrEqual(renderer.builtCapacity + 400);
    renderer.dispose();
  });

  it('lays out the same instances for the same seed', () => {
    const a = new FlowRenderer(CHARSETS.current);
    const b = new FlowRenderer(CHARSETS.current);
    a.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig({ seed: 1204 }));
    b.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig({ seed: 1204 }));
    expect(arraysClose(a.debugU0, b.debugU0)).toBe(true);
    expect(a.drawn).toBe(b.drawn);
    a.dispose();
    b.dispose();
  });

  it('changes the layout for a different seed', () => {
    const a = new FlowRenderer(CHARSETS.current);
    const b = new FlowRenderer(CHARSETS.current);
    a.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig({ seed: 1204 }));
    b.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig({ seed: 9921 }));
    expect(arraysClose(a.debugU0, b.debugU0)).toBe(false);
    a.dispose();
    b.dispose();
  });

  it('is stable at a fixed lab time', () => {
    const renderer = new FlowRenderer(CHARSETS.current);
    renderer.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig({ time: 6 }));
    const first = renderer.currentU(6);
    renderer.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig({ time: 6 }));
    const second = renderer.currentU(6);
    expect(arraysClose(first, second)).toBe(true);
    renderer.dispose();
  });

  it('wraps glyphs back to the ribbon entry instead of letting them escape', () => {
    const renderer = new FlowRenderer(CHARSETS.current);
    renderer.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig());
    const u = renderer.currentU(137); // far future
    for (let i = 0; i < u.length; i += 1) {
      expect(u[i]!).toBeGreaterThanOrEqual(0);
      expect(u[i]!).toBeLessThan(1);
    }
    renderer.dispose();
  });

  it('spends fewer glyphs on the mobile tier than the desktop tier', () => {
    const desktop = new FlowRenderer(CHARSETS.current);
    const mobile = new FlowRenderer(CHARSETS.current);
    desktop.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig({ quality: 0 }));
    mobile.render(fakeCtx(), { width: 390, height: 844 }, makeConfig({ quality: 2 }));
    expect(mobile.builtCapacity).toBeLessThan(desktop.builtCapacity);
    expect(mobile.builtCapacity).toBeGreaterThanOrEqual(350);
    expect(mobile.builtCapacity).toBeLessThanOrEqual(700);
    desktop.dispose();
    mobile.dispose();
  });

  it('stops drawing after dispose', () => {
    const renderer = new FlowRenderer(CHARSETS.current);
    renderer.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig());
    expect(renderer.drawn).toBeGreaterThan(0);
    renderer.dispose();
    renderer.render(fakeCtx(), { width: 1440, height: 900 }, makeConfig());
    expect(renderer.drawn).toBe(0);
  });
});
