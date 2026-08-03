import { opSmoothUnion, opSubtract, sdCapsule, sdEllipse } from './sdf';
import type { MaskShape } from './mask-shape';

/**
 * A schematic face.
 *
 * Deliberately not a likeness: an oval, a jaw, two empty sockets and a flat
 * mouth. The point is recognition, not resemblance — the field should resolve
 * into something the reader identifies as a face and then lose it again. A
 * detailed or realistic face would tip the piece from unease into a jump
 * scare, which is exactly what it is trying not to be.
 */
export const faceMask: MaskShape = {
  id: 'face',
  distance(x, y) {
    const skull = sdEllipse(x, y + 0.04, 0.23, 0.3);
    const jaw = sdEllipse(x, y - 0.16, 0.17, 0.16);
    let shape = opSmoothUnion(skull, jaw, 0.09);

    const socketLeft = sdEllipse(x + 0.095, y - 0.02, 0.062, 0.042);
    const socketRight = sdEllipse(x - 0.095, y - 0.02, 0.062, 0.042);
    shape = opSubtract(shape, socketLeft);
    shape = opSubtract(shape, socketRight);

    const mouth = sdCapsule(x, y, -0.07, 0.17, 0.07, 0.17, 0.012);
    shape = opSubtract(shape, mouth);

    return shape;
  },
};
