/**
 * The one surface the whole piece is drawn on.
 *
 * There is exactly one code-rain field in this project. The full-screen page
 * draws it, and the television shows it — not a second rain seeded the same
 * way, and not a second animation loop.
 *
 * It is the *same source*, but not yet the same pixels. `blit` below crops to
 * the destination aspect, and its only caller hands it a 320×240 canvas, so
 * what reaches the glass today is a cropped and heavily downsampled copy. The
 * epilogue is supposed to land on the reader seeing nothing change but the
 * cabinet appearing around the picture; until the reveal binds this surface at
 * full resolution, the pull-back still has a visible jump in it.
 *
 * The ASCII engine publishes its canvas here at the end of every frame. The
 * SIGNAL channel blits from it. Neither side knows about the other, and there
 * is no second animation loop anywhere in the handoff.
 */
class SignalSurface {
  private source: HTMLCanvasElement | null = null;
  private frame = 0;
  private cssWidth = 0;
  private cssHeight = 0;

  /** Called by the renderer that owns the field, once per drawn frame. */
  publish(canvas: HTMLCanvasElement, width: number, height: number): void {
    this.source = canvas;
    this.cssWidth = width;
    this.cssHeight = height;
    this.frame += 1;
  }

  /** Detaches the surface — used when the field is disposed. */
  clear(): void {
    this.source = null;
    this.cssWidth = 0;
    this.cssHeight = 0;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.source;
  }

  /** Monotonic. Consumers compare it to detect a stale or duplicated frame. */
  get frameId(): number {
    return this.frame;
  }

  get available(): boolean {
    return this.source !== null && this.cssWidth > 0 && this.cssHeight > 0;
  }

  get width(): number {
    return this.cssWidth;
  }

  get height(): number {
    return this.cssHeight;
  }

  /**
   * Draws the published frame into a destination context at `dw`×`dh`.
   *
   * The page is wider than the television screen, so the source is centre-
   * cropped rather than squashed: the reader must not be able to tell that the
   * aspect ratio changed when the reveal hands over. Returns false when there
   * is nothing published yet, so the caller can paint its own fallback.
   */
  blit(ctx: CanvasRenderingContext2D, dw: number, dh: number): boolean {
    const source = this.source;
    if (!source || source.width < 1 || source.height < 1 || dw < 1 || dh < 1) {
      return false;
    }

    const sourceAspect = source.width / source.height;
    const destAspect = dw / dh;

    let sx = 0;
    let sy = 0;
    let sw = source.width;
    let sh = source.height;

    if (sourceAspect > destAspect) {
      sw = source.height * destAspect;
      sx = (source.width - sw) * 0.5;
    } else {
      sh = source.width / destAspect;
      sy = (source.height - sh) * 0.5;
    }

    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
    return true;
  }
}

export const signalSurface = new SignalSurface();

/** Test seam: a fresh surface with no global state. */
export function createSignalSurface(): SignalSurface {
  return new SignalSurface();
}

export type { SignalSurface };
