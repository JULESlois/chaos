import { describe, expect, it, vi } from 'vitest';
import { createSignalSurface } from './signal-surface';

/**
 * The jsdom canvas has no real 2D context, so the blit is checked by recording
 * the nine-argument `drawImage` the surface makes rather than by reading back
 * pixels. What matters here is the crop arithmetic, and that is entirely in
 * those arguments.
 */
interface Recorded {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
}

function recorder(): { ctx: CanvasRenderingContext2D; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const ctx = {
    drawImage: vi.fn(
      (
        _image: CanvasImageSource,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        _dx: number,
        _dy: number,
        dw: number,
        dh: number,
      ) => {
        calls.push({ sx, sy, sw, sh, dw, dh });
      },
    ),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function sourceCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe('publishing', () => {
  it('starts with nothing to show', () => {
    const surface = createSignalSurface();
    expect(surface.available).toBe(false);
    expect(surface.canvas).toBeNull();
    expect(surface.frameId).toBe(0);
  });

  it('hands out the very canvas the field drew on, not a copy', () => {
    // The point of the whole surface: the television shows the same pixels the
    // page is showing, so the reveal changes the frame around the picture and
    // nothing inside it.
    const surface = createSignalSurface();
    const canvas = sourceCanvas(1440, 810);
    surface.publish(canvas, 1440, 810);
    expect(surface.canvas).toBe(canvas);
    expect(surface.available).toBe(true);
    expect(surface.width).toBe(1440);
    expect(surface.height).toBe(810);
  });

  it('counts frames monotonically so a consumer can spot a stale one', () => {
    const surface = createSignalSurface();
    const canvas = sourceCanvas(320, 240);
    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      surface.publish(canvas, 320, 240);
      seen.push(surface.frameId);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps counting across a change of canvas', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(320, 240), 320, 240);
    surface.publish(sourceCanvas(640, 480), 640, 480);
    expect(surface.frameId).toBe(2);
    expect(surface.width).toBe(640);
  });

  it('detaches when the field is disposed', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(320, 240), 320, 240);
    surface.clear();
    expect(surface.available).toBe(false);
    expect(surface.canvas).toBeNull();
    expect(surface.width).toBe(0);
  });

  it('does not rewind the frame counter when it detaches', () => {
    // A consumer that cached a frame id must not be fooled into thinking an
    // old frame is new because the field restarted.
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(320, 240), 320, 240);
    const before = surface.frameId;
    surface.clear();
    surface.publish(sourceCanvas(320, 240), 320, 240);
    expect(surface.frameId).toBeGreaterThan(before);
  });

  it('is unavailable if the field published a zero-sized viewport', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(320, 240), 0, 0);
    expect(surface.available).toBe(false);
  });
});

describe('the blit', () => {
  it('says no when nothing has been published, so the caller can fall back', () => {
    const surface = createSignalSurface();
    const { ctx, calls } = recorder();
    expect(surface.blit(ctx, 320, 240)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('says no rather than dividing by a zero-sized destination', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(1440, 810), 1440, 810);
    const { ctx } = recorder();
    expect(surface.blit(ctx, 0, 240)).toBe(false);
    expect(surface.blit(ctx, 320, 0)).toBe(false);
  });

  it('says no when the published canvas has not been sized yet', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(0, 0), 1440, 810);
    const { ctx } = recorder();
    expect(surface.blit(ctx, 320, 240)).toBe(false);
  });

  /**
   * The reveal's other continuity claim. A 16:9 page squashed into a 4:3
   * screen would change every proportion in the picture at the moment the
   * television takes over, which is exactly the tell the crossfade exists to
   * avoid. So it crops instead.
   */
  it('centre-crops a wide page into the 4:3 screen instead of squashing it', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(1600, 900), 1600, 900);
    const { ctx, calls } = recorder();

    expect(surface.blit(ctx, 320, 240)).toBe(true);
    const call = calls[0]!;
    // Full height, narrowed width: 900 * (320/240) = 1200.
    expect(call.sh).toBe(900);
    expect(call.sy).toBe(0);
    expect(call.sw).toBeCloseTo(1200, 6);
    expect(call.sx).toBeCloseTo(200, 6);
    // Equal margins left and right.
    expect(call.sx + call.sw).toBeCloseTo(1600 - call.sx, 6);
  });

  it('centre-crops a tall page the other way', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(390, 844), 390, 844);
    const { ctx, calls } = recorder();

    expect(surface.blit(ctx, 320, 240)).toBe(true);
    const call = calls[0]!;
    // Full width, shortened height: 390 / (320/240) = 292.5.
    expect(call.sw).toBe(390);
    expect(call.sx).toBe(0);
    expect(call.sh).toBeCloseTo(292.5, 6);
    expect(call.sy).toBeCloseTo((844 - 292.5) / 2, 6);
  });

  it('takes the whole frame when the aspects already agree', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(640, 480), 640, 480);
    const { ctx, calls } = recorder();

    surface.blit(ctx, 320, 240);
    const call = calls[0]!;
    expect(call.sx).toBeCloseTo(0, 6);
    expect(call.sy).toBeCloseTo(0, 6);
    expect(call.sw).toBeCloseTo(640, 6);
    expect(call.sh).toBeCloseTo(480, 6);
  });

  it('never samples outside the published canvas', () => {
    const surface = createSignalSurface();
    for (const [sw, sh] of [
      [1600, 900],
      [390, 844],
      [800, 800],
      [2560, 1080],
      [640, 480],
    ]) {
      surface.publish(sourceCanvas(sw!, sh!), sw!, sh!);
      const { ctx, calls } = recorder();
      surface.blit(ctx, 320, 240);
      const call = calls[0]!;
      expect(call.sx).toBeGreaterThanOrEqual(0);
      expect(call.sy).toBeGreaterThanOrEqual(0);
      expect(call.sx + call.sw).toBeLessThanOrEqual(sw! + 1e-9);
      expect(call.sy + call.sh).toBeLessThanOrEqual(sh! + 1e-9);
    }
  });

  it('preserves the destination aspect ratio in what it samples', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(2560, 1080), 2560, 1080);
    const { ctx, calls } = recorder();
    surface.blit(ctx, 256, 192);
    const call = calls[0]!;
    expect(call.sw / call.sh).toBeCloseTo(256 / 192, 6);
  });

  it('fills the destination exactly', () => {
    const surface = createSignalSurface();
    surface.publish(sourceCanvas(1440, 810), 1440, 810);
    const { ctx, calls } = recorder();
    surface.blit(ctx, 320, 240);
    expect(calls[0]!.dw).toBe(320);
    expect(calls[0]!.dh).toBe(240);
  });
});
