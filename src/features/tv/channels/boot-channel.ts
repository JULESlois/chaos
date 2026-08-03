import { createRng } from '@/utils/math';
import {
  CHANNEL_FONT,
  CHANNEL_PALETTE,
  clearFrame,
  drawScanlines,
  drawText,
  type ChannelContext,
  type TVChannel,
} from './channel-types';

const BOOT_LINES: readonly { text: string; colour?: string; delay: number }[] = [
  { text: 'NODE TELEVISION RECEIVER', delay: 0.2 },
  { text: 'MODEL: RX-07', delay: 0.35 },
  { text: '', delay: 0.4 },
  { text: 'MEMORY CHECK........FAILED', colour: CHANNEL_PALETTE.danger, delay: 1.1 },
  { text: 'CHANNEL TABLE.......5', delay: 1.5 },
  { text: 'OBSERVER INPUT......ACTIVE', colour: CHANNEL_PALETTE.signal, delay: 1.9 },
  { text: '', delay: 2.0 },
  { text: 'RETRY MEMORY........SKIPPED', colour: CHANNEL_PALETTE.warning, delay: 2.4 },
  { text: 'SIGNAL LOCK.........OK', delay: 2.8 },
];

/** Time after the last line before the receiver advances to CH-01. */
export const BOOT_HANDOFF_SECONDS = 4.6;

/**
 * CH-00 — startup diagnostics.
 * Prints line by line, then hands off to the next channel automatically.
 */
export function createBootChannel(onComplete: () => void): TVChannel {
  let sweep = 0;
  let handedOff = false;
  const rng = createRng(4207);

  return {
    id: 'ch-00',
    label: 'CH-00 · BOOT',
    fps: 24,

    enter() {
      sweep = 0;
      handedOff = false;
    },

    update(context, delta) {
      sweep += delta;
      if (!handedOff && context.elapsed >= BOOT_HANDOFF_SECONDS) {
        handedOff = true;
        onComplete();
      }
    },

    render(context: ChannelContext) {
      const { ctx, width, height, elapsed } = context;
      clearFrame(ctx, width, height);
      ctx.font = `${CHANNEL_FONT.size}px ${CHANNEL_FONT.family}`;
      ctx.textBaseline = 'top';

      let row = 1;
      for (const line of BOOT_LINES) {
        if (elapsed < line.delay) break;

        // Type the most recent line out character by character.
        const age = elapsed - line.delay;
        const visible =
          age < 0.28 ? Math.ceil((age / 0.28) * line.text.length) : line.text.length;

        drawText(
          ctx,
          line.text.slice(0, visible),
          0,
          row,
          line.colour ?? CHANNEL_PALETTE.text,
        );
        row += 1;
      }

      // Blinking cursor beneath the last printed line.
      if (Math.floor(elapsed * 2) % 2 === 0 && elapsed < BOOT_HANDOFF_SECONDS) {
        drawText(ctx, '_', 0, row, CHANNEL_PALETTE.signal);
      }

      if (elapsed >= 3.2) {
        drawText(
          ctx,
          'HANDING OFF TO CH-01',
          0,
          row + 2,
          CHANNEL_PALETTE.mid,
        );
      }

      // Occasional read errors flicker in the lower half.
      if (rng() < 0.06) {
        const y = height * 0.6 + rng() * height * 0.3;
        ctx.fillStyle = 'rgba(228, 79, 79, 0.35)';
        ctx.fillRect(0, y, width * (0.2 + rng() * 0.6), 2);
      }

      // Scan sweep bar.
      const sweepY = ((sweep * 40) % (height + 40)) - 20;
      const gradient = ctx.createLinearGradient(0, sweepY, 0, sweepY + 20);
      gradient.addColorStop(0, 'rgba(139, 255, 120, 0)');
      gradient.addColorStop(0.5, 'rgba(139, 255, 120, 0.07)');
      gradient.addColorStop(1, 'rgba(139, 255, 120, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, sweepY, width, 20);

      drawScanlines(ctx, width, height);
    },

    exit() {
      handedOff = true;
    },
  };
}
