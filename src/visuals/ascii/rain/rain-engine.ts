import { createRng } from '@/utils/math';
import type { RainConfig } from './rain-types';

/**
 * Owns the persistent state of every rain column.
 *
 * All state lives in parallel typed arrays sized to the current column count,
 * so a frame that draws thousands of characters allocates nothing. The engine
 * is deterministic: `populate` from a fixed seed always yields the same field,
 * which is what makes the keyframe reproducible and the rain the same on every
 * visit. Per-column chaos perturbations (speed scale, freeze, direction flip,
 * head nudge) are written by the field each frame and reset on demand.
 */
export class RainEngine {
  private cfg: RainConfig;
  readonly seed: number;

  private cols = 1;
  private rows = 1;

  // Per-column stream state.
  private readonly column: Float32Array;
  private readonly direction: Int8Array;
  private readonly speed: Float32Array;
  private readonly baseSpeed: Float32Array;
  private readonly length: Float32Array;
  private readonly headY: Float32Array;
  private readonly glyphSeed: Float32Array;
  private readonly mutationRate: Float32Array;
  private readonly phaseOffset: Float32Array;
  private readonly brightness: Float32Array;
  private readonly persistence: Float32Array;

  // Boot parameters
  private readonly bootReleaseAt: Float32Array;
  private readonly bootReleaseDuration: Float32Array;
  private readonly bootLineOffsetY: Float32Array;
  private readonly bootJitterX: Float32Array;
  private readonly bootFlickerPhase: Float32Array;
  private readonly bootFlickerRate: Float32Array;

  // Visual Irregularities
  private readonly laneOffset: Float32Array;
  private readonly driftAmplitude: Float32Array;
  private readonly driftFrequency: Float32Array;
  private readonly driftPhase: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly sizeVariance: Float32Array;
  private readonly spacing: Float32Array;
  private readonly dropoutRate: Float32Array;
  private readonly accelerationPhase: Float32Array;
  private readonly accelerationRate: Float32Array;
  private readonly accelerationAmount: Float32Array;
  private readonly glyphClockRate: Float32Array;
  private readonly glyphPhase: Float32Array;
  private readonly curveSlope: Float32Array;
  private readonly envelopeType: Uint8Array;

  // Per-column chaos state, reset each frame by the field.
  private readonly speedScale: Float32Array;
  private readonly frozen: Uint8Array;
  private readonly chaosDir: Float32Array;

  constructor(config: RainConfig, seed = config.seed) {
    this.cfg = config;
    this.seed = seed;
    const max = 2048;
    this.column = new Float32Array(max);
    this.direction = new Int8Array(max);
    this.speed = new Float32Array(max);
    this.baseSpeed = new Float32Array(max);
    this.length = new Float32Array(max);
    this.headY = new Float32Array(max);
    this.glyphSeed = new Float32Array(max);
    this.mutationRate = new Float32Array(max);
    this.phaseOffset = new Float32Array(max);
    this.brightness = new Float32Array(max);
    this.persistence = new Float32Array(max);

    this.bootReleaseAt = new Float32Array(max);
    this.bootReleaseDuration = new Float32Array(max);
    this.bootLineOffsetY = new Float32Array(max);
    this.bootJitterX = new Float32Array(max);
    this.bootFlickerPhase = new Float32Array(max);
    this.bootFlickerRate = new Float32Array(max);

    this.laneOffset = new Float32Array(max);
    this.driftAmplitude = new Float32Array(max);
    this.driftFrequency = new Float32Array(max);
    this.driftPhase = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.sizeVariance = new Float32Array(max);
    this.spacing = new Float32Array(max);
    this.dropoutRate = new Float32Array(max);
    this.accelerationPhase = new Float32Array(max);
    this.accelerationRate = new Float32Array(max);
    this.accelerationAmount = new Float32Array(max);
    this.glyphClockRate = new Float32Array(max);
    this.glyphPhase = new Float32Array(max);
    this.curveSlope = new Float32Array(max);
    this.envelopeType = new Uint8Array(max);

    this.speedScale = new Float32Array(max);
    this.frozen = new Uint8Array(max);
    this.chaosDir = new Float32Array(max);
  }

  get config(): RainConfig {
    return this.cfg;
  }

  /** Swaps the desktop/mobile preset. Re-populates so the field stays stable. */
  setConfig(config: RainConfig): void {
    if (config === this.cfg) return;
    this.cfg = config;
    this.populate();
  }

  get columnCount(): number {
    return this.cols;
  }

  get rowCount(): number {
    return this.rows;
  }

  /** Current head positions, valid after `update`. Read by the field. */
  get heads(): Float32Array {
    return this.headY;
  }

  /** Rebuilds the grid for a new column/row count and re-populates. */
  resize(cols: number, rows: number): void {
    const next = Math.max(1, Math.min(this.column.length, cols | 0));
    if (next !== this.cols || rows !== this.rows) {
      this.cols = next;
      this.rows = Math.max(1, rows | 0);
      this.populate();
    }
  }

