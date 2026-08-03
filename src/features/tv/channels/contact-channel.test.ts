import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContactChannel, entryAt } from './contact-channel';
import { contacts } from '../../../content/hidden-records';
import type { ChannelContext, TVChannel } from './channel-types';

/**
 * The contact channel's rows are click targets in canvas pixels, so the hit
 * test must agree with `entryAt` exactly: the same y must resolve to the same
 * entry whether the channel is drawing a hover or answering a click.
 */

/** `hit` is optional on the interface, so call it through a defined guard. */
function fireHit(channel: TVChannel, x: number, y: number, context: ChannelContext): boolean {
  return channel.hit ? channel.hit(x, y, context) : false;
}

// FIRST_ROW = 3, ROWS_PER_ENTRY = 2, CHANNEL_FONT.lineHeight = 12.
// rowBounds(row, 0) → y = 4 + row * 12, height = 12; an entry spans two rows.
//   entry 0 → rows 3..4 → y ∈ [40, 64)
//   entry 1 → rows 5..6 → y ∈ [64, 88)
//   entry 2 → rows 7..8 → y ∈ [88, 112)
const HEIGHT = 200;

describe('entryAt', () => {
  it('maps a y coordinate to the entry it falls on', () => {
    expect(entryAt(40, HEIGHT)).toBe(0);
    expect(entryAt(63, HEIGHT)).toBe(0);
    expect(entryAt(64, HEIGHT)).toBe(1);
    expect(entryAt(87, HEIGHT)).toBe(1);
    expect(entryAt(88, HEIGHT)).toBe(2);
    expect(entryAt(111, HEIGHT)).toBe(2);
  });

  it('returns -1 outside the entry stack', () => {
    expect(entryAt(0, HEIGHT)).toBe(-1);
    expect(entryAt(39, HEIGHT)).toBe(-1);
    expect(entryAt(112, HEIGHT)).toBe(-1);
    expect(entryAt(999, HEIGHT)).toBe(-1);
  });

  it('ignores the height argument', () => {
    expect(entryAt(40, 10)).toBe(0);
    expect(entryAt(40, 1000)).toBe(0);
  });
});

describe('click handling', () => {
  const open = vi.spyOn(window, 'open');

  afterEach(() => {
    open.mockClear();
  });

  function context(): ChannelContext {
    return {
      canvas: document.createElement('canvas'),
      ctx: {} as CanvasRenderingContext2D,
      width: 100,
      height: HEIGHT,
      elapsed: 0,
      pointer: { x: -1, y: -1 },
      tension: 0.1,
    };
  }

  it('opens the link for a live row', () => {
    const channel = createContactChannel();
    const index = contacts.findIndex((entry) => entry.href !== null);
    // First contact has a github href; it sits at y = 40.
    expect(index).toBe(0);
    const y = 40 + index * 24;

    const consumed = fireHit(channel, 0, y, context());
    expect(consumed).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      contacts[0]!.href,
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('leaves a row with no href inert and silent', () => {
    const channel = createContactChannel();
    // The MAIL row (index 1) has href === null and sits at y = 64.
    const consumed = fireHit(channel, 0, 64, context());
    expect(consumed).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects a click that lands between entries', () => {
    const channel = createContactChannel();
    const consumed = fireHit(channel, 0, 0, context());
    expect(consumed).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
