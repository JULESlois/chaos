/**
 * Hand-authored low-resolution form masks.
 *
 * Each mask is a `size × size` RGBA buffer sampled in screen-normalised space
 * (0–1, origin top-left). Channels:
 *
 *   R  density / brightness contribution
 *   G  edge / outline highlight
 *   B  depth / speed cue
 *   A  void — characters are suppressed here (negative space, eye sockets)
 *
 * No external assets, no SDF files from the retired mask system. They are
 * generated once at construction and only ever read by the form modulator, so
 * they never become a picture drawn on top of the rain — they are a lookup the
 * rain consults as it passes through.
 */

export interface FormMask {
  readonly size: number;
  /** size*size*4, RGBA, each channel 0–255. */
  readonly data: Uint8Array;
}

export interface MaskSample {
  density: number;
  edge: number;
  depth: number;
  void: number;
}

const RES = 128;

function build(
  paint: (nx: number, ny: number) => { r: number; g: number; b: number; a: number },
): FormMask {
  const size = RES;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const ny = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const { r, g, b, a } = paint(nx, ny);
      const i = (y * size + x) * 4;
      data[i] = clamp255(r);
      data[i + 1] = clamp255(g);
      data[i + 2] = clamp255(b);
      data[i + 3] = clamp255(a);
    }
  }
  return { size, data };
}

function clamp255(v: number): number {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  return (c * 255) | 0;
}

// ── cheap signed-distance helpers (not the retired SDF module) ──

function sdEllipse(nx: number, ny: number, cx: number, cy: number, rx: number, ry: number): number {
  return Math.hypot((nx - cx) / rx, (ny - cy) / ry) - 1;
}

function sdCapsule(
  nx: number,
  ny: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-6;
  let t = ((nx - ax) * dx + (ny - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t;
  const py = ay + dy * t;
  return Math.hypot(nx - px, ny - py) - r;
}

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, (b - a + k) / (2 * k)));
  return a * h + b * (1 - h) - k * h * (1 - h);
}

// ── face: half a face, off-centre, one socket carved, jaw incomplete ──

export const FACE_MASK: FormMask = build((nx, ny) => {
  // Slightly off-centre, biased right, vertically middle.
  const cx = 0.67;
  const cy = 0.49;
  const rx = 0.31;
  const ry = 0.4;

  // Asymmetry: the lower-left of the ellipse is cut away (half a face).
  const half = nx < 0.5 || ny > cy + 0.18 * (1 - Math.abs(nx - cx) / rx) ? -0.6 : 0;

  let field = Math.max(sdEllipse(nx, ny, cx, cy, rx, ry), half);
  // Forehead dissolves upward into the dark.
  field = Math.max(field, smoothMin(field, (ny - 0.16) * 2.2, 0.25));
  // Jaw incomplete: cut the very bottom.
  field = Math.max(field, smoothMin(field, (ny - 0.86) * 3.2, 0.2));

  const fill = -field; // >0 inside
  const inside = clamp01(fill * 3.2);
  const edge = clamp01(-field < 0.04 && -field > -0.14 ? (0.14 + field) / 0.1 : 0);

  // Nose ridge: a narrow bright vertical streak.
  const nose = clamp01((1 - Math.abs(nx - cx) / 0.045) * clamp01(1 - Math.abs(ny - 0.52) / 0.12));

  // Left socket (toward screen edge) carved hard; right socket only partly.
  const socketL = -sdEllipse(nx, ny, cx + 0.085, 0.47, 0.06, 0.05);
  const socketR = -sdEllipse(nx, ny, cx - 0.085, 0.47, 0.05, 0.04);
  const voidL = clamp01(socketL * 4.5);
  const voidR = clamp01(socketR * 2.2) * 0.5;

  const density = clamp01(inside * 0.7 + nose * 0.5);
  const depth = clamp01(inside * 0.6 + nose * 0.6);
  return {
    r: density,
    g: clamp01(edge + nose * 0.4),
    b: depth,
    a: clamp01(Math.max(voidL, voidR)),
  };
});

