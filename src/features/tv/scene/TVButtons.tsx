import { useEffect, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type * as THREE from 'three';
import type { TVButtonId } from '../types';

interface TVButtonsProps {
  /** Buttons only accept clicks once the camera has locked onto the set. */
  interactive: boolean;
  powered: boolean;
  onPress: (id: TVButtonId) => void;
}

const BUTTON_Z = 0.305;
const BUTTON_Y = 0.98;

interface PhysicalButtonProps {
  id: TVButtonId;
  x: number;
  colour: string;
  emissive: string;
  enabled: boolean;
  onPress: (id: TVButtonId) => void;
}

function PhysicalButton({
  id,
  x,
  colour,
  emissive,
  enabled,
  onPress,
}: PhysicalButtonProps): React.JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const depth = useRef(0);
  const hovered = useRef(false);

  // Never leave the document cursor in the pointer state on unmount.
  useEffect(() => {
    return () => {
      if (hovered.current) {
        document.body.style.cursor = '';
        hovered.current = false;
      }
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    if (hovered.current) {
      document.body.style.cursor = '';
      hovered.current = false;
    }
  }, [enabled]);

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    depth.current *= Math.exp(-11 * delta);
    if (depth.current < 0.0005) depth.current = 0;
    mesh.position.z = BUTTON_Z - depth.current * 0.022;

    const material = materialRef.current;
    if (material) {
      const target = hovered.current && enabled ? 0.55 : 0.12;
      material.emissiveIntensity +=
        (target - material.emissiveIntensity) * (1 - Math.exp(-10 * delta));
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    if (!enabled) return;
    depth.current = 1;
    onPress(id);
  };

  const handleOver = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation();
    if (!enabled || hovered.current) return;
    hovered.current = true;
    document.body.style.cursor = 'pointer';
  };

  const handleOut = (): void => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = '';
  };

  return (
    <mesh
      ref={meshRef}
      position={[x, BUTTON_Y, BUTTON_Z]}
      rotation={[Math.PI / 2, 0, 0]}
      onClick={handleClick}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
    >
      <cylinderGeometry args={[0.052, 0.056, 0.05, 12]} />
      <meshStandardMaterial
        ref={materialRef}
        color={colour}
        emissive={emissive}
        emissiveIntensity={0.12}
        roughness={0.55}
        metalness={0.1}
      />
    </mesh>
  );
}

/**
 * The three physical controls on the cabinet.
 *
 * These are a *duplicate* affordance — every action is also available from
 * the DOM control bar below the canvas, which is the accessible path. The 3D
 * buttons exist for the feel of operating the set, not as the only way in.
 */
export function TVButtons({
  interactive,
  powered,
  onPress,
}: TVButtonsProps): React.JSX.Element {
  return (
    <group>
      <PhysicalButton
        id="prev"
        x={0.18}
        colour="#2a2f28"
        emissive="#6f8a6a"
        enabled={interactive && powered}
        onPress={onPress}
      />
      <PhysicalButton
        id="next"
        x={0.36}
        colour="#2a2f28"
        emissive="#6f8a6a"
        enabled={interactive && powered}
        onPress={onPress}
      />
      <PhysicalButton
        id="power"
        x={0.56}
        colour="#32241f"
        emissive={powered ? '#e44f4f' : '#4a2020'}
        enabled={interactive}
        onPress={onPress}
      />

      {/* Power tell-tale: the only light on the cabinet that survives standby. */}
      <mesh position={[0.56, 0.82, 0.306]}>
        <circleGeometry args={[0.014, 8]} />
        <meshBasicMaterial color={powered ? '#e44f4f' : '#1d1210'} toneMapped={false} />
      </mesh>
    </group>
  );
}
