import { clamp01 } from '@/utils/math';
import type { EntropyInputs, SignalState } from './types';

/**
 * Weights are tuned so that ordinary browsing (some pointer movement,
 * some scrolling, shallow routes) lands in the 0.08–0.18 band.
 */
export const ENTROPY_WEIGHTS = {
  base: 0.06,
  pointer: 0.09,
  scroll: 0.11,
  routeDepth: 0.035,
  idle: 0.1,
  anomaly: 0.45,
} as const;

/** Idle only starts contributing after this many seconds of stillness. */
export const IDLE_ONSET_SECONDS = 12;
/** Idle contribution saturates here. */
export const IDLE_SATURATION_SECONDS = 60;

/** Route depth beyond this adds nothing further. */
export const MAX_ROUTE_DEPTH = 3;

export function normaliseIdle(idleDuration: number): number {
  if (idleDuration <= IDLE_ONSET_SECONDS) return 0;
  const span = IDLE_SATURATION_SECONDS - IDLE_ONSET_SECONDS;
  return clamp01((idleDuration - IDLE_ONSET_SECONDS) / span);
}

export function normaliseRouteDepth(routeDepth: number): number {
  if (routeDepth <= 0) return 0;
  return Math.min(routeDepth, MAX_ROUTE_DEPTH) / MAX_ROUTE_DEPTH;
}

/**
 * Computes the raw entropy target from interaction telemetry.
 * The result is always clamped to [0, 1]; individual inputs are clamped first
 * so out-of-range telemetry can never push the total past its weight.
 */
export function computeEntropy(inputs: EntropyInputs): number {
  const pointer = clamp01(inputs.pointerVelocity);
  const scroll = clamp01(inputs.scrollVelocity);
  const depth = normaliseRouteDepth(inputs.routeDepth);
  const idle = normaliseIdle(Math.max(0, inputs.idleDuration));
  const boost = clamp01(inputs.anomalyBoost);

  const total =
    ENTROPY_WEIGHTS.base +
    pointer * ENTROPY_WEIGHTS.pointer +
    scroll * ENTROPY_WEIGHTS.scroll +
    depth * ENTROPY_WEIGHTS.routeDepth +
    idle * ENTROPY_WEIGHTS.idle +
    boost * ENTROPY_WEIGHTS.anomaly;

  return clamp01(total);
}

/** Maps a smoothed entropy value onto the discrete signal state. */
export function entropyToSignalState(entropy: number, stabilised: boolean): SignalState {
  if (stabilised) return 'stable';
  if (entropy >= 0.95) return 'silence';
  if (entropy >= 0.7) return 'chaos';
  if (entropy >= 0.45) return 'alert';
  if (entropy >= 0.22) return 'drift';
  return 'stable';
}

/**
 * Smooths entropy toward its target with frame-rate independent damping.
 * Rising is slower than falling: the system is quick to calm down.
 */
export function smoothEntropy(current: number, target: number, delta: number): number {
  const speed = target > current ? 0.9 : 1.8;
  const factor = 1 - Math.exp(-speed * delta);
  return clamp01(current + (target - current) * factor);
}
