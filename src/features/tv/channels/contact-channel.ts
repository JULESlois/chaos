import { contacts } from '../../../content/hidden-records';
import { applyChannelFont, drawChannelHeader } from './channel-text';
import {
  CHANNEL_PALETTE,
  clearFrame,
  drawScanlines,
  drawText,
  rowBounds,
  type ChannelContext,
  type TVChannel,
} from './channel-types';

/**
 * CH-03 · CONTACT — how to reach the operator.
 *
 * The rows are clickable. Not with anchors: the hit test runs in canvas
 * pixels, forwarded from a raycast against the screen mesh, so the only
 * thing in the DOM is the television. A row with no href stays inert and
 * says so by never highlighting.
 */

const FIRST_ROW = 3;
const ROWS_PER_ENTRY = 2;

function rowForEntry(index: number): number {
  return FIRST_ROW + index * ROWS_PER_ENTRY;
}

/** Which entry, if any, sits under a point in canvas pixels. */
export function entryAt(y: number, height: number): number {
  void height;
  for (let i = 0; i < contacts.length; i += 1) {
    const bounds = rowBounds(rowForEntry(i), 0);
    // The click target spans both rows of the entry, not just the label.
    if (y >= bounds.y && y < bounds.y + bounds.height * ROWS_PER_ENTRY) return i;
  }
  return -1;
}

export function createContactChannel(): TVChannel {
  // Set when a row is opened, so the screen acknowledges the click even
  // though the new tab happens somewhere the reader cannot see.
  let acknowledged = -1;
  let acknowledgeTime = 0;

  return {
    id: 'ch-03',
    label: 'CH-03 · CONTACT',
    fps: 18,

    enter() {
      acknowledged = -1;
      acknowledgeTime = 0;
    },

    update(_context, delta) {
      if (acknowledgeTime > 0) acknowledgeTime = Math.max(0, acknowledgeTime - delta);
      if (acknowledgeTime === 0) acknowledged = -1;
    },

    render(context: ChannelContext) {
      const { ctx, width, height, pointer, tension } = context;
      applyChannelFont(ctx);
      clearFrame(ctx, width, height);
      drawChannelHeader(ctx, width, 'CH-03 · CONTACT', tension);

      const hovered = pointer.x >= 0 ? entryAt(pointer.y * height, height) : -1;

      for (let i = 0; i < contacts.length; i += 1) {
        const entry = contacts[i]!;
        const row = rowForEntry(i);
        const live = entry.href !== null;
        const active = live && hovered === i;

        if (active) {
          const bounds = rowBounds(row, width);
          ctx.fillStyle = CHANNEL_PALETTE.dim;
          ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height * ROWS_PER_ENTRY);
        }

        if (acknowledged === i) {
          const bounds = rowBounds(row, width);
          ctx.fillStyle = `rgba(255, 226, 230, ${(acknowledgeTime * 0.35).toFixed(3)})`;
          ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height * ROWS_PER_ENTRY);
        }

        drawText(ctx, entry.label, 0, row, live ? CHANNEL_PALETTE.mid : CHANNEL_PALETTE.low);
        drawText(
          ctx,
          entry.value,
          2,
          row + 1,
          active ? CHANNEL_PALETTE.white : live ? CHANNEL_PALETTE.text : CHANNEL_PALETTE.low,
        );

        // Live rows get a leading mark; dead ones get nothing. That is the
        // whole affordance — no underline, no cursor change, no tooltip.
        if (live) {
          ctx.fillStyle = active ? CHANNEL_PALETTE.bright : CHANNEL_PALETTE.low;
          ctx.fillRect(2, 13 + row * 12, 3, 3);
        }
      }

      drawScanlines(ctx, width, height, 0.14);
    },

    hit(_x, y, context) {
      const index = entryAt(y, context.height);
      if (index < 0) return false;

      const entry = contacts[index]!;
      if (!entry.href) return false;

      acknowledged = index;
      acknowledgeTime = 0.5;
      window.open(entry.href, '_blank', 'noopener,noreferrer');
      return true;
    },

    exit() {
      acknowledged = -1;
      acknowledgeTime = 0;
    },
  };
}