  /** Deterministic layout from the seed. */
  populate(): void {
    const rng = createRng((this.seed ^ (this.cols * 0x9e37)) >>> 0);
    const { reverseRatio, lengthMin, lengthMax, mutationMin, mutationMax, brightnessMin, brightnessMax } = this.config;
    for (let i = 0; i < this.cols; i += 1) {
      this.column[i] = i;
      this.direction[i] = rng() < reverseRatio ? -1 : 1;

      // Non-regular speed distribution: 25% slow, 55% normal, 17% fast, 3% burst
      const rSpeed = rng();
      let speed = 8;
      if (rSpeed < 0.25) {
        speed = 2.5 + rng() * 3.5;
      } else if (rSpeed < 0.80) {
        speed = 6.0 + rng() * 8.0;
      } else if (rSpeed < 0.97) {
        speed = 14.0 + rng() * 11.0;
      } else {
        speed = 25.0 + rng() * 9.0;
      }

      this.speed[i] = speed;
      this.baseSpeed[i] = speed;
      this.length[i] = Math.round(lengthMin + rng() * (lengthMax - lengthMin));
      this.headY[i] = rng() * this.rows;
      this.glyphSeed[i] = rng();
      this.mutationRate[i] = mutationMin + rng() * (mutationMax - mutationMin);
      this.phaseOffset[i] = rng();
      this.brightness[i] = brightnessMin + rng() * (brightnessMax - brightnessMin);
      this.persistence[i] = 0.35 + rng() * 0.65;
      this.speedScale[i] = 1;
      this.frozen[i] = 0;
      this.chaosDir[i] = 1;

      // Boot parameters
      this.bootReleaseAt[i] = 0.42 + rng() * 0.44;
      this.bootReleaseDuration[i] = 0.12 + rng() * 0.12;
      this.bootLineOffsetY[i] = (rng() - 0.5) * 3.6;
      this.bootJitterX[i] = (rng() - 0.5) * 0.8;
      this.bootFlickerPhase[i] = rng() * Math.PI * 2;
      this.bootFlickerRate[i] = 1.5 + rng() * 4.5;

      // Visual Irregularities
      this.laneOffset[i] = (rng() - 0.5) * 0.7;
      this.driftAmplitude[i] = 0.3 + rng() * 1.5;
      this.driftFrequency[i] = 0.15 + rng() * 0.65;
      this.driftPhase[i] = rng() * Math.PI * 2;

      const rSize = rng();
      if (rSize < 0.30) {
        this.baseSize[i] = 0.72 + rng() * 0.15;
      } else if (rSize < 0.75) {
        this.baseSize[i] = 0.95 + rng() * 0.2;
      } else if (rSize < 0.95) {
        this.baseSize[i] = 1.25 + rng() * 0.25;
      } else {
        this.baseSize[i] = 1.6 + rng() * 0.4;
      }

      this.sizeVariance[i] = 0.05 + rng() * 0.2;
      this.spacing[i] = 0.75 + rng() * 0.65;
      this.dropoutRate[i] = rng() < 0.35 ? rng() * 0.22 : 0;
      this.accelerationPhase[i] = rng() * Math.PI * 2;
      this.accelerationRate[i] = 0.1 + rng() * 0.3;
      this.accelerationAmount[i] = 0.65 + rng() * 0.8;
      this.glyphClockRate[i] = 1.5 + rng() * 10.5;
      this.glyphPhase[i] = rng() * Math.PI * 2;

      const rCurve = rng();
      if (rCurve < 0.8) {
        this.curveSlope[i] = (rng() - 0.5) * 0.28;
      } else {
        this.curveSlope[i] = (rng() - 0.5) * 0.50;
      }

      const rEnv = rng();
      if (rEnv < 0.40) this.envelopeType[i] = 0;
      else if (rEnv < 0.70) this.envelopeType[i] = 1;
      else if (rEnv < 0.90) this.envelopeType[i] = 2;
      else this.envelopeType[i] = 3;
    }
  }

  /** Advances every non-frozen head by its (possibly chaos-scaled) speed. */
  update(delta: number): void {
    const d = Math.min(0.1, delta);
    for (let i = 0; i < this.cols; i += 1) {
      if (this.frozen[i]) continue;
      const v = this.direction[i] * this.chaosDir[i] * this.speed[i] * this.speedScale[i] * d;
      let h = this.headY[i] + v;
      // Wrap into [0, rows).
      h %= this.rows;
      if (h < 0) h += this.rows;
      this.headY[i] = h;
    }
  }

  // ── chaos write API (called by the field each frame) ──

  resetChaos(): void {
    for (let i = 0; i < this.cols; i += 1) {
      this.speedScale[i] = 1;
      this.frozen[i] = 0;
      this.chaosDir[i] = 1;
    }
  }

