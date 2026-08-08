import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ChannelManager } from '../channels/ChannelManager';
import type { TVButtonId, TransitionPhase } from '../types';
import { TVButtons } from './TVButtons';
import { TVScreen, type ScreenQuality } from './TVScreen';

interface RetroTVProps {
  manager: ChannelManager | null;
  quality: ScreenQuality;
  powered: boolean;
  transitionPhase: TransitionPhase;
  tension: number;
  tearImpulse: number;
  reducedMotion: boolean;
  interactive: boolean;
  castShadows: boolean;
  onPress: (id: TVButtonId) => void;
}

/**
 * Low-poly cabinet.
 *
 * Everything is boxes and cylinders — no imported model, no texture maps.
 * Coordinates are chosen so the picture plane sits at y = 1.56, z = 0.304,
 * which is what the camera stations and the screen light are aimed at.
 */
export function RetroTV({
  manager,
  quality,
  powered,
  transitionPhase,
  tension,
  tearImpulse,
  reducedMotion,
  interactive,
  castShadows,
  onPress,
}: RetroTVProps): React.JSX.Element {
  // Every surface sits on the same hue as the rest of the site, just far
  // enough down the ramp to read as unlit plastic rather than as pink.
  const materials = useMemo(() => {
    return {
      cabinet: new THREE.MeshStandardMaterial({
        color: '#1c1316',
        roughness: 0.86,
        metalness: 0.04,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: '#0d0709',
        roughness: 0.94,
        metalness: 0.02,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: '#43353a',
        roughness: 0.42,
        metalness: 0.68,
      }),
      furniture: new THREE.MeshStandardMaterial({
        color: '#171013',
        roughness: 0.9,
        metalness: 0.03,
      }),
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) material.dispose();
    };
  }, [materials]);

  const grilleSlats = useMemo(() => [0.84, 0.9, 0.96, 1.02, 1.08], []);

  return (
    <group name="retro-tv" rotation={[0.025, -0.15, -0.015]}>
      {/* Cabinet: front face lands on z = 0.30. */}
      <mesh
        position={[0, 1.4, -0.2]}
        castShadow={castShadows}
        receiveShadow={castShadows}
        material={materials.cabinet}
      >
        <boxGeometry args={[1.42, 1.32, 1.0]} />
      </mesh>

      {/* Screen well: a slightly darker inset behind the picture plane. */}
      <mesh position={[0, 1.56, 0.301]} material={materials.dark}>
        <planeGeometry args={[1.12, 0.88]} />
      </mesh>

      <group position={[0, 1.56, 0.304]}>
        <TVScreen
          manager={manager}
          quality={quality}
          powered={powered}
          transitionPhase={transitionPhase}
          tension={tension}
          tearImpulse={tearImpulse}
          reducedMotion={reducedMotion}
          interactive={interactive}
        />
      </group>

      {/* Speaker grille on the lower-left of the control strip. */}
      {grilleSlats.map((y) => (
        <mesh key={y} position={[-0.36, y, 0.304]} material={materials.dark}>
          <boxGeometry args={[0.5, 0.022, 0.012]} />
        </mesh>
      ))}

      <TVButtons interactive={interactive} powered={powered} onPress={onPress} />

      {/* Plinth between the cabinet and the table. */}
      <mesh position={[0, 0.72, -0.2]} castShadow={castShadows} material={materials.dark}>
        <boxGeometry args={[1.0, 0.04, 0.8]} />
      </mesh>

      {/* Antenna base and two rods. */}
      <mesh position={[0, 2.08, -0.2]} material={materials.metal}>
        <boxGeometry args={[0.26, 0.05, 0.16]} />
      </mesh>
      <mesh position={[0.474, 2.562, -0.2]} rotation={[0, 0, -0.42]} material={materials.metal}>
        <cylinderGeometry args={[0.008, 0.012, 1.1, 6]} />
      </mesh>
      <mesh position={[-0.474, 2.562, -0.2]} rotation={[0, 0, 0.42]} material={materials.metal}>
        <cylinderGeometry args={[0.008, 0.012, 1.1, 6]} />
      </mesh>

      {/* The table the set stands on. */}
      <mesh
        position={[0, 0.35, -0.25]}
        castShadow={castShadows}
        receiveShadow={castShadows}
        material={materials.furniture}
      >
        <boxGeometry args={[2.3, 0.7, 1.1]} />
      </mesh>
    </group>
  );
}
