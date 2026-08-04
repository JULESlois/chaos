/** Small, allocation-free math helpers shared by every rendering system. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

/**
 * Maps `value` from one range to another and clamps the result.
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, clamp01(inverseLerp(inMin, inMax, value)));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(inverseLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent damping factor.
 * Use as: current = lerp(current, target, damp(speed, delta)).
 */
export function damp(speed: number, delta: number): number {
  return 1 - Math.exp(-speed * delta);
}

/** Deterministic 32-bit hash → [0, 1). Used instead of Math.random for stable visuals. */
export function hash01(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Mulberry32 — tiny seeded PRNG for reproducible procedural content. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap 2D value noise. Not gradient noise — adequate for slow field drift. */
export function valueNoise2D(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const n00 = hash01(xi * 374761393 + yi * 668265263);
  const n10 = hash01((xi + 1) * 374761393 + yi * 668265263);
  const n01 = hash01(xi * 374761393 + (yi + 1) * 668265263);
  const n11 = hash01((xi + 1) * 374761393 + (yi + 1) * 668265263);

  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

/** Wraps a value into [0, range). Handles negatives correctly. */
export function wrap(value: number, range: number): number {
  const result = value % range;
  return result < 0 ? result + range : result;
}
export function hashUnit(n: number): number {
  let x = n >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
