import { clamp01, smoothstep, valueNoise2D } from '@/utils/math';
import { CHARSETS } from '../charset';
import { MaskField } from '../fields/mask-field';
import { GridLayer } from '../layers/grid-layer';
import { MaskLayer } from '../layers/mask-layer';
import { faceMask } from '../masks/face-mask';
import { figureMask } from '../masks/figure-mask';
import { handMask } from '../masks/hand-mask';
import type { MaskShape } from '../masks/mask-shape';
import type { AsciiRuntime, AsciiScene, AsciiViewport } from '../types';

/** In the order the reader meets them. */
const SHAPES: readonly MaskShape[] = [faceMask, handMask, figureMask];

/** How much of each segment is spent fading between shapes. */
const HANDOVER = 0.16;

/**
 * Screen three — FORM.
 *
 * The moving field starts to gather into things. Three silhouettes take turns:
 * a face, a hand, and a standing figure. None of them ever completes — the
 * closer the reader's pointer gets, the more the shape comes apart, so the
 * only way to see one whole is to stop moving and look slightly away from it.
 *
 * Scrolling back up rebuilds a shape in the wrong order. That is the whole
 * horror budget for this screen: no sound, no motion spike, nothing that
 * appears suddenly. Just the sense that it assembled itself while unobserved
 * and did not quite remember how.
 */
export class FormScene implements AsciiScene {
  readonly id = 'form';
  readonly charset = CHARSETS.form;

  private readonly masks: MaskField[];
  private readonly maskLayer: MaskLayer;
  private readonly grid: GridLayer;
  private activeShape = -1;

  constructor(maskCapacity: number) {
    // Sampled once at construction. Each field is a few thousand rejection
    // samples, which is cheap enough to do up front and far too expensive to
    // redo on a screen boundary.
    this.masks = SHAPES.map(
      (shape, index) => new MaskField(shape, maskCapacity, 0x51_ed + index * 977),
    );
    this.maskLayer = new MaskLayer(maskCapacity, this.charset);
    this.grid = new GridLayer(
      (nx, ny, runtime) => this.substrate(nx, ny, runtime),
      this.charset,
      0.16,
    );
  }

  private substrate(nx: number, ny: number, runtime: AsciiRuntime): number {
    const t = runtime.time * 0.02;
    const noise = valueNoise2D(nx * 2.4 + t, ny * 2.4 - t);
    // The substrate recedes as a shape gains coherence, so the silhouette is
    // read against emptiness rather than against texture.
    const recede = 1 - runtime.tension.maskCoherence * 0.7;
    return clamp01((noise - 0.6) * 1.5 * runtime.tension.density * recede);
  }

  /** Which silhouette is showing, and how strongly, at a local progress. */
  private segmentAt(local: number): { index: number; weight: number } {
    const span = 1 / SHAPES.length;
    const raw = Math.min(SHAPES.length - 1, Math.floor(local / span));
    const within = (local - raw * span) / span;
    // Fade out at both ends of a segment so shapes hand over rather than cut.
    const weight = smoothstep(0, HANDOVER, within) * (1 - smoothstep(1 - HANDOVER, 1, within));
    return { index: raw, weight };
  }

  enter(runtime: AsciiRuntime): void {
    this.activeShape = -1;
    this.update(runtime);
  }

  update(runtime: AsciiRuntime): void {
    const { index, weight } = this.segmentAt(runtime.experience.localProgress);

    if (index !== this.activeShape) {
      this.activeShape = index;
      this.maskLayer.setMask(this.masks[index] ?? null);
    }

    // The handover weight scales the population rather than the coherence, so
    // a shape thins out as it leaves instead of melting in place.
    const budget = Math.floor(runtime.budget * 0.72 * weight);
    this.maskLayer.setActive(budget);
    this.maskLayer.update(runtime);
  }

  render(runtime: AsciiRuntime): void {
    this.grid.draw(runtime);
    this.maskLayer.draw(runtime);
  }

  exit(): void {
    this.maskLayer.scatter();
    this.maskLayer.setActive(0);
    this.activeShape = -1;
  }

  resize(view: AsciiViewport): void {
    this.maskLayer.resize(view);
    this.grid.resize(view);
  }

  dispose(): void {
    this.maskLayer.dispose();
    this.grid.dispose();
  }
}
