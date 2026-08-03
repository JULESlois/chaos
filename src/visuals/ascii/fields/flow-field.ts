import { valueNoise2D } from '@/utils/math';
import type { PointerState } from '../types';
import { addPointerObstacle, addPointerWake, type Vec2 } from './pointer-field';
import { addBoundaryFlow, addScrollShear } from './scroll-field';

export interface FlowParameters {
  /** Seconds. Advances the noise so the field is never static. */
  time: number;
  /** 0–1 from the tension controller. */
  distortion: number;
  /** Damped scroll speed. */
  scrollVelocity: number;
  scrollDirection: number;
  /** Spatial frequency of the curl noise. Higher is more turbulent. */
  scale: number;
}

const EPSILON = 0.0035;
const BASE_SPEED = 0.09;

/**
 * Curl of a scalar noise potential.
 *
 * Taking the perpendicular gradient rather than sampling noise directly gives
 * a divergence-free field: characters circulate instead of piling up in the
 * places where the noise happens to be high. That difference is the whole
 * reason the current screen reads as a fluid.
 */
function curlNoise(out: Vec2, x: number, y: number, time: number): void {
  const n1 = valueNoise2D(x, y + EPSILON + time);
  const n2 = valueNoise2D(x, y - EPSILON + time);
  const n3 = valueNoise2D(x + EPSILON, y + time);
  const n4 = valueNoise2D(x - EPSILON, y + time);

  out.x = (n1 - n2) / (2 * EPSILON);
  out.y = -(n3 - n4) / (2 * EPSILON);
}

/**
 * The combined vector field the current screen advects through.
 *
 * Six contributions, summed in a fixed order:
 *   base flow      — a slow prevailing drift, so the field has a grain
 *   curl noise     — the turbulence, scaled by the tension controller
 *   pointer obstacle — the reader's cursor displaces the medium
 *   pointer wake   — and drags it when it moves
 *   scroll shear   — the wheel strains the field rather than translating it
 *   boundary flow  — a soft inward push so the corners never empty out
 *
 * Writes into a caller-owned vector. Called once per particle per frame, so
 * it allocates nothing and takes no options object.
 */
export class FlowField {
  private readonly curl: Vec2 = { x: 0, y: 0 };

  sample(
    out: Vec2,
    nx: number,
    ny: number,
    pointer: Readonly<PointerState>,
    params: FlowParameters,
  ): Vec2 {
    const { time, distortion, scale } = params;

    // Base flow: a slow rightward-and-up drift that rotates over time, so
    // returning to the screen later does not look like the same loop.
    const angle = 0.6 + Math.sin(time * 0.05) * 0.35;
    out.x = Math.cos(angle) * BASE_SPEED;
    out.y = Math.sin(angle) * BASE_SPEED * 0.4;

    curlNoise(this.curl, nx * scale, ny * scale, time * 0.06);
    const turbulence = 0.012 + distortion * 0.05;
    out.x += this.curl.x * turbulence;
    out.y += this.curl.y * turbulence;

    addPointerObstacle(out, nx, ny, pointer, 0.55);
    addPointerWake(out, nx, ny, pointer, 0.4);
    addScrollShear(out, nx, ny, params.scrollVelocity, params.scrollDirection, 0.22);
    addBoundaryFlow(out, nx, ny, 0.35);

    return out;
  }
}
