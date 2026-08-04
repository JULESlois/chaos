import { makeCharset } from '../charset';
import type { QualityTier } from '../types';
import { DEFAULT_RAIN_CONFIG, type RainConfig } from './rain-types';

/**
 * The rain alphabet.
 *
 * Directional marks and digits first, a few letters for the suggestion of
 * signal, a handful of bracket glyphs for structure. Deliberately *not* the
 * green Matrix head character, and never emoji or block walls. Kept inside the
 * shared glyph table so it reads as the same alphabet the rest of the piece
 * uses, just a sparser slice.
 */
export const RAIN_CHARS = '.,:\'"`|/\\-_=+~^<>0123456789()[]{}!?@#$%&*·¦×÷±╱╲';
export const RAIN_CHARSET = makeCharset(RAIN_CHARS);
export const RAIN_CHARSET_SPARSE = makeCharset('.,:\'"`|/\\-_=+~^<>0123456789()[]{}!?@#$%&*');

export const BOOT_CHARS = '.:-_=+|01#%';
export const BOOT_CHARSET = makeCharset(BOOT_CHARS);

export interface WeightedGlyphGroup {
  chars: string;
  weight: number;
}

export const RAIN_GROUPS: WeightedGlyphGroup[] = [
  { chars: '.,:\'"`', weight: 0.32 },
  { chars: '|/\\-_=+~^<>', weight: 0.28 },
  { chars: '0123456789', weight: 0.20 },
  { chars: '()[]{}', weight: 0.10 },
  { chars: '!?@#$%&*', weight: 0.08 },
  { chars: '·¦×÷±╱╲', weight: 0.02 },
];

export const BOOT_LOCAL_INDICES = new Uint8Array(BOOT_CHARS.length);
for (let i = 0; i < BOOT_CHARS.length; i++) {
  BOOT_LOCAL_INDICES[i] = RAIN_CHARS.indexOf(BOOT_CHARS[i]!);
}

const RAIN_GROUP_INDICES: { indices: Uint8Array; weight: number }[] = RAIN_GROUPS.map((g) => {
  const indices = new Uint8Array(g.chars.length);
  for (let i = 0; i < g.chars.length; i++) {
    indices[i] = RAIN_CHARS.indexOf(g.chars[i]!);
  }
  return { indices, weight: g.weight };
});

export function pickRainGlyph(seedVal: number, mix: number): number {
  let totalWeight = 0;
  for (let i = 0; i < RAIN_GROUP_INDICES.length; i++) {
    const w = RAIN_GROUP_INDICES[i]!.weight;
    totalWeight += (i >= 3) ? w * mix : w;
  }
  
  let w = seedVal * totalWeight;
  for (let i = 0; i < RAIN_GROUP_INDICES.length; i++) {
    const group = RAIN_GROUP_INDICES[i]!;
    const groupWeight = (i >= 3) ? group.weight * mix : group.weight;
    if (w < groupWeight) {
      const idx = Math.floor((w / groupWeight) * group.indices.length);
      return group.indices[idx]!;
    }
    w -= groupWeight;
  }
  return 0; // Fallback
}

export interface RainGrid {
  cols: number;
  rows: number;
  /** Glyph cell size in CSS pixels. */
  cell: number;
}

const DESKTOP_CELL = 13;
const MOBILE_CELL = 12;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Column/row count derived from the viewport and the spec's suggested grids.
 * Desktop: 80–150 columns, 45–90 rows. Mobile: 35–70 columns, 45–85 rows.
 */
export function gridFor(width: number, height: number, quality: QualityTier): RainGrid {
  const narrow = width < 768;
  const cell = narrow ? MOBILE_CELL : DESKTOP_CELL;
  let cols: number;
  let rows: number;
  if (narrow) {
    cols = clamp(Math.round(width / 9), 35, 70);
    rows = clamp(Math.round(height / 11), 45, 85);
  } else {
    cols = clamp(Math.round(width / 12), 80, 150);
    rows = clamp(Math.round(height / 14), 45, 90);
  }
  // Low tiers thin the grid further.
  if (quality === 2) {
    cols = Math.round(cols * 0.7);
    rows = Math.round(rows * 0.8);
  }
  return { cols, rows, cell };
}

export const DESKTOP_RAIN_CONFIG: RainConfig = {
  ...DEFAULT_RAIN_CONFIG,
  reverseRatio: 0.09,
  speedMin: 6,
  speedMax: 17,
  lengthMin: 8,
  lengthMax: 34,
};

export const MOBILE_RAIN_CONFIG: RainConfig = {
  ...DEFAULT_RAIN_CONFIG,
  reverseRatio: 0.11,
  speedMin: 5,
  speedMax: 13,
  lengthMin: 7,
  lengthMax: 26,
};

export function configFor(quality: QualityTier): RainConfig {
  return quality === 2 ? MOBILE_RAIN_CONFIG : DESKTOP_RAIN_CONFIG;
}
