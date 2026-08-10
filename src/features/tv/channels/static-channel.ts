import { hash01 } from '../../../utils/math';
import { applyChannelFont } from './channel-text';
import { CHANNEL_PALETTE, clearFrame, drawScanlines, type ChannelContext, type TVChannel } from './channel-types';

/**
 * CH-05 · STATIC — the channel that carries nothing.
 *
 * It is the last listed channel before the unlisted one: the receiver ends
 * its rotation in a place that greets no one. Whatever is legible here
 * surfaces out of the noise on its own and sinks back; there is no text
 * layer, only pixels that happen to line up for a second.
 */

const SURFACE_PERIOD = 9.5;
const SURFACE_WINDOW = 2.6;

/** Fragments that briefly resolve out of the snow. Never instructions. */
const FRAGMENTS = ['— — —', 'NO CARRIER', 'STAND BY', '· · · · ·', 'CH 00'];

export function createStaticChannel(): TVChannel {
  // Reused across frames: the snow is drawn from a fixed field of offsets so
  // it flickers without ever allocating.
  let frame = 0;

  return {
    id: 'ch-05',
    label: 'CH-05 · STATIC',
    fps: 24,

    enter() {
      frame = 0;
    },

    update(_context, _delta) {
      frame += 1;
    },

    render(context: ChannelContext) {
      const { ctx, width, height, elapsed, tension } = context;
      applyChannelFont(ctx);
      clearFrame(ctx, width, height);

      // Snow: a coarse block grid rather than per-pixel, so the cost is
      // fixed regardless of the canvas resolution.
      const cell = 3;
      const columns = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      const density = 0.42 + tension * 0.28;

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          const n = hash01(x * 73856093 + y * 19349663 + frame * 83492791);
          if (n > density) continue;
          const value = 30 + n * 320;
          const r = Math.min(255, value) | 0;
          ctx.fillStyle = `rgba(${r}, ${(r * 0.56) | 0}, ${(r * 0.62) | 0}, 0.7)`;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }

      // Horizontal hold: a darker band drifting upward at a constant rate.
      const bandY = height - ((elapsed * 26) % (height + 40));
      const gradient = ctx.createLinearGradient(0, bandY, 0, bandY + 34);
      gradient.addColorStop(0, 'rgba(7, 2, 3, 0)');
      gradient.addColorStop(0.5, 'rgba(7, 2, 3, 0.55)');
      gradient.addColorStop(1, 'rgba(7, 2, 3, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, bandY, width, 34);

      // Something resolves out of the noise, then loses coherence again.
      const cyclePosition = elapsed % SURFACE_PERIOD;
      if (cyclePosition < SURFACE_WINDOW) {
        const t = cyclePosition / SURFACE_WINDOW;
        // Triangular envelope: legible only at the midpoint.
        const strength = 1 - Math.abs(t * 2 - 1);
        const index = Math.floor(elapsed / SURFACE_PERIOD) % FRAGMENTS.length;
        const text = FRAGMENTS[index]!;

        ctx.save();
        ctx.globalAlpha = strength * 0.75;
        ctx.fillStyle = CHANNEL_PALETTE.bright;
        ctx.textAlign = 'center';
        ctx.fillText(text, width / 2, height / 2 - 5);
        ctx.restore();
      }

      drawScanlines(ctx, width, height, 0.2);
    },

    exit() {
      frame = 0;
    },
  };
}
