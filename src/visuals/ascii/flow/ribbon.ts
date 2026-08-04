import { clamp, clamp01, lerp } from '@/utils/math';
import type { CubicBezierSegment, Vec2 } from './bezier';
import { samplePath } from './bezier';

/**
 * A hand-authored stream of characters.
 *
 * The path is the composition: a glyph's on-screen position is derived from a
 * point on the curve plus a lateral offset, never from an independent random
 * (x, y). Every profile is a small lookup table sampled across the path, so a
 * ribbon reads as one designed object rather than a particle system.
 */
export interface RibbonDefinition {
  id: string;
  path: CubicBezierSegment[];
  /** Normalised half-width of the band at points along the path. */
  widthProfile: readonly number[];
  /** Relative glyph density along the path. */
  densityProfile: readonly number[];
  /** Travel speed along the path (u per second) at points along it. */
  speedProfile: readonly number[];
  /** Base luminance (0–1) along the path. */
  luminanceProfile: readonly number[];
  /** [near, far] visual depth range for glyphs on this ribbon. */
  depthRange: readonly [number, number];
  seed: number;
}

/** Per-glyph instance state. Deterministic from `seed` + index. */
export interface RibbonGlyphState {
  /** Position along the curve, 0–1. */
  u: number;
  /** Lateral offset from the centre line, in [-1, 1] (× width at draw time). */
  lateral: number;
  /** Visual depth, 0 (far) – 1 (near). */
  depth: number;
  /** Multiplier on the path speed for this glyph. */
  speed: number;
  /** Stable per-instance individuality. */
  seed: number;
  /** Glyph table index. */
  glyphIndex: number;
}

/**
 * A reusable sample of a ribbon, also the interface FORM will consume later to
 * re-shape the same stream into a body outline. The current scene only reads
 * `x`/`y`/`width`/`density`; the vectors are provided so a future scene can
 * bend the path without re-implementing the sampler.
 */
export interface RibbonSample {
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
  width: number;
  density: number;
}

/** Linearly interpolates a profile table across `u` in [0,1]. */
export function sampleProfile(profile: readonly number[], u: number): number {
  const n = profile.length;
  if (n === 0) return 0;
  if (n === 1) return profile[0]!;
  const scaled = clamp01(clamp(u, 0, 1)) * (n - 1);
  const index = Math.min(n - 2, Math.floor(scaled));
  const f = scaled - index;
  return lerp(profile[index]!, profile[index + 1]!, f);
}

export interface RibbonSampleResult {
  point: Vec2;
  angle: number;
  tangentX: number;
  tangentY: number;
  width: number;
  density: number;
  speed: number;
  luminance: number;
}

/** Full ribbon sample at `u`, resolving every profile. */
export function sampleRibbon(def: RibbonDefinition, u: number): RibbonSampleResult {
  const { point, angle } = samplePath(def.path, u);
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  return {
    point,
    angle,
    tangentX: tx,
    tangentY: ty,
    width: sampleProfile(def.widthProfile, u),
    density: sampleProfile(def.densityProfile, u),
    speed: sampleProfile(def.speedProfile, u),
    luminance: sampleProfile(def.luminanceProfile, u),
  };
}

/**
 * The main ribbon: enters lower-left, bends up through the middle, tightens
 * around an off-centre focus near (0.62, 0.46), and leaves to the right.
 *
 * The two segments share a C1 join (control points are collinear at the seam,
 * p2→p3→p1), so the tangent — and therefore the character rotation — never
 * jumps at the midpoint.
 */
export const MAIN_RIBBON: RibbonDefinition = {
  id: 'main',
  path: [
    { p0: { x: -0.12, y: 0.78 }, p1: { x: -0.02, y: 0.30 }, p2: { x: 0.40, y: 0.50 }, p3: { x: 0.62, y: 0.46 } },
    { p0: { x: 0.62, y: 0.46 }, p1: { x: 0.84, y: 0.42 }, p2: { x: 0.98, y: 0.30 }, p3: { x: 1.12, y: 0.22 } },
  ],
  // entry wide → middle narrow → focus briefly thick → exit thin.
  widthProfile: [0.15, 0.08, 0.18, 0.025],
  densityProfile: [0.7, 1.0, 1.0, 0.4],
  speedProfile: [0.018, 0.028, 0.035, 0.05],
  luminanceProfile: [0.32, 0.55, 0.95, 0.4],
  depthRange: [0.15, 1.0],
  seed: 1204,
};

/**
 * The secondary ribbon: dimmer, thinner, smaller, slightly out of focus. It
 * crosses from lower-left to upper-right on a different axis to balance the
 * main band and add depth without forming a regular lattice with it.
 */
export const SECONDARY_RIBBON: RibbonDefinition = {
  id: 'secondary',
  path: [
    { p0: { x: 0.12, y: 1.08 }, p1: { x: 0.18, y: 0.55 }, p2: { x: 0.52, y: 0.30 }, p3: { x: 0.76, y: -0.10 } },
  ],
  widthProfile: [0.05, 0.035, 0.025],
  densityProfile: [0.5, 0.7, 0.4],
  speedProfile: [0.012, 0.02, 0.03],
  luminanceProfile: [0.18, 0.28, 0.16],
  depthRange: [0.0, 0.55],
  seed: 7741,
};

/** Off-centre focus the composition anchors on. */
export const FOCUS: Readonly<Vec2> = { x: 0.64, y: 0.43 };
