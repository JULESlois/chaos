import { opSmoothUnion, sdCapsule, sdEllipse } from './sdf';
import type { MaskShape } from './mask-shape';

interface Finger {
  readonly baseX: number;
  readonly baseY: number;
  readonly tipX: number;
  readonly tipY: number;
  readonly radius: number;
}

/** Four fingers fanning up, plus a thumb across the palm. */
const FINGERS: readonly Finger[] = [
  { baseX: -0.105, baseY: -0.02, tipX: -0.15, tipY: -0.245, radius: 0.026 },
  { baseX: -0.035, baseY: -0.05, tipX: -0.05, tipY: -0.31, radius: 0.028 },
  { baseX: 0.035, baseY: -0.05, tipX: 0.048, tipY: -0.3, radius: 0.028 },
  { baseX: 0.1, baseY: -0.02, tipX: 0.14, tipY: -0.235, radius: 0.025 },
];

const THUMB: Finger = {
  baseX: -0.11,
  baseY: 0.06,
  tipX: -0.235,
  tipY: -0.055,
  radius: 0.032,
};

/**
 * An open hand, palm toward the reader.
 *
 * The hand is the shape that carries the most intent in the piece — a face is
 * a presence, but a hand is a gesture, and the reader reads it as being aimed
 * at them. It is built from capsules smooth-unioned into the palm so the
 * knuckles have no seam.
 */
export const handMask: MaskShape = {
  id: 'hand',
  distance(x, y) {
    let shape = sdEllipse(x, y + 0.06, 0.145, 0.135);

    for (let index = 0; index < FINGERS.length; index += 1) {
      const finger = FINGERS[index]!;
      const digit = sdCapsule(
        x,
        y,
        finger.baseX,
        finger.baseY,
        finger.tipX,
        finger.tipY,
        finger.radius,
      );
      shape = opSmoothUnion(shape, digit, 0.035);
    }

    const thumb = sdCapsule(x, y, THUMB.baseX, THUMB.baseY, THUMB.tipX, THUMB.tipY, THUMB.radius);
    shape = opSmoothUnion(shape, thumb, 0.045);

    const wrist = sdCapsule(x, y, 0, 0.16, 0, 0.32, 0.075);
    shape = opSmoothUnion(shape, wrist, 0.05);

    return shape;
  },
};
