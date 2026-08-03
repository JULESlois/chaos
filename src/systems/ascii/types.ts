/** ASCII field domain types. */

export interface AsciiGridMetrics {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** Device-pixel canvas size. */
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  fontSize: number;
}

export interface AsciiPointer {
  /** Normalised 0–1 position across the viewport. */
  x: number;
  y: number;
  /** Normalised speed, 0–1. */
  speed: number;
  active: boolean;
}

/** A short-lived pointer trail sample. */
export interface TrailSample {
  x: number;
  y: number;
  strength: number;
}

export interface AsciiFocusRegion {
  /** Normalised centre of attraction. */
  x: number;
  y: number;
  /** Normalised radius. */
  radius: number;
  /** 0 = inactive, 1 = fully converged. */
  strength: number;
}

export interface AsciiEngineOptions {
  /** Maximum number of cells the engine may allocate. */
  cellBudget: number;
  maxDpr: number;
  /** Target frames per second; the engine may drop below this adaptively. */
  targetFps: number;
  reducedMotion: boolean;
}

export interface AsciiFrameState {
  elapsed: number;
  delta: number;
  entropy: number;
  scrollVelocity: number;
  scrollOffset: number;
}

/** Quality tiers the engine steps through when frame time degrades. */
export type AsciiQuality = 'high' | 'medium' | 'low';

export const QUALITY_FPS: Record<AsciiQuality, number> = {
  high: 45,
  medium: 30,
  low: 24,
};
