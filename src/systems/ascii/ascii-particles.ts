import { clamp01 } from '@/utils/math';
import type { AsciiFocusRegion, TrailSample } from './types';

/**
 * Pointer trail buffer.
 *
 * A fixed-size ring of samples — no allocation after construction.
 * Samples decay each frame and are read by the engine as additive intensity.
 */
export class TrailBuffer {
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly strengths: Float32Array;
  private head = 0;
  private readonly capacity: number;

  constructor(capacity = 24) {
    this.capacity = capacity;
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.strengths = new Float32Array(capacity);
  }

  /** Records a normalised pointer position. */
  push(x: number, y: number, strength: number): void {
    this.head = (this.head + 1) % this.capacity;
    this.xs[this.head] = x;
    this.ys[this.head] = y;
    this.strengths[this.head] = clamp01(strength);
  }

  /** Exponentially decays every sample. */
  decay(delta: number, rate = 2.6): void {
    const factor = Math.exp(-rate * delta);
    for (let i = 0; i < this.capacity; i += 1) {
      const value = this.strengths[i] * factor;
      this.strengths[i] = value < 0.002 ? 0 : value;
    }
  }

  /**
   * Accumulated influence of the trail at a normalised point.
   * Uses squared distance to avoid a sqrt per cell per sample.
   */
  influenceAt(x: number, y: number, radiusSq: number): number {
    let total = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      const strength = this.strengths[i];
      if (strength === 0) continue;
      const dx = x - this.xs[i];
      const dy = y - this.ys[i];
      const distSq = dx * dx + dy * dy;
      if (distSq >= radiusSq) continue;
      total += strength * (1 - distSq / radiusSq);
    }
    return total;
  }

  clear(): void {
    this.strengths.fill(0);
  }

  /** Debug/testing accessor. */
  samples(): TrailSample[] {
    const result: TrailSample[] = [];
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.strengths[i] > 0) {
        result.push({ x: this.xs[i], y: this.ys[i], strength: this.strengths[i] });
      }
    }
    return result;
  }
}

/**
 * Tracks convergence toward a focus region (used by the TV absorb effect
 * and by link hover clustering).
 */
export class FocusController {
  private region: AsciiFocusRegion = { x: 0.5, y: 0.5, radius: 0.25, strength: 0 };
  private targetStrength = 0;

  setTarget(x: number, y: number, radius: number): void {
    this.region.x = x;
    this.region.y = y;
    this.region.radius = Math.max(0.02, radius);
  }

  engage(strength = 1): void {
    this.targetStrength = clamp01(strength);
  }

  release(): void {
    this.targetStrength = 0;
  }

  update(delta: number, speed = 2.2): void {
    const factor = 1 - Math.exp(-speed * delta);
    this.region.strength += (this.targetStrength - this.region.strength) * factor;
    if (Math.abs(this.region.strength - this.targetStrength) < 0.001) {
      this.region.strength = this.targetStrength;
    }
  }

  get current(): Readonly<AsciiFocusRegion> {
    return this.region;
  }

  get isActive(): boolean {
    return this.region.strength > 0.002;
  }
}

/**
 * Tracks columns knocked out by the `dead-column` anomaly.
 * Stored as a byte per column so lookups during render are O(1).
 */
export class DeadColumnMask {
  private mask: Uint8Array;

  constructor(columns: number) {
    this.mask = new Uint8Array(columns);
  }

  resize(columns: number): void {
    if (this.mask.length !== columns) {
      this.mask = new Uint8Array(columns);
    }
  }

  /** Kills a run of columns starting at a seeded position. */
  kill(seed: number, count = 2): void {
    if (this.mask.length === 0) return;
    const start = seed % this.mask.length;
    for (let i = 0; i < count; i += 1) {
      this.mask[(start + i) % this.mask.length] = 1;
    }
  }

  clear(): void {
    this.mask.fill(0);
  }

  isDead(column: number): boolean {
    return this.mask[column] === 1;
  }

  get hasAny(): boolean {
    return this.mask.some((value) => value === 1);
  }
}
