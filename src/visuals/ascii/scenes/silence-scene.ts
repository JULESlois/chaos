import { glassStrength } from '@/systems/signal/reveal-state';
import { smoothstep } from '@/utils/math';
import { CHARSETS } from '../charset';
import type { AsciiRuntime, AsciiScene, AsciiViewport, QualityTier } from '../types';

/**
 * Screen five — SILENCE.
 *
 * The rain does not leave; it stops. Almost every column is frozen mid-fall, so
 * the field reads as a paused frame of something that was moving a second ago,
 * with the last coherent anatomy still faintly held in it. Every few seconds
 * the signal tries once — a short re-scan runs down a handful of columns and
 * fails again.
 *
 * The other thing that happens here is the leak, and it is all this class does
 * now. Scanlines, a vignette and then the faint curved edge of a screen bleed
 * in from nowhere and sit *over* the field. Nothing has moved and no camera has
 * appeared, but by the end of the screen the reader is looking at something
 * with a border. That border is the television, and TELEVISION only has to pull
 * back from it.
 *
 * The stopping of the rain is `SILENCE_PRESET`; the field belongs to the engine.
 */
export class SilenceScene implements AsciiScene {
  readonly id = 'silence';
  readonly charset = CHARSETS.silence;

  private quality: QualityTier = 0;
  private width = 1;
  private height = 1;
  private vignette: CanvasGradient | null = null;
  private vignetteDirty = true;

  enter(runtime: AsciiRuntime): void {
    this.quality = runtime.quality;
  }

  update(): void {
    // Rain parameters live in SILENCE_PRESET.
  }

  render(runtime: AsciiRuntime): void {
    this.renderBoundaryLeak(runtime);
  }

  /**
   * The television boundary, bleeding in.
   *
   * Drawn in the page's own coordinates, not in the WebGL scene — the point is
   * that the frame arrives *before* the object it belongs to, so the epilogue
   * can begin already inside a screen instead of cutting to one.
   *
   * It is a stand-in, and it knows it. Once the camera starts backing out, the
   * CRT shader begins drawing the same optics for real, and this fades out at
   * the rate that one fades in. Leaving it up would scanline every frame twice
   * — once here and once in the shader sampling this very canvas.
   */
  private renderBoundaryLeak(runtime: AsciiRuntime): void {
    const p = runtime.experience.localProgress;
    const leak = smoothstep(0.18, 0.98, p) * (1 - glassStrength());
    if (leak <= 0.01) return;

    const ctx = runtime.ctx;
    const w = this.width;
    const h = this.height;
    if (this.vignetteDirty) this.buildVignette(ctx);
    ctx.save();

    // Scanlines. Spaced by device, never below two CSS pixels.
    if (!runtime.reducedMotion || leak > 0.5) {
      const spacing = this.quality === 2 ? 6 : 4;
      const roll = (runtime.time * 22) % spacing;
      ctx.fillStyle = `rgba(0,0,0,${0.1 + leak * 0.24})`;
      for (let y = -spacing + roll; y < h; y += spacing) {
        ctx.fillRect(0, y, w, 1);
      }
    }

    // Vignette, cached per size.
    if (this.vignette) {
      ctx.globalAlpha = leak * 0.85;
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // The curved edge of the glass. Inset grows as the screen "recedes" a
    // little inside the viewport, so TELEVISION starts from a shape that is
    // already there instead of introducing one.
    const inset = leak * Math.min(w, h) * 0.035;
    const radius = Math.min(w, h) * (0.05 + leak * 0.05);
    ctx.strokeStyle = `rgba(255,176,190,${leak * 0.16})`;
    ctx.lineWidth = 1 + leak * 1.5;
    roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, radius);
    ctx.stroke();

    ctx.restore();
  }

  exit(): void {
    // Nothing retained. The field carries on frozen because TELEVISION_PRESET
    // opens where SILENCE_PRESET left off, not because this class held it.
  }

  resize(view: AsciiViewport): void {
    this.width = view.width;
    this.height = view.height;
    this.vignetteDirty = true;
  }

  /** Built from the live context, cached until the next resize. */
  private buildVignette(ctx: CanvasRenderingContext2D): void {
    this.vignetteDirty = false;
    const w = this.width;
    const h = this.height;
    const g = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.25,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0.78)');
    this.vignette = g;
  }

  dispose(): void {
    this.vignette = null;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
