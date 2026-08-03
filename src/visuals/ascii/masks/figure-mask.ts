import { opSmoothUnion, sdCapsule, sdCircle } from './sdf';
import type { MaskShape } from './mask-shape';

/**
 * A standing figure, facing forward, arms at its sides.
 *
 * Read at ASCII resolution this is barely more than a silhouette, which is the
 * intent — it should be unmistakably a person and impossible to identify as
 * any particular one. The stance is symmetrical and still; nothing about the
 * pose is threatening, and the discomfort comes entirely from the fact that it
 * assembles itself while the reader is not moving.
 */
export const figureMask: MaskShape = {
  id: 'figure',
  distance(x, y) {
    const head = sdCircle(x, y + 0.335, 0.062);
    const neck = sdCapsule(x, y, 0, -0.28, 0, -0.235, 0.024);
    let shape = opSmoothUnion(head, neck, 0.03);

    const torso = sdCapsule(x, y, 0, -0.22, 0, 0.03, 0.088);
    shape = opSmoothUnion(shape, torso, 0.05);

    const shoulders = sdCapsule(x, y, -0.105, -0.205, 0.105, -0.205, 0.038);
    shape = opSmoothUnion(shape, shoulders, 0.045);

    const armLeft = sdCapsule(x, y, -0.12, -0.19, -0.145, 0.08, 0.03);
    const armRight = sdCapsule(x, y, 0.12, -0.19, 0.145, 0.08, 0.03);
    shape = opSmoothUnion(shape, armLeft, 0.035);
    shape = opSmoothUnion(shape, armRight, 0.035);

    const legLeft = sdCapsule(x, y, -0.05, 0.0, -0.058, 0.4, 0.042);
    const legRight = sdCapsule(x, y, 0.05, 0.0, 0.058, 0.4, 0.042);
    shape = opSmoothUnion(shape, legLeft, 0.04);
    shape = opSmoothUnion(shape, legRight, 0.04);

    return shape;
  },
};
