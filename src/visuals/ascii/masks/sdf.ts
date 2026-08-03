/**
 * Signed distance helpers, in mask-local space.
 *
 * Masks are authored inside a [-0.5, 0.5] square with y pointing down. A
 * negative distance is inside the shape. Everything here is a closed-form
 * expression — no lookup tables and no sampling — so a mask can be evaluated
 * per character per frame without a texture or a cache.
 */

export function sdCircle(px: number, py: number, radius: number): number {
  return Math.hypot(px, py) - radius;
}

/**
 * Approximate ellipse distance. Exact ellipse SDFs need an iterative solve;
 * this scaled-circle approximation is off by a few percent near the flat
 * sides, which is invisible once the result is quantised into glyphs.
 */
export function sdEllipse(px: number, py: number, rx: number, ry: number): number {
  const scaled = Math.hypot(px / rx, py / ry);
  return (scaled - 1) * Math.min(rx, ry);
}

export function sdCapsule(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
): number {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denominator = bax * bax + bay * bay;
  const h = denominator === 0 ? 0 : Math.max(0, Math.min(1, (pax * bax + pay * bay) / denominator));
  return Math.hypot(pax - bax * h, pay - bay * h) - radius;
}

/** Polynomial smooth minimum — joins limbs without a visible seam. */
export function opSmoothUnion(d1: number, d2: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (d2 - d1)) / k));
  return d2 * (1 - h) + d1 * h - k * h * (1 - h);
}

export function opUnion(d1: number, d2: number): number {
  return d1 < d2 ? d1 : d2;
}

/** Carves `hole` out of `shape`. */
export function opSubtract(shape: number, hole: number): number {
  return shape > -hole ? shape : -hole;
}
