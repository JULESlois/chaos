/**
 * The geometry of the reveal, with no renderer attached.
 *
 * Everything here is arithmetic on numbers and a camera matrix: where the
 * screen plane is, how far back you have to stand for it to fill the viewport,
 * and where its corners land in CSS pixels once you do. It lives apart from
 * `CameraDirector` for one reason — the claim the whole transition rests on,
 * that at progress 0 the picture covers the viewport exactly, should be
 * checkable without starting a WebGL context, on a phone, in CI, anywhere.
 */
import * as THREE from 'three';
import { revealState } from '@/systems/signal/reveal-state';

/** Where the picture plane lives in the set, and how big it is. */
export const SCREEN_CENTRE: readonly [number, number, number] = [0, 1.56, 0.305];
export const SCREEN_HALF_WIDTH = 0.51;
export const SCREEN_HALF_HEIGHT = 0.39;

/**
 * The four stations of the reveal.
 *
 *  0  insideSignal   — the camera is *in* the picture; the screen is the world
 *  1  glassSurface   — back through the glass, the frame becomes an edge
 *  2  cabinetReveal  — the object appears: bezel, cabinet, the table it sits on
 *  3  interactive    — settled in the room, close enough to reach the buttons
 *
 * The z of the first two is not authored. It is solved each frame from the
 * camera's own fov and aspect, because the only distance at which the handoff
 * from the full-screen field is invisible is the one where the screen plane
 * exactly spans the viewport — and that distance is different on a phone held
 * upright than on a desktop. Everything after the glass is authored, because
 * by then the reader can see the room and the framing is a composition choice
 * rather than a continuity constraint.
 */
export const TV_REVEAL_STATIONS: readonly [number, number, number][] = [
  [0, 1.56, 0.305],
  [0.02, 1.575, 0.305],
  [0.18, 1.72, 2.25],
  [0.35, 1.92, 4.1],
];

export const TV_REVEAL_TARGETS: readonly [number, number, number][] = [
  [0, 1.56, 0.3],
  [0, 1.56, 0.3],
  [0, 1.48, 0],
  [0, 1.4, -0.05],
];

export const FOV_BY_STATION = [42, 42, 41, 39];

/**
 * The crossfade, and the dwell that protects it.
 *
 * Two renderers have to trade places without the reader seeing a seam, and the
 * camera holds still until the fade has finished so that the picture is at
 * least not changing shape while they swap. That much works.
 *
 * The seam itself does NOT currently vanish, and this comment used to claim it
 * did. What the reader actually gets at the handoff is a magnified, twice-
 * cropped, heavily resampled copy of the frame underneath:
 *
 *   - `signalSurface.blit` fits the 16:9 page canvas into the 4:3 channel
 *     canvas by centre-cropping, which throws away 25% of the page width;
 *   - that goes through a 320×240 (256×192 on mobile) channel canvas, so it
 *     arrives at a 1920-wide viewport via a ~6× nearest-neighbour upscale;
 *   - `fillDistance` below solves for *cover*, which is correct for leaving no
 *     gap at the edges but necessarily crops: at 16:9 the fit is width-bound
 *     and ~27% of the plane's height falls outside the viewport.
 *
 * Composed, roughly 53% of the original frame survives, shown at about 1.37×.
 * Fixing that is the point of the handoff work — bind the full-resolution
 * signal surface as the texture while the camera is still inside the screen,
 * rather than routing continuity through the low-resolution channel relay.
 */
export const HANDOFF_IN = 0.015;
export const HANDOFF_OUT = 0.07;
export const CAMERA_DWELL = 0.085;

/**
 * How far back the camera must sit for the screen plane to cover the viewport.
 * Solved rather than measured: the plane is 4:3 and the viewport is usually
 * wider, so the binding constraint swaps between width and height as the
 * window changes shape.
 *
 * Note that cover is not fit. Taking the *smaller* of the two limits
 * guarantees no empty room shows down the sides, and thereby guarantees the
 * other axis overflows — at 16:9 the plane is width-bound and loses about 27%
 * of its height off screen. That is the correct behaviour for this function;
 * it is a problem only because the texture it is covering with has already
 * been cropped once. See the crossfade note above.
 */
