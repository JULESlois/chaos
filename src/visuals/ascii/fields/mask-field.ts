import { createRng } from '@/utils/math';
import type { MaskShape } from '../masks/mask-shape';

/**
 * A mask turned into something a particle system can aim at.
 *
 * Two products are precomputed once per shape:
 *
 *   `points`  — a blue-ish scatter of positions inside the shape, used as
 *               attractor targets. Precomputing beats rejection-sampling per
 *               frame, and because the sampler is seeded the same character
 *               always heads for the same spot, so a shape reassembles the way
 *               it disassembled instead of reshuffling.
 *
 *   `edge`    — how far each target sits from the outline, which the mask
 *               layer uses to pick a brighter glyph for the silhouette than
 *               for the fill.
 *
 * Nothing here is aspect-corrected: the layer that consumes the points maps
 * mask space into viewport space, so one mask works at any window shape.
 */
export class MaskField {
  readonly shape: MaskShape;
  /** Interleaved x,y pairs in mask-local space. */
  readonly points: Float32Array;
  /** 0 at the centre of the shape, 1 right on the outline. */
  readonly edge: Float32Array;
  readonly count: number;

  constructor(shape: MaskShape, count: number, seed = 0x51_ed) {
    this.shape = shape;
    const rng = createRng(seed);
    const points = new Float32Array(count * 2);
    const edge = new Float32Array(count);

    let placed = 0;
    let attempts = 0;
    // Bounded so a degenerate mask cannot spin here forever; a shape that
    // cannot fill its quota simply renders sparser.
    const maxAttempts = count * 60;

    while (placed < count && attempts < maxAttempts) {
      attempts += 1;
      const x = rng() - 0.5;
      const y = rng() - 0.5;
      const distance = shape.distance(x, y);
      if (distance > 0) continue;

      points[placed * 2] = x;
      points[placed * 2 + 1] = y;
      // Depth of 0.06 mask units is treated as "fully interior".
      const depth = Math.min(1, -distance / 0.06);
      edge[placed] = 1 - depth;
      placed += 1;
    }

    this.points = points;
    this.edge = edge;
    this.count = placed;
  }

  /** Soft coverage at a mask-local point, 1 inside and 0 well outside. */
  coverage(x: number, y: number, softness = 0.02): number {
    const distance = this.shape.distance(x, y);
    if (distance <= -softness) return 1;
    if (distance >= softness) return 0;
    const t = 0.5 - distance / (2 * softness);
    return t * t * (3 - 2 * t);
  }
}
