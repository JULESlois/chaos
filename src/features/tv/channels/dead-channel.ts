import { createRng } from '@/utils/math';
import {
  CHANNEL_FONT,
  CHANNEL_PALETTE,
  clearFrame,
  drawScanlines,
  type TVChannel,
} from './channel-types';

const NO_SIGNAL_UNTIL = 3.0;
const NOT_LISTED_UNTIL = 6.5;
const RECONSTRUCT_AT = 8.0;

/**
 * CH-04 — the unlisted channel.
 *
 * Sequence: snow → "NO SIGNAL" → "THIS CHANNEL IS NOT LISTED." → an abstract
 * wireframe reconstruction of this site's own layout.
 *
 * Explicitly local: nothing is captured, no permissions are requested and no
 * data is transmitted. The "reconstruction" is a hard-coded set of rectangles
 * that resembles the page — it is a drawing, not a capture.
 */
export function createDeadChannel(onDiscovered: () => void): TVChannel {
  const rng = createRng(90210);
  let notified = false;
  let snowPhase = 0;

  function drawSnow(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    density: number,
  ): void {
    const count = Math.floor(width * height * density * 0.05);
    for (let i = 0; i < count; i += 1) {
      const x = rng() * width;
      const y = rng() * height;
      const value = 40 + rng() * 150;
      ctx.fillStyle = `rgb(${value}, ${value + 6}, ${value})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  return {
    id: 'ch-04',
    label: 'CH-04 · ———',
    fps: 24,

    enter() {
      notified = false;
      snowPhase = 0;
    },

    update(context, delta) {
      snowPhase += delta;
      if (!notified && context.elapsed >= RECONSTRUCT_AT) {
        notified = true;
        onDiscovered();
      }
    },

    render(context) {
      const { ctx, width, height, elapsed } = context;
      clearFrame(ctx, width, height, '#050705');
      ctx.font = `${CHANNEL_FONT.size}px ${CHANNEL_FONT.family}`;
      ctx.textBaseline = 'top';

      if (elapsed < NO_SIGNAL_UNTIL) {
        drawSnow(ctx, width, height, 1);
        const label = 'NO SIGNAL';
        ctx.fillStyle = CHANNEL_PALETTE.text;
        ctx.fillText(label, width / 2 - label.length * 3, height / 2 - 6);
        drawScanlines(ctx, width, height);
        return;
      }

      if (elapsed < NOT_LISTED_UNTIL) {
        drawSnow(ctx, width, height, 0.35);
        const label = 'THIS CHANNEL IS NOT LISTED.';
        ctx.fillStyle = CHANNEL_PALETTE.warning;
        ctx.fillText(label, Math.max(4, width / 2 - label.length * 3), height / 2 - 6);
        drawScanlines(ctx, width, height);
        return;
      }

      // Abstract reconstruction of the site layout — drawn from constants.
      drawSnow(ctx, width, height, 0.08);

      const pad = 10;
      const innerW = width - pad * 2;
      ctx.strokeStyle = 'rgba(139, 255, 120, 0.5)';
      ctx.lineWidth = 1;

      // Header bar.
      ctx.strokeRect(pad, pad, innerW, 8);
      // Hero block.
      ctx.strokeRect(pad, pad + 14, innerW * 0.62, 26);
      // A "television" inside the reconstruction — recursion, one level deep.
      ctx.strokeRect(pad + innerW * 0.66, pad + 14, innerW * 0.34, 26);
      ctx.fillStyle = 'rgba(139, 255, 120, 0.16)';
      ctx.fillRect(pad + innerW * 0.68, pad + 17, innerW * 0.3, 20);

      // Record rows.
      for (let i = 0; i < 4; i += 1) {
        const y = pad + 48 + i * 10;
        ctx.strokeRect(pad, y, innerW, 7);
        const fill = (0.3 + (i % 3) * 0.2) * innerW;
        ctx.fillStyle = 'rgba(198, 208, 194, 0.14)';
        ctx.fillRect(pad + 2, y + 2, fill, 3);
      }

      // Footer.
      ctx.strokeRect(pad, height - pad - 10, innerW, 10);

      // A cursor that traces the layout, slightly ahead of nothing.
      const t = (elapsed - RECONSTRUCT_AT) * 0.5;
      const cursorX = pad + ((Math.sin(t) + 1) / 2) * innerW;
      const cursorY = pad + 48 + ((Math.cos(t * 0.7) + 1) / 2) * 34;
      ctx.fillStyle = CHANNEL_PALETTE.danger;
      ctx.fillRect(cursorX - 2, cursorY, 5, 1);
      ctx.fillRect(cursorX, cursorY - 2, 1, 5);

      ctx.fillStyle = CHANNEL_PALETTE.mid;
      ctx.fillText('LOCAL RECONSTRUCTION', 8, height - 26);
      ctx.fillStyle = CHANNEL_PALETTE.dim;
      ctx.fillText('NO CAPTURE / NO UPLINK', 8, height - 15);

      // Periodic horizontal displacement.
      if (Math.sin(snowPhase * 3) > 0.93) {
        const sliceY = (snowPhase * 120) % height;
        const slice = ctx.getImageData(0, sliceY, width, 6);
        ctx.putImageData(slice, Math.floor(rng() * 12 - 6), sliceY);
      }

      drawScanlines(ctx, width, height);
    },

    exit() {
      notified = false;
    },
  };
}
