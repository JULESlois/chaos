import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { resetRevealState, revealState } from '@/systems/signal/reveal-state';
import {
  CAMERA_DWELL,
  fillDistance,
  HANDOFF_IN,
  HANDOFF_OUT,
  interpolateFov,
  publishScreenRect,
  SCREEN_CENTRE,
  smoothstep,
  TV_REVEAL_STATIONS,
  TV_REVEAL_TARGETS,
} from './reveal-path';
import type { LiveValue } from '../types';

interface CameraDirectorProps {
  /** Live reveal progress, written by the scroll driver outside React. */
  progressRef: LiveValue<number>;
  /** Live visual tension, used only for a little hand-held drift. */
  tensionRef: LiveValue<number>;
  reducedMotion: boolean;
  /** Level 2 devices skip the cinematography and sit at the final framing. */
  staticView: boolean;
  /**
   * For screenshots: skip the scroll-damping settle and jump straight to the
   * target progress. The reveal is still the real camera path; we just don't
   * spend the first half second gliding there.
   */
  instant?: boolean;
}

/**
 * Backs the camera out of the picture.
 *
 * The geometry it flies through — the stations, the screen plane, the distance
 * at which that plane fills the viewport — is in `reveal-path`, so it can be
 * asserted against without a renderer. What is left here is the part that
 * genuinely needs a frame loop: damping the reader's scroll, solving the two
 * inside-the-screen stations for the viewport currently on screen, and fading
 * the WebGL layer up while the two renderers still agree.
 */
export function CameraDirector({
  progressRef,
  tensionRef,
  reducedMotion,
  staticView,
  instant,
}: CameraDirectorProps): null {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);

  const initialized = useRef(false);
  const smoothed = useRef(staticView ? 1 : 0);
  const clock = useRef(0);

  const rig = useMemo(() => {
    const toVectors = (points: readonly [number, number, number][]): THREE.Vector3[] =>
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    // The curve holds these exact vectors, so solving a station in place below
    // moves the path with it.
    const stations = toVectors(TV_REVEAL_STATIONS);
    return {
      stations,
      path: new THREE.CatmullRomCurve3(stations, false, 'catmullrom', 0.35),
      aim: new THREE.CatmullRomCurve3(toVectors(TV_REVEAL_TARGETS), false, 'catmullrom', 0.35),
      position: new THREE.Vector3(),
      target: new THREE.Vector3(),
      corner: new THREE.Vector3(),
    };
  }, []);

  useEffect(() => {
    const element = gl.domElement;
    return () => {
      // Nothing else writes either of these, so nothing else would ever put
      // them back: a stale progress would keep the silence screen's faked
      // glass suppressed after the set had gone.
      resetRevealState();
      element.style.opacity = '0';
    };
  }, [gl]);

  useFrame((_state, delta) => {
    const step = Math.min(delta, 0.1);
    clock.current += step;

    const target = staticView ? 1 : (progressRef.current ?? 0);

    if (!initialized.current || instant) {
      smoothed.current = target;
      initialized.current = true;
    }
    const stiffness = reducedMotion ? 40 : 5.2;
    smoothed.current += (target - smoothed.current) * (1 - Math.exp(-stiffness * step));
    const scroll = THREE.MathUtils.clamp(smoothed.current, 0, 1);

    // Reveal progress is not scroll progress: the camera waits out the
    // crossfade, then eases away and eases back down into the final framing.
    const t = staticView ? 1 : smoothstep(CAMERA_DWELL, 1, scroll);

    const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null;
    const fov = interpolateFov(t);

    if (perspective && Math.abs(perspective.fov - fov) > 0.02) {
      perspective.fov = fov;
      perspective.updateProjectionMatrix();
    }

    // Solve the two inside-the-screen stations for this viewport, then rebuild
    // the curve. Cheap: two vectors written in place, no allocation.
    const aspect = perspective ? perspective.aspect : size.width / Math.max(1, size.height);
    const fill = fillDistance(fov, aspect);
    rig.stations[0]!.z = SCREEN_CENTRE[2] + fill;
    rig.stations[1]!.z = SCREEN_CENTRE[2] + fill * 1.95;
    rig.path.updateArcLengths();

    rig.path.getPoint(t, rig.position);
    rig.aim.getPoint(t, rig.target);

    if (!reducedMotion) {
      // Hand-held drift. Suppressed at the very start — a wobble while the
      // camera is still inside the picture would break the 2D/3D alignment —
      // and again at the end so it never fights the reader's aim at a button.
      const settle = smoothstep(0.08, 0.4, t) * (1 - t * 0.7);
      const tension = tensionRef.current ?? 0;
      const amplitude = (0.008 + tension * 0.02) * settle;
      rig.position.x += Math.sin(clock.current * 0.61) * amplitude;
      rig.position.y += Math.sin(clock.current * 0.43 + 1.7) * amplitude * 0.7;
      rig.position.z += Math.sin(clock.current * 0.29 + 0.4) * amplitude * 0.5;
    }

    camera.position.copy(rig.position);
    camera.lookAt(rig.target);
    camera.updateMatrixWorld();

    publishScreenRect(camera, rig.corner, size.width, size.height, t);

    // The WebGL layer fades up while the two renderers are still showing the
    // same picture in the same place, so the swap has nothing to give away.
    const handoff = staticView ? 1 : smoothstep(HANDOFF_IN, HANDOFF_OUT, scroll);
    revealState.targetProgress = target;
    revealState.smoothedProgress = scroll;
    revealState.pathProgress = t;
    revealState.canvasOpacity = handoff;
    revealState.handoff = handoff;
    gl.domElement.style.opacity = handoff.toFixed(3);
  });

  return null;
}
