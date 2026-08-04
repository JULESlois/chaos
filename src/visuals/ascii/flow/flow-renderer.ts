import { clamp, clamp01, createRng, lerp, smoothstep, wrap } from '@/utils/math';
import type { QualityTier } from '../types';
import {
  cubicPoint,
  samplePath,
  samplePathPoints,
  type CubicBezierSegment,
  type Vec2,
} from './bezier';
import {
  FOCUS,
  MAIN_RIBBON,
  SECONDARY_RIBBON,
  sampleRibbon,
  type RibbonDefinition,
} from './ribbon';
import { GlyphAtlas } from './glyph-atlas';

/**
 * Drives the new CURRENT screen.
 *
 * This is the opposite of the old particle field: there is no full-screen
 * spawn, no uniform noise density, and no "more characters == more progress".
 * Every glyph belongs to a ribbon — its position is a point on a hand-placed
 * Bézier curve plus a lateral offset — so the composition is authored, not
 * emergent. The screen is a still poster that happens to breathe.
 */

export interface FlowLayerIntensity {
  background: number;
  body: number;
  foreground: number;
}

export interface FlowRenderConfig {
  width: number;
  height: number;
  dpr: number;
  /** Flowing time in seconds (frozen by the lab for keyframes). */
  time: number;
  /** Local progress within the CURRENT screen, 0–1. */
  progress: number;
  seed: number;
  quality: QualityTier;
  pointer: { x: number; y: number; active: boolean };
  /** Scroll speed, roughly 0–1, for extra stretch and scatter. */
  scrollVelocity: number;
  /** Lab density multiplier, 0.4–1.6. */
  density: number;
  /** Lab glyph scale multiplier. */
  sizeScale: number;
  layerIntensity: FlowLayerIntensity;
  debug: boolean;
  /** Per-frame delta in seconds (for pointer easing). */
  delta: number;
  /** Lab overrides; production leaves these undefined. */
  mainRibbon?: RibbonDefinition;
  secondaryRibbon?: RibbonDefinition;
}

/** Total transformed glyph ceiling per quality tier (spec: desktop 700–1400, mobile 350–700). */
const QUALITY_CAP: Record<QualityTier, number> = { 0: 1100, 1: 820, 2: 540 };

/** Hard caps on the largest glyphs so the poster never fills with 32px+ type. */
const MAX_LARGE = 40;
const MAX_HUGE = 10;

// Normalised speed ranges (u per second) used to stretch glyphs along flow.
const SPEED_MIN = 0.008;
const SPEED_MAX = 0.07;

interface ResolvedCounts {
  main: number;
  secondary: number;
  scatter: number;
  signature: string;
}

/**
 * The flow renderer.
 *
 * It owns its own atlas and its own deterministic instance population, and
 * draws straight to whatever context it is handed — the production engine's
 * canvas, or the Visual Lab's. It never touches the bucket painter.
 */
export class FlowRenderer {
  private readonly atlas: GlyphAtlas;
  private mainDef: RibbonDefinition = MAIN_RIBBON;
  private secondaryDef: RibbonDefinition = SECONDARY_RIBBON;

  // Main + secondary ribbon instance state, as parallel typed arrays.
  private u0 = new Float32Array(0);
  private lateral = new Float32Array(0);
  private depth = new Float32Array(0);
  private speedMul = new Float32Array(0);
  private glyphSeed = new Float32Array(0);
  private glyphIndex = new Uint8Array(0);
  private sizeTier = new Uint8Array(0);
  private lumLayer = new Uint8Array(0);
  private pushX = new Float32Array(0);
  private pushY = new Float32Array(0);
  private ribbonOf = new Uint8Array(0); // 0 = main, 1 = secondary
  private capacity = 0;

  // Scatter (脱落) instances, spawned from the band edge.
  private sU0 = new Float32Array(0);
  private sSide = new Float32Array(0);
  private sPhase = new Float32Array(0);
  private sSpeed = new Float32Array(0);
  private sSeed = new Float32Array(0);
  private sGlyph = new Uint8Array(0);
  private scatterCount = 0;

