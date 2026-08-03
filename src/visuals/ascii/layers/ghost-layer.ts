import { GlyphSnapshot, type GlyphPainter } from '../GlyphPainter';
import { dimBucket } from '../palette';
import type { AsciiLayer, AsciiRuntime, AsciiViewport } from '../types';

/** Two history frames plus the live one give the three time-offset layers. */
const HISTORY = 2;

/**
 * Layer E — the same-hue ghost.
 *
 * The chaos screen is supposed to show three copies of itself separated in
 * time. The obvious implementation — three simulations — costs three times as
 * much and drifts out of phase. Instead the painter's queue from the previous
 * frames is replayed at a lower rung of the same pink ladder and a small
 * spatial offset.
 *
 * Because the copies come from the same simulation there is no divergence, and
 * because they only ever move down the luminance ladder there is no second hue
 * anywhere on screen: this is what replaces RGB channel separation.
 */
export class GhostLayer implements AsciiLayer {
  readonly id = 'ghost';

  private readonly frames: GlyphSnapshot[];
  private cursor = 0;
  private stored = 0;
  private width = 1;

  constructor(capacity: number) {
    this.frames = [];
    for (let index = 0; index < HISTORY; index += 1) {
      this.frames.push(new GlyphSnapshot(capacity));
    }
  }

  resize(view: AsciiViewport): void {
    this.width = view.width;
    // History from a different viewport would replay in the wrong places.
    for (const frame of this.frames) frame.clear();
    this.stored = 0;
  }

  /** Records the scene's own glyphs. Must run before `replay`. */
  capture(painter: GlyphPainter): void {
    const frame = this.frames[this.cursor]!;
    painter.captureInto(frame);
    this.cursor = (this.cursor + 1) % HISTORY;
    if (this.stored < HISTORY) this.stored += 1;
  }

  /**
   * Appends the stored frames, dimmed and displaced.
   *
   * The number of copies scales with `temporalOffset`, so quiet screens pay
   * nothing and only the chaos screen carries all three layers. Pushes are
   * capped by the painter's remaining room, so the ghost can never crowd out
   * the live frame.
   */
  replay(runtime: AsciiRuntime): void {
    const separation = runtime.tension.temporalOffset;
    if (separation <= 0.02 || this.stored === 0) return;

    const copies = Math.min(this.stored, separation > 0.55 ? HISTORY : 1);
    const painter = runtime.painter;

    for (let copy = 0; copy < copies; copy += 1) {
      // Walk backwards from the most recent capture.
      const slot = (this.cursor - 1 - copy + HISTORY * 2) % HISTORY;
      const frame = this.frames[slot]!;
      if (frame.count === 0) continue;

      const age = copy + 1;
      const shift = separation * this.width * 0.006 * age;
      const dim = 2 + age;
      const alpha = 0.5 / age;

      const allowed = Math.min(frame.count, painter.remaining);
      for (let index = 0; index < allowed; index += 1) {
        painter.push(
          frame.xs[index]! - shift,
          frame.ys[index]!,
          frame.glyphs[index]!,
          dimBucket(frame.buckets[index]!, dim),
          alpha,
        );
      }
    }
  }

  /** Drops the history — used when a scene changes so trails do not bleed. */
  clear(): void {
    for (const frame of this.frames) frame.clear();
    this.stored = 0;
    this.cursor = 0;
  }

  dispose(): void {
    this.clear();
    this.frames.length = 0;
  }
}
