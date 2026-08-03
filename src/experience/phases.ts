/**
 * The six screens of the piece.
 *
 * Scroll distance is the only timeline. Each phase owns a slice of the
 * document height; the slices are declared in viewport heights and the
 * normalised 0–1 ranges are derived from them, so retuning the pacing is a
 * matter of changing one number and nothing else has to agree with it.
 */

export type SceneId = 'void' | 'current' | 'form' | 'chaos' | 'silence' | 'television';

export interface ExperiencePhase {
  readonly id: SceneId;
  /** Height of this phase's scroll spacer, in viewport heights. */
  readonly heightVh: number;
  /** Normalised start of the phase within the whole timeline. */
  readonly start: number;
  /** Normalised end of the phase within the whole timeline. */
  readonly end: number;
}

interface PhaseSpec {
  readonly id: SceneId;
  readonly heightVh: number;
}

/** 800vh total — inside the 700–900vh the piece is designed around. */
const PHASE_SPECS: readonly PhaseSpec[] = [
  { id: 'void', heightVh: 90 },
  { id: 'current', heightVh: 170 },
  { id: 'form', heightVh: 170 },
  { id: 'chaos', heightVh: 150 },
  { id: 'silence', heightVh: 100 },
  { id: 'television', heightVh: 120 },
];

export const TOTAL_HEIGHT_VH = PHASE_SPECS.reduce((sum, spec) => sum + spec.heightVh, 0);

function buildPhases(): readonly ExperiencePhase[] {
  let cursor = 0;
  return PHASE_SPECS.map((spec) => {
    const start = cursor / TOTAL_HEIGHT_VH;
    cursor += spec.heightVh;
    const end = cursor / TOTAL_HEIGHT_VH;
    return { id: spec.id, heightVh: spec.heightVh, start, end };
  });
}

export const EXPERIENCE_PHASES = buildPhases();

export const SCENE_IDS: readonly SceneId[] = EXPERIENCE_PHASES.map((phase) => phase.id);

/** The phase a normalised progress value falls inside. Never returns undefined. */
export function phaseAt(progress: number): ExperiencePhase {
  const clamped = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  for (let index = 0; index < EXPERIENCE_PHASES.length; index += 1) {
    const phase = EXPERIENCE_PHASES[index]!;
    if (clamped < phase.end) return phase;
  }
  return EXPERIENCE_PHASES[EXPERIENCE_PHASES.length - 1]!;
}

/** Progress within the phase that contains `progress`, clamped to 0–1. */
export function localProgressAt(progress: number, phase = phaseAt(progress)): number {
  const span = phase.end - phase.start;
  if (span <= 0) return 0;
  const local = (progress - phase.start) / span;
  return local <= 0 ? 0 : local >= 1 ? 1 : local;
}