  private lastSeed = Number.NaN;
  private lastSignature = '';
  private lastMainRef: RibbonDefinition | null = null;
  private lastSecondaryRef: RibbonDefinition | null = null;
  private disposed = false;

  /** Built glyph count this frame, surfaced for tests/perf. */
  drawn = 0;

  constructor(charset: Uint8Array) {
    this.atlas = new GlyphAtlas(charset);
  }

  /** Releases the offscreen atlas and stops all further drawing. */
  dispose(): void {
    this.disposed = true;
    this.atlas.dispose();
  }

  /** Rebuilds the atlas if the viewport changed. Cheap when unchanged. */
  resize(view: { dpr: number }): void {
    void view;
    this.atlas.ensure();
  }

  private resolveCounts(config: FlowRenderConfig): ResolvedCounts {
    const cap = QUALITY_CAP[config.quality];
    const total = clamp(Math.round(cap * clamp01(config.density)), 350, 1400);
    const main = Math.round(total * 0.6);
    const secondary = Math.round(total * 0.22);
    const scatter = total - main - secondary;
    return { main, secondary, scatter, signature: `${config.quality}:${total}` };
  }

  /** How bright the whole ribbon is allowed to be at a given local progress. */
  private brightnessRamp(progress: number): number {
    if (progress < 0.18) return lerp(0.42, 0.55, smoothstep(0, 0.18, progress));
    if (progress < 0.45) return lerp(0.55, 0.82, smoothstep(0.18, 0.45, progress));
    if (progress < 0.68) return lerp(0.82, 1.0, smoothstep(0.45, 0.68, progress));
    if (progress < 0.86) return 1.0;
    return lerp(1.0, 0.9, smoothstep(0.86, 1, progress));
  }

  private maybeReseed(config: FlowRenderConfig, counts: ResolvedCounts): void {
    const mainRef = config.mainRibbon ?? this.mainDef;
    const secondaryRef = config.secondaryRibbon ?? this.secondaryDef;
    const signature = counts.signature;
    const changed =
      this.lastSeed !== config.seed ||
      this.lastSignature !== signature ||
      this.lastMainRef !== mainRef ||
      this.lastSecondaryRef !== secondaryRef;

    if (!changed) return;

    this.mainDef = config.mainRibbon ?? MAIN_RIBBON;
    this.secondaryDef = config.secondaryRibbon ?? SECONDARY_RIBBON;
    this.lastMainRef = mainRef;
    this.lastSecondaryRef = secondaryRef;
    this.lastSeed = config.seed;
    this.lastSignature = signature;

    this.populate(config.seed, counts);
  }

