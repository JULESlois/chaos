import { createRng, smoothstep } from '@/utils/math';
import { GlyphAtlas } from '../flow/glyph-atlas';
import type { AsciiRuntime, AsciiViewport, QualityTier } from '../types';
import { RainEngine } from './rain-engine';
import { createFormSample, FormModulator } from './form-modulator';
import { TemporalBuffer } from './temporal-buffer';
import { RainRenderer } from './rain-renderer';
import { configFor, gridFor, RAIN_CHARSET, RAIN_CHARSET_SPARSE } from './rain-presets';
import {
  clamp01,
  mix,
  NORMAL_CHAOS,
  type ChaosFaults,
  type FormWeights,
  type RainGlyphSample,
  type RainRenderConfig,
} from './rain-types';

/**
 * Slowest a column may run inside fully dense form, as a fraction of its own
 * speed.
 *
 * Deliberately well above zero. At zero the characters inside a face would
 * stop, and a silhouette made of stopped characters is the one thing this
 * whole approach exists to avoid: it looks correct in a still and dead in
 * motion. At 0.55 the form is a drag the rain falls through, and every column
 * is still visibly moving when you watch any one of them.
 */
const FORM_SPEED_FLOOR = 0.55;

/**
 * Builds a `RainRenderConfig` from the engine runtime plus per-scene choices.
 * Keeps the four rain scenes from duplicating the same mapping.
 */
export function makeRainConfig(
  runtime: AsciiRuntime,
  opts: {
    seed: number;
    formWeights: FormWeights;
    chaos?: ChaosFaults;
    weight?: number;
    bootProgress?: number;
    bootLineStrength?: number;
    releaseStrength?: number;
    trailGrowth?: number;
    debug?: boolean;
  },
): RainRenderConfig {
  return {
    width: runtime.view.width,
    height: runtime.view.height,
    cell: runtime.view.cellWidth,
    time: runtime.time,
    delta: runtime.delta,
    progress: runtime.experience.localProgress,
    seed: opts.seed,
    quality: runtime.quality,
    pointer: runtime.pointer,
    reducedMotion: runtime.reducedMotion,
    formWeights: opts.formWeights,
    chaos: opts.chaos ?? NORMAL_CHAOS,
    weight: opts.weight ?? 1,
    bootProgress: opts.bootProgress ?? 1,
    bootLineStrength: opts.bootLineStrength ?? 0,
    releaseStrength: opts.releaseStrength ?? 1,
    trailGrowth: opts.trailGrowth ?? 1,
    debug: opts.debug ?? false,
    frameId: 0,
  };
}

/**
 * The dynamic code rain, fully assembled.
 *
 * A scene constructs one of these and calls `render` each frame with a
 * `RainRenderConfig`. The field owns a deterministic `RainEngine`, the
 * `FormModulator` that bends the rain into faces/figures/hands, a
 * `TemporalBuffer` used by CHAOS for time-split faults, and the `RainRenderer`
 * that blits pre-baked glyphs. No React state drives it and no object is
 * allocated per character — the sample pool is fixed at resize.
 */
export class RainField {
  private readonly atlas: GlyphAtlas;
  private readonly engine: RainEngine;
  private readonly modulator = new FormModulator();
  private readonly buffer: TemporalBuffer;
  private readonly renderer: RainRenderer;

  private cell = 13;
  private cols = 1;
  private rows = 1;
  private readonly phaseBias: Float32Array;
  private readonly delayFrames: Float32Array;

  // Per-column form state, resolved once before the update and reused when the
  // samples are built. Sampling the modulator a second time in `buildSamples`
  // would cost a mask lookup per column and let the fall rate and the glyph
  // churn disagree about how dense the form under a column is.
  private readonly formSpeed: Float32Array;
  private readonly formDensity: Float32Array;

  private samples: RainGlyphSample[] = [];
  private sampleCapacity = 0;
  private frame = 0;
  private lastCount = 0;

  // Scratch form records. Two, because the repeat fault reads a second point
  // while the first is still live. Never reallocated.
  private readonly formA = createFormSample();
  private readonly formB = createFormSample();

  private debug = false;

  readonly seed: number;

  constructor(seed = 2407, sparse = false) {
    this.seed = seed;
    this.atlas = new GlyphAtlas(sparse ? RAIN_CHARSET_SPARSE : RAIN_CHARSET);
    this.engine = new RainEngine(configFor(0), seed);
    this.buffer = new TemporalBuffer(this.engine.columnCount);
    this.renderer = new RainRenderer(this.atlas);
    this.phaseBias = new Float32Array(2048);
    this.delayFrames = new Float32Array(2048);
    this.formSpeed = new Float32Array(2048).fill(1);
    this.formDensity = new Float32Array(2048);
  }

