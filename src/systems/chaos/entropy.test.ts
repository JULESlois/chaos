import { describe, expect, it } from 'vitest';
import {
  IDLE_ONSET_SECONDS,
  computeEntropy,
  entropyToSignalState,
  normaliseIdle,
  normaliseRouteDepth,
  smoothEntropy,
} from './entropy';
import type { EntropyInputs } from './types';

const IDLE: EntropyInputs = {
  pointerVelocity: 0,
  scrollVelocity: 0,
  routeDepth: 0,
  idleDuration: 0,
  anomalyBoost: 0,
};

describe('computeEntropy', () => {
  it('returns the base value when nothing is happening', () => {
    expect(computeEntropy(IDLE)).toBeCloseTo(0.06, 5);
  });

  it('keeps ordinary browsing inside the calm band', () => {
    const browsing = computeEntropy({
      ...IDLE,
      pointerVelocity: 0.3,
      scrollVelocity: 0.35,
      routeDepth: 1,
    });

    // The brief requires normal use to sit between 0.08 and 0.18.
    expect(browsing).toBeGreaterThan(0.08);
    expect(browsing).toBeLessThan(0.18);
  });

  it('clamps out-of-range telemetry instead of trusting it', () => {
    const absurd = computeEntropy({
      pointerVelocity: 40,
      scrollVelocity: 40,
      routeDepth: 99,
      idleDuration: 10_000,
      anomalyBoost: 12,
    });

    expect(absurd).toBeLessThanOrEqual(1);
    // Same result as every input already saturated.
    expect(absurd).toBeCloseTo(
      computeEntropy({
        pointerVelocity: 1,
        scrollVelocity: 1,
        routeDepth: 3,
        idleDuration: 600,
        anomalyBoost: 1,
      }),
      5,
    );
  });

  it('only counts idling after the onset delay', () => {
    expect(normaliseIdle(IDLE_ONSET_SECONDS)).toBe(0);
    expect(normaliseIdle(IDLE_ONSET_SECONDS + 1)).toBeGreaterThan(0);
    expect(normaliseIdle(10_000)).toBe(1);
  });

  it('saturates route depth', () => {
    expect(normaliseRouteDepth(0)).toBe(0);
    expect(normaliseRouteDepth(3)).toBe(1);
    expect(normaliseRouteDepth(9)).toBe(1);
  });
});

describe('entropyToSignalState', () => {
  it('maps each band to its state', () => {
    expect(entropyToSignalState(0.05, false)).toBe('stable');
    expect(entropyToSignalState(0.3, false)).toBe('drift');
    expect(entropyToSignalState(0.5, false)).toBe('alert');
    expect(entropyToSignalState(0.8, false)).toBe('chaos');
    expect(entropyToSignalState(0.99, false)).toBe('silence');
  });

  it('reports stable whenever the viewer has stabilised the system', () => {
    expect(entropyToSignalState(0.99, true)).toBe('stable');
  });
});

describe('smoothEntropy', () => {
  it('rises more slowly than it falls', () => {
    const rise = smoothEntropy(0.2, 0.8, 0.1) - 0.2;
    const fall = 0.8 - smoothEntropy(0.8, 0.2, 0.1);
    expect(fall).toBeGreaterThan(rise);
  });

  it('converges on the target and never leaves 0–1', () => {
    let value = 0.08;
    for (let i = 0; i < 200; i += 1) value = smoothEntropy(value, 0.6, 0.1);
    expect(value).toBeCloseTo(0.6, 3);

    expect(smoothEntropy(0, -5, 1)).toBe(0);
    expect(smoothEntropy(1, 5, 1)).toBe(1);
  });
});