  /** (Re)builds every instance array deterministically from the seed. */
  private populate(seed: number, counts: ResolvedCounts): void {
    const main = counts.main;
    const secondary = counts.secondary;
    const total = main + secondary;
    this.capacity = total;

    this.u0 = new Float32Array(total);
    this.lateral = new Float32Array(total);
    this.depth = new Float32Array(total);
    this.speedMul = new Float32Array(total);
    this.glyphSeed = new Float32Array(total);
    this.glyphIndex = new Uint8Array(total);
    this.sizeTier = new Uint8Array(total);
    this.lumLayer = new Uint8Array(total);
    this.pushX = new Float32Array(total);
    this.pushY = new Float32Array(total);
    this.ribbonOf = new Uint8Array(total);

    const charsetLen = this.atlas.glyphCount;
    const rng = createRng(seed);

    let largeCount = 0;
    let hugeCount = 0;

    for (let i = 0; i < total; i += 1) {
      const isSecondary = i >= main;
      const def = isSecondary ? this.secondaryDef : this.mainDef;
      const r = rng();
      const r2 = rng();
      const r3 = rng();

      this.u0[i] = r;
      // Concentrate toward the centre line, with a soft edge.
      const edge = (r2 - 0.5) * 2;
      this.lateral[i] = edge * 0.82;
      this.depth[i] = lerp(def.depthRange[0], def.depthRange[1], r3);
      this.speedMul[i] = 0.7 + rng() * 0.6;
      this.glyphSeed[i] = rng();
      this.glyphIndex[i] = Math.min(charsetLen - 1, (rng() * charsetLen) | 0);
      this.ribbonOf[i] = isSecondary ? 1 : 0;

      const baseLum = sampleRibbon(def, r).luminance;
      // Secondary is deliberately dimmer and never reaches the highlight.
      const lum = isSecondary ? baseLum * 0.5 : baseLum;
      const metric = lum * 0.62 + this.depth[i] * 0.38;
      let tier = metric < 0.3 ? 0 : metric < 0.5 ? 1 : metric < 0.7 ? 2 : metric < 0.88 ? 3 : 4;
      if (isSecondary) tier = Math.min(tier, 2);

      // Enforce the global caps on the largest glyphs.
      if (tier === 4 && hugeCount >= MAX_HUGE) tier = 3;
      if (tier === 3 && largeCount >= MAX_LARGE) tier = 2;
      if (tier === 4) hugeCount += 1;
      else if (tier === 3) largeCount += 1;

      this.sizeTier[i] = tier;
      this.lumLayer[i] = this.layerForLuminance(lum);
    }

    // Scatter population.
    const scatter = counts.scatter;
    this.scatterCount = scatter;
    this.sU0 = new Float32Array(scatter);
    this.sSide = new Float32Array(scatter);
    this.sPhase = new Float32Array(scatter);
    this.sSpeed = new Float32Array(scatter);
    this.sSeed = new Float32Array(scatter);
    this.sGlyph = new Uint8Array(scatter);
    const srng = createRng(seed ^ 0x5a17);
    for (let i = 0; i < scatter; i += 1) {
      this.sU0[i] = srng();
      this.sSide[i] = srng() < 0.5 ? -1 : 1;
      this.sPhase[i] = srng();
      this.sSpeed[i] = 0.06 + srng() * 0.12;
      this.sSeed[i] = srng();
      this.sGlyph[i] = Math.min(charsetLen - 1, (srng() * charsetLen) | 0);
    }
  }

  private layerForLuminance(lum: number): number {
    if (lum < 0.22) return 0;
    if (lum < 0.5) return 1;
    if (lum < 0.82) return 2;
    return 3;
  }

