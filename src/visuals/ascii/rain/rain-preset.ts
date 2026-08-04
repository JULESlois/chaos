import { clamp01, smoothstep } from '@/utils/math';
import type { SceneId } from '@/experience/phases';
import type { AsciiRuntime } from '../types';
import { mix, type ChaosFaults, type FormWeights } from './rain-types';

/**
 * Everything a screen is allowed to say about the rain.
 *
 * This is the whole of the per-phase difference. There is one `RainField` for
 * the entire visit, and a screen cannot own simulation state, reseed the
 * field, or draw a second rain — it can only describe how the one rain should
 * behave while the reader is on it. That constraint is the point: it is what
 * makes the rain continuous across a phase boundary instead of restarting.
 */
export interface RainParams {
  /**
   * How much rain this phase shows at all, 0–1.
   *
   * Zero for VOID, which predates the rain. Blending this rather than
   * switching fields is what lets the rain fade up into CURRENT without the
   * simulation having to start over.
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
  formWeights: FormWeights;
  chaos: ChaosFaults;
}

/**
 * A screen's rain parameters, as a pure function of the frame.
 *
 * `apply` must write every field of `out` and must not retain anything: the
 * same preset is evaluated twice during a crossfade, once for the screen being
 * left and once for the screen being entered.
 */
export interface RainPreset {
  readonly id: SceneId;
  /**
   * @param progress Local progress *for this preset*, 0–1. During a crossfade
   * the outgoing screen is evaluated at 1 — it has just finished — rather than
   * at the incoming screen's progress, which would snap its forms to their
   * opening values at the exact moment they should be fading out.
   */
  apply(out: RainParams, runtime: AsciiRuntime, progress: number): void;
}

export function createRainParams(): RainParams {
  return {
    weight: 0,
    bootProgress: 1,
    bootLineStrength: 0,
    releaseStrength: 1,
    trailGrowth: 1,
    trajectoryDistortion: 0,
    trajectoryAnomaly: 0,
    mutationIntensity: 0,
    glyphPoolMix: 0,
    formWeights: { face: 0, figure: 0, hand: 0 },
    chaos: {
      intensity: 0,
      phaseError: 0,
      maskDrift: 0,
      frozen: 0,
      directionInversion: 0,
      collapse: 0,
      repeat: 0,
    },
  };
}

/** Linear blend of two parameter sets into a third. Allocates nothing. */
export function blendRainParams(out: RainParams, a: RainParams, b: RainParams, t: number): void {
  out.weight = mix(a.weight, b.weight, t);
  out.bootProgress = mix(a.bootProgress, b.bootProgress, t);
  out.bootLineStrength = mix(a.bootLineStrength, b.bootLineStrength, t);
  out.releaseStrength = mix(a.releaseStrength, b.releaseStrength, t);
  out.trailGrowth = mix(a.trailGrowth, b.trailGrowth, t);
  
  out.trajectoryDistortion = mix(a.trajectoryDistortion, b.trajectoryDistortion, t);
  out.trajectoryAnomaly = mix(a.trajectoryAnomaly, b.trajectoryAnomaly, t);
  out.mutationIntensity = mix(a.mutationIntensity, b.mutationIntensity, t);
  out.glyphPoolMix = mix(a.glyphPoolMix, b.glyphPoolMix, t);

  out.formWeights.face = mix(a.formWeights.face, b.formWeights.face, t);
  out.formWeights.figure = mix(a.formWeights.figure, b.formWeights.figure, t);
  out.formWeights.hand = mix(a.formWeights.hand, b.formWeights.hand, t);

  const ca = a.chaos;
  const cb = b.chaos;
  const co = out.chaos;
  co.intensity = mix(ca.intensity, cb.intensity, t);
  co.phaseError = mix(ca.phaseError, cb.phaseError, t);
  co.maskDrift = mix(ca.maskDrift, cb.maskDrift, t);
  co.frozen = mix(ca.frozen, cb.frozen, t);
  co.directionInversion = mix(ca.directionInversion, cb.directionInversion, t);
  co.collapse = mix(ca.collapse, cb.collapse, t);
  co.repeat = mix(ca.repeat, cb.repeat, t);
}

function noForm(out: RainParams): void {
  out.formWeights.face = 0;
  out.formWeights.figure = 0;
  out.formWeights.hand = 0;
}

function noFaults(out: RainParams): void {
  const c = out.chaos;
  c.intensity = 0;
  c.phaseError = 0;
  c.maskDrift = 0;
  c.frozen = 0;
  c.directionInversion = 0;
  c.collapse = 0;
  c.repeat = 0;
}

/** VOID predates the rain. The field exists but is not shown. */
export const VOID_PRESET: RainPreset = {
  id: 'void',
  apply(out, _runtime, p) {
    out.weight = smoothstep(0.02, 0.20, p);
    out.bootProgress = p;
    out.bootLineStrength = smoothstep(0.05, 0.35, p) * (1 - smoothstep(0.8, 1.0, p));
    out.releaseStrength = smoothstep(0.42, 0.86, p);
    out.trailGrowth = smoothstep(0.50, 0.95, p);
    out.trajectoryDistortion = 0;
    out.trajectoryAnomaly = 0;
    out.mutationIntensity = 0.25;
    out.glyphPoolMix = 0;
    noForm(out);
    noFaults(out);
  },
};

/**
 * CURRENT — the rain establishes itself. No forms, no faults, just the
 * vocabulary the later screens bend.
 */
export const CURRENT_PRESET: RainPreset = {
  id: 'current',
  apply(out, _runtime, p) {
    out.weight = 1;
    out.bootProgress = 1;
    out.bootLineStrength = 0;
    out.releaseStrength = 1;
    out.trailGrowth = 1;
    
    out.trajectoryDistortion = smoothstep(0.48, 0.62, p);
    out.trajectoryAnomaly = smoothstep(0.5, 0.75, p) * 0.65;
    out.mutationIntensity = mix(0.45, 0.7, smoothstep(0.4, 0.7, p));
    out.glyphPoolMix = smoothstep(0.5, 0.8, p) * 0.4;
    
    noForm(out);
    noFaults(out);
  },
};

/**
 * FORM — the overlapping face → figure → hand schedule.
 *
 * The three never cut: the half-face is still dissolving when the shoulders
 * arrive, and the fingers are already at the edge by the time it goes.
 */
export const FORM_PRESET: RainPreset = {
  id: 'form',
  apply(out, _runtime, p) {
    out.weight = 1;
    out.trajectoryDistortion = 1;
    out.trajectoryAnomaly = 0.8;
    out.mutationIntensity = 0.7;
    out.glyphPoolMix = 0.5;
    noFaults(out);
    const w = out.formWeights;
    w.face = smoothstep(0.1, 0.3, p) * (1 - smoothstep(0.74, 0.96, p) * 0.85);
    w.figure = smoothstep(0.32, 0.52, p) * (1 - smoothstep(0.88, 1, p) * 0.7);
    w.hand = smoothstep(0.62, 0.84, p);
  },
};

/**
 * CHAOS — the rain and the thing it was drawing stop agreeing.
 *
 * The order of failure is authored by the tension timeline; the texture of
 * each failure is seeded, so the same scroll always breaks the same way.
 */
export const CHAOS_PRESET: RainPreset = {
  id: 'chaos',
  apply(out, runtime, p) {
    out.weight = 1;
    out.trajectoryDistortion = 1;
    out.trajectoryAnomaly = 1;
    out.mutationIntensity = clamp01(0.7 + smoothstep(0, 1, p) * 0.3);
    out.glyphPoolMix = clamp01(0.5 + smoothstep(0, 1, p) * 0.5);
    const tension = runtime.tension;
    const c = out.chaos;

    // `flowDistortion` is the authored ramp; scroll and pointer speed can make
    // a failure worse but cannot invent or reorder one.
    const drive = clamp01(tension.flowDistortion * 0.75 + smoothstep(0.05, 0.6, p) * 0.45);
    const agitation = clamp01(
      runtime.experience.scrollVelocity * 0.4 + runtime.pointer.speed * 0.3,
    );

    c.intensity = clamp01(drive + agitation * 0.18);
    // Time splits first: columns fall out of the present before anything else.
    c.phaseError = clamp01(smoothstep(0.04, 0.34, p) * (0.5 + drive * 0.6));
    // Then the form and its medium stop agreeing.
    c.maskDrift = clamp01(smoothstep(0.18, 0.55, p) * (1 - tension.maskCoherence) * 1.3);
    // Dead columns arrive as frozen regions, driven by the authored envelope.
    c.frozen = clamp01(runtime.events['dead-column'] * 0.85 + smoothstep(0.4, 0.8, p) * 0.35);
    // Patches invert against the field once the tear channel opens.
    c.directionInversion = clamp01(tension.tearAmount * 1.1 + smoothstep(0.5, 0.85, p) * 0.4);
    // Anatomy repeats late — the signal is retransmitting what it already sent.
    c.repeat = clamp01(
      smoothstep(0.55, 0.9, p) * (0.4 + runtime.events['glyph-substitution'] * 0.7),
    );
    // Collapse. The field stops mid-escalation; the silence is the point.
    c.collapse = smoothstep(0.86, 1, p);

    // The forms do not leave when chaos arrives — they are what is being torn.
    // The face lingers longest, the hand last touched the glass most recently.
    const alive = 1 - smoothstep(0.82, 1, p);
    const w = out.formWeights;
    w.face = clamp01((0.55 - smoothstep(0.3, 0.75, p) * 0.4) * alive);
    w.figure = clamp01((0.4 - smoothstep(0.45, 0.9, p) * 0.3) * alive);
    w.hand = clamp01(0.3 * (1 - smoothstep(0.2, 0.6, p)) * alive);
  },
};

/**
 * SILENCE — the rain does not leave, it stops.
 *
 * Almost every column is frozen mid-fall, so the field reads as a paused frame
 * of something that was moving a second ago. Every few seconds the signal
 * tries once: a short re-scan runs down a handful of columns and fails again.
 */
export const SILENCE_PRESET: RainPreset = {
  id: 'silence',
  apply(out, runtime, p) {
    out.weight = 1;
    out.trajectoryDistortion = 1;
    out.trajectoryAnomaly = 1;
    out.mutationIntensity = 1;
    out.glyphPoolMix = 1;
    const c = out.chaos;

    const beat = (runtime.time % 5.4) / 5.4;
    const retry = Math.pow(1 - smoothstep(0, 0.16, beat), 2) * (1 - smoothstep(0.55, 1, p));

    c.intensity = 1;
    c.collapse = clamp01(0.88 + p * 0.11 - retry * 0.55);
    c.frozen = clamp01(0.72 + p * 0.24 - retry * 0.5);
    c.phaseError = 0.12 * (1 - p);
    c.maskDrift = 0.08 * (1 - p);
    c.directionInversion = 0;
    c.repeat = 0;

    // What is left of the last form, held still and fading out.
    const residue = (1 - smoothstep(0.1, 0.72, p)) * 0.42;
    const w = out.formWeights;
    w.face = residue;
    w.figure = residue * 0.45;
    w.hand = 0;
  },
};

/**
 * TELEVISION — the signal resumes.
 *
 * It thaws out of SILENCE over the first fifth of the screen and lets the
 * half-face surface again every so often. The channel is still transmitting
 * the same thing; the only new fact is the cabinet around it.
 */
export const TELEVISION_PRESET: RainPreset = {
  id: 'television',
  apply(out, runtime, p) {
    out.weight = 1;
    out.trajectoryDistortion = 1;
    out.trajectoryAnomaly = 1;
    out.mutationIntensity = 1;
    out.glyphPoolMix = 1;
    const c = out.chaos;

    // SILENCE handed over a frozen field, so the first fifth of this screen is
    // the rain coming back rather than the rain appearing.
    const thaw = smoothstep(0, 0.2, p);
    c.intensity = 1 - thaw * 0.9;
    c.collapse = (1 - thaw) * 0.85;
    c.frozen = (1 - thaw) * 0.6;
    c.phaseError = (1 - thaw) * 0.2;
    c.maskDrift = 0;
    c.directionInversion = 0;
    c.repeat = 0;

    // The broadcast keeps its subject. The face breathes in and out slowly so
    // the screen in the room is never a dead texture.
    const breath = 0.5 + 0.5 * Math.sin(runtime.time * 0.21);
    const w = out.formWeights;
    w.face = clamp01(thaw * (0.24 + breath * 0.3));
    w.figure = clamp01(thaw * (0.1 + (1 - breath) * 0.16));
    w.hand = 0;
  },
};

export const RAIN_PRESETS: Record<SceneId, RainPreset> = {
  void: VOID_PRESET,
  current: CURRENT_PRESET,
  form: FORM_PRESET,
  chaos: CHAOS_PRESET,
  silence: SILENCE_PRESET,
  television: TELEVISION_PRESET,
};
