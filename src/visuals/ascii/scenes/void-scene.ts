import { clamp01, smoothstep, valueNoise2D } from '@/utils/math';
import { CHARSETS } from '../charset';
import { GridLayer } from '../layers/grid-layer';
import type { AsciiRuntime, AsciiScene, AsciiViewport } from '../types';

/**
 * Screen one — VOID.
 *
 * Almost nothing, and then slightly more than nothing. A very sparse noise
 * field fades up from black while a faint horizontal seam forms across the
 * middle of the viewport. The seam is the only structure here; it exists so
 * that the reader has something to notice and so the next screen has a horizon
 * to dissolve.
 *
 * This screen is also where the engine is cheapest, which matters: it is the
 * one that has to survive a cold start on a phone.
 */
export class VoidScene implements AsciiScene {
  readonly id = 'void';
  readonly charset = CHARSETS.void;

  private readonly grid: GridLayer;

  constructor() {
    this.grid = new GridLayer(
      (nx, ny, runtime) => this.density(nx, ny, runtime),
      this.charset,
      0.1,
    );
  }

  private density(nx: number, ny: number, runtime: AsciiRuntime): number {
    const t = runtime.time * 0.05;
    const noise = valueNoise2D(nx * 5.5 + t, ny * 5.5 - t * 0.6);

    // The seam: a narrow band that sharpens as the screen progresses.
    const local = runtime.experience.localProgress;
    const seamWidth = 0.22 - local * 0.16;
    const seam = 1 - smoothstep(0, seamWidth, Math.abs(ny - 0.5));

    const dust = Math.max(0, noise - 0.62) * 2.6;
    return clamp01((dust * 0.5 + seam * 0.5) * runtime.tension.density * 2.4);
  }

  enter(): void {
    // Nothing to prime — the field is a pure function of time and position.
  }

  update(): void {
    // No simulation state.
  }

  render(runtime: AsciiRuntime): void {
    this.grid.draw(runtime);
  }

  exit(): void {
    // Nothing retained.
  }

  resize(view: AsciiViewport): void {
    this.grid.resize(view);
  }

  dispose(): void {
    this.grid.dispose();
  }
}
