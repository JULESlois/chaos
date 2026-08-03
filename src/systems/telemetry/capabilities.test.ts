import { describe, expect, it } from 'vitest';
import {
  asciiCellBudget,
  channelResolution,
  detectCapabilities,
  detectWebGL,
  selectRenderLevel,
  type DeviceCapabilities,
} from './capabilities';

function caps(overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return {
    webgl: true,
    webgl2: true,
    tier: 'high',
    isTouchPrimary: false,
    isNarrowViewport: false,
    prefersReducedMotion: false,
    deviceMemoryGb: 8,
    hardwareConcurrency: 8,
    maxDpr: 1.5,
    renderLevel: 0,
    ...overrides,
  };
}

describe('selectRenderLevel', () => {
  it('falls all the way back to the DOM television without WebGL', () => {
    expect(
      selectRenderLevel({ webgl: false, tier: 'high', prefersReducedMotion: false }),
    ).toBe(3);
  });

  it('prefers the static scene on low-end devices, even with WebGL', () => {
    expect(
      selectRenderLevel({ webgl: true, tier: 'low', prefersReducedMotion: false }),
    ).toBe(2);
  });

  it('uses the reduced tier for mid devices and for reduced motion', () => {
    expect(
      selectRenderLevel({ webgl: true, tier: 'medium', prefersReducedMotion: false }),
    ).toBe(1);
    expect(
      selectRenderLevel({ webgl: true, tier: 'high', prefersReducedMotion: true }),
    ).toBe(1);
  });

  it('only gives the full experience to a capable, motion-tolerant device', () => {
    expect(
      selectRenderLevel({ webgl: true, tier: 'high', prefersReducedMotion: false }),
    ).toBe(0);
  });

  it('never lets a missing context be overridden by a fast device', () => {
    for (const tier of ['high', 'medium', 'low'] as const) {
      expect(selectRenderLevel({ webgl: false, tier, prefersReducedMotion: false })).toBe(
        3,
      );
    }
  });
});

describe('render budgets', () => {
  it('shrinks the ASCII grid on small and slow devices', () => {
    expect(asciiCellBudget(caps({ isNarrowViewport: true }))).toBeLessThan(
      asciiCellBudget(caps({ tier: 'medium' })),
    );
    expect(asciiCellBudget(caps({ tier: 'medium' }))).toBeLessThan(
      asciiCellBudget(caps()),
    );
  });

  it('shrinks the channel canvas on small and slow devices', () => {
    expect(channelResolution(caps({ tier: 'low' }))).toEqual({
      width: 256,
      height: 192,
    });
    expect(channelResolution(caps())).toEqual({ width: 320, height: 240 });
  });
});

describe('detection in this environment', () => {
  it('reports no WebGL under jsdom and therefore render level 3', () => {
    expect(detectWebGL()).toEqual({ webgl: false, webgl2: false });
    expect(detectCapabilities().renderLevel).toBe(3);
  });
});
