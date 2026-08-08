import { useEffect, useRef } from 'react';
import { signalSurface } from '@/systems/signal/signal-surface';
import { VOID } from '@/visuals/ascii/palette';
import { RainField } from '@/visuals/ascii/rain/rain-field';
import type { ChaosFaults, FormWeights, RainRenderConfig } from '@/visuals/ascii/rain/rain-types';
import { NORMAL_CHAOS } from '@/visuals/ascii/rain/rain-types';
import type { AsciiViewport, PointerState, QualityTier } from '@/visuals/ascii/types';

/**
 * Everything a lab is allowed to change about the rain, per frame.
 *
 * Held in a ref and read at the top of each tick rather than passed as props,
 * because a slider drag should not restart the field — the whole value of a
 * lab is watching one number move while the simulation keeps its history.
 */
export interface RainParams {
  quality: QualityTier;
  /** Frozen frames are how the screenshots are taken. */
  paused: boolean;
  /** The clock used while paused. Ignored when running. */
  time: number;
  /** 0–1, fed to the modulator as scene-local progress. */
  progress: number;
  reducedMotion: boolean;
  /** Overlays the mask fields the modulator is reading. */
  debug: boolean;
  form: FormWeights;
  chaos: ChaosFaults;
  /**
   * Publish each frame to the shared signal surface.
   *
   * Only the TV reveal lab wants this. The other two would be handing the
   * television a picture nothing is watching.
   */
  publish: boolean;
}

export interface RainStats {
  cols: number;
  rows: number;
  glyphs: number;
  /** Rolling average of the render call, in milliseconds. */
  cost: number;
  fps: number;
}

export const IDLE_POINTER: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  speed: 0,
  active: false,
  idle: 10,
};

/** A viewport shaped the way `AsciiEngine.measure` shapes the real one. */
export function labViewport(width: number, height: number, maxDpr = 1.5): AsciiViewport {
  const narrow = width < 768;
  const dpr = Math.min(narrow ? 1 : maxDpr, (globalThis.devicePixelRatio || 1) as number);
  const fontSize = narrow ? 15 : 13;
  const cellWidth = fontSize * 0.62;
  const cellHeight = fontSize * 1.16;
  return {
    width,
    height,
    dpr,
    fontSize,
    cellWidth,
    cellHeight,
    cols: Math.max(1, Math.floor(width / cellWidth)),
    rows: Math.max(1, Math.floor(height / cellHeight)),
  };
}

/**
 * Runs one real `RainField` against a full-viewport canvas.
 *
 * This is the production field, the production renderer and the production
 * form modulator — the lab supplies the numbers a scene would normally supply
 * and nothing else. If a lab could make the rain do something the site cannot,
 * the lab would be lying, and every screenshot taken from it with it.
 *
 * The field is rebuilt when `seed` changes (the seed is a constructor argument
 * and the determinism depends on that) and re-gridded when quality or the
 * window changes. Nothing else tears it down.
 */
export function useRainCanvas(
  seed: number,
  paramsRef: React.RefObject<RainParams>,
  onStats?: (stats: RainStats) => void,
): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statsRef = useRef(onStats);
  statsRef.current = onStats;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const field = new RainField(seed);
    const config: RainRenderConfig = {
      width: 0,
      height: 0,
      cell: 13,
      time: 0,
      delta: 0,
      progress: 0,
      seed,
      quality: 0,
      pointer: IDLE_POINTER,
      reducedMotion: false,
      formWeights: { face: 0, figure: 0, hand: 0 },
      chaos: NORMAL_CHAOS,
      weight: 1,
      bootProgress: 1,
      bootLineStrength: 0,
      releaseStrength: 1,
      trailGrowth: 1,
      trajectoryDistortion: 0,
      trajectoryAnomaly: 0,
      mutationIntensity: 0.25,
      glyphPoolMix: 0,
      debug: false,
      frameId: 0,
    };

    let view = labViewport(1, 1);
    let griddedQuality: QualityTier | null = null;
    let raf = 0;
    let clock = paramsRef.current?.time ?? 0;
    let last = performance.now();
    let cost = 0;
    let fps = 60;
    let statAt = 0;

    const fit = (quality: QualityTier): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const changed = width !== view.width || height !== view.height;
      if (changed) view = labViewport(width, height);
      if (!changed && griddedQuality === quality) return;

      const pixelWidth = Math.max(1, Math.round(view.width * view.dpr));
      const pixelHeight = Math.max(1, Math.round(view.height * view.dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${view.width}px`;
      canvas.style.height = `${view.height}px`;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

      field.resize(view, quality);
      griddedQuality = quality;
    };

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const p = paramsRef.current;
      if (!p) return;

      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      fps += ((delta > 0 ? 1 / delta : 60) - fps) * 0.1;

      fit(p.quality);
      if (!p.paused) clock += delta;

      config.width = view.width;
      config.height = view.height;
      config.cell = view.cellWidth;
      config.time = p.paused ? p.time : clock;
      // A paused lab still has to advance the simulation by *something* or the
      // field would not exist at all; it advances by a fixed step, so a frozen
      // frame is reproducible rather than dependent on when you hit pause.
      config.delta = p.paused ? 1 / 60 : delta;
      config.progress = p.progress;
      config.quality = p.quality;
      config.reducedMotion = p.reducedMotion;
      config.formWeights = p.form;
      config.chaos = p.chaos;
      config.debug = p.debug;

      ctx.fillStyle = VOID;
      ctx.fillRect(0, 0, view.width, view.height);

      const started = performance.now();
      field.render(ctx, config);
      cost += (performance.now() - started - cost) * 0.1;

      if (p.publish) signalSurface.publish(canvas, view.width, view.height);

      const report = statsRef.current;
      if (report && now - statAt > 250) {
        statAt = now;
        report({
          cols: field.columnCount,
          rows: field.rowCount,
          glyphs: field.drawnCount,
          cost,
          fps,
        });
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      field.dispose();
      if (signalSurface.canvas === canvas) signalSurface.clear();
    };
  }, [seed, paramsRef]);

  return canvasRef;
}
