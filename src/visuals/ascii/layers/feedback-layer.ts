import { lerp } from '@/utils/math';
import { VOID } from '../palette';
import type { AsciiRuntime, AsciiViewport, FrameLayer } from '../types';

/**
 * Bounds on the feedback transform.
 *
 * These are narrow on purpose. Frame feedback is a positive-feedback loop: an
 * opacity above ~0.95 or a scale far from 1 does not "look more intense", it
 * saturates the canvas to a solid block within a second and stays there. The
 * ranges below are the widest that still decay.
 */
const OPACITY_MIN = 0.82;
const OPACITY_MAX = 0.94;
const SCALE_MIN = 0.998;
const SCALE_MAX = 1.008;
const ROTATION_LIMIT = 0.002;

/**
 * Layer D — the frame feedback buffer.
 *
 * Each frame the previous frame is redrawn slightly scaled and rotated before
 * anything new is painted on top. Characters therefore leave trails that
 * spiral rather than simply fading, which is what makes the chaos screen feel
 * like a signal degrading through a loop instead of a particle system with
 * motion blur.
 *
 * Exactly one offscreen buffer is retained. It is sized to the backing store,
 * reallocated only on resize, and released on dispose.
 */
export class FeedbackLayer implements FrameLayer {
  readonly id = 'feedback';

  private buffer: HTMLCanvasElement | null = null;
  private bufferCtx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private primed = false;

  resize(view: AsciiViewport): void {
    this.width = view.width;
    this.height = view.height;

    const pixelWidth = Math.max(1, Math.round(view.width * view.dpr));
    const pixelHeight = Math.max(1, Math.round(view.height * view.dpr));

    if (!this.buffer) {
      this.buffer = document.createElement('canvas');
      this.bufferCtx = this.buffer.getContext('2d', { alpha: false });
    }
    if (!this.buffer) return;

    if (this.buffer.width !== pixelWidth || this.buffer.height !== pixelHeight) {
      this.buffer.width = pixelWidth;
      this.buffer.height = pixelHeight;
      // A resized buffer holds nothing meaningful; start the loop again.
      this.primed = false;
    }
  }

  /** Paints the background, plus the decayed previous frame if enabled. */
  before(runtime: AsciiRuntime): void {
    const { ctx, tension } = runtime;
    const amount = tension.feedbackAmount;

    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, this.width, this.height);

    if (amount <= 0.01 || !this.buffer || !this.primed) return;

    const opacity = lerp(OPACITY_MIN, OPACITY_MAX, amount);
    const scale = lerp(SCALE_MIN, SCALE_MAX, amount);
    const rotation = (runtime.tension.temporalOffset * 2 - 1) * ROTATION_LIMIT * amount;

    const centreX = this.width * 0.5;
    const centreY = this.height * 0.5;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(centreX, centreY);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-centreX, -centreY);
    ctx.drawImage(this.buffer, 0, 0, this.width, this.height);
    ctx.restore();
  }

  /** Stores the finished frame for the next pass. */
  after(runtime: AsciiRuntime): void {
    const context = this.bufferCtx;
    const buffer = this.buffer;
    if (!context || !buffer) return;

    if (runtime.tension.feedbackAmount <= 0.01) {
      // Nothing will read the buffer next frame; skip the blit entirely and
      // mark it stale so the loop restarts cleanly when feedback returns.
      this.primed = false;
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(runtime.ctx.canvas, 0, 0, buffer.width, buffer.height);
    this.primed = true;
  }

  dispose(): void {
    if (this.buffer) {
      // Collapsing to 1×1 releases the backing store immediately rather than
      // waiting for the canvas element to be collected.
      this.buffer.width = 1;
      this.buffer.height = 1;
    }
    this.buffer = null;
    this.bufferCtx = null;
    this.primed = false;
  }
}
