import type { Vec2 } from './pointer-field';

/** How far inside the edge the boundary flow starts pushing back. */
const MARGIN = 0.08;

/**
 * Scroll as a shear.
 *
 * Scrolling does not translate the field — it slides the top and bottom of it
 * in opposite directions. The result is that a flick of the wheel visibly
 * strains the current rather than moving it, which keeps the sense that the
 * page is one continuous surface being deformed.
 */
export function addScrollShear(
  out: Vec2,
  _nx: number,
  ny: number,
  velocity: number,
  direction: number,
  strength: number,
): void {
  if (strength <= 0 || velocity <= 0) return;
  const centred = ny - 0.5;
  out.x += centred * velocity * direction * strength;
  out.y += velocity * direction * strength * 0.12;
}

/**
 * Keeps the field inside the viewport without a hard wall.
 *
 * Particles that wander past the margin get an inward nudge proportional to
 * how far out they are. Without this the flow field slowly evacuates the
 * corners and the composition drifts off one edge.
 */
export function addBoundaryFlow(out: Vec2, nx: number, ny: number, strength: number): void {
  if (strength <= 0) return;

  if (nx < MARGIN) out.x += ((MARGIN - nx) / MARGIN) * strength;
  else if (nx > 1 - MARGIN) out.x -= ((nx - (1 - MARGIN)) / MARGIN) * strength;

  if (ny < MARGIN) out.y += ((MARGIN - ny) / MARGIN) * strength;
  else if (ny > 1 - MARGIN) out.y -= ((ny - (1 - MARGIN)) / MARGIN) * strength;
}
