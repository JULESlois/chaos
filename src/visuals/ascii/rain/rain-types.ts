import type { PointerState, QualityTier } from '../types';

/**
 * One column of the rain.
 *
 * A stream is a persistent, deterministic object: it owns its speed, length,
 * phase and mutation cadence for the whole visit. The characters are a function
 * of time sampled against the stream, never stored per character.
 */
export interface RainStream {
  /** Column index in the current grid. */
  column: number;
  /** Head position along the column, in cell rows. Wraps over `rows`. */
  headY: number;
  /** +1 down, -1 up. */
  direction: 1 | -1;
  /** Cells advanced per second. */
  speed: number;
  /** Trail length in cells. */
  length: number;
  /** Seed for glyph selection / mutation, 0–1. */
  glyphSeed: number;
  /** How often the head glyph changes, 0–1 (higher = faster mutation). */
  mutationRate: number;
  /** Phase offset so columns do not update in lockstep. */
  phaseOffset: number;
  /** Peak brightness for this stream, 0–1. */
  brightness: number;
  /** 0–1, how much the tail resists fading (longer-lived trails). */
  persistence: number;
}

/** A single drawn character, sampled from a stream at a trail position. */
export interface RainGlyphSample {
  x: number;
  y: number;
  column: number;
  row: number;
  trailIndex: number;
  glyph: number;
  brightness: number;
  alpha: number;
  size: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  maskValue: number;
  edgeValue: number;
  depthValue: number;
}

/**
 * What the form modulator contributes at a screen coordinate.
 *
 * It never says *where* a character goes. It only perturbs how the rain that is
 * already passing through that point behaves — its speed, brightness, void and
 * time offset. That is what keeps the form a property of the rain rather than a
 * picture laid on top of it.
 */
export interface FormSample {
  /** 0–1. Raises brightness and slows the local rain. */
  density: number;
  /** 0–1. Brief highlight, used for outlines. */
  edge: number;
  /** 0–1. Depth/speed cue; stretches and enlarges. */
  depth: number;
  /** 0–1. Suppresses characters to carve negative space (eye sockets). */
  voidValue: number;
  /** 0–1. Fraction of a second the local rain samples from an earlier frame. */
  temporalDelay: number;
}

export interface RainConfig {
  /** Fixed seed. Same seed → same field on every visit. */
  seed: number;
  /** Upward-stream ratio, 0–1 (spec suggests 0.05–0.12). */
  reverseRatio: number;
  speedMin: number;
  speedMax: number;
  lengthMin: number;
  lengthMax: number;
  /** 0–1, how fast heads mutate. */
  mutationMin: number;
  mutationMax: number;
  /** Peak brightness range. */
  brightnessMin: number;
  brightnessMax: number;
}

/** How strongly each form bends the rain, 0–1. They overlap freely. */
export interface FormWeights {
  face: number;
  figure: number;
  hand: number;
}

export const NO_FORM: FormWeights = { face: 0, figure: 0, hand: 0 };

export interface ChaosFaults {
  /** 0–1 overall escalation from the tension controller. */
  intensity: number;
  /** Columns jump ±this many cells of phase. */
  phaseError: number;
  /** 0–1 horizontal mask drift relative to the rain. */
  maskDrift: number;
  /** 0–1 chance a local column is frozen in place. */
  frozen: number;
  /** 0–1 regions invert direction against the field. */
  directionInversion: number;
  /** 0–1 signal collapse: rain slows, thins, then stops. */
  collapse: number;
  /** Extra anatomy repeats (0–1) — late in chaos. */
  repeat: number;
}

export interface RainRenderConfig {
  /** CSS pixel viewport. */
  width: number;
  height: number;
  /** Glyph cell size in CSS pixels (square). */
  cell: number;
  time: number;
  delta: number;
  /** 0–1 local scene progress. */
  progress: number;
  seed: number;
  quality: QualityTier;
  pointer: Readonly<PointerState>;
  reducedMotion: boolean;
  /** Per-form weights, 0–1, summed freely so they may overlap. */
  formWeights: { face: number; figure: number; hand: number };
  chaos: ChaosFaults;
  /**
   * Overall visibility of the field, 0–1.
   *
   * Scales every sample's alpha. This is how a phase that shows no rain (VOID)
   * and a phase that does are blended: the one field keeps simulating
   * throughout and only its opacity crosses, so nothing has to restart.
   */
  weight: number;
  bootProgress: number;
  bootLineStrength: number;
  releaseStrength: number;
  trailGrowth: number;

  trajectoryDistortion: number;
  trajectoryAnomaly: number;
  mutationIntensity: number;
  glyphPoolMix: number;

  /** Debug overlay of the form masks. */
  debug: boolean;
  /** Frame id, bumped each render, used by the shared signal surface. */
  frameId: number;
}

/** No faults. CURRENT and FORM render with this; only CHAOS deviates. */
export const NORMAL_CHAOS: ChaosFaults = {
  intensity: 0,
  phaseError: 0,
  maskDrift: 0,
  frozen: 0,
  directionInversion: 0,
  collapse: 0,
  repeat: 0,
};

export const DEFAULT_RAIN_CONFIG: RainConfig = {
  seed: 2407,
  reverseRatio: 0.09,
  speedMin: 5.5,
  speedMax: 17,
  lengthMin: 7,
  lengthMax: 34,
  mutationMin: 0.25,
  mutationMax: 0.9,
  brightnessMin: 0.35,
  brightnessMax: 1,
};

/** Row→tail brightness envelope. Head (i=0) is brightest, tail fades. */
export function trailEnvelope(trailIndex: number, length: number, persistence: number): number {
  if (length <= 1) return 1;
  const t = trailIndex / (length - 1);
  // Bright head for the first 10%, stable middle, long fade to nothing.
  const head = t < 0.1 ? 1 - t * 1.4 : 0.86;
  const tail = 1 - t;
  const fade = Math.pow(Math.max(0, tail), 1 + (1 - persistence) * 2.2);
  return clamp01(head * 0.5 + fade * 0.5);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
