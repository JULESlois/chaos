import type { FormSample, FormWeights } from './rain-types';
import { FACE_MASK, FIGURE_MASK, HAND_MASK, sampleMask, type FormMask } from './masks';

const MASKS: Record<keyof FormWeights, FormMask> = {
  face: FACE_MASK,
  figure: FIGURE_MASK,
  hand: HAND_MASK,
};

const KEYS: (keyof FormWeights)[] = ['face', 'figure', 'hand'];

/** A reusable sample record. Callers own theirs; the modulator allocates none. */
export function createFormSample(): FormSample {
  return { density: 0, edge: 0, depth: 0, voidValue: 0, temporalDelay: 0 };
}

/**
 * Turns the three form masks into a single modulation at a screen point.
 *
 * The modulator is pure lookup. It does not know about columns, characters or
 * time-of-character. The rain engine asks it, per sampled glyph, "what should
 * happen to the rain passing through here?" and gets back a small set of
 * multipliers written into a caller-owned record. Forms therefore have no
 * position of their own — they are behaviours the rain falls into and out of,
 * and nothing here can move a character to a coordinate.
 */
export class FormModulator {
  private weights: FormWeights = { face: 0, figure: 0, hand: 0 };

  /** CHAOS only: the masks slide sideways against the rain that draws them. */
  private driftX = 0;
  private driftY = 0;

  setWeights(weights: FormWeights): void {
    this.weights = weights;
  }

  getWeights(): FormWeights {
    return this.weights;
  }

  setDrift(x: number, y = 0): void {
    this.driftX = x;
    this.driftY = y;
  }

  /** True when at least one form is contributing. Lets callers skip work. */
  get active(): boolean {
    const w = this.weights;
    return w.face > 0.001 || w.figure > 0.001 || w.hand > 0.001;
  }

  sample(out: FormSample, nx: number, ny: number, time: number, progress: number): FormSample {
    out.density = 0;
    out.edge = 0;
    out.depth = 0;
    out.voidValue = 0;
    out.temporalDelay = 0;
    if (!this.active) return out;

    const sx = nx + this.driftX;
    const sy = ny + this.driftY;

    let density = 0;
    let edge = 0;
    let depth = 0;
    let voidValue = 0;

    for (let i = 0; i < KEYS.length; i += 1) {
      const key = KEYS[i]!;
      const w = this.weights[key];
      if (w <= 0.001) continue;
      const m = sampleMask(MASKS[key], sx, sy);
      density += m.density * w;
      edge += m.edge * w;
      depth += m.depth * w;
      // Void is a carve: the strongest void at a point wins.
      if (m.void * w > voidValue) voidValue = m.void * w;
    }

    out.density = clamp01(density);
    out.edge = clamp01(edge);
    out.depth = clamp01(depth);
    out.voidValue = clamp01(voidValue);

    // A coherent form holds its characters a touch longer; later progress lets
    // the delay grow so the shape can read as slightly out of time.
    out.temporalDelay = clamp01(out.density * (0.03 + progress * 0.04));

    // `time` is accepted so callers can phase-shift masks if they ever need
    // to, but the static masks need no time term themselves.
    void time;

    return out;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
