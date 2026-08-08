import { GLYPH_STRINGS } from '../charset';
import { PINK_STOPS } from '../palette';

/**
 * Pre-rendered glyph atlas for the transformed flow.
 *
 * The bucket painter draws every character with one `fillText` call, which
 * cannot rotate or scale. The flow needs per-glyph rotation, stretch and depth,
 * so each glyph is baked once into a small transparent canvas at several font
 * sizes and a few luminance layers, and the renderer blits them with
 * `drawImage` under a translate/rotate/scale transform.
 *
 * The atlas is font-only: luminance is baked into the colour of each layer, so
 * the four monochrome stops are the only tones on screen. No new hue is added.
 */

const CANVAS_FONT =
  "'IBM Plex Mono', 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

/** Five clearly separated size tiers, in CSS pixels. */
export const SIZE_TIERS = [9, 13, 20, 32, 56] as const;

/**
 * Four luminance layers, mapping to existing palette stops so the flow shares
 * the piece's single pink ladder:
 *   shadow → #321016, low → #6b2933, main → #e68a98, high → #ffc0c9.
 */
export const LUMINANCE_LAYERS = [1, 2, 6, 7] as const;

/** Supersample factor for crisp glyphs when drawn at large scale. */
const SSA = 2;

export interface AtlasEntry {
  canvas: HTMLCanvasElement;
  /** Glyph cell size in atlas pixels. */
  cell: number;
  /** Glyph cell size to draw at, in CSS pixels (atlas downsampled). */
  draw: number;
}

export class GlyphAtlas {
  private readonly charset: Uint8Array;
  private entries: AtlasEntry[][] = [];
  private built = false;

  constructor(charset: Uint8Array) {
    this.charset = charset;
  }

  get glyphCount(): number {
    return this.charset.length;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /** Builds the offscreen canvases. Idempotent — safe to call every frame. */
  ensure(): void {
    if (this.built) return;
    this.entries = [];
    for (const sizeTier of SIZE_TIERS) {
      const cell = Math.max(4, Math.round(sizeTier * SSA));
      const row: AtlasEntry[] = [];
      for (const layerIndex of LUMINANCE_LAYERS) {
        const color = PINK_STOPS[layerIndex] ?? PINK_STOPS[0]!;
        const canvas = document.createElement('canvas');
        canvas.width = cell * this.charset.length;
        canvas.height = cell;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = color;
          ctx.font = `600 ${sizeTier}px ${CANVAS_FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let g = 0; g < this.charset.length; g += 1) {
            const globalGlyphIndex = this.charset[g]!;
            const char = GLYPH_STRINGS[globalGlyphIndex]!;
            ctx.fillText(char, g * cell + cell / 2, cell / 2);
          }
        }
        row.push({ canvas, cell, draw: sizeTier });
      }
      this.entries.push(row);
    }
    this.built = true;
  }

  /** Forces a rebuild (used by tests to confirm the rebuild path). */
  rebuild(): void {
    this.dispose();
    this.ensure();
  }

  /** The atlas canvas + cell sizes for a size tier and luminance layer. */
  entry(sizeIndex: number, luminanceIndex: number): AtlasEntry | null {
    const row = this.entries[sizeIndex];
    if (!row) return null;
    return row[luminanceIndex] ?? null;
  }

  dispose(): void {
    for (const row of this.entries) {
      for (const entry of row) {
        entry.canvas.width = 1;
        entry.canvas.height = 1;
      }
    }
    this.entries = [];
    this.built = false;
  }
}
