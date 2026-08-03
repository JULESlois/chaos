import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChannelManager } from '../channels/ChannelManager';
import crtFragment from '../shaders/crt.frag?raw';
import crtVertex from '../shaders/crt.vert?raw';
import type { TransitionPhase } from '../types';

export interface ScreenQuality {
  /** Level 0 gets the full shader; higher levels progressively simplify it. */
  curvature: number;
  scanline: number;
  chroma: number;
  noise: number;
  band: number;
  vignette: number;
}

export const SCREEN_QUALITY: Record<0 | 1 | 2, ScreenQuality> = {
  0: { curvature: 0.12, scanline: 0.16, chroma: 0.0012, noise: 0.045, band: 0.03, vignette: 0.55 },
  1: { curvature: 0.08, scanline: 0.1, chroma: 0.0006, noise: 0.025, band: 0.02, vignette: 0.42 },
  2: { curvature: 0.0, scanline: 0.06, chroma: 0.0, noise: 0.0, band: 0.0, vignette: 0.3 },
};

interface TVScreenProps {
  manager: ChannelManager | null;
  quality: ScreenQuality;
  powered: boolean;
  transitionPhase: TransitionPhase;
  entropy: number;
  /** Raised briefly by the chaos director's horizontal-tear event. */
  tearImpulse: number;
  reducedMotion: boolean;
}

/**
 * The screen surface.
 *
 * Inner plane: the channel CanvasTexture processed by the CRT shader.
 * Outer shell: a transparent convex "glass" mesh carrying reflection only.
 */
export function TVScreen({
  manager,
  quality,
  powered,
  transitionPhase,
  entropy,
  tearImpulse,
  reducedMotion,
}: TVScreenProps): React.JSX.Element {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const collapseRef = useRef(0);
  const tearRef = useRef(0);
  const tearYRef = useRef(0.5);

  // Build the CanvasTexture once per manager instance.
  const texture = useMemo(() => {
    if (!manager) return null;
    const canvasTexture = new THREE.CanvasTexture(manager.canvas);
    canvasTexture.magFilter = THREE.NearestFilter;
    canvasTexture.minFilter = THREE.NearestFilter;
    canvasTexture.generateMipmaps = false;
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.flipY = true;
    return canvasTexture;
  }, [manager]);

  useEffect(() => {
    textureRef.current = texture;
    return () => {
      texture?.dispose();
      textureRef.current = null;
    };
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uTime: { value: 0 },
      uCurvature: { value: quality.curvature },
      uScanline: { value: quality.scanline },
      uChroma: { value: quality.chroma },
      uNoise: { value: quality.noise },
      uTear: { value: 0 },
      uTearY: { value: 0.5 },
      uBand: { value: quality.band },
      uVignette: { value: quality.vignette },
      uBrightness: { value: 1 },
      uCollapse: { value: 0 },
    }),
    // Uniform *values* are updated in useFrame; this object is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture],
  );

  // Apply quality changes without rebuilding the material.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uCurvature.value = quality.curvature;
    material.uniforms.uScanline.value = quality.scanline;
    material.uniforms.uChroma.value = quality.chroma;
    material.uniforms.uNoise.value = reducedMotion ? 0 : quality.noise;
    material.uniforms.uBand.value = reducedMotion ? 0 : quality.band;
    material.uniforms.uVignette.value = quality.vignette;
  }, [quality, reducedMotion]);

  // Trigger a tear when the chaos director asks for one.
  useEffect(() => {
    if (tearImpulse <= 0 || reducedMotion) return;
    tearRef.current = 0.06;
    tearYRef.current = 0.2 + Math.random() * 0.6;
  }, [tearImpulse, reducedMotion]);

  useFrame((_state, delta) => {
    const material = materialRef.current;
    if (!material) return;

    material.uniforms.uTime.value += delta;

    // Upload the canvas only when the channel actually drew something.
    if (manager && textureRef.current && manager.needsTextureUpload) {
      textureRef.current.needsUpdate = true;
      manager.markUploaded();
    }

    // Power collapse animation.
    const collapseTarget = powered ? 0 : 1;
    const collapseSpeed = reducedMotion ? 24 : 9;
    collapseRef.current +=
      (collapseTarget - collapseRef.current) * (1 - Math.exp(-collapseSpeed * delta));
    material.uniforms.uCollapse.value = collapseRef.current;

    // Brightness follows power, with the transition phases dimming briefly.
    let brightnessTarget = powered ? 1 : 0;
    if (transitionPhase === 'compress') brightnessTarget *= 1.25;
    if (transitionPhase === 'snow') brightnessTarget *= 0.8;
    material.uniforms.uBrightness.value +=
      (brightnessTarget - material.uniforms.uBrightness.value) *
      (1 - Math.exp(-12 * delta));

    // Tear decays back to zero; entropy keeps a very small baseline wobble.
    if (transitionPhase === 'displace') {
      tearRef.current = Math.max(tearRef.current, 0.05);
      tearYRef.current = 0.5;
    }
    tearRef.current *= Math.exp(-6 * delta);
    if (tearRef.current < 0.0005) tearRef.current = 0;

    const ambientTear = reducedMotion ? 0 : entropy * 0.004;
    material.uniforms.uTear.value = tearRef.current + ambientTear;
    material.uniforms.uTearY.value = tearYRef.current;
  });

  return (
    <group>
      {/* Inner content plane, slightly inset into the bezel. */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[1.02, 0.78, 1, 1]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={crtVertex}
          fragmentShader={crtFragment}
          uniforms={uniforms}
          toneMapped={false}
          transparent={false}
        />
      </mesh>

      {/*
        Outer glass: a shallow spherical cap whose apex sits just in front of
        the picture plane. The sphere centre is pushed back by its radius so
        the bulge lands at z = 0.02 rather than a radius away from the bezel.
      */}
      <mesh position={[0, 0, 0.02 - 2.6]} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
        <sphereGeometry args={[2.6, 20, 6, 0, Math.PI * 2, 0, 0.256]} />
        <meshPhysicalMaterial
          color="#0a0d0a"
          transparent
          opacity={0.14}
          roughness={0.22}
          metalness={0}
          transmission={0}
          clearcoat={1}
          clearcoatRoughness={0.18}
          reflectivity={0.4}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
