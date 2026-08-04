import { describe, expect, it } from 'vitest';
import { FormModulator, createFormSample } from './form-modulator';
import { FACE_MASK, FIGURE_MASK, HAND_MASK, sampleMask } from './masks';
import type { FormSample, FormWeights } from './rain-types';

/**
 * The modulator is where the piece's central claim is either true or false.
 *
 * A form is supposed to be a *behaviour of the rain* — slower here, brighter
 * there, absent in the socket — and not a picture placed on top of it. That
 * distinction is architectural, and it is enforced by what the modulator is
 * physically capable of returning: five scalars at a coordinate, no position,
 * no character, no glyph. The tests below assert the shape of that contract as
 * much as the values, because the day someone adds an `x` to `FormSample` is
 * the day the rain stops being the medium.
 */

function read(
  weights: Partial<FormWeights>,
  nx: number,
  ny: number,
  progress = 0.5,
): FormSample {
  const modulator = new FormModulator();
  modulator.setWeights({ face: 0, figure: 0, hand: 0, ...weights });
  return modulator.sample(createFormSample(), nx, ny, 0, progress);
}

/** Scans a mask for its strongest point in a channel. Used to aim assertions. */
function peak(
  mask: { size: number; data: Uint8Array },
  channel: 0 | 1 | 2 | 3,
): { nx: number; ny: number; value: number } {
  let best = { nx: 0, ny: 0, value: -1 };
  for (let y = 0; y < mask.size; y += 1) {
    for (let x = 0; x < mask.size; x += 1) {
      const value = mask.data[(y * mask.size + x) * 4 + channel]! / 255;
      if (value > best.value) {
        best = { nx: (x + 0.5) / mask.size, ny: (y + 0.5) / mask.size, value };
      }
    }
  }
  return best;
}

