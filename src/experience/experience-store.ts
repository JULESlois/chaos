import { clamp, clamp01, damp, lerp } from '@/utils/math';
import {
  localProgressAt,
  phaseAt,
  type SceneId,
} from './phases';

export interface ExperienceState {
  /** Raw scroll position, 0–1 across the whole document. */
  progress: number;
  /** Damped progress. Everything visual reads this, never `progress`. */
  smoothedProgress: number;
  /** Which of the six screens the raw progress currently falls inside. */
  sceneId: SceneId;
  /** Progress within the current screen, 0–1. */
  localProgress: number;
  /** Absolute rate of change of `progress`, in units per second, damped. */
  scrollVelocity: number;
  /** -1 up, 1 down, 0 at rest. */
  scrollDirection: -1 | 0 | 1;
}

/** Below this units/sec the reader counts as still — masks reform here. */
const STILLNESS_THRESHOLD = 0.004;
/** How fast the visual progress catches up with the raw scroll. */
const PROGRESS_DAMPING = 6.5;
/** How fast the velocity readout decays back to zero. */
const VELOCITY_DAMPING = 5;
/** Velocity is normalised against this, so 1.0 means "flung". */
const VELOCITY_SCALE = 0.9;

/**
 * The single source of truth for where the reader is in the piece.
 *
 * Two things are deliberately separated: `progress` jumps with the scroll
 * wheel, `smoothedProgress` eases toward it. The scenes read the smoothed
 * value so a flick of the wheel becomes a glide rather than a cut, while the
 * scene routing reads the raw value so entering a screen is not delayed.
 *
 * Nothing here touches React. `update` is called once per frame from the
 * single ASCII animation loop, and subscribers are only notified when the
 * active screen actually changes — a handful of times per visit.
 */
export class ExperienceStore {
  private readonly state: ExperienceState = {
    progress: 0,
    smoothedProgress: 0,
    sceneId: 'void',
    localProgress: 0,
    scrollVelocity: 0,
    scrollDirection: 0,
  };

  private target = 0;
  private previousTarget = 0;
  private listeners = new Set<(scene: SceneId, previous: SceneId) => void>();

  /** Live state object. Reused every frame — read it, never store it. */
  get current(): Readonly<ExperienceState> {
    return this.state;
  }

  /** Called by the scroll driver. Cheap enough to call on every scroll event. */
  setProgress(raw: number): void {
    this.target = clamp01(raw);
  }

  /** Jumps the smoothed value to the raw one. Used on mount and on resize. */
  snap(raw: number): void {
    this.target = clamp01(raw);
    this.previousTarget = this.target;
    this.state.progress = this.target;
    this.state.smoothedProgress = this.target;
    this.state.scrollVelocity = 0;
    this.state.scrollDirection = 0;
    this.applyScene();
  }

  /**
   * Advances the smoothing. `delta` is in seconds and is clamped, so a
   * backgrounded tab that resumes after ten seconds eases in rather than
   * teleporting.
   */
  update(delta: number): void {
    const step = clamp(delta, 0, 1 / 15);
    const state = this.state;

    const rawDelta = this.target - this.previousTarget;
    this.previousTarget = this.target;
    state.progress = this.target;

    const instantVelocity = step > 0 ? Math.abs(rawDelta) / step / VELOCITY_SCALE : 0;
    state.scrollVelocity = lerp(
      state.scrollVelocity,
      clamp(instantVelocity, 0, 4),
      damp(VELOCITY_DAMPING, step),
    );

    if (Math.abs(rawDelta) / Math.max(step, 1e-4) > STILLNESS_THRESHOLD) {
      state.scrollDirection = rawDelta > 0 ? 1 : -1;
    } else if (state.scrollVelocity < STILLNESS_THRESHOLD) {
      state.scrollDirection = 0;
    }

    state.smoothedProgress = lerp(
      state.smoothedProgress,
      this.target,
      damp(PROGRESS_DAMPING, step),
    );

    this.applyScene();
  }

  /** Fires only when the active screen changes. Returns an unsubscribe. */
  subscribeScene(listener: (scene: SceneId, previous: SceneId) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  private applyScene(): void {
    const state = this.state;
    const phase = phaseAt(state.progress);
    state.localProgress = localProgressAt(state.progress, phase);

    if (phase.id === state.sceneId) return;
    const previous = state.sceneId;
    state.sceneId = phase.id;
    for (const listener of this.listeners) {
      try {
        listener(phase.id, previous);
      } catch (error) {
        console.error('[experience] scene listener threw', error);
      }
    }
  }
}

/** True when the reader has stopped moving — the cue for masks to reform. */
export function isStill(state: Readonly<ExperienceState>): boolean {
  return state.scrollVelocity < STILLNESS_THRESHOLD * 4;
}
