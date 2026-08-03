import { clamp01, valueNoise2D } from '@/utils/math';
import {
  BINARY_GLYPHS,
  BOX_GLYPHS,
  GLYPH_RAMP,
  computeGridMetrics,
  rampIndexForIntensity,
} from './ascii-grid';
import { DeadColumnMask, FocusController, TrailBuffer } from './ascii-particles';
import {
  QUALITY_FPS,
  type AsciiEngineOptions,
  type AsciiGridMetrics,
  type AsciiQuality,
} from './types';

/**
 * Fixed-grid ASCII field renderer.
 *
 * Design notes:
 * - Cells never move. A scalar field drifts beneath them and each cell samples it.
 *   This makes per-frame cost exactly rows × columns regardless of activity.
 * - All per-cell data lives in flat typed arrays allocated on resize only.
 * - Draw calls are batched by glyph so fillText runs once per distinct character
 *   per row-band rather than once per cell.
 */
export class AsciiEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: AsciiEngineOptions;

  private metrics: AsciiGridMetrics;
  private intensity: Float32Array;
  private glyphIndex: Uint8Array;
  private cellCount = 0;

  private readonly trail = new TrailBuffer(20);
  private readonly focus = new FocusController();
  private readonly deadColumns = new DeadColumnMask(0);

  private rafId: number | null = null;
  private running = false;
  private lastFrameAt = 0;
  private elapsed = 0;
  private accumulator = 0;

  private quality: AsciiQuality = 'high';
  private frameTimeAvg = 16;
  private qualityCooldown = 0;

  // Live inputs, written from listeners, read during the frame.
  private pointerX = 0.5;
  private pointerY = 0.5;
  private pointerSpeed = 0;
  private pointerActive = false;
  private scrollVelocity = 0;
  private scrollOffset = 0;
  private entropy = 0.08;
  private glyphCorruption = 0;

  /** Reusable per-glyph batch buckets; keys are glyph strings. */
  private batches = new Map<string, number[]>();

  /** Resolved once on resize — reading computed style per frame is expensive. */
  private fontFamily = 'monospace';

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    options: AsciiEngineOptions,
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.options = options;
    this.metrics = computeGridMetrics(1, 1, options.cellBudget, options.maxDpr);
    this.intensity = new Float32Array(0);
    this.glyphIndex = new Uint8Array(0);
  }

  /** Allocates buffers for the current viewport. Safe to call repeatedly. */
  resize(viewportWidth: number, viewportHeight: number): void {
    const metrics = computeGridMetrics(
      viewportWidth,
      viewportHeight,
      this.options.cellBudget,
      this.options.maxDpr,
    );
    this.metrics = metrics;

    this.canvas.width = metrics.pixelWidth;
    this.canvas.height = metrics.pixelHeight;
    this.canvas.style.width = `${viewportWidth}px`;
    this.canvas.style.height = `${viewportHeight}px`;

    const count = metrics.rows * metrics.columns;
    if (count !== this.cellCount) {
      this.intensity = new Float32Array(count);
      this.glyphIndex = new Uint8Array(count);
      this.cellCount = count;
    }
    this.deadColumns.resize(metrics.columns);

    this.fontFamily =
      (typeof getComputedStyle === 'function'
        ? getComputedStyle(this.canvas).fontFamily
        : '') || 'monospace';

    this.ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
    this.ctx.textBaseline = 'top';
    this.ctx.font = `${metrics.fontSize.toFixed(1)}px ${this.fontFamily}`;
  }

  setPointer(x: number, y: number, speed: number): void {
    this.pointerX = x;
    this.pointerY = y;
    this.pointerSpeed = clamp01(speed);
    this.pointerActive = true;
    if (!this.options.reducedMotion) {
      this.trail.push(x, y, 0.35 + this.pointerSpeed * 0.65);
    }
  }

  clearPointer(): void {
    this.pointerActive = false;
    this.pointerSpeed = 0;
  }

  setScroll(offset: number, velocity: number): void {
    this.scrollOffset = offset;
    this.scrollVelocity = clamp01(velocity);
  }

  setEntropy(value: number): void {
    this.entropy = clamp01(value);
  }

  /** Drives the `glyph-substitution` anomaly, 0–1. */
  setGlyphCorruption(value: number): void {
    this.glyphCorruption = clamp01(value);
  }

  killColumns(seed: number, count = 2): void {
    this.deadColumns.kill(seed, count);
  }

  restoreColumns(): void {
    this.deadColumns.clear();
  }

  /** Converge the field on a screen-space rect (used by the TV section). */
  absorbTo(rect: DOMRect | null): void {
    if (!rect || typeof window === 'undefined') {
      this.focus.release();
      return;
    }
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    const radius = Math.max(rect.width / window.innerWidth, 0.12) * 0.75;
    this.focus.setTarget(clamp01(x), clamp01(y), radius);
    this.focus.engage(1);
  }

  release(): void {
    this.focus.release();
  }

  setReducedMotion(reduced: boolean): void {
    this.options.reducedMotion = reduced;
    if (reduced) this.trail.clear();
  }

  setCellBudget(budget: number, viewportWidth: number, viewportHeight: number): void {
    if (budget === this.options.cellBudget) return;
    this.options.cellBudget = budget;
    this.resize(viewportWidth, viewportHeight);
  }

  start(): void {
    if (this.running || typeof requestAnimationFrame === 'undefined') return;
    this.running = true;
    this.lastFrameAt = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.batches.clear();
    this.intensity = new Float32Array(0);
    this.glyphIndex = new Uint8Array(0);
    this.cellCount = 0;
    this.trail.clear();
  }

  private get targetFrameInterval(): number {
    const fps = this.options.reducedMotion
      ? 12
      : Math.min(this.options.targetFps, QUALITY_FPS[this.quality]);
    return 1000 / fps;
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const rawDelta = now - this.lastFrameAt;
    this.lastFrameAt = now;
    this.accumulator += Math.min(rawDelta, 100);

    const interval = this.targetFrameInterval;
    if (this.accumulator < interval) return;

    const delta = Math.min(this.accumulator, 100) / 1000;
    this.accumulator = 0;

    const frameStart = performance.now();
    this.update(delta);
    this.render();
    this.adaptQuality(performance.now() - frameStart, delta);
  };

  private update(delta: number): void {
    this.elapsed += delta;
    this.trail.decay(delta);
    this.focus.update(delta);

    const { rows, columns } = this.metrics;
    if (rows === 0 || columns === 0) return;

    const reduced = this.options.reducedMotion;
    const time = reduced ? 0 : this.elapsed;

    // Slow ambient drift; scroll adds a vertical shear.
    const driftX = time * 0.055;
    const driftY = time * 0.035 + this.scrollOffset * 0.00035;
    const stretch = 1 + this.scrollVelocity * 2.4;
    const trailRadiusSq = 0.018;
    const pointerRadiusSq = 0.006;
    const focusRegion = this.focus.current;
    const focusActive = this.focus.isActive;

    for (let row = 0; row < rows; row += 1) {
      const ny = row / rows;
      const rowIndex = row * columns;

      for (let column = 0; column < columns; column += 1) {
        const nx = column / columns;
        const index = rowIndex + column;

        if (this.deadColumns.isDead(column)) {
          this.intensity[index] = 0;
          this.glyphIndex[index] = 0;
          continue;
        }

        // Base field: two octaves of cheap value noise.
        let value =
          valueNoise2D(nx * 5.5 + driftX, ny * 3.2 * stretch + driftY) * 0.68 +
          valueNoise2D(nx * 13.0 - driftY, ny * 8.0 + driftX * 1.7) * 0.32;

        // Vertical falloff keeps the top and bottom quieter than the middle.
        value *= 0.55 + 0.45 * Math.sin(ny * Math.PI);

        if (!reduced) {
          const trailInfluence = this.trail.influenceAt(nx, ny, trailRadiusSq);
          if (trailInfluence > 0) value += trailInfluence * 0.55;

          // Standing pointer gather: persists after the trail has decayed.
          if (this.pointerActive) {
            const px = nx - this.pointerX;
            const py = ny - this.pointerY;
            const gatherSq = px * px + py * py;
            if (gatherSq < pointerRadiusSq) {
              value += (1 - gatherSq / pointerRadiusSq) * 0.26;
            }
          }
        }

        if (focusActive) {
          const dx = nx - focusRegion.x;
          const dy = ny - focusRegion.y;
          const dist = Math.hypot(dx, dy);
          const inside = 1 - clamp01(dist / focusRegion.radius);
          // Inside the focus region the field intensifies; outside it fades.
          value =
            value * (1 - focusRegion.strength * 0.75) +
            inside * inside * focusRegion.strength * 0.95;
        }

        value += this.entropy * 0.12;

        const clamped = clamp01(value);
        this.intensity[index] = clamped;
        this.glyphIndex[index] = rampIndexForIntensity(clamped);
      }
    }
  }

  private render(): void {
    const { ctx } = this;
    const { rows, columns, cellWidth, cellHeight, fontSize } = this.metrics;
    const width = this.metrics.pixelWidth / this.metrics.dpr;
    const height = this.metrics.pixelHeight / this.metrics.dpr;

    ctx.clearRect(0, 0, width, height);
    if (rows === 0 || columns === 0) return;

    ctx.font = `${fontSize.toFixed(1)}px ${this.fontFamily}`;

    // Reset batches without reallocating the arrays.
    for (const bucket of this.batches.values()) bucket.length = 0;

    const corruption = this.glyphCorruption;
    const time = this.elapsed;

    for (let row = 0; row < rows; row += 1) {
      const rowIndex = row * columns;
      for (let column = 0; column < columns; column += 1) {
        const index = rowIndex + column;
        const rampIndex = this.glyphIndex[index];
        if (rampIndex === 0) continue;

        let glyph: string = GLYPH_RAMP[rampIndex];

        // Deterministic secondary glyph sprinkling, plus anomaly substitution.
        const salt = (column * 31 + row * 17) & 63;
        if (salt === 0) {
          glyph = BINARY_GLYPHS[(column + row) & 1];
        } else if (salt === 21) {
          glyph = BOX_GLYPHS[(column + row) % BOX_GLYPHS.length];
        }

        if (corruption > 0) {
          const noise = valueNoise2D(column * 0.7 + time * 3.1, row * 0.7);
          if (noise < corruption * 0.45) {
            glyph = BOX_GLYPHS[(column * 3 + row) % BOX_GLYPHS.length];
          }
        }

        let bucket = this.batches.get(glyph);
        if (!bucket) {
          bucket = [];
          this.batches.set(glyph, bucket);
        }
        // Store packed cell coordinates; positions computed at draw time.
        bucket.push(index);
      }
    }

    // Draw batched by glyph. Alpha is quantised into a few buckets so we
    // change fillStyle rarely rather than per cell.
    for (const [glyph, indices] of this.batches) {
      if (indices.length === 0) continue;

      let currentAlphaBucket = -1;
      for (let i = 0; i < indices.length; i += 1) {
        const index = indices[i];
        const value = this.intensity[index];
        const alphaBucket = Math.min(5, Math.floor(value * 6));
        if (alphaBucket !== currentAlphaBucket) {
          currentAlphaBucket = alphaBucket;
          const alpha = 0.06 + alphaBucket * 0.055;
          ctx.fillStyle = this.colourFor(value, alpha);
        }
        const column = index % columns;
        const row = (index - column) / columns;
        ctx.fillText(glyph, column * cellWidth, row * cellHeight);
      }
    }
  }

  private colourFor(value: number, alpha: number): string {
    // Mostly neutral grey-green; only the brightest cells pick up signal colour.
    if (value > 0.82) {
      return `rgba(139, 255, 120, ${(alpha * 0.9).toFixed(3)})`;
    }
    if (value > 0.6) {
      return `rgba(150, 175, 145, ${alpha.toFixed(3)})`;
    }
    return `rgba(120, 132, 118, ${alpha.toFixed(3)})`;
  }

  /** Steps the quality ladder with hysteresis so it never oscillates. */
  private adaptQuality(frameCost: number, delta: number): void {
    this.frameTimeAvg = this.frameTimeAvg * 0.9 + frameCost * 0.1;
    this.qualityCooldown -= delta;
    if (this.qualityCooldown > 0) return;

    if (this.frameTimeAvg > 9 && this.quality !== 'low') {
      this.quality = this.quality === 'high' ? 'medium' : 'low';
      this.qualityCooldown = 3;
    } else if (this.frameTimeAvg < 3.2 && this.quality !== 'high') {
      this.quality = this.quality === 'low' ? 'medium' : 'high';
      this.qualityCooldown = 6;
    }
  }

  /** Test/debug accessors. */
  get currentQuality(): AsciiQuality {
    return this.quality;
  }

  get gridMetrics(): Readonly<AsciiGridMetrics> {
    return this.metrics;
  }

  get isRunning(): boolean {
    return this.running;
  }
}

/** Convenience wrapper used by the React component. */
export function createAsciiEngine(
  canvas: HTMLCanvasElement,
  options: AsciiEngineOptions,
): AsciiEngine | null {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  return new AsciiEngine(canvas, ctx, options);
}
