import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_PHASES,
  SCENE_IDS,
  TOTAL_HEIGHT_VH,
  localProgressAt,
  phaseAt,
} from './phases';

describe('the phase table', () => {
  it('declares the six screens in narrative order', () => {
    expect(SCENE_IDS).toEqual([
      'void',
      'current',
      'form',
      'chaos',
      'silence',
      'television',
    ]);
  });

  it('is 800vh — inside the 700–900vh the piece is designed around', () => {
    expect(TOTAL_HEIGHT_VH).toBe(800);
    expect(TOTAL_HEIGHT_VH).toBeGreaterThanOrEqual(700);
    expect(TOTAL_HEIGHT_VH).toBeLessThanOrEqual(900);
  });

  it('covers 0–1 with no gap and no overlap between phases', () => {
    expect(EXPERIENCE_PHASES[0]!.start).toBe(0);
    expect(EXPERIENCE_PHASES[EXPERIENCE_PHASES.length - 1]!.end).toBeCloseTo(1, 10);

    for (let index = 1; index < EXPERIENCE_PHASES.length; index += 1) {
      expect(EXPERIENCE_PHASES[index]!.start).toBeCloseTo(
        EXPERIENCE_PHASES[index - 1]!.end,
        10,
      );
    }
  });

  it('derives each range from its own height rather than a second table', () => {
    for (const phase of EXPERIENCE_PHASES) {
      expect(phase.end - phase.start).toBeCloseTo(phase.heightVh / TOTAL_HEIGHT_VH, 10);
    }
  });
});

describe('phaseAt', () => {
  it('returns a phase for every value, including out-of-range ones', () => {
    for (const progress of [-5, -0.001, 0, 0.5, 1, 1.001, 42]) {
      expect(phaseAt(progress)).toBeDefined();
    }
    expect(phaseAt(-1).id).toBe('void');
    expect(phaseAt(2).id).toBe('television');
  });

  it('puts the boundary at the start of the following phase', () => {
    const chaos = EXPERIENCE_PHASES.find((phase) => phase.id === 'chaos')!;
    expect(phaseAt(chaos.start).id).toBe('chaos');
    // The end of a phase already belongs to the next one.
    expect(phaseAt(chaos.end).id).toBe('silence');
  });

  it('agrees with the phase each midpoint belongs to', () => {
    for (const phase of EXPERIENCE_PHASES) {
      expect(phaseAt((phase.start + phase.end) / 2).id).toBe(phase.id);
    }
  });
});

describe('localProgressAt', () => {
  it('runs 0 to 1 across a phase', () => {
    const form = EXPERIENCE_PHASES.find((phase) => phase.id === 'form')!;
    expect(localProgressAt(form.start)).toBe(0);
    expect(localProgressAt((form.start + form.end) / 2)).toBeCloseTo(0.5, 10);
    // Sampled just inside the top, since the end belongs to the next phase.
    expect(localProgressAt(form.end - 1e-9, form)).toBeCloseTo(1, 6);
  });

  it('clamps rather than reporting a value outside its own phase', () => {
    const chaos = EXPERIENCE_PHASES.find((phase) => phase.id === 'chaos')!;
    expect(localProgressAt(0, chaos)).toBe(0);
    expect(localProgressAt(1, chaos)).toBe(1);
  });
});
