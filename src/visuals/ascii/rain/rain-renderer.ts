import type { GlyphAtlas } from '../flow/glyph-atlas';
import type { RainGlyphSample } from './rain-types';
import { clamp01 } from './rain-types';
import type { ShapeSlots } from './shape/shape-slots';
import { SlotState } from './shape/shape-types';

const SIZE_TIERS = [9, 13, 20, 32, 56] as const;

function luminanceIndex(brightness: number): number {
  const b = clamp01(brightness);
  if (b < 0.22) return 0;
  if (b < 0.5) return 1;
  if (b < 0.82) return 2;
  return 3;
}

function nearestTier(sizePx: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < SIZE_TIERS.length; i += 1) {
    const diff = Math.abs(SIZE_TIERS[i]! - sizePx);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/**
 * Paints rain glyph samples with the shared `GlyphAtlas`.
 *
 * The atlas pre-renders each glyph at every size tier × luminance layer, so a
 * sample is just `drawImage` under a translate/rotate/scale — no per-character
 * `fillText`. Per-glyph alpha carries the trail fade, the form void cut, and the
 * chaos collapse; rotation follows the local rain tangent (here the column
 * axis, so the rotation is a small per-stream jitter), and the scale carries
 * the depth stretch from the form modulator.
 */
export class RainRenderer {
  private readonly atlas: GlyphAtlas;

  constructor(atlas: GlyphAtlas) {
    this.atlas = atlas;
  }

  get atlasInstance(): GlyphAtlas {
    return this.atlas;
  }

  render(ctx: CanvasRenderingContext2D, samples: RainGlyphSample[], count: number): void {
    this.atlas.ensure();
    let lastAlpha = -1;
    for (let i = 0; i < count; i += 1) {
      const s = samples[i]!;
      if (s.alpha < 0.02) continue;

      const lumIndex = luminanceIndex(s.brightness);
      const sizeIndex = nearestTier(s.size);
      const entry = this.atlas.entry(sizeIndex, lumIndex);
      if (!entry) continue;

      if (s.alpha !== lastAlpha) {
        ctx.globalAlpha = clamp01(s.alpha);
        lastAlpha = s.alpha;
      }

      const native = SIZE_TIERS[sizeIndex]!;
      const baseScale = native > 0 ? s.size / native : 1;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rotation);
      ctx.scale(baseScale * s.scaleX, baseScale * s.scaleY);
      ctx.drawImage(
        entry.canvas,
        s.glyph * entry.cell,
        0,
        entry.cell,
        entry.cell,
        -entry.draw / 2,
        -entry.draw / 2,
        entry.draw,
        entry.draw,
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  renderShapeSlots(ctx: CanvasRenderingContext2D, slots: ShapeSlots, cellPx: number): void {
    if (slots.count === 0) return;
    this.atlas.ensure();
    let lastAlpha = -1;
    const count = slots.count;

    for (let i = 0; i < count; i += 1) {
      if (slots.state[i] === SlotState.EMPTY) continue;
      const energy = slots.energy[i];
      if (energy < 0.02) continue;

      const x = (slots.currentX[i] + 0.5) * cellPx;
      const y = (slots.currentY[i] + 0.5) * cellPx;

      const lumIndex = luminanceIndex(0.6 + energy * 0.4);
      const sizeIndex = nearestTier(cellPx);
      const entry = this.atlas.entry(sizeIndex, lumIndex);
      if (!entry) continue;

      const alpha = clamp01(energy);
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }

      const native = SIZE_TIERS[sizeIndex]!;
      const baseScale = native > 0 ? cellPx / native : 1;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(baseScale, baseScale);
      ctx.drawImage(
        entry.canvas,
        (slots.glyph[i] % this.atlas.glyphCount) * entry.cell,
        0,
        entry.cell,
        entry.cell,
        -entry.draw / 2,
        -entry.draw / 2,
        entry.draw,
        entry.draw,
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
