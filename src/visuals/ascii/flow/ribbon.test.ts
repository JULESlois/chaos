import { describe, expect, it } from 'vitest';
import { FOCUS, MAIN_RIBBON, SECONDARY_RIBBON, sampleProfile, sampleRibbon } from './ribbon';

describe('ribbon profiles', () => {
  it('interpolates a profile table across u', () => {
    const profile = [0.15, 0.08, 0.18, 0.025];
    expect(sampleProfile(profile, 0)).toBeCloseTo(0.15, 6);
    expect(sampleProfile(profile, 1)).toBeCloseTo(0.025, 6);
    expect(sampleProfile(profile, 0.5)).toBeCloseTo(0.13, 6);
  });

  it('leaves the table endpoints intact for a single entry', () => {
    expect(sampleProfile([0.4], 0)).toBeCloseTo(0.4, 6);
    expect(sampleProfile([0.4], 1)).toBeCloseTo(0.4, 6);
  });

  it('main ribbon has a wide entry, a narrow middle and a thick focus', () => {
    expect(sampleRibbon(MAIN_RIBBON, 0).width).toBeCloseTo(0.15, 5);
    // Near the off-centre focus the band briefly thickens.
    expect(sampleRibbon(MAIN_RIBBON, 0.66).width).toBeGreaterThan(0.17);
    expect(sampleRibbon(MAIN_RIBBON, 1).width).toBeCloseTo(0.025, 5);
  });

  it('secondary ribbon is thinner than the main one', () => {
    const main = sampleRibbon(MAIN_RIBBON, 0.5).width;
    const secondary = sampleRibbon(SECONDARY_RIBBON, 0.5).width;
    expect(secondary).toBeLessThan(main);
  });

  it('anchors the focus off-centre', () => {
    expect(FOCUS.x).toBeGreaterThan(0.6);
    expect(FOCUS.x).toBeLessThan(0.7);
    expect(FOCUS.y).toBeGreaterThan(0.38);
    expect(FOCUS.y).toBeLessThan(0.5);
  });
});
