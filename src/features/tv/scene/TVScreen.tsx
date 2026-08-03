import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChannelManager } from '../channels/ChannelManager';
import crtFragment from '../shaders/crt.frag?raw';
import crtVertex from '../shaders/crt.vert?raw';
import type { TransitionPhase } from '../types';

export interface ScreenQuality {
  /** Level 0 gets the full shader; higher levels progressively simplify it. */
  curvature: number;
  scanline: number;
  /** Same-hue smear along the scan direction, 0–1. Never a channel split. */
  dispersion: number;
  noise: number;
  band: number;
  vignette: number;
}

export const SCREEN_QUALITY: Record<0 | 1 | 2, ScreenQuality> = {
  0: { curvature: 0.12, scanline: 0.16, dispersion: 0.6, noise: 0.045, band: 0.03, vignette: 0.55 },
  1: { curvature: 0.08, scanline: 0.1, dispersion: 0.3, noise: 0.025, band: 0.02, vignette: 0.42 },
  2: { curvature: 0.0, scanline: 0.06, dispersion: 0.0, noise: 0.0, band: 0.0, vignette: 0.3 },
};

/**
 * The JS twin of `curveUv` in the fragment shader.
 *
 * Clicks arrive as flat plane UVs, but the picture the reader is aiming at
 * has been barrel-distorted. Running the same curve here is the difference
 * between hitting the row you can see and hitting the row next to it.
 */
function curveUv(x: number, y: number, amount: number): [number, number] {
  const cx = x * 2 - 1;
  const cy = y * 2 - 1;
  return [
    (cx + cx * (cy * cy * amount)) * 0.5 + 0.5,
    (cy + cy * (cx * cx * amount)) * 0.5 + 0.5,
  ];
}

interface TVScreenProps {
  manager: ChannelManager | null;
  quality: ScreenQuality;
  powered: boolean;
  transitionPhase: TransitionPhase;
  /** Visual tension, 0–1. Feeds the ambient wobble only. */
  tension: number;
  /** Raised briefly by the horizontal-tear event. */
  tearImpulse: number;
  reducedMotion: boolean;
  /** Screen clicks only register once the camera has locked onto the set. */
  interactive: boolean;
}

/**
 * The screen surface.
 *
 * Inner plane: the channel CanvasTexture processed by the CRT shader.
 * Outer shell: a transparent convex "glass" mesh carrying reflection only.
 *
 * The plane is also the site's only click target for content. Channels that
 * have something to open expose a `hit`, and the raycast UV is converted to
 * canvas pixels here. Nothing is overlaid on the canvas in the DOM.
 */
export function TVScreen({
  manager,
  quality,
  powered,
  transitionPhase,
  tension,
  tearImpulse,
  reducedMotion,
  interactive,
}: TVScreenProps): React.JSX.Element {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const collapseRef = useRef(0);
  const tearRef = useRef(0);
  const tearYRef = useRef(0.5);
  const hoveredRef = useRef(false);

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

  // Never leave the document cursor in the pointer state on unmount.
  useEffect(() => {
    return () => {
      if (hoveredRef.current) {
        document.body.style.cursor = '';
        hoveredRef.current = false;
      }
    };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uTime: { value: 0 },
      uCurvature: { value: quality.curvature },
      uScanline: { value: quality.scanline },
      uDispersion: { value: quality.dispersion },
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
    material.uniforms.uDispersion.value = quality.dispersion;
    material.uniforms.uNoise.value = reducedMotion ? 0 : quality.noise;
    material.uniforms.uBand.value = reducedMotion ? 0 : quality.band;
    material.uniforms.uVignette.value = quality.vignette;
  }, [quality, reducedMotion]);

  // Trigger a tear when the tension controller asks for one.
  useEffect(() => {
    if (tearImpulse <= 0 || reducedMotion) return;
    tearRef.current = 0.06;
    tearYRef.current = 0.2 + Math.random() * 0.6;
  }, [tearImpulse, reducedMotion]);

  /** Plane UV → texture UV → canvas-relative UV, matching the shader. */
  const toChannelUv = useCallback(
    (uv: THREE.Vector2): [number, number] => {
      const [x, y] = curveUv(uv.x, uv.y, quality.curvature);
      // flipY is on, so the top of the canvas is v = 1 on the plane.
      return [x, 1 - y];
    },
    [quality.curvature],
  );

  const handleMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!manager || !powered) return;
      const uv = event.uv;
      if (!uv) return;
      const [u, v] = toChannelUv(uv);
      manager.setPointer(u, v);
    },
    [manager, powered, toChannelUv],
  );

  const handleOut = useCallback(() => {
    // -1 is the channels' agreed "pointer is not on the glass" value.
    manager?.setPointer(-1, -1);
    if (hoveredRef.current) {
      document.body.style.cursor = '';
      hoveredRef.current = false;
    }
  }, [manager]);

  const handleOver = useCallback(() => {
    if (!interactive || hoveredRef.current) return;
    hoveredRef.current = true;
    document.body.style.cursor = 'pointer';
  }, [interactive]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!manager || !powered || !interactive) return;
      const uv = event.uv;
      if (!uv) return;
      event.stopPropagation();
      const [u, v] = toChannelUv(uv);
      manager.hit(u, v);
    },
    [manager, powered, interactive, toChannelUv],
  );

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

    // Tear decays back to zero; tension keeps a very small baseline wobble.
    if (transitionPhase === 'displace') {
      tearRef.current = Math.max(tearRef.current, 0.05);
      tearYRef.current = 0.5;
    }
    tearRef.current *= Math.exp(-6 * delta);
    if (tearRef.current < 0.0005) tearRef.current = 0;

    const ambientTear = reducedMotion ? 0 : tension * 0.004;
    material.uniforms.uTear.value = tearRef.current + ambientTear;
    material.uniforms.uTearY.value = tearYRef.current;
  });

  return (
    <group>
      {/* Inner content plane, slightly inset into the bezel. */}
      <mesh
        position={[0, 0, 0.001]}
        onClick={handleClick}
        onPointerMove={handleMove}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
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

        It does not take pointer events — the picture plane behind it is the
        click target, and an invisible shell swallowing clicks is the kind of
        bug that reads as "the site is broken" rather than "the site is odd".
      */}
      <mesh
        position={[0, 0, 0.02 - 2.6]}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={2}
        raycast={() => null}
      >
        <sphereGeometry args={[2.6, 20, 6, 0, Math.PI * 2, 0, 0.256]} />
        <meshPhysicalMaterial
          color="#150609"
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
