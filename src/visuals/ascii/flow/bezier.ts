/**
 * Cubic Bézier math for the authored flow ribbons.
 *
 * Everything is in normalised viewport space: (0,0) is the top-left, (1,1) the
 * bottom-right, and values may run a little outside [0,1] so a ribbon can enter
 * from off-screen and leave again. The flow is built from hand-placed curves,
 * never from a noise field, so the composition is decided by the path, not by
 * the simulator.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface CubicBezierSegment {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
}

/** Point on a single cubic segment at `t` (0–1). */
export function cubicPoint(segment: CubicBezierSegment, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * segment.p0.x + b * segment.p1.x + c * segment.p2.x + d * segment.p3.x,
    y: a * segment.p0.y + b * segment.p1.y + c * segment.p2.y + d * segment.p3.y,
  };
}

/**
 * Tangent (first derivative) of a single segment at `t`.
 *
 * Not normalised — callers that need a direction should normalise, but the raw
 * magnitude is useful because it stays continuous across a C1 join, which is
 * what makes the character rotation continuous along the whole ribbon.
 */
export function cubicTangent(segment: CubicBezierSegment, t: number): Vec2 {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return {
    x: a * (segment.p1.x - segment.p0.x) + b * (segment.p2.x - segment.p1.x) + c * (segment.p3.x - segment.p2.x),
    y: a * (segment.p1.y - segment.p0.y) + b * (segment.p2.y - segment.p1.y) + c * (segment.p3.y - segment.p2.y),
  };
}

/** Direction angle (radians) of a segment tangent, for rotating glyphs. */
export function segmentAngle(segment: CubicBezierSegment, t: number): number {
  const tangent = cubicTangent(segment, t);
  return Math.atan2(tangent.y, tangent.x);
}

/**
 * Walks a multi-segment path. `u` in [0,1] is mapped evenly across segments,
 * so a two-segment ribbon spends half its length in each. The join between
 * segments is C1 by construction (see the default ribbons), which keeps the
 * tangent — and therefore the glyph rotation — continuous.
 */
export function samplePath(
  segments: readonly CubicBezierSegment[],
  u: number,
): { point: Vec2; angle: number } {
  const count = segments.length;
  if (count === 0) return { point: { x: 0, y: 0 }, angle: 0 };
  if (count === 1) {
    const segment = segments[0]!;
    return { point: cubicPoint(segment, u), angle: segmentAngle(segment, u) };
  }

  const clamped = u <= 0 ? 0 : u >= 1 ? 0.999999 : u;
  const scaled = clamped * count;
  const index = Math.min(count - 1, Math.floor(scaled));
  const local = scaled - index;
  const segment = segments[index]!;
  return { point: cubicPoint(segment, local), angle: segmentAngle(segment, local) };
}

/** Samples `samples` points along a path for drawing debug guides. */
export function samplePathPoints(
  segments: readonly CubicBezierSegment[],
  samples: number,
): Vec2[] {
  const points: Vec2[] = [];
  const steps = Math.max(2, samples);
  for (let i = 0; i <= steps; i += 1) {
    points.push(samplePath(segments, i / steps).point);
  }
  return points;
}