// ── figure: back of a head and shoulders, lower body lost to rain ──

export const FIGURE_MASK: FormMask = build((nx, ny) => {
  const headC = { x: 0.32, y: 0.4 };
  const head = sdEllipse(nx, ny, headC.x, headC.y, 0.1, 0.12);

  // Shoulders: a wide shallow capsule across the lower torso.
  const shoulder = sdCapsule(nx, ny, 0.16, 0.62, 0.5, 0.62, 0.12);

  // Torso fades downward — only the upper body is coherent.
  const torsoFade = clamp01(1 - Math.max(0, ny - 0.62) / 0.3);

  const body = smoothMin(head, shoulder, 0.12);
  const fill = -body;
  const inside = clamp01(fill * 3) * torsoFade;
  const edge =
    clamp01(fill > -0.02 && fill < 0.12 ? (0.12 - fill) / 0.14 : 0) * 0.9;

  const density = clamp01(inside * 0.8);
  const depth = clamp01(inside * 0.7);
  return { r: density, g: edge, b: depth, a: 0 };
});

// ── hand: fingers reaching in from the right edge, gaps between them ──

export const HAND_MASK: FormMask = build((nx, ny) => {
  // Four finger capsules entering from the right (nx = 1) toward the centre.
  const fingers = [
    { y: 0.34, len: 0.46, r: 0.028 },
    { y: 0.45, len: 0.52, r: 0.03 },
    { y: 0.56, len: 0.5, r: 0.03 },
    { y: 0.67, len: 0.42, r: 0.026 },
  ];
  let nearest = 1e9;
  let tipGlow = 0;
  for (const f of fingers) {
    const d = sdCapsule(nx, ny, 1.02, f.y, 1.02 - f.len, f.y, f.r);
    nearest = Math.min(nearest, d);
    // Hover zone near the fingertip (inner end).
    const tip = -sdEllipse(nx, ny, 1.02 - f.len, f.y, 0.05, 0.04);
    tipGlow = Math.max(tipGlow, clamp01(tip * 3));
  }
  const fill = -nearest;
  const inside = clamp01(fill * 3.5);
  const edge = clamp01(fill > -0.015 && fill < 0.06 ? (0.06 - fill) / 0.075 : 0);

  // Gaps between fingers are void (no characters).
  const gap = clamp01(1 - Math.abs(nearest) / 0.05); // ~1 between fingers (outside)
  const density = clamp01(inside * 0.85 + tipGlow * 0.3);

  return {
    r: density,
    g: clamp01(edge + tipGlow * 0.5),
    b: clamp01(inside * 0.5),
    a: clamp01(gap * (1 - inside)),
  };
});

export function sampleMask(mask: FormMask, nx: number, ny: number): MaskSample {
  const size = mask.size;
  const x = clampCoord(nx) * (size - 1);
  const y = clampCoord(ny) * (size - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * size + x0) * 4;
  const i10 = (y0 * size + x1) * 4;
  const i01 = (y1 * size + x0) * 4;
  const i11 = (y1 * size + x1) * 4;
  const d = mask.data;
  const r = bilerp(d[i00], d[i10], d[i01], d[i11], fx, fy) / 255;
  const g = bilerp(d[i00 + 1], d[i10 + 1], d[i01 + 1], d[i11 + 1], fx, fy) / 255;
  const b = bilerp(d[i00 + 2], d[i10 + 2], d[i01 + 2], d[i11 + 2], fx, fy) / 255;
  const a = bilerp(d[i00 + 3], d[i10 + 3], d[i01 + 3], d[i11 + 3], fx, fy) / 255;
  return { density: r, edge: g, depth: b, void: a };
}

function bilerp(a: number, b: number, c: number, d: number, fx: number, fy: number): number {
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

function clampCoord(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