export function fillDistance(fov: number, aspect: number): number {
  const halfFov = THREE.MathUtils.degToRad(fov) * 0.5;
  const limit = Math.min(SCREEN_HALF_HEIGHT, SCREEN_HALF_WIDTH / Math.max(0.01, aspect));
  // A little closer than the exact solution. At the exact distance the plane's
  // edges land on the viewport's edges and rounding decides whether the reader
  // gets a one-pixel line of empty room down the side of the picture.
  return (limit / Math.tan(halfFov)) * 0.985;
}

/** Smoothstep. Used for the crossfade window, not for the camera itself. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function interpolateFov(t: number): number {
  const index = THREE.MathUtils.clamp(t, 0, 1) * (FOV_BY_STATION.length - 1);
  const low = Math.floor(index);
  const high = Math.min(low + 1, FOV_BY_STATION.length - 1);
  return THREE.MathUtils.lerp(FOV_BY_STATION[low]!, FOV_BY_STATION[high]!, index - low);
}

/**
 * Projects the four corners of the screen plane and publishes the bounding
 * rectangle in CSS pixels.
 *
 * This is the only description of "where the picture is" in the project, and
 * it is measured rather than declared, so the claim the reveal rests on — that
 * at progress 0 the screen covers the viewport exactly — is a number anything
 * can read and a test can assert, rather than an intention in a comment.
 */
export function publishScreenRect(
  camera: THREE.Camera,
  scratch: THREE.Vector3,
  width: number,
  height: number,
  progress: number,
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < 4; i += 1) {
    const sx = i === 0 || i === 3 ? -1 : 1;
    const sy = i < 2 ? -1 : 1;
    scratch.set(
      SCREEN_CENTRE[0] + sx * SCREEN_HALF_WIDTH,
      SCREEN_CENTRE[1] + sy * SCREEN_HALF_HEIGHT,
      SCREEN_CENTRE[2],
    );
    scratch.project(camera);
    const px = (scratch.x * 0.5 + 0.5) * width;
    // NDC y is up, CSS y is down.
    const py = (0.5 - scratch.y * 0.5) * height;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  // Cabinet bounds projection
  let cabMinX = Infinity;
  let cabMinY = Infinity;
  let cabMaxX = -Infinity;
  let cabMaxY = -Infinity;
  const CAB_HALF_W = SCREEN_HALF_WIDTH * 1.38;
  const CAB_HALF_H = SCREEN_HALF_HEIGHT * 1.42;

  for (let i = 0; i < 4; i += 1) {
    const sx = i === 0 || i === 3 ? -1 : 1;
    const sy = i < 2 ? -1 : 1;
    scratch.set(
      SCREEN_CENTRE[0] + sx * CAB_HALF_W,
      SCREEN_CENTRE[1] + sy * CAB_HALF_H,
      SCREEN_CENTRE[2] - 0.1,
    );
    scratch.project(camera);
    const px = (scratch.x * 0.5 + 0.5) * width;
    const py = (0.5 - scratch.y * 0.5) * height;
    if (px < cabMinX) cabMinX = px;
    if (px > cabMaxX) cabMaxX = px;
    if (py < cabMinY) cabMinY = py;
    if (py > cabMaxY) cabMaxY = py;
  }

  revealState.active = true;
  revealState.progress = progress;
  revealState.x = minX;
  revealState.y = minY;
  revealState.width = Math.max(0, maxX - minX);
  revealState.height = Math.max(0, maxY - minY);
  revealState.cabinetX = cabMinX;
  revealState.cabinetY = cabMinY;
  revealState.cabinetWidth = Math.max(0, cabMaxX - cabMinX);
  revealState.cabinetHeight = Math.max(0, cabMaxY - cabMinY);
}
