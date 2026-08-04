import { describe, expect, it } from 'vitest';
import { cubicPoint, cubicTangent, samplePath } from './bezier';
import { MAIN_RIBBON } from './ribbon';

describe('cubic bezier sampling', () => {
  it('passes through its endpoints', () => {
    const seg = MAIN_RIBBON.path[0]!;
    const start = cubicPoint(seg, 0);
    const end = cubicPoint(seg, 1);
    expect(start.x).toBeCloseTo(seg.p0.x, 6);
    expect(start.y).toBeCloseTo(seg.p0.y, 6);
    expect(end.x).toBeCloseTo(seg.p3.x, 6);
    expect(end.y).toBeCloseTo(seg.p3.y, 6);
  });

  it('is C0 continuous at the segment join', () => {
    const seg0 = MAIN_RIBBON.path[0]!;
    const seg1 = MAIN_RIBBON.path[1]!;
    const end = cubicPoint(seg0, 1);
    const next = cubicPoint(seg1, 0);
    expect(end.x).toBeCloseTo(next.x, 6);
    expect(end.y).toBeCloseTo(next.y, 6);
  });

  it('is C1 continuous at the segment join (tangent direction)', () => {
    const seg0 = MAIN_RIBBON.path[0]!;
    const seg1 = MAIN_RIBBON.path[1]!;
    const tEnd = cubicTangent(seg0, 1);
    const tStart = cubicTangent(seg1, 0);
    expect(tEnd.x).toBeCloseTo(tStart.x, 5);
    expect(tEnd.y).toBeCloseTo(tStart.y, 5);
  });

  it('keeps the sampled angle continuous across the whole path', () => {
    const before = samplePath(MAIN_RIBBON.path, 0.499999).angle;
    const after = samplePath(MAIN_RIBBON.path, 0.500001).angle;
    let diff = Math.abs(before - after);
    if (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
    expect(diff).toBeLessThan(1e-3);
  });
});
