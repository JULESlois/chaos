import { useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface CameraDirectorProps {
  /** Live scroll progress, written by the scroll driver outside React. */
  progressRef: RefObject<number>;
  /** Live entropy, used only for a very small amount of hand-held drift. */
  entropyRef: RefObject<number>;
  reducedMotion: boolean;
  /** Level 2 devices skip the cinematography and sit at the final framing. */
  staticView: boolean;
}

/**
 * The four camera stations of the television chapter.
 *
 *  A  distant observation — the set is small, the room dominates
 *  B  approach            — the set fills more of the frame
 *  C  signal lock         — the screen becomes the subject
 *  D  interaction lock    — close enough to read and to reach the buttons
 */
const STATIONS: readonly [number, number, number][] = [
  [0.0, 2.72, 7.6],
  [1.15, 2.05, 4.5],
  [0.42, 1.66, 2.35],
  [0.0, 1.5, 1.28],
];

const TARGETS: readonly [number, number, number][] = [
  [0.0, 1.15, -0.2],
  [0.0, 1.4, 0.0],
  [0.0, 1.54, 0.16],
  [0.0, 1.56, 0.3],
];

const FOV_BY_STATION = [46, 43, 40, 38];

export function CameraDirector({
  progressRef,
  entropyRef,
  reducedMotion,
  staticView,
}: CameraDirectorProps): null {
  const camera = useThree((state) => state.camera);
  const smoothed = useRef(staticView ? 1 : 0);
  const clock = useRef(0);

  const { path, aim, scratchPosition, scratchTarget } = useMemo(() => {
    const toVectors = (points: readonly [number, number, number][]): THREE.Vector3[] =>
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z));

    return {
      path: new THREE.CatmullRomCurve3(toVectors(STATIONS), false, 'catmullrom', 0.4),
      aim: new THREE.CatmullRomCurve3(toVectors(TARGETS), false, 'catmullrom', 0.4),
      scratchPosition: new THREE.Vector3(),
      scratchTarget: new THREE.Vector3(),
    };
  }, []);

  useFrame((_state, delta) => {
    const step = Math.min(delta, 0.1);
    clock.current += step;

    const target = staticView ? 1 : (progressRef.current ?? 0);

    // Frame-rate independent damping. Reduced motion snaps rather than glides.
    const stiffness = reducedMotion ? 40 : 5.2;
    smoothed.current += (target - smoothed.current) * (1 - Math.exp(-stiffness * step));
    const t = THREE.MathUtils.clamp(smoothed.current, 0, 1);

    path.getPoint(t, scratchPosition);
    aim.getPoint(t, scratchTarget);

    if (!reducedMotion) {
      // Hand-held drift. Amplitude shrinks as the camera settles at the set,
      // so the interaction phase never fights the viewer's aim.
      const settle = 1 - t * 0.75;
      const entropy = entropyRef.current ?? 0;
      const amplitude = (0.008 + entropy * 0.02) * settle;
      scratchPosition.x += Math.sin(clock.current * 0.61) * amplitude;
      scratchPosition.y += Math.sin(clock.current * 0.43 + 1.7) * amplitude * 0.7;
      scratchPosition.z += Math.sin(clock.current * 0.29 + 0.4) * amplitude * 0.5;
    }

    camera.position.copy(scratchPosition);
    camera.lookAt(scratchTarget);

    if (camera instanceof THREE.PerspectiveCamera) {
      const index = t * (FOV_BY_STATION.length - 1);
      const low = Math.floor(index);
      const high = Math.min(low + 1, FOV_BY_STATION.length - 1);
      const fov = THREE.MathUtils.lerp(
        FOV_BY_STATION[low],
        FOV_BY_STATION[high],
        index - low,
      );
      if (Math.abs(camera.fov - fov) > 0.02) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}
