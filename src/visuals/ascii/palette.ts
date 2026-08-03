/**
 * The canvas half of the colour system.
 *
 * These stops mirror `src/styles/tokens.css`. They are duplicated here rather
 * than read from `getComputedStyle` because the painter needs them on every
 * frame and a style read is a layout read. If the tokens move, move these.
 *
 * Every stop sits between hue 350° and 356°. There is no second hue anywhere
 * in the renderer, which is why "chromatic aberration" is implemented as a
 * luminance offset instead of a channel split.
 */
export const PINK_STOPS: readonly string[] = [
  '#1d0a0e',
  '#321016',
  '#4e1b23',
  '#6b2933',
  '#91414e',
  '#b75a69',
  '#e68a98',
  '#ffc0c9',
];

export const BUCKET_COUNT = PINK_STOPS.length;
const LAST_BUCKET = BUCKET_COUNT - 1;

/** The single brightest value in the piece. Used sparingly, by design. */
export const PINK_WHITE = '#ffe2e6';

/** Page background. Matches `--void`. */
export const VOID = '#070203';

/**
 * Maps a 0–1 luminance to a bucket index.
 *
 * `ceiling` is the tension controller's `lightIntensity`: it caps how bright
 * the field is allowed to get, so a quiet screen can never accidentally paint
 * a highlight.
 */
export function bucketFor(luminance: number, ceiling: number): number {
  const capped = luminance <= 0 ? 0 : luminance >= 1 ? ceiling : luminance * ceiling;
  let bucket = (capped * LAST_BUCKET + 0.5) | 0;
  if (bucket < 0) bucket = 0;
  else if (bucket > LAST_BUCKET) bucket = LAST_BUCKET;
  return bucket;
}

/** Shifts a bucket down the ladder without leaving it. Used by the ghost. */
export function dimBucket(bucket: number, steps: number): number {
  const next = bucket - steps;
  return next < 0 ? 0 : next > LAST_BUCKET ? LAST_BUCKET : next;
}