  setSpeedScale(column: number, scale: number): void {
    if (column >= 0 && column < this.cols) this.speedScale[column] = scale;
  }

  /**
   * Multiplies a column's speed scale instead of replacing it.
   *
   * Form drag and signal collapse are independent reasons for a column to run
   * slow and both are applied in the same frame, so the second one to be
   * written must compose with the first rather than overwrite it.
   */
  scaleSpeed(column: number, factor: number): void {
    if (column >= 0 && column < this.cols) this.speedScale[column]! *= factor;
  }

  setFrozen(column: number, frozen: boolean): void {
    if (column >= 0 && column < this.cols) this.frozen[column] = frozen ? 1 : 0;
  }

  setChaosDirection(column: number, dir: number): void {
    if (column >= 0 && column < this.cols) this.chaosDir[column] = dir;
  }

  /** Jumps a head by a whole number of cells (column phase error). */
  nudgeHead(column: number, cells: number): void {
    if (column >= 0 && column < this.cols) {
      let h = this.headY[column]! + cells;
      h %= this.rows;
      if (h < 0) h += this.rows;
      this.headY[column] = h;
    }
  }

  // ── read access for sampling ──

  getSpeed(column: number): number {
    return this.speed[column] ?? 0;
  }
  getLength(column: number): number {
    return this.length[column] ?? 0;
  }
  getGlyphSeed(column: number): number {
    return this.glyphSeed[column] ?? 0;
  }
  getMutationRate(column: number): number {
    return this.mutationRate[column] ?? 0;
  }
  getPhaseOffset(column: number): number {
    return this.phaseOffset[column] ?? 0;
  }
  getBrightness(column: number): number {
    return this.brightness[column] ?? 0;
  }
  getPersistence(column: number): number {
    return this.persistence[column] ?? 0;
  }
  getDirection(column: number): number {
    return this.direction[column] ?? 1;
  }

  getBootReleaseAt(column: number): number { return this.bootReleaseAt[column] ?? 0.5; }
  getBootReleaseDuration(column: number): number { return this.bootReleaseDuration[column] ?? 0.15; }
  getBootLineOffsetY(column: number): number { return this.bootLineOffsetY[column] ?? 0; }
  getBootJitterX(column: number): number { return this.bootJitterX[column] ?? 0; }
  getBootFlickerPhase(column: number): number { return this.bootFlickerPhase[column] ?? 0; }
  getBootFlickerRate(column: number): number { return this.bootFlickerRate[column] ?? 2; }

  getLaneOffset(column: number): number { return this.laneOffset[column] ?? 0; }
  getDriftAmplitude(column: number): number { return this.driftAmplitude[column] ?? 0; }
  getDriftFrequency(column: number): number { return this.driftFrequency[column] ?? 0; }
  getDriftPhase(column: number): number { return this.driftPhase[column] ?? 0; }
  getBaseSize(column: number): number { return this.baseSize[column] ?? 1; }
  getSizeVariance(column: number): number { return this.sizeVariance[column] ?? 0.1; }
  getSpacing(column: number): number { return this.spacing[column] ?? 1; }
  getDropoutRate(column: number): number { return this.dropoutRate[column] ?? 0; }
  getAccelerationPhase(column: number): number { return this.accelerationPhase[column] ?? 0; }
  getAccelerationRate(column: number): number { return this.accelerationRate[column] ?? 0.2; }
  getAccelerationAmount(column: number): number { return this.accelerationAmount[column] ?? 1; }
  getGlyphClockRate(column: number): number { return this.glyphClockRate[column] ?? 5; }
  getGlyphPhase(column: number): number { return this.glyphPhase[column] ?? 0; }
  getCurveSlope(column: number): number { return this.curveSlope[column] ?? 0; }
  getEnvelopeType(column: number): number { return this.envelopeType[column] ?? 0; }

  /** Largest trail length in the field — used to size sample capacity. */
  maxLength(): number {
    let m = 1;
    for (let i = 0; i < this.cols; i += 1) m = Math.max(m, this.length[i]!);
    return m;
  }

  get reverseCount(): number {
    let n = 0;
    for (let i = 0; i < this.cols; i += 1) if (this.direction[i] === -1) n += 1;
    return n;
  }

  /** Exposed for tests that check speed/length stay in range. */
  ranges(): { speedMin: number; speedMax: number; lengthMin: number; lengthMax: number } {
    let sMin = Infinity;
    let sMax = -Infinity;
    let lMin = Infinity;
    let lMax = -Infinity;
    for (let i = 0; i < this.cols; i += 1) {
      sMin = Math.min(sMin, this.speed[i]!);
      sMax = Math.max(sMax, this.speed[i]!);
      lMin = Math.min(lMin, this.length[i]!);
      lMax = Math.max(lMax, this.length[i]!);
    }
    return { speedMin: sMin, speedMax: sMax, lengthMin: lMin, lengthMax: lMax };
  }
}