describe('the form sample contract', () => {
  it('carries modulation and nothing that could place a character', () => {
    const sample = read({ face: 1 }, 0.67, 0.49);
    // If this list ever grows a coordinate, the form has stopped being a
    // behaviour and started being a layout.
    expect(Object.keys(sample).sort()).toEqual([
      'density',
      'depth',
      'edge',
      'temporalDelay',
      'voidValue',
    ]);
  });

  it('keeps every channel inside the unit range', () => {
    const modulator = new FormModulator();
    modulator.setWeights({ face: 1, figure: 1, hand: 1 });
    const out = createFormSample();
    for (let i = 0; i <= 40; i += 1) {
      for (let j = 0; j <= 40; j += 1) {
        const s = modulator.sample(out, i / 40, j / 40, 3, 1);
        for (const value of [s.density, s.edge, s.depth, s.voidValue, s.temporalDelay]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('writes into the caller\'s record rather than allocating one', () => {
    const modulator = new FormModulator();
    modulator.setWeights({ face: 1, figure: 0, hand: 0 });
    const out = createFormSample();
    expect(modulator.sample(out, 0.5, 0.5, 0, 0)).toBe(out);
  });
});

describe('weights', () => {
  it('reports itself inactive at zero, and skips the lookup entirely', () => {
    const modulator = new FormModulator();
    modulator.setWeights({ face: 0, figure: 0, hand: 0 });
    expect(modulator.active).toBe(false);

    const s = modulator.sample(createFormSample(), 0.67, 0.49, 0, 0.5);
    expect(s.density).toBe(0);
    expect(s.edge).toBe(0);
    expect(s.depth).toBe(0);
    expect(s.voidValue).toBe(0);
  });

  it('wakes as soon as any one form is contributing', () => {
    const modulator = new FormModulator();
    modulator.setWeights({ face: 0, figure: 0, hand: 0.4 });
    expect(modulator.active).toBe(true);
  });

  it('scales density with weight', () => {
    const point = peak(FACE_MASK, 0);
    const quiet = read({ face: 0.25 }, point.nx, point.ny);
    const loud = read({ face: 1 }, point.nx, point.ny);
    expect(loud.density).toBeGreaterThan(quiet.density);
  });
});

describe('the masks', () => {
  it('puts the face where a face is, and nothing outside it', () => {
    const point = peak(FACE_MASK, 0);
    expect(read({ face: 1 }, point.nx, point.ny).density).toBeGreaterThan(0.4);
    // Far top-left is outside the face ellipse in every direction.
    expect(read({ face: 1 }, 0.04, 0.04).density).toBeLessThan(0.05);
  });

  it('carves the eye socket as void, not as darkness', () => {
    const socket = peak(FACE_MASK, 3);
    const sample = read({ face: 1 }, socket.nx, socket.ny);
    expect(sample.voidValue).toBeGreaterThan(0.4);
  });

  it('gives the figure a head and shoulders and loses the lower body', () => {
    const body = read({ figure: 1 }, 0.3, 0.45).density;
    const shoulders = read({ figure: 1 }, 0.3, 0.62).density;
    const legs = read({ figure: 1 }, 0.3, 0.85).density;
    expect(body).toBeGreaterThan(0.5);
    expect(shoulders).toBeLessThan(body);
    // Only the upper body is coherent; below the shoulders the figure is
    // simply rain again, with nothing modulating it.
    expect(legs).toBe(0);
  });

  it('reaches the hand in from the right and stops where the fingers end', () => {
    // The fingers enter at nx = 1 and reach about half way across. Left of the
    // fingertips the mask contributes nothing at all — the hand is at the edge
    // of the frame, not floating in the middle of it.
    for (const nx of [0.1, 0.2, 0.3, 0.4]) {
      expect(read({ hand: 1 }, nx, 0.45).density).toBe(0);
    }
    expect(read({ hand: 1 }, 0.5, 0.45).density).toBeGreaterThan(0.2);
  });

  it('puts void in the gaps between the fingers', () => {
    // Sampled along a column that crosses all four fingers. On a finger there
    // is rain; between them there is a hole. The absolute density is low this
    // far from the fingertips, so what matters is the relationship.
    const onFinger = read({ hand: 1 }, 0.9, 0.45);
    const between = read({ hand: 1 }, 0.9, 0.39);
    expect(onFinger.density).toBeGreaterThan(between.density);
    expect(between.voidValue).toBeGreaterThan(onFinger.voidValue);
  });
});

describe('overlap', () => {
  it('lets two forms contribute at the same point without clipping to one', () => {
    const point = { nx: 0.5, ny: 0.55 };
    const face = read({ face: 1 }, point.nx, point.ny).density;
    const figure = read({ figure: 1 }, point.nx, point.ny).density;
    const both = read({ face: 1, figure: 1 }, point.nx, point.ny).density;
    // Summed, then clamped — so the pair is at least as strong as either, and
    // the forms bleed into one another rather than switching over.
    expect(both).toBeGreaterThanOrEqual(Math.max(face, figure) - 1e-6);
  });

  it('takes the strongest void rather than adding them up', () => {
    const socket = peak(FACE_MASK, 3);
    const alone = read({ face: 1 }, socket.nx, socket.ny).voidValue;
    const withOthers = read({ face: 1, figure: 1, hand: 1 }, socket.nx, socket.ny).voidValue;
    expect(withOthers).toBeCloseTo(alone, 5);
  });
});

describe('drift', () => {
  it('slides the mask sideways against the rain that draws it', () => {
    const modulator = new FormModulator();
    modulator.setWeights({ face: 1, figure: 0, hand: 0 });
    const out = createFormSample();
    const point = peak(FACE_MASK, 0);

    const centred = modulator.sample(out, point.nx, point.ny, 0, 0.5).density;
    modulator.setDrift(0.2, 0);
    const drifted = modulator.sample(out, point.nx, point.ny, 0, 0.5).density;

    // This is the CHAOS fault where the anatomy and the medium visibly stop
    // agreeing: the same screen point now reads a different part of the face.
    expect(drifted).not.toBeCloseTo(centred, 3);
  });

  it('restores the original reading when the drift is cleared', () => {
    const modulator = new FormModulator();
    modulator.setWeights({ face: 1, figure: 0, hand: 0 });
    const out = createFormSample();
    const before = modulator.sample(out, 0.6, 0.5, 0, 0.5).density;
    modulator.setDrift(0.3, 0.1);
    modulator.sample(out, 0.6, 0.5, 0, 0.5);
    modulator.setDrift(0, 0);
    expect(modulator.sample(out, 0.6, 0.5, 0, 0.5).density).toBeCloseTo(before, 6);
  });
});

describe('temporal delay', () => {
  it('grows with density and with progress, and is zero in empty rain', () => {
    const point = peak(FACE_MASK, 0);
    const early = read({ face: 1 }, point.nx, point.ny, 0).temporalDelay;
    const late = read({ face: 1 }, point.nx, point.ny, 1).temporalDelay;
    expect(late).toBeGreaterThan(early);
    expect(read({ face: 1 }, 0.02, 0.02, 1).temporalDelay).toBeLessThan(0.005);
  });
});

describe('mask sampling', () => {
  it('interpolates between texels rather than stepping', () => {
    // Taken across the figure's shoulder edge, where consecutive texels
    // genuinely differ. A nearest-neighbour lookup would return the same value
    // for a half-texel step anywhere; bilinear lands in between.
    const size = FIGURE_MASK.size;
    const a = sampleMask(FIGURE_MASK, 0.105, 0.62).density;
    const b = sampleMask(FIGURE_MASK, 0.105 + 1 / size, 0.62).density;
    const mid = sampleMask(FIGURE_MASK, 0.105 + 0.5 / size, 0.62).density;
    expect(a).not.toBe(b);
    expect(mid).toBeGreaterThan(Math.min(a, b));
    expect(mid).toBeLessThan(Math.max(a, b));
  });

  it('clamps out-of-range coordinates instead of wrapping', () => {
    const left = sampleMask(HAND_MASK, -3, 0.5);
    const edge = sampleMask(HAND_MASK, 0, 0.5);
    expect(left.density).toBeCloseTo(edge.density, 6);
  });
});
