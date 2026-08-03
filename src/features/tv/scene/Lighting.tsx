import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';

interface LightingProps {
  /** Screen brightness drives the main practical light. */
  screenLight: number;
  enableShadows: boolean;
  flicker: boolean;
}

/**
 * Three light sources total:
 *  - a very weak ambient fill so the room is not pure black;
 *  - a point light at the screen, which is the primary practical source;
 *  - a low side light for silhouette separation.
 */
export function Lighting({
  screenLight,
  enableShadows,
  flicker,
}: LightingProps): React.JSX.Element {
  const screenLightRef = useRef<THREE.PointLight>(null);
  const phase = useRef(0);

  useFrame((_state, delta) => {
    const light = screenLightRef.current;
    if (!light) return;

    phase.current += delta;
    // Subtle mains flicker; disabled entirely in reduced-motion.
    const wobble = flicker
      ? 1 + Math.sin(phase.current * 17.3) * 0.03 + Math.sin(phase.current * 3.1) * 0.02
      : 1;
    light.intensity = screenLight * 3.4 * wobble;
  });

  return (
    <>
      <ambientLight intensity={0.06} color="#8fa08c" />

      <pointLight
        ref={screenLightRef}
        position={[0, 1.42, 0.32]}
        color="#a8ffd0"
        intensity={screenLight * 3.4}
        distance={5.5}
        decay={2}
        castShadow={enableShadows}
        shadow-mapSize-width={enableShadows ? 512 : 0}
        shadow-mapSize-height={enableShadows ? 512 : 0}
        shadow-bias={-0.002}
      />

      <directionalLight
        position={[-3.6, 3.2, 1.8]}
        intensity={0.22}
        color="#7d8ea6"
      />

      {/* Faint bounce from the floor keeps the underside of the set readable. */}
      <hemisphereLight args={['#1b2a1a', '#05060a', 0.12]} />
    </>
  );
}
