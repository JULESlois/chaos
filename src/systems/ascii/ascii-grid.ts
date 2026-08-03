import type { AsciiGridMetrics } from './types';

/**
 * Character ramp ordered from lowest to highest visual density.
 * Index into this with a normalised intensity to get a glyph.
 */
export const GLYPH_RAMP = [
  ' ',
  '.',
  ':',
  ';',
  '_',
  '-',
  '+',
  '=',
  '*',
  '/',
  '\\',
  '|',
  '░',
  '#',
  '%',
  '▒',
  '@',
  '▓',
  '█',
] as const;

/** Secondary sets sampled for texture rather than density. */
export const BINARY_GLYPHS = ['0', '1'] as const;
export const BOX_GLYPHS = ['╱', '╲', '─', '│', '┼'] as const;

export const RAMP_LENGTH = GLYPH_RAMP.length;

/**
 * Chooses a grid that fits the cell budget while keeping cells roughly
 * proportional to a monospace glyph (about 0.6 width-to-height).
 */
export function computeGridMetrics(
  viewportWidth: number,
  viewportHeight: number,
  cellBudget: number,
  maxDpr: number,
): AsciiGridMetrics {
  const dpr = Math.min(
    maxDpr,
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  );

  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const aspect = width / height;

  // Solve rows * columns <= budget with columns/rows ≈ aspect / glyphAspect.
  const glyphAspect = 0.58;
  const ratio = aspect / glyphAspect;
  let rows = Math.max(6, Math.round(Math.sqrt(cellBudget / ratio)));
  let columns = Math.max(8, Math.round(rows * ratio));

  // Shrink until inside the budget — at most a few iterations.
  while (rows * columns > cellBudget && rows > 6 && columns > 8) {
    rows -= 1;
    columns = Math.max(8, Math.round(rows * ratio));
  }

  const cellWidth = width / columns;
  const cellHeight = height / rows;

  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    pixelWidth: Math.round(width * dpr),
    pixelHeight: Math.round(height * dpr),
    dpr,
    fontSize: cellHeight * 0.92,
  };
}

/** Maps a normalised intensity to a glyph from the density ramp. */
export function glyphForIntensity(intensity: number): string {
  const index = Math.min(
    RAMP_LENGTH - 1,
    Math.max(0, Math.floor(intensity * RAMP_LENGTH)),
  );
  return GLYPH_RAMP[index];
}

/** Glyph ramp index, exposed separately so buffers can store a byte. */
export function rampIndexForIntensity(intensity: number): number {
  return Math.min(RAMP_LENGTH - 1, Math.max(0, Math.floor(intensity * RAMP_LENGTH)));
}