  get engineInstance(): RainEngine {
    return this.engine;
  }

  get modulatorInstance(): FormModulator {
    return this.modulator;
  }

  get glyphCount(): number {
    return this.atlas.glyphCount;
  }

  get columnCount(): number {
    return this.cols;
  }

  get rowCount(): number {
    return this.rows;
  }

  /** Characters drawn on the last frame. Read by the labs and by tests. */
  get drawnCount(): number {
    return this.lastCount;
  }

  /**
   * Total frames of history the columns are currently being drawn from.
   *
   * Chaos time-splits and form lag both accumulate here. Exposed because the
   * effect is otherwise invisible to anything but the eye: a lagged column
   * draws a legitimate-looking trail, just at a row the live head has left.
   */
  get laggedFrames(): number {
    let total = 0;
    for (let i = 0; i < this.cols; i += 1) total += this.delayFrames[i]!;
    return total;
  }

  /** Frame id, bumped each render — the shared signal surface reads this. */
  frameId = 0;

  resize(view: AsciiViewport, quality: QualityTier, sparse = false): void {
    const grid = gridFor(view.width, view.height, quality);
    this.cell = grid.cell;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.engine.setConfig(configFor(quality));
    this.engine.resize(this.cols, this.rows);
    this.engine.populate();
    this.buffer.resize(this.cols);
    this.ensureSamples(this.cols, this.engine.maxLength());
    void sparse;
  }

  private ensureSamples(cols: number, maxLen: number): void {
    const need = Math.max(1, cols * Math.max(2, Math.ceil(maxLen)));
    if (need <= this.sampleCapacity && this.samples.length > 0) return;
    this.sampleCapacity = need;
    this.samples = new Array(need);
    for (let i = 0; i < need; i += 1) {
      this.samples[i] = {
        x: 0,
        y: 0,
        column: 0,
        row: 0,
        trailIndex: 0,
        glyph: 0,
        brightness: 0,
        alpha: 0,
        size: this.cell,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        maskValue: 0,
        edgeValue: 0,
        depthValue: 0,
      };
    }
  }

  /**
   * Advances the simulation, then builds and draws the frame.
   *
   * The simulation runs on every call regardless of `config.weight`, including
   * when the field is invisible. That is deliberate and is the whole reason
   * this class is shared rather than per-scene: a field that only ticks while
   * its screen is on top would hand the next screen a frozen, stale set of
   * head positions, and the reader would see the rain restart at the boundary.
   */
  render(ctx: CanvasRenderingContext2D, config: RainRenderConfig): void {
    this.frame += 1;
    this.frameId += 1;
    this.debug = config.debug;
    this.modulator.setWeights(config.formWeights);

    // Mask desync: the form slides sideways against the rain that draws it, so
    // the anatomy and the medium visibly stop agreeing.
    const drift = config.chaos.maskDrift;
    this.modulator.setDrift(
      drift > 0 ? Math.sin(config.time * 1.7) * drift * 0.22 : 0,
      drift > 0 ? Math.sin(config.time * 0.9 + 1.1) * drift * 0.06 : 0,
    );

    this.applyChaos(config.chaos);
    this.applyForm(config);
    this.engine.update(config.reducedMotion ? config.delta * 0.25 : config.delta);
    this.buffer.push(this.engine.heads);

    // Invisible still simulates — see the note above — but there is no reason
    // to build or blit samples nobody can see.
    if (config.weight <= 0.001) {
      this.lastCount = 0;
      return;
    }

    const count = this.buildSamples(config);
    this.lastCount = count;
    this.renderer.render(ctx, this.samples, count);

    if (this.debug) this.drawDebug(ctx, config);
  }

