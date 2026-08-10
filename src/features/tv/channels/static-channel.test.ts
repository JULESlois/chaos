import { describe, expect, it } from 'vitest';
import { createStaticChannel } from './static-channel';
import type { ChannelContext, TVChannel } from './channel-types';

/**
 * STATIC only draws — it exposes no getters — so the tests observe state by
 * capturing the text it paints. The recording context records `fillText`
 * calls and otherwise behaves as a no-op.
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

function makeContext(ctx: CanvasRenderingContext2D, elapsed: number): ChannelContext {
  return {
    canvas: document.createElement('canvas'),
    ctx,
    width: 100,
    height: 100,
    elapsed,
    pointer: { x: -1, y: -1 },
    tension: 0.1,
  };
}

describe('CH-05 · STATIC', () => {
  it('draws snow and briefly resolves a fragment out of the noise', () => {
    const channel: TVChannel = createStaticChannel();
    const { ctx, texts } = makeRecordingCtx();

    // elapsed 0 sits inside the first surface window: a fragment is visible.
    channel.enter(makeContext(ctx, 0));
    channel.update(makeContext(ctx, 0), 1 / 24);
    channel.render(makeContext(ctx, 0));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts[0]).toMatch(/— — —|NO CARRIER|STAND BY|· · · · ·|CH 00/);
  });

  it('shows only noise on frames outside the surface window', () => {
    const channel: TVChannel = createStaticChannel();
    const { ctx, texts } = makeRecordingCtx();

    // elapsed 4s is between the 2.6s window and the 9.5s period.
    channel.enter(makeContext(ctx, 4));
    channel.update(makeContext(ctx, 4), 1 / 24);
    channel.render(makeContext(ctx, 4));
    expect(texts).toHaveLength(0);
  });
});
