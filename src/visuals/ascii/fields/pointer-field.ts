import type { PointerState } from '../types';

export interface Vec2 {
  x: number;
  y: number;
}

/** Radius, in normalised viewport units, of the pointer's dead zone. */
export const OBSTACLE_RADIUS = 0.16;
/** Radius of the swirl the pointer drags behind it. */
export const WAKE_RADIUS = 0.28;

/**
 * The pointer as an obstacle.
 *
 * Characters are pushed out of a soft disc around the cursor. The falloff is
 * quadratic so the boundary of the disc is not a visible ring — the field just
 * gets quietly emptier as you approach the middle.
 */
export function addPointerObstacle(
  out: Vec2,
  nx: number,
  ny: number,
  pointer: Readonly<PointerState>,
  strength: number,
): void {
  if (!pointer.active || strength <= 0) return;

  const dx = nx - pointer.x;
  const dy = ny - pointer.y;
  const distanceSquared = dx * dx + dy * dy;
  const radiusSquared = OBSTACLE_RADIUS * OBSTACLE_RADIUS;
  if (distanceSquared >= radiusSquared || distanceSquared < 1e-8) return;

  const distance = Math.sqrt(distanceSquared);
  const falloff = 1 - distance / OBSTACLE_RADIUS;
  const push = (falloff * falloff * strength) / distance;
  out.x += dx * push;
  out.y += dy * push;
}

/**
 * The pointer as a wake.
 *
 * A moving cursor drags the field along with it and spins the edges of that
 * drag, which is what makes the current screen feel like a fluid rather than a
 * particle system with a hole in it. A stationary cursor produces no wake at
 * all, so the effect always reads as a consequence of movement.
 */
export function addPointerWake(
  out: Vec2,
  nx: number,
  ny: number,
  pointer: Readonly<PointerState>,
  strength: number,
): void {
  if (!pointer.active || strength <= 0) return;
  if (pointer.speed < 1e-3) return;

  const dx = nx - pointer.x;
  const dy = ny - pointer.y;
  const distanceSquared = dx * dx + dy * dy;
  const radiusSquared = WAKE_RADIUS * WAKE_RADIUS;
  if (distanceSquared >= radiusSquared) return;

  const falloff = 1 - distanceSquared / radiusSquared;
  const drag = falloff * falloff * strength;

  // Along the direction of travel…
  out.x += pointer.vx * drag;
  out.y += pointer.vy * drag;

  // …plus a perpendicular component, which is the part that curls.
  const swirl = drag * 0.55;
  out.x += -pointer.vy * swirl * Math.sign(dx || 1);
  out.y += pointer.vx * swirl * Math.sign(dy || 1);
}
