import { unlistedTransmission } from '../../../content/hidden-records';
import { clamp01 } from '../../../utils/math';
import { TypedBlock, applyChannelFont, drawCursor } from './channel-text';
import { CHANNEL_PALETTE, clearFrame, drawScanlines, drawText, type ChannelContext, type TVChannel } from './channel-types';

/**
 * CH-?? · UNLISTED — not in the table.
 *
 * Only reachable by the button sequence. It is deliberately the calmest
 * screen in the piece: after eight hundred viewport heights of interference,
 * the reward for finding the hidden thing is that the interference stops.
 *
 * It also tells the truth — there is nothing further hidden — because a
 * hunt with no floor is a worse experience than one that ends.
 */

const SETTLE = 1.8;

export function createUnlistedChannel(onDiscovered: () => void): TVChannel {
  const body = new TypedBlock();
  let announced = false;
  let settle = 0;

  return {
    id: 'ch-unlisted',
    label: 'CH-?? · UNLISTED',
    fps: 16,

    enter() {
      body.setLines(unlistedTransmission);
      body.speed = 34;
      settle = 0;
      if (!announced) {
        announced = true;
        onDiscovered();
      }
    },

    update(_context, delta) {
      settle = Math.min(SETTLE, settle + delta);
      body.update(delta);
    },

    render(context: ChannelContext) {
      const { ctx, width, height, elapsed } = context;
      applyChannelFont(ctx);
      clearFrame(ctx, width, height, '#070203');

      // The channel arrives out of noise and then stops moving entirely.
      const noise = 1 - clamp01(settle / SETTLE);
      if (noise > 0.01) {
        const count = Math.floor(width * height * 0.02 * noise);
        for (let i = 0; i < count; i += 1) {
          const value = 40 + Math.random() * 180;
          ctx.fillStyle = `rgba(${value | 0}, ${(value * 0.56) | 0}, ${(value * 0.62) | 0}, 0.6)`;
          ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
        }
      }

      // No header strip: this channel is not part of the broadcast system.
      drawText(ctx, 'CH-??', 0, 0, CHANNEL_PALETTE.low);

      const end = body.draw(ctx, 0, 3, CHANNEL_PALETTE.white);
      if (body.finished) drawCursor(ctx, 0, end, elapsed, CHANNEL_PALETTE.bright);

      // Scanlines fade out as the picture settles: the one place in the
      // piece where the CRT stops asserting itself.
      drawScanlines(ctx, width, height, 0.04 + noise * 0.14);
    },

    exit() {
      body.reset();
      settle = 0;
    },
  };
}
