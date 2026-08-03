import { records } from '../../../content/hidden-records';
import { clamp01 } from '../../../utils/math';
import { TypedBlock, applyChannelFont, drawChannelHeader } from './channel-text';
import { CHANNEL_PALETTE, clearFrame, drawScanlines, drawText, type ChannelContext, type TVChannel } from './channel-types';

/**
 * CH-02 · RECORDS — the work.
 *
 * Cycles on its own so the channel is not a dead page, and advances on a
 * click so a reader who wants to move faster can. The click target is the
 * whole screen: there is no button, because a button would need a label and
 * a label would break the object.
 */

const DWELL = 8.5;
const WIPE = 0.45;

export function createRecordsChannel(): TVChannel {
  const body = new TypedBlock();
  let index = 0;
  let sinceChange = 0;
  let wipe = 0;

  function show(next: number): void {
    index = ((next % records.length) + records.length) % records.length;
    body.setLines(records[index]!.lines);
    sinceChange = 0;
    wipe = WIPE;
  }

  return {
    id: 'ch-02',
    label: 'CH-02 · RECORDS',
    fps: 20,

    enter() {
      index = 0;
      show(0);
    },

    update(_context, delta) {
      sinceChange += delta;
      if (wipe > 0) wipe = Math.max(0, wipe - delta);
      body.update(delta);
      if (sinceChange >= DWELL) show(index + 1);
    },

    render(context: ChannelContext) {
      const { ctx, width, height, tension } = context;
      const record = records[index]!;

      applyChannelFont(ctx);
      clearFrame(ctx, width, height);
      drawChannelHeader(ctx, width, 'CH-02 · RECORDS', tension);

      let row = 2;
      drawText(ctx, record.id, 0, row, CHANNEL_PALETTE.low);
      drawText(ctx, String(record.year), 24, row, CHANNEL_PALETTE.low);
      row += 1;
      drawText(ctx, record.title, 0, row, CHANNEL_PALETTE.white);
      row += 1;
      drawText(ctx, record.stack, 0, row, CHANNEL_PALETTE.mid);
      row += 2;

      ctx.fillStyle = CHANNEL_PALETTE.dim;
      ctx.fillRect(8, 10 + row * 12 - 4, width - 16, 1);
      row += 1;

      body.draw(ctx, 0, row, CHANNEL_PALETTE.text);

      // Position in the reel, as marks rather than "3 / 3".
      const markY = height - 12;
      for (let i = 0; i < records.length; i += 1) {
        ctx.fillStyle = i === index ? CHANNEL_PALETTE.bright : CHANNEL_PALETTE.low;
        ctx.fillRect(8 + i * 9, markY, i === index ? 7 : 4, 2);
      }

      // Dwell progress, drawn as a thin line consuming the screen width.
      const progress = clamp01(sinceChange / DWELL);
      ctx.fillStyle = CHANNEL_PALETTE.dim;
      ctx.fillRect(0, height - 3, width * progress, 1);

      // Change-over flash: reuses the transition vocabulary of the receiver
      // instead of a fade, so switching records reads as switching signal.
      if (wipe > 0) {
        const strength = wipe / WIPE;
        ctx.fillStyle = `rgba(255, 226, 230, ${(strength * 0.22).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        const bandHeight = Math.max(2, strength * height * 0.5);
        ctx.fillStyle = `rgba(255, 226, 230, ${(strength * 0.5).toFixed(3)})`;
        ctx.fillRect(0, (height - bandHeight) / 2, width, bandHeight * 0.08);
      }

      drawScanlines(ctx, width, height, 0.14);
    },

    hit() {
      show(index + 1);
      return true;
    },

    exit() {
      body.reset();
      wipe = 0;
    },
  };
}
