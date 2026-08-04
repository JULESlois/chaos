import { signalSurface } from '@/systems/signal/signal-surface';
import { hash01 } from '../../../utils/math';
import { applyChannelFont } from './channel-text';
import {
  CHANNEL_PALETTE,
  clearFrame,
  drawScanlines,
  type ChannelContext,
  type TVChannel,
} from './channel-types';

/**
 * CH-00 · SIGNAL — the channel the whole site was on.
 *
 * It does not generate anything. It blits the page's own code-rain surface:
 * there is no second rain, no second seed, and no second animation loop — this
 * channel is a window, not a source.
 *
 * It is not yet a *clean* window. The blit crops the 16:9 page to this canvas's
 * 4:3, the canvas is 320×240, and `drawScanlines` below then spends real
 * vertical resolution at that size before the texture is upscaled ~6× onto the
 * glass. That is acceptable for a channel the reader is looking *at*; it is not
 * acceptable for the reveal, where this same picture has to pass for the one
 * the reader was standing in. The reveal should bypass this path entirely.
 *
 * The fallback below only runs if the field has not published a frame yet
 * (a still-mounting page, or a stopped engine). It is deliberately not the old
 * snow: a dead carrier here should read as *this* signal missing, not as some
 * other channel's static.
 */
export function createSignalChannel(): TVChannel {
  let lastFrameId = -1;
  let staleFrames = 0;
  let frame = 0;

  return {
    id: 'ch-00',
    label: 'CH-00 · SIGNAL',
    // Matched to the page field, so the television is never a slideshow of it.
    fps: 60,

    enter() {
      lastFrameId = -1;
      staleFrames = 0;
      frame = 0;
    },

    update() {
      frame += 1;
      const id = signalSurface.frameId;
      if (id === lastFrameId) staleFrames += 1;
      else staleFrames = 0;
      lastFrameId = id;
    },

    render(context: ChannelContext) {
      const { ctx, width, height } = context;
      clearFrame(ctx, width, height, '#0b0305');

      const drawn = signalSurface.blit(ctx, width, height);
      if (!drawn || staleFrames > 90) {
        renderCarrierLoss(context, frame);
      }

      // The glass adds its own scanlines on top of the shared surface. Kept
      // light: the CRT shader does the heavy lifting, this is only what makes
      // the small screen read as a different *object* to the full-screen field.
      drawScanlines(ctx, width, height, 0.12);
    },

    exit() {
      lastFrameId = -1;
      staleFrames = 0;
    },
  };
}

/** No published frame. A thin, dim carrier rather than full snow. */
function renderCarrierLoss(context: ChannelContext, frame: number): void {
  const { ctx, width, height, elapsed } = context;
  applyChannelFont(ctx);
  clearFrame(ctx, width, height, '#0b0305');

  const cell = 4;
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const n = hash01(x * 73856093 + y * 19349663 + frame * 83492791);
      if (n > 0.06) continue;
      const value = (40 + n * 900) | 0;
      const r = Math.min(190, value);
      ctx.fillStyle = `rgba(${r}, ${(r * 0.56) | 0}, ${(r * 0.62) | 0}, 0.5)`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  const y = height * 0.5 + Math.sin(elapsed * 1.4) * height * 0.04;
  ctx.fillStyle = 'rgba(255, 192, 201, 0.22)';
  ctx.fillRect(0, y, width, 1);

  ctx.save();
  ctx.globalAlpha = 0.4 + 0.2 * Math.sin(elapsed * 2.2);
  ctx.fillStyle = CHANNEL_PALETTE.text;
  ctx.textAlign = 'center';
  ctx.fillText('NO SIGNAL', width / 2, height / 2 - 6);
  ctx.restore();
}