  private applyChaos(chaos: ChaosFaults): void {
    this.engine.resetChaos();
    this.phaseBias.fill(0, 0, this.cols);
    this.delayFrames.fill(0, 0, this.cols);
    if (chaos.intensity <= 0) return;

    const rng = createRng((this.seed ^ (this.frame * 2246822519)) >>> 0);
    const c = chaos;
    for (let i = 0; i < this.cols; i += 1) {
      const r = rng();
      const r2 = rng();
      const r3 = rng();
      const r4 = rng();
      // Frozen region: the column simply stops carrying signal.
      if (r < c.frozen * 0.22) this.engine.setFrozen(i, true);
      // Direction inversion: part of the field runs against itself.
      if (r2 < c.directionInversion * 0.18) this.engine.setChaosDirection(i, -1);
      // Column phase error: a sustained, non-accumulating head bias, so the
      // column is drawing the right trail at the wrong place in the column.
      if (r3 < c.phaseError * 0.2) {
        this.phaseBias[i] = (rng() < 0.5 ? -1 : 1) * (2 + Math.floor(rng() * 11));
      }
      // Signal collapse: the whole field slows toward a stop.
      if (c.collapse > 0) {
        this.engine.setSpeedScale(i, Math.max(0, 1 - c.collapse * 0.95));
      }
      // Temporal split: a fraction of columns render from an earlier frame.
      if (r4 < c.intensity * 0.26) {
        this.delayFrames[i] = 3 + Math.floor(rng() * 11);
      }
    }
  }

  /**
   * Form, as a property of the rain's motion.
   *
   * This is the difference between rain that draws a face and a face drawn in
   * rain. Nothing is placed and nothing parks: every column keeps falling and
   * keeps its identity. But a column falling through dense form runs slower
   * and renders from slightly further in the past than its neighbours, so the
   * anatomy is legible in the *behaviour* of the field — in where it drags and
   * where it lags — and survives being unreadable glyph by glyph.
   *
   * Sampled once per column at the head, before the update, so the density a
   * column is falling into is what slows it. Cost is O(columns), not
   * O(characters), which is why it can be per-frame.
   */
  private applyForm(config: RainRenderConfig): void {
    this.formSpeed.fill(1, 0, this.cols);
    this.formDensity.fill(0, 0, this.cols);
    if (!this.modulator.active) return;

    const { width, height, time, progress } = config;
    const cell = this.cell;
    // `temporalDelay` is a lag in seconds; the buffer counts frames.
    const fps = config.delta > 0.0001 ? 1 / config.delta : 60;

    for (let i = 0; i < this.cols; i += 1) {
      const x = (i + 0.5) * cell;
      if (x > width + cell) break;
      const head = this.engine.heads[i]!;
      const at = this.modulator.sample(
        this.formA,
        x / width,
        (this.wrapRow(head) * cell) / height,
        time,
        progress,
      );
      if (at.density <= 0.001) continue;

      this.formDensity[i] = at.density;
      const drag = mix(1, FORM_SPEED_FLOOR, at.density);
      this.formSpeed[i] = drag;
      this.engine.scaleSpeed(i, drag);
      this.delayFrames[i]! += at.temporalDelay * fps;
    }
  }

