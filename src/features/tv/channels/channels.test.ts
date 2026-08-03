import { describe, expect, it, vi } from 'vitest';
import { createRecordsChannel } from './records-channel';
import { createUnlistedChannel } from './unlisted-channel';
import { records } from '../../../content/hidden-records';
import type { ChannelContext, TVChannel } from './channel-types';

/**
 * Both channels only draw — they expose no getters — so the tests observe
 * state by capturing the text they paint. A recording 2D context records
 * every `fillText` call and otherwise behaves as a no-op, which is enough to
 * read back which record id or transmission line is on screen.
 */
function makeRecordingCtx() {
  const texts: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    fillText: (text: string) => {
      texts.push(text);
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    closePath: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    drawImage: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    measureText: () => ({ width: 6 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' }),
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' }),
    putImageData: () => {},
  } as unknown as CanvasRenderingContext2D;

  return { ctx, texts };
}

function makeContext(ctx: CanvasRenderingContext2D): ChannelContext {
  return {
    canvas: document.createElement('canvas'),
    ctx,
    width: 100,
    height: 100,
    elapsed: 0,
    pointer: { x: -1, y: -1 },
    tension: 0.1,
  };
}

/** `hit` is optional on the interface, so call it through a defined guard. */
function fireHit(channel: TVChannel): boolean {
  return channel.hit ? channel.hit(0, 0, makeContext(makeRecordingCtx().ctx)) : false;
}

describe('CH-02 · RECORDS', () => {
  it('opens on the first record', () => {
    const channel = createRecordsChannel();
    const { ctx, texts } = makeRecordingCtx();
    channel.enter(makeContext(ctx));
    channel.render(makeContext(ctx));
    expect(texts).toContain(records[0]!.id);
  });

  it('advances on its own after the dwell period', () => {
    const channel = createRecordsChannel();
    const ctx = makeRecordingCtx().ctx;
    channel.enter(makeContext(ctx));

    // DWELL is 8.5s; a single long frame must move to the next record.
    channel.update(makeContext(ctx), 9);
    const r2 = makeRecordingCtx();
    channel.render(makeContext(r2.ctx));
    expect(r2.texts).toContain(records[1]!.id);

    // Two more long frames wrap the reel back to the first record.
    channel.update(makeContext(ctx), 9);
    channel.update(makeContext(ctx), 9);
    const r3 = makeRecordingCtx();
    channel.render(makeContext(r3.ctx));
    expect(r3.texts).toContain(records[0]!.id);
  });

  it('skips ahead on a click', () => {
    const channel = createRecordsChannel();
    const ctx = makeRecordingCtx().ctx;
    channel.enter(makeContext(ctx));

    const consumed = fireHit(channel);
    expect(consumed).toBe(true);

    const after = makeRecordingCtx();
    channel.render(makeContext(after.ctx));
    expect(after.texts).toContain(records[1]!.id);
  });
});

describe('CH-?? · UNLISTED', () => {
  it('fires the discovery callback exactly once per channel instance', () => {
    const onDiscovered = vi.fn();
    const channel = createUnlistedChannel(onDiscovered);

    channel.enter(makeContext(makeRecordingCtx().ctx));
    channel.enter(makeContext(makeRecordingCtx().ctx));
    channel.exit(makeContext(makeRecordingCtx().ctx));
    channel.enter(makeContext(makeRecordingCtx().ctx));

    expect(onDiscovered).toHaveBeenCalledTimes(1);
  });

  it('draws its transmission and stops moving', () => {
    const channel = createUnlistedChannel(vi.fn());
    const { ctx, texts } = makeRecordingCtx();
    channel.enter(makeContext(ctx));
    // The typed reveal is time-based; a long frame exposes the whole block.
    channel.update(makeContext(ctx), 10);
    channel.update(makeContext(ctx), 10);
    channel.render(makeContext(ctx));
    expect(texts.join('\n')).toContain('CHANNEL NOT IN TABLE');
  });
});
