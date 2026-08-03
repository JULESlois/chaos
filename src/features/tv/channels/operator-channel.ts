import { operator } from '../../../content/hidden-records';
import { hash01 } from '../../../utils/math';
import { TypedBlock, applyChannelFont, drawChannelHeader, drawCursor } from './channel-text';
import { CHANNEL_PALETTE, clearFrame, drawScanlines, drawText, type ChannelContext, type TVChannel } from './channel-types';

/**
 * CH-01 · OPERATOR — who made this.
 *
 * The only place on the site where a person is described. It reads as a
 * personnel record rather than an about page, because the fiction is that
 * the receiver found the file, not that the author wrote a bio.
 */
export function createOperatorChannel(): TVChannel {
  const body = new TypedBlock();

  return {
    id: 'ch-01',
    label: 'CH-01 · OPERATOR',
    fps: 20,

    enter() {
      body.setLines(operator.lines);
    },

    update(_context, delta) {
      body.update(delta);
    },

    render(context: ChannelContext) {
      const { ctx, width, height, elapsed, tension } = context;
      applyChannelFont(ctx);
      clearFrame(ctx, width, height);
      drawChannelHeader(ctx, width, 'CH-01 · OPERATOR', tension);

      let row = 2;
      drawText(ctx, operator.callsign, 0, row, CHANNEL_PALETTE.white);
      row += 1;
      drawText(ctx, operator.role, 0, row, CHANNEL_PALETTE.mid);
      row += 1;
      drawText(ctx, `STATUS: ${operator.status}`, 0, row, CHANNEL_PALETTE.low);
      row += 2;

      // Separator rule.
      ctx.fillStyle = CHANNEL_PALETTE.dim;
      ctx.fillRect(8, 10 + row * 12 - 4, width - 16, 1);
      row += 1;

      const end = body.draw(ctx, 0, row, CHANNEL_PALETTE.text);
      if (body.finished) drawCursor(ctx, 0, end, elapsed);

      // A single character in the record is wrong on any given frame, and
      // it is a different one each time. Nothing announces this; the reader
      // either notices the record is not stable or they do not.
      if (tension > 0.12) {
        const seed = Math.floor(elapsed * 3);
        if (hash01(seed) < tension * 0.5) {
          const line = Math.floor(hash01(seed * 7 + 1) * operator.lines.length);
          const column = Math.floor(hash01(seed * 13 + 3) * 26);
          ctx.fillStyle = CHANNEL_PALETTE.background;
          ctx.fillRect(8 + column * 6, 10 + (row + line) * 12, 6, 11);
          drawText(ctx, '#', column, row + line, CHANNEL_PALETTE.bright);
        }
      }

      drawScanlines(ctx, width, height, 0.14);
    },

    exit() {
      body.reset();
    },
  };
}
