/**
 * One global glyph table for the whole piece.
 *
 * Everything downstream refers to characters by their index in this string,
 * never by the character itself. That is what lets the painter store glyphs in
 * a `Uint8Array` and look up a pre-split single-character string at draw time,
 * so a frame with seven thousand characters allocates nothing.
 *
 * Scenes restrict themselves to a subset — the piece should read as one
 * alphabet losing its composure, not as five different alphabets.
 */
export const GLYPHS =
  " .'`,:;·˙-_~=+*^|/\\<>()[]{}!?ilrctuvxzTLYJICOQ0123456789%&$#@█▓▒░ABDEF";

/** Pre-split so `fillText` never receives a freshly allocated string. */
export const GLYPH_STRINGS: readonly string[] = Array.from(GLYPHS);

export const GLYPH_COUNT = GLYPH_STRINGS.length;

/**
 * Turns a human-readable character list into indices into `GLYPHS`.
 * Characters missing from the table are dropped rather than silently
 * rendering as a different glyph.
 */
export function makeCharset(chars: string): Uint8Array {
  const indices: number[] = [];
  for (const char of chars) {
    const index = GLYPH_STRINGS.indexOf(char);
    if (index >= 0) indices.push(index);
  }
  if (indices.length === 0) {
    throw new Error(`[ascii] charset "${chars}" contains no known glyphs`);
  }
  return Uint8Array.from(indices);
}

/**
 * Per-screen alphabets, ordered from emptiest to densest so a charset can be
 * indexed directly by an intensity value.
 */
export const CHARSETS = {
  /** Almost nothing. Dust, and the suggestion of a grid. */
  void: makeCharset(" .'`,·˙:"),
  /** Soft, directional marks — the band should read as motion, not code. */
  current: makeCharset(".,'` :;~-_/()[]{}"),
  /** A clean density ramp, so a silhouette reads as a silhouette. */
  form: makeCharset(" .:;+*ctuxzTICO0%&#@"),
  /** Everything, including the blocks. Reserved for the failure screen. */
  chaos: makeCharset(" .:;-_~=+*^|/\\<>!?%&$#@█▓▒░"),
  /** Vertical marks that survive being scaled down to a vanishing point. */
  silence: makeCharset(" .·:'|ilr"),
} as const;

export type CharsetName = keyof typeof CHARSETS;

/** Picks a glyph for a 0–1 intensity. Never reads outside the charset. */
export function glyphFor(charset: Uint8Array, intensity: number): number {
  const last = charset.length - 1;
  let index = (intensity * last + 0.5) | 0;
  if (index < 0) index = 0;
  else if (index > last) index = last;
  return charset[index]!;
}
