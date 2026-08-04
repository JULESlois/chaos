import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { glassStrength, resetRevealState, revealState } from '@/systems/signal/reveal-state';
import {
  CAMERA_DWELL,
  fillDistance,
  FOV_BY_STATION,
  HANDOFF_IN,
  HANDOFF_OUT,
  interpolateFov,
  publishScreenRect,
  SCREEN_CENTRE,
  SCREEN_HALF_HEIGHT,
  SCREEN_HALF_WIDTH,
  smoothstep,
  TV_REVEAL_STATIONS,
  TV_REVEAL_TARGETS,
} from './reveal-path';

/**
 * Stands a camera at the station the director would solve for this viewport,
 * aims it where the director would aim it, and publishes the rect. This is
 * the director's per-frame body with the damping and the drift removed — the
 * parts that are geometry, and nothing else.
 */
function frameAt(t: number, width: number, height: number): Readonly<typeof revealState> {
  const fov = interpolateFov(t);
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);

  const stations = TV_REVEAL_STATIONS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const fill = fillDistance(fov, camera.aspect);
  stations[0]!.z = SCREEN_CENTRE[2] + fill;
  stations[1]!.z = SCREEN_CENTRE[2] + fill * 1.95;

  const path = new THREE.CatmullRomCurve3(stations, false, 'catmullrom', 0.35);
  const aim = new THREE.CatmullRomCurve3(
    TV_REVEAL_TARGETS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'catmullrom',
    0.35,
  );

  camera.position.copy(path.getPoint(t));
  camera.lookAt(aim.getPoint(t));
  camera.updateMatrixWorld();

  publishScreenRect(camera, new THREE.Vector3(), width, height, t);
  // A copy: `revealState` is one mutable record, so two frames compared by
  // reference would always look identical.
  return { ...revealState };
}

const VIEWPORTS: [string, number, number][] = [
  ['desktop 16:9', 1440, 810],
  ['laptop 16:10', 1280, 800],
  ['phone portrait', 390, 844],
  ['phone landscape', 844, 390],
  ['square', 800, 800],
  ['ultrawide', 2560, 1080],
];

beforeEach(() => {
  resetRevealState();
});

describe('the seam', () => {
  /**
   * The whole reveal rests on this: at the moment the two renderers trade
   * places, the screen plane must cover the viewport. If it does not, the
   * reader sees a rectangle of empty room appear around the picture at the
   * exact instant the fade starts, and the conceit is over.
   */
  it.each(VIEWPORTS)('covers the viewport at progress 0 on %s', (_name, width, height) => {
    const rect = frameAt(0, width, height);
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(width);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(height);
  });

  it('still covers the viewport at the end of the crossfade window', () => {
    // The camera does not move until CAMERA_DWELL, and the fade is finished by
    // HANDOFF_OUT. So the whole fade happens at camera progress 0.
    expect(HANDOFF_OUT).toBeLessThan(CAMERA_DWELL);
    expect(HANDOFF_IN).toBeLessThan(HANDOFF_OUT);
    expect(smoothstep(CAMERA_DWELL, 1, HANDOFF_OUT)).toBe(0);
  });

  /**
   * On the axis that actually binds, the plane should clear the viewport by a
   * hair and no more — that margin exists to keep rounding from leaving a
   * one-pixel line of room down the edge, not to hide a zoom. The other axis
   * necessarily overflows, because a 4:3 picture cannot cover a 16:9 viewport
   * without spilling somewhere.
   */
  it.each(VIEWPORTS)('clears the binding edge by a hair on %s', (_name, width, height) => {
    const rect = frameAt(0, width, height);
    const bind = Math.min(rect.width / width, rect.height / height);
    expect(bind).toBeGreaterThanOrEqual(1);
    expect(bind).toBeLessThan(1.03);
  });

  it('leaves the picture smaller than the viewport once the camera has moved', () => {
    const early = frameAt(0, 1440, 810);
    const late = frameAt(1, 1440, 810);
    expect(late.width).toBeLessThan(early.width);
    expect(late.width).toBeLessThan(1440);
  });

  it('shrinks the picture monotonically as the camera backs out', () => {
    let previous = Infinity;
    for (let i = 0; i <= 10; i += 1) {
      const rect = frameAt(i / 10, 1440, 810);
      expect(rect.width).toBeLessThanOrEqual(previous + 0.5);
      previous = rect.width;
    }
  });

  it('keeps the picture centred horizontally the whole way out', () => {
    for (let i = 0; i <= 5; i += 1) {
      const rect = frameAt(i / 5, 1440, 810);
      const centre = rect.x + rect.width / 2;
      // The stations drift right a little; the picture should stay near the
      // middle of the frame rather than sliding off to one side.
      expect(Math.abs(centre - 720)).toBeLessThan(1440 * 0.2);
    }
  });
});