  private buildSamples(config: RainRenderConfig): number {
    const { width, height, time, progress, pointer, reducedMotion } = config;
    const cell = this.cell;
    const charsetLen = this.atlas.glyphCount;
    const px = pointer.x * width;
    const py = pointer.y * height;
    const pointerActive = pointer.active;
    const pointerRadius = Math.min(width, height) * 0.13;
    const interference = pointerActive ? clamp01(0.35 + pointer.speed * 1.6) : 0;

    let count = 0;
    const capacity = this.sampleCapacity;
    const formActive = this.modulator.active;
    const repeat = config.chaos.repeat;
    const weight = clamp01(config.weight);

    const bootProgress = config.bootProgress ?? 1;
    const bootLineStrength = config.bootLineStrength ?? 0;
    const trailGrowth = config.trailGrowth ?? 1;
    const lineY = Math.floor(this.rows * 0.52);

    for (let i = 0; i < this.cols; i += 1) {
      const dir = this.engine.getDirection(i);
      const speed = this.engine.getSpeed(i);
      const baseLength = this.engine.getLength(i);
      const bright = this.engine.getBrightness(i);
      const persist = this.engine.getPersistence(i);
      const gSeed = this.engine.getGlyphSeed(i);
      const mut = this.engine.getMutationRate(i);
      const phase = this.engine.getPhaseOffset(i);

      let simHead = this.engine.heads[i]! + this.phaseBias[i]!;
      if (this.delayFrames[i]! > 0) {
        simHead = this.buffer.delayedHead(i, this.delayFrames[i]!, simHead);
      }

      // Boot line release curve per column
      const releaseAt = this.engine.getBootReleaseAt(i);
      const releaseDur = this.engine.getBootReleaseDuration(i);
      const drop = smoothstep(releaseAt, releaseAt + releaseDur, bootProgress);
      const bootOffset = this.engine.getBootLineOffsetY(i);

      // Effective head position
      const head = mix(lineY + bootOffset, simHead, drop);

      // Effective trail length
      let effectiveLength = baseLength;
      let isBootLineOnly = false;
      if (drop < 0.05 && bootLineStrength > 0) {
        isBootLineOnly = true;
        effectiveLength = 1;
        // Edge taper for horizontal boot line
        const normCol = i / Math.max(1, this.cols);
        const edgeTaper = smoothstep(0.04, 0.18, normCol) * (1 - smoothstep(0.82, 0.96, normCol));
        if (hashUnit(this.seed ^ (i * 1337)) > edgeTaper * 0.88 + 0.12) {
          continue;
        }
      } else {
        effectiveLength = Math.max(1, Math.round(baseLength * mix(0.12, 1, Math.pow(drop, 1.4)) * trailGrowth));
      }

      // Non-regularity attributes
      const laneOffset = this.engine.getLaneOffset(i) * cell;
      const driftAmp = this.engine.getDriftAmplitude(i);
      const driftFreq = this.engine.getDriftFrequency(i);
      const driftPhase = this.engine.getDriftPhase(i);
      const curveSlope = this.engine.getCurveSlope(i);

      const denseBoost = this.formDensity[i]!;
      const localSpeed = speed * this.formSpeed[i]!;

      // In form area, reduce drift amplitude so anatomy stays legible
      const driftVal = Math.sin(time * driftFreq + driftPhase) * driftAmp * (1 - denseBoost * 0.45) * cell;
      const baseX = (i + 0.5) * cell + laneOffset + driftVal;

      if (baseX < -cell * 2 || baseX > width + cell * 2) continue;
      const nx = clamp01(baseX / width);

      const spacing = this.engine.getSpacing(i);
      const dropout = this.engine.getDropoutRate(i);
      const baseSize = this.engine.getBaseSize(i);
      const sizeVar = this.engine.getSizeVariance(i);
      const clockRate = this.engine.getGlyphClockRate(i);
      const glyphPhase = this.engine.getGlyphPhase(i);
      const envType = this.engine.getEnvelopeType(i);

      const flickerRate = this.engine.getBootFlickerRate(i);
      const flickerPhase = this.engine.getBootFlickerPhase(i);
      const bootFlicker = isBootLineOnly ? (0.4 + 0.6 * Math.sin(time * flickerRate + flickerPhase)) : 1;

      for (let t = 0; t < effectiveLength; t += 1) {
        if (count >= capacity) break;

        // Character gaps/dropout
        if (t > 0 && dropout > 0 && hashUnit(this.seed ^ (i * 577) ^ (t * 43)) < dropout) {
          continue;
        }

        const row = this.wrapRow(head - dir * t * spacing);
        const y = (row + 0.5) * cell;
        if (y > height + cell * 2) continue;

        const env = trailEnvelopeTyped(t, effectiveLength, persist, envType);
        if (env <= 0.01 && !isBootLineOnly) continue;

        const ny = y / height;
        const form = formActive
          ? this.sampleForm(nx, ny, time, progress, repeat, i)
          : this.zeroForm();

        const voidCut = 1 - form.voidValue;
        if (voidCut < 0.05) continue;

        let ox = 0;
        let glyphJitter = 0;
        if (interference > 0) {
          const dx = baseX - px;
          const dy = y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < pointerRadius && dist > 0.001) {
            const k = (1 - dist / pointerRadius) * interference;
            ox = (dx / dist) * k * 11;
            glyphJitter = k * 9;
          }
        }

        const headBoost = t === 0 ? (gSeed > 0.18 ? 1.2 : 0.72) : 1;
        let brightness = bright * env * headBoost * bootFlicker;
        brightness *= 1 + denseBoost * 0.75 + form.edge * 0.55;
        const flicker = 0.85 + 0.15 * Math.sin((time * (1 + mut * 2) + phase * 12 + t * 0.7) * 3.1);
        brightness = clamp01(brightness * flicker);

        let alpha = env * (0.3 + form.depth * 0.42 + form.density * 0.2);
        if (isBootLineOnly) alpha = bootFlicker * bootLineStrength;
        alpha *= voidCut;
        alpha *= 0.45 + 0.55 * bright;
        if (reducedMotion) alpha *= 0.85;
        alpha *= weight;
        alpha = clamp01(alpha);
        if (alpha < 0.02) continue;

        // Per-character independent tick & glyph
        const tick = Math.floor(time * clockRate * (localSpeed / Math.max(1, speed)) + glyphPhase + t * 0.37 + glyphJitter);
        const gSeedVal = hashUnit(this.seed ^ (i * 1237) ^ (t * 89) ^ tick);
        const glyph = Math.floor(gSeedVal * charsetLen) % charsetLen;

        const curSizeVar = 1 + (hashUnit(this.seed ^ (i * 101) ^ (t * 31)) - 0.5) * sizeVar * (1 - denseBoost * 0.7);
        const curveX = (row - this.rows * 0.5) * curveSlope * cell;

        const s = this.samples[count]!;
        s.x = baseX + ox + curveX;
        s.y = y;
        s.column = i;
        s.row = row;
        s.trailIndex = t;
        s.glyph = glyph;
        s.brightness = brightness;
        s.alpha = alpha;
        s.size = cell * baseSize * curSizeVar * (0.82 + form.depth * 0.5 + denseBoost * 0.12);
        s.scaleX = 1 + form.depth * 0.4;
        s.scaleY = 1 + form.depth * 0.18 + form.density * 0.1;
        s.rotation = (gSeed - 0.5) * 0.06 + form.edge * 0.05;
        s.maskValue = form.density;
        s.edgeValue = form.edge;
        s.depthValue = form.depth;
        count += 1;
      }
    }
    return count;
  }

  private zeroForm() {
    const f = this.formA;
    f.density = 0;
    f.edge = 0;
    f.depth = 0;
    f.voidValue = 0;
    f.temporalDelay = 0;
    return f;
  }

  private sampleForm(
    nx: number,
    ny: number,
    time: number,
    progress: number,
    repeat: number,
    column: number,
  ) {
    const base = this.modulator.sample(this.formA, nx, ny, time, progress);
    if (repeat <= 0) return base;
    // Repeated anatomy: a fraction of columns also read the mask shifted, so a
    // nose or a shoulder briefly appears twice in the same field.
    const r = hashUnit(this.seed ^ (column * 911) ^ (this.frame * 7));
    if (r < repeat * 0.26) {
      const shift = (r < repeat * 0.13 ? -1 : 1) * 0.11;
      const echo = this.modulator.sample(this.formB, nx + shift, ny, time, progress);
      base.density = clamp01(base.density + echo.density * 0.65);
      base.edge = clamp01(base.edge + echo.edge * 0.55);
    }
    return base;
  }

  private wrapRow(pos: number): number {
    let r = pos % this.rows;
    if (r < 0) r += this.rows;
    return r;
  }

  private drawDebug(ctx: CanvasRenderingContext2D, config: RainRenderConfig): void {
    const { width, height } = config;
    ctx.save();
    ctx.globalAlpha = 1;
    const step = 16;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const f = this.modulator.sample(
          this.formB,
          x / width,
          y / height,
          config.time,
          config.progress,
        );
        if (f.voidValue > 0.4) {
          ctx.fillStyle = 'rgba(40,10,14,0.55)';
          ctx.fillRect(x, y, step, step);
        } else if (f.density > 0.25) {
          ctx.fillStyle = `rgba(230,138,152,${f.density * 0.22})`;
          ctx.fillRect(x, y, step, step);
        }
      }
    }
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffc0c9';
    ctx.fillText(
      `rain ${this.cols}x${this.rows} glyphs:${this.lastCount} frame:${this.frameId}`,
      12,
      12,
    );
    ctx.restore();
  }

  dispose(): void {
    this.atlas.dispose();
  }
}

function hashUnit(n: number): number {
  let x = n >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function trailEnvelopeTyped(
  trailIndex: number,
  length: number,
  persistence: number,
  envType: number,
): number {
  if (length <= 1) return 1;
  const t = trailIndex / (length - 1);
  if (envType === 0) {
    const head = t < 0.08 ? 1.2 : 0.85;
    return clamp01(head * Math.pow(Math.max(0, 1 - t), 1.8 + (1 - persistence) * 1.5));
  } else if (envType === 1) {
    return clamp01(Math.sin(Math.max(0, 1 - t) * Math.PI * 0.5));
  } else if (envType === 2) {
    const frag = trailIndex % 3 === 0 ? 0.45 : 1.0;
    return clamp01((1 - t) * frag);
  } else {
    return clamp01(0.55 * (1 - t * 0.4));
  }
}