  private normalizedSpeed(def: RibbonDefinition, u: number): number {
    const s = sampleRibbon(def, u).speed;
    return clamp01((s - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  }

  /** Draws the whole flow to `ctx` (assumed already in CSS-pixel space). */
  render(ctx: CanvasRenderingContext2D, view: { width: number; height: number }, config: FlowRenderConfig): void {
    if (this.disposed) {
      this.drawn = 0;
      return;
    }
    this.atlas.ensure();
    const counts = this.resolveCounts(config);
    this.maybeReseed(config, counts);

    const bright = this.brightnessRamp(config.progress);
    const focusBoost = smoothstep(0.42, 0.66, config.progress);
    const shortSide = Math.min(view.width, view.height);
    const pushRadius = shortSide * 0.12;
    const pointerActive = config.pointer.active;
    const pointerPx = config.pointer.x * view.width;
    const pointerPy = config.pointer.y * view.height;
    const scrollStretch = clamp01(config.scrollVelocity) * 0.6;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let lastAlpha = -1;
    let lastFilter = '';
    this.drawn = 0;

    // ── ribbon glyphs ──
    for (let i = 0; i < this.capacity; i += 1) {
      const def = this.ribbonOf[i] === 1 ? this.secondaryDef : this.mainDef;
      const u = wrap(this.u0[i] + sampleRibbon(def, this.u0[i]).speed * this.speedMul[i] * config.time, 1);
      const sample = sampleRibbon(def, u);

      const nx = sample.point.x + -sample.tangentY * this.lateral[i] * sample.width * 0.5;
      const ny = sample.point.y + sample.tangentX * this.lateral[i] * sample.width * 0.5;

      let px = nx * view.width;
      let py = ny * view.height;

      // ── pointer gap + push ──
      let pushTargetX = 0;
      let pushTargetY = 0;
      let gap = 1;
      if (pointerActive) {
        const dx = px - pointerPx;
        const dy = py - pointerPy;
        const dist = Math.hypot(dx, dy);
        if (dist < pushRadius && dist > 0.001) {
          const k = 1 - dist / pushRadius;
          pushTargetX = (dx / dist) * k * 26;
          pushTargetY = (dy / dist) * k * 26;
          gap = 1 - k * 0.85;
        }
      }
      // Ease the push (only meaningful in production where delta > 0).
      const ease = 1 - Math.exp(-8 * Math.max(0, config.delta));
      this.pushX[i] = lerp(this.pushX[i], pushTargetX, ease);
      this.pushY[i] = lerp(this.pushY[i], pushTargetY, ease);
      px += this.pushX[i];
      py += this.pushY[i];

      // ── visual attributes ──
      const lumBase = sample.luminance;
      const isSecondary = this.ribbonOf[i] === 1;
      const lum = isSecondary ? lumBase * 0.5 : lumBase;
      const visualLum = clamp01(lum * lerp(0.5, 1, bright));
      const lumIndex = isSecondary ? Math.min(this.lumLayer[i], 1) : this.layerForLuminance(visualLum);

      const depth = this.depth[i];
      const angle = sample.angle + (this.glyphSeed[i] - 0.5) * 0.24; // ±0.12 rad
      const nSpeed = this.normalizedSpeed(def, u);
      const scaleX = clamp(1 + (nSpeed + scrollStretch) * 2.5, 0.8, 3.5);
      const scaleY = clamp(0.85 + depth * 0.25, 0.75, 1.25);

      // Alpha by depth/layer + band-edge falloff + progress brightness.
      const edgeFall = 1 - Math.abs(this.lateral[i]) * 0.55;
      let alpha = edgeFall * (0.35 + depth * 0.4) * lerp(0.5, 1, bright);
      if (isSecondary) alpha *= 0.7;
      alpha *= gap;
      alpha *= isSecondary ? config.layerIntensity.background : config.layerIntensity.body;
      if (depth > 0.8 && !isSecondary) alpha *= config.layerIntensity.foreground;
      alpha = clamp01(alpha);
      if (alpha < 0.02) continue;

      const tier = this.sizeTier[i];
      const entry = this.atlas.entry(tier, lumIndex);
      if (!entry) continue;

      // Foreground large glyphs get a touch of blur; everything else is crisp.
      const blur = depth > 0.82 && tier >= 3 ? (tier >= 4 ? 1.1 : 0.5) * (depth - 0.82) * 5 : 0;
      const filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : 'none';
      if (filter !== lastFilter) {
        ctx.filter = filter;
        lastFilter = filter;
      }
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.scale(scaleX * config.sizeScale, scaleY * config.sizeScale);
      ctx.drawImage(
        entry.canvas,
        this.glyphIndex[i]! * entry.cell,
        0,
        entry.cell,
        entry.cell,
        -entry.draw / 2,
        -entry.draw / 2,
        entry.draw,
        entry.draw,
      );
      ctx.restore();
      this.drawn += 1;
    }

    // ── scatter (脱落) from the band edge ──
    this.drawScatter(ctx, view, config, focusBoost);

    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();

    if (config.debug) this.drawDebug(ctx, view, config);
  }

  private drawScatter(
    ctx: CanvasRenderingContext2D,
    view: { width: number; height: number },
    config: FlowRenderConfig,
    focusBoost: number,
  ): void {
    // Scatter only appears once the screen is past its opening.
    const onset = smoothstep(0.4, 0.7, config.progress);
    if (onset <= 0.01) return;
    const count = this.scatterCount;

    let lastAlpha = -1;
    for (let i = 0; i < count; i += 1) {
      const tau = wrap(config.time * this.sSpeed[i]! + this.sPhase[i]!, 1);
      const sample = sampleRibbon(this.mainDef, this.sU0[i]!);
      const edge = 0.9 + tau * 1.6;
      const nx = sample.point.x + -sample.tangentY * this.sSide[i]! * sample.width * 0.5 * edge;
      const ny = sample.point.y + sample.tangentX * this.sSide[i]! * sample.width * 0.5 * edge
        + sample.tangentY * (this.sSeed[i]! - 0.5) * tau * 0.02;
      const px = nx * view.width;
      const py = ny * view.height;

      const alpha = clamp01(Math.sin(Math.PI * tau) * 0.5 * onset * (0.5 + focusBoost * 0.5));
      if (alpha < 0.02) continue;

      const tier = 0;
      const entry = this.atlas.entry(tier, 1);
      if (!entry) continue;
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(sample.angle + (this.sSeed[i]! - 0.5) * 0.2);
      ctx.scale(0.9, 0.9);
      ctx.drawImage(entry.canvas, this.sGlyph[i]! * entry.cell, 0, entry.cell, entry.cell, -entry.draw / 2, -entry.draw / 2, entry.draw, entry.draw);
      ctx.restore();
      this.drawn += 1;
    }
  }

  /** Debug overlay: path, width envelope, focus and live instance count. */
  drawDebug(ctx: CanvasRenderingContext2D, view: { width: number; height: number }, config: FlowRenderConfig): void {
    const mainRef = config.mainRibbon ?? this.mainDef;
    const secondaryRef = config.secondaryRibbon ?? this.secondaryDef;
    this.strokePath(ctx, view, mainRef.path, '#ffc0c9');
    this.strokePath(ctx, view, secondaryRef.path, '#6b2933');

    // Width envelope ticks along the main ribbon.
    ctx.strokeStyle = 'rgba(255,192,201,0.5)';
    for (let i = 0; i <= 20; i += 1) {
      const u = i / 20;
      const sample = sampleRibbon(mainRef, u);
      const cx = sample.point.x * view.width;
      const cy = sample.point.y * view.height;
      const nx = -sample.tangentY;
      const ny = sample.tangentX;
      const half = sample.width * 0.5 * Math.min(view.width, view.height);
      ctx.beginPath();
      ctx.moveTo(cx - nx * half, cy - ny * half);
      ctx.lineTo(cx + nx * half, cy + ny * half);
      ctx.stroke();
    }

    // Focus marker.
    ctx.strokeStyle = '#ffc0c9';
    ctx.beginPath();
    ctx.arc(FOCUS.x * view.width, FOCUS.y * view.height, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffc0c9';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`glyphs: ${this.drawn}`, 12, 12);
  }

  private strokePath(ctx: CanvasRenderingContext2D, view: { width: number; height: number }, segments: readonly CubicBezierSegment[], color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const points = samplePathPoints(segments, 48);
    for (let i = 0; i < points.length; i += 1) {
      const p: Vec2 = points[i]!;
      const x = p.x * view.width;
      const y = p.y * view.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /** Exposes the sampled centre line — the interface FORM will later reuse. */
  ribbonSampleAt(u: number, which: 'main' | 'secondary' = 'main') {
    return sampleRibbon(which === 'secondary' ? this.secondaryDef : this.mainDef, u);
  }

  /** True once instances have been built for the current seed/counts. */
  get populated(): boolean {
    return this.capacity > 0;
  }

  /** Built glyph count (main + secondary). Surfaced for tests/perf. */
  get builtCapacity(): number {
    return this.capacity;
  }

  /** Base `u` of every ribbon instance, as laid out by the seed. Test-only. */
  get debugU0(): Float32Array {
    return this.u0;
  }

  /** Current `u` of every instance at a given flow time (wraps to [0,1)). */
  currentU(time: number): Float32Array {
    const out = new Float32Array(this.capacity);
    for (let i = 0; i < this.capacity; i += 1) {
      const def = this.ribbonOf[i] === 1 ? this.secondaryDef : this.mainDef;
      const speed = sampleRibbon(def, this.u0[i]!).speed;
      out[i] = wrap(this.u0[i]! + speed * this.speedMul[i]! * time, 1);
    }
    return out;
  }

  get mainDefinition(): RibbonDefinition {
    return this.mainDef;
  }
}

/** Convenience for callers that only have a base size scale. */
export function defaultLayerIntensity(): FlowLayerIntensity {
  return { background: 1, body: 1, foreground: 1 };
}

/** Sample points for the main ribbon centre line (used by debug + FORM). */
export { cubicPoint, samplePath };