describe('fill distance', () => {
  it('stands further back for a taller, narrower viewport', () => {
    const wide = fillDistance(42, 1440 / 810);
    const tall = fillDistance(42, 390 / 844);
    expect(tall).toBeGreaterThan(wide);
  });

  it('swaps which edge binds at the planes own aspect ratio', () => {
    const pivot = SCREEN_HALF_WIDTH / SCREEN_HALF_HEIGHT;
    const at = fillDistance(42, pivot);
    // Narrower than the plane: height is what has to be covered, and it does
    // not change, so there is nothing left for the aspect to affect.
    expect(fillDistance(42, pivot / 2)).toBeCloseTo(at, 6);
    expect(fillDistance(42, pivot / 4)).toBeCloseTo(at, 6);
    // Wider than the plane: width binds, and the camera has to come in.
    expect(fillDistance(42, pivot * 2)).toBeCloseTo(at / 2, 6);
  });

  it('stands closer with a wider lens', () => {
    expect(fillDistance(60, 1.6)).toBeLessThan(fillDistance(30, 1.6));
  });

  it('is always positive', () => {
    for (const aspect of [0.2, 0.5, 1, 1.78, 3, 10]) {
      expect(fillDistance(42, aspect)).toBeGreaterThan(0);
    }
  });
});

describe('the lens', () => {
  it('opens at the authored station values and ends at the last one', () => {
    expect(interpolateFov(0)).toBe(FOV_BY_STATION[0]);
    expect(interpolateFov(1)).toBe(FOV_BY_STATION[FOV_BY_STATION.length - 1]);
  });

  it('narrows as the camera settles, never widens', () => {
    let previous = Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const fov = interpolateFov(i / 20);
      expect(fov).toBeLessThanOrEqual(previous + 1e-9);
      previous = fov;
    }
  });

  it('clamps rather than extrapolating out of range', () => {
    expect(interpolateFov(-1)).toBe(FOV_BY_STATION[0]);
    expect(interpolateFov(2)).toBe(FOV_BY_STATION[FOV_BY_STATION.length - 1]);
  });
});

describe('the published rect', () => {
  it('is inert until a camera publishes', () => {
    expect(revealState.active).toBe(false);
    expect(revealState.width).toBe(0);
  });

  it('marks itself active and carries the camera progress, not the scroll', () => {
    frameAt(0.42, 1440, 810);
    expect(revealState.active).toBe(true);
    expect(revealState.progress).toBeCloseTo(0.42, 6);
  });

  it('is put back when the set goes away', () => {
    frameAt(0.5, 1440, 810);
    resetRevealState();
    expect(revealState).toEqual({
      active: false,
      progress: 0,
      targetProgress: 0,
      smoothedProgress: 0,
      pathProgress: 0,
      canvasOpacity: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      cabinetX: 0,
      cabinetY: 0,
      cabinetWidth: 0,
      cabinetHeight: 0,
      handoff: 0,
    });
  });
});

describe('the glass', () => {
  it('is off entirely while no camera is publishing', () => {
    revealState.progress = 1;
    expect(glassStrength()).toBe(0);
  });

  it('is off at the start of the move and full well before the end', () => {
    frameAt(0, 1440, 810);
    expect(glassStrength()).toBe(0);
    frameAt(0.6, 1440, 810);
    expect(glassStrength()).toBe(1);
  });

  it('leaks in monotonically', () => {
    let previous = -1;
    for (let i = 0; i <= 20; i += 1) {
      frameAt(i / 20, 1440, 810);
      const glass = glassStrength();
      expect(glass).toBeGreaterThanOrEqual(previous);
      expect(glass).toBeLessThanOrEqual(1);
      previous = glass;
    }
  });

  it('is already fully on by the time the buttons arm', () => {
    frameAt(0.9, 1440, 810);
    expect(glassStrength()).toBe(1);
  });
});

describe('the stations', () => {
  it('has one target and one fov for every station', () => {
    expect(TV_REVEAL_TARGETS).toHaveLength(TV_REVEAL_STATIONS.length);
    expect(FOV_BY_STATION).toHaveLength(TV_REVEAL_STATIONS.length);
  });

  it('starts on the screen plane and ends in the room', () => {
    expect(TV_REVEAL_STATIONS[0]![1]).toBeCloseTo(SCREEN_CENTRE[1], 6);
    expect(TV_REVEAL_STATIONS[3]![2]).toBeGreaterThan(3);
  });

  it('describes a period picture, not a widescreen one', () => {
    const aspect = SCREEN_HALF_WIDTH / SCREEN_HALF_HEIGHT;
    expect(aspect).toBeGreaterThan(1.25);
    expect(aspect).toBeLessThan(1.4);
  });
});
