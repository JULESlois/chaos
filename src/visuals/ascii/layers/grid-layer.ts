import { glyphFor } from '../charset';
import { bucketFor } from '../palette';
import type { AsciiRuntime, AsciiViewport, DrawLayer } from '../types';

/**
 * A scalar field sampled at a cell centre. Returns 0–1 intensity; anything at
 * or below zero leaves the cell empty.
 */
export type DensityField = (nx: number, ny: number, runtime: AsciiRuntime) => number;

/**
 * Layer A — the fixed density field.
 *
 * This is the only layer that respects the character grid, and it is what
 * gives the piece its "terminal" substrate: no matter how freely the other
 * layers move, there is always a lattice underneath them.
 *
 * The budget is honoured by striding, not by clipping. If a frame can only
 * afford a quarter of the cells the layer visits every other row and column
 * rather than filling the top-left quadrant and stopping — so reducing quality
 * thins the image uniformly instead of cropping it.
 */
export class GridLayer implements DrawLayer {
  readonly id = 'grid';

  private cols = 0;
  private rows = 0;
  private cellWidth = 0;
  private cellHeight = 0;

  /**
   * Multiplies a whole column's intensity, 0 killing it outright. This is how
   * the dead-column failure is expressed — as an absence in the substrate
   * rather than as an overlay drawn on top of it.
   */
  columnGate: ((col: number, runtime: AsciiRuntime) => number) | null = null;

  /**
   * Last chance to swap the chosen glyph. Used by the glyph-substitution
   * failure, which replaces characters with the wrong ones from the same
   * alphabet — the field stays legible as a field, but stops meaning anything.
   */
  glyphOverride:
    | ((glyph: number, col: number, row: number, runtime: AsciiRuntime) => number)
    | null = null;

  private readonly field: DensityField;
  private readonly charset: Uint8Array;
  /** Cells below this intensity are skipped entirely. */
  private readonly threshold: number;

  constructor(field: DensityField, charset: Uint8Array, threshold = 0.06) {
    this.field = field;
    this.charset = charset;
    this.threshold = threshold;
  }

  resize(view: AsciiViewport): void {
    this.cols = view.cols;
    this.rows = view.rows;
    this.cellWidth = view.cellWidth;
    this.cellHeight = view.cellHeight;
  }

  draw(runtime: AsciiRuntime): void {
    const { cols, rows } = this;
    if (cols === 0 || rows === 0) return;

    const budget = Math.max(1, runtime.budget);
    const total = cols * rows;
    const stride = total <= budget ? 1 : Math.max(1, Math.ceil(Math.sqrt(total / budget)));

    const { painter, tension } = runtime;
    const ceiling = tension.lightIntensity;
    const halfWidth = this.cellWidth * 0.5;
    const baseline = this.cellHeight * 0.78;

    // Offsetting the sampling lattice by the frame index stops a coarse stride
    // from looking like a static screen door.
    const jitter = stride > 1 ? (runtime.time * 3) | 0 : 0;

    for (let row = 0; row < rows; row += stride) {
      const offsetRow = stride > 1 ? (row + (jitter % stride)) % rows : row;
      const ny = (offsetRow + 0.5) / rows;
      const y = offsetRow * this.cellHeight + baseline;

      for (let col = 0; col < cols; col += stride) {
        const gate = this.columnGate ? this.columnGate(col, runtime) : 1;
        if (gate <= 0) continue;

        const nx = (col + 0.5) / cols;
        const intensity = this.field(nx, ny, runtime) * gate;
        if (intensity <= this.threshold) continue;

        const glyph = glyphFor(this.charset, intensity);
        painter.push(
          col * this.cellWidth + halfWidth,
          y,
          this.glyphOverride ? this.glyphOverride(glyph, col, offsetRow, runtime) : glyph,
          bucketFor(intensity, ceiling),
        );
      }
    }
  }

  dispose(): void {
    // No retained resources — the field closure is owned by the scene.
  }
}
