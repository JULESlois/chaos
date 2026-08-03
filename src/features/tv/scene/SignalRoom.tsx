import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/utils/math';

interface SignalRoomProps {
  /** Dust and the back wall are dropped on the reduced quality tiers. */
  detail: 'full' | 'reduced';
  receiveShadows: boolean;
  reducedMotion: boolean;
}

const DUST_COUNT = 160;

/**
 * The room around the set.
 *
 * Deliberately almost empty: a floor, a back wall, and slow dust. The fog
 * does most of the work — it hides the edges of the geometry so the space
 * reads as larger and less finished than it is.
 */
export function SignalRoom({
  detail,
  receiveShadows,
  reducedMotion,
}: SignalRoomProps): React.JSX.Element {
  const dustRef = useRef<THREE.Points>(null);

  const dustGeometry = useMemo(() => {
    if (detail !== 'full') return null;
    const random = createRng(0x5eed);
    const positions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      positions[i * 3] = (random() - 0.5) * 9;
      positions[i * 3 + 1] = random() * 3.4 + 0.1;
      positions[i * 3 + 2] = (random() - 0.5) * 7;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [detail]);

  useEffect(() => {
    return () => dustGeometry?.dispose();
  }, [dustGeometry]);

  useFrame((_state, delta) => {
    const dust = dustRef.current;
    if (!dust || reducedMotion) return;
    // One rotation of the whole cloud is far cheaper than moving 160 points.
    dust.rotation.y += delta * 0.014;
  });

  return (
    <group name="signal-room">
      <fog attach="fog" args={['#05060a', 5.5, 17]} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow={receiveShadows}
      >
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#0a0c0a" roughness={0.98} metalness={0} />
      </mesh>

      {detail === 'full' && (
        <mesh position={[0, 3.2, -4.2]} receiveShadow={receiveShadows}>
          <planeGeometry args={[16, 7.4]} />
          <meshStandardMaterial color="#0b0d10" roughness={1} metalness={0} />
        </mesh>
      )}

      {dustGeometry && (
        <points ref={dustRef} geometry={dustGeometry} position={[0, 0, 0]}>
          <pointsMaterial
            color="#9fb39b"
            size={0.016}
            sizeAttenuation
            transparent
            opacity={0.34}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
}
