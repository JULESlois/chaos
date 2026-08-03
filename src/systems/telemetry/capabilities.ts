/**
 * Device capability detection and the resulting quality ladder.
 *
 * Level 0 — full Three.js + Canvas channels + CRT shader
 * Level 1 — reduced DPR, no shadows, simplified shader
 * Level 2 — static Three.js TV, CSS-driven screen animation
 * Level 3 — no WebGL: static DOM television with DOM channel content
 */

export type RenderLevel = 0 | 1 | 2 | 3;

export interface DeviceCapabilities {
  webgl: boolean;
  webgl2: boolean;
  /** Rough device class derived from memory, cores and pointer type. */
  tier: 'high' | 'medium' | 'low';
  isTouchPrimary: boolean;
  isNarrowViewport: boolean;
  prefersReducedMotion: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number;
  maxDpr: number;
  renderLevel: RenderLevel;
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/** Probes for a WebGL context and disposes it immediately. */
export function detectWebGL(): { webgl: boolean; webgl2: boolean } {
  if (typeof document === 'undefined') {
    return { webgl: false, webgl2: false };
  }
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      gl2.getExtension('WEBGL_lose_context')?.loseContext();
      return { webgl: true, webgl2: true };
    }
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (gl) {
      (gl as WebGLRenderingContext)
        .getExtension('WEBGL_lose_context')
        ?.loseContext();
      return { webgl: true, webgl2: false };
    }
    return { webgl: false, webgl2: false };
  } catch {
    return { webgl: false, webgl2: false };
  } finally {
    canvas = null;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function detectTier(
  memory: number | null,
  cores: number,
  touchPrimary: boolean,
  narrow: boolean,
): 'high' | 'medium' | 'low' {
  if (memory !== null && memory <= 2) return 'low';
  if (cores <= 2) return 'low';
  if (touchPrimary && narrow && cores <= 4) return 'low';
  if (memory !== null && memory <= 4) return 'medium';
  if (cores <= 4) return 'medium';
  if (touchPrimary) return 'medium';
  return 'high';
}

function resolveRenderLevel(
  webgl: boolean,
  tier: 'high' | 'medium' | 'low',
  reducedMotion: boolean,
): RenderLevel {
  if (!webgl) return 3;
  if (tier === 'low') return 2;
  if (reducedMotion) return 1;
  if (tier === 'medium') return 1;
  return 0;
}

export function detectCapabilities(): DeviceCapabilities {
  if (typeof window === 'undefined') {
    return {
      webgl: false,
      webgl2: false,
      tier: 'low',
      isTouchPrimary: false,
      isNarrowViewport: false,
      prefersReducedMotion: false,
      deviceMemoryGb: null,
      hardwareConcurrency: 1,
      maxDpr: 1,
      renderLevel: 3,
    };
  }

  const { webgl, webgl2 } = detectWebGL();
  const nav = navigator as NavigatorWithMemory;
  const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const hardwareConcurrency = nav.hardwareConcurrency || 2;
  const isTouchPrimary =
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  const isNarrowViewport = window.innerWidth < 768;
  const reducedMotion = prefersReducedMotion();

  const tier = detectTier(
    deviceMemoryGb,
    hardwareConcurrency,
    isTouchPrimary,
    isNarrowViewport,
  );

  const maxDpr = isNarrowViewport || tier === 'low' ? 1 : tier === 'medium' ? 1.25 : 1.5;

  return {
    webgl,
    webgl2,
    tier,
    isTouchPrimary,
    isNarrowViewport,
    prefersReducedMotion: reducedMotion,
    deviceMemoryGb,
    hardwareConcurrency,
    maxDpr,
    renderLevel: resolveRenderLevel(webgl, tier, reducedMotion),
  };
}

/** Exposed separately so it can be unit tested without a DOM. */
export function selectRenderLevel(input: {
  webgl: boolean;
  tier: 'high' | 'medium' | 'low';
  prefersReducedMotion: boolean;
}): RenderLevel {
  return resolveRenderLevel(input.webgl, input.tier, input.prefersReducedMotion);
}

/** ASCII cell budget for the detected device. */
export function asciiCellBudget(caps: DeviceCapabilities): number {
  if (caps.isNarrowViewport || caps.tier === 'low') return 1800;
  if (caps.tier === 'medium') return 3800;
  return 6000;
}

/** Channel canvas resolution for the detected device. */
export function channelResolution(caps: DeviceCapabilities): {
  width: number;
  height: number;
} {
  if (caps.isNarrowViewport || caps.tier === 'low') return { width: 256, height: 192 };
  return { width: 320, height: 240 };
}
