import { GLYPH_STRINGS } from './charset';
import { BUCKET_COUNT, PINK_STOPS, PINK_WHITE } from './palette';

/**
 * A copy of one frame's queued glyphs.
 *
 * The ghost layer keeps a couple of these and replays them dimmed, which is
 * how the same-hue trailing images are produced without a second canvas.
 */
export class GlyphSnapshot {
  readonly capacity: number;
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  readonly glyphs: Uint8Array;
  readonly buckets: Uint8Array;
  count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.glyphs = new Uint8Array(capacity);
    this.buckets = new Uint8Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }
}

/**
 * Collects glyphs for a frame and draws them in as few state changes as
 * possible.
 *
 * The naive approach — set `fillStyle`, call `fillText`, repeat — costs one
 * canvas state change per character, which is what makes most ASCII renderers
 * fall over at a few thousand glyphs. Here every glyph is pushed into parallel
 * typed arrays with a luminance bucket, and the flush walks the buckets in
 * order: eight `fillStyle` assignments per frame regardless of how many
 * characters were queued.
 *
 * The arrays are allocated once at the budget ceiling and reused. `push` past
 * capacity drops the glyph rather than growing, so a runaway scene degrades
 * into a sparser field instead of into an out-of-memory crash.
 */
export class GlyphPainter {
  readonly capacity: number;

  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly glyphs: Uint8Array;
  private readonly buckets: Uint8Array;
  private readonly alphas: Float32Array;

  /** Counting-sort scratch: how many glyphs landed in each bucket. */
  private readonly counts: Uint32Array;
  private readonly offsets: Uint32Array;
  private readonly order: Uint32Array;

  private count = 0;
  private dropped = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.glyphs = new Uint8Array(capacity);
    this.buckets = new Uint8Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.counts = new Uint32Array(BUCKET_COUNT);
    this.offsets = new Uint32Array(BUCKET_COUNT);
    this.order = new Uint32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Glyphs discarded since the last reset. Surfaced for tests. */
  get overflow(): number {
    return this.dropped;
  }

  get remaining(): number {
    return this.capacity - this.count;
  }

  reset(): void {
    this.count = 0;
    this.dropped = 0;
  }

  /**
   * Queues a glyph in device-independent CSS pixels.
   * `alpha` is optional and defaults to opaque; it exists for the ghost layer,
   * which needs sub-bucket fading without introducing a new colour.
   */
  push(x: number, y: number, glyph: number, bucket: number, alpha = 1): void {
    const index = this.count;
    if (index >= this.capacity) {
      this.dropped += 1;
      return;
    }
    this.xs[index] = x;
    this.ys[index] = y;
    this.glyphs[index] = glyph;
    this.buckets[index] = bucket;
    this.alphas[index] = alpha;
    this.count = index + 1;
  }

  /**
   * Copies the current queue into `snapshot`, truncating if the snapshot is
   * smaller. Used by the ghost layer at the end of a frame.
   */
  captureInto(snapshot: GlyphSnapshot): void {
    const total = Math.min(this.count, snapshot.capacity);
    snapshot.xs.set(this.xs.subarray(0, total));
    snapshot.ys.set(this.ys.subarray(0, total));
    snapshot.glyphs.set(this.glyphs.subarray(0, total));
    snapshot.buckets.set(this.buckets.subarray(0, total));
    snapshot.count = total;
  }

  /**
   * Draws everything queued this frame.
   *
   * `tearCentre`/`tearHeight`/`tearShift` displace a horizontal band, which is
   * how the tear failure is implemented: shifting glyph positions at draw time
   * costs nothing, whereas re-blitting a slice of the canvas costs a full
   * readback.
   */
  flush(
    ctx: CanvasRenderingContext2D,
    options: {
      tearCentre?: number;
      tearHeight?: number;
      tearShift?: number;
      /** Draw the top bucket in the one near-white tone. */
      allowHighlight?: boolean;
    } = {},
  ): void {
    const total = this.count;
    if (total === 0) return;

    const { counts, offsets, order, buckets } = this;
    counts.fill(0);

    for (let index = 0; index < total; index += 1) {
      counts[buckets[index]!]! += 1;
    }

    let running = 0;
    for (let bucket = 0; bucket < BUCKET_COUNT; bucket += 1) {
      offsets[bucket] = running;
      running += counts[bucket]!;
    }

    // Stable counting sort into `order`, so glyphs are visited bucket by
    // bucket without allocating an array of objects to sort.
    const cursor = counts;
    cursor.set(offsets);
    for (let index = 0; index < total; index += 1) {
      const bucket = buckets[index]!;
      order[cursor[bucket]!] = index;
      cursor[bucket]! += 1;
    }

    const tearHeight = options.tearHeight ?? 0;
    const tearShift = options.tearShift ?? 0;
    const tearCentre = options.tearCentre ?? -1;
    const tearActive = tearHeight > 0 && tearShift !== 0;
    const tearTop = tearCentre - tearHeight * 0.5;
    const tearBottom = tearCentre + tearHeight * 0.5;

    const previousAlpha = ctx.globalAlpha;
    let currentAlpha = -1;

    for (let bucket = 0; bucket < BUCKET_COUNT; bucket += 1) {
      const start = offsets[bucket]!;
      const stop = bucket + 1 < BUCKET_COUNT ? offsets[bucket + 1]! : total;
      if (start >= stop) continue;

      ctx.fillStyle =
        options.allowHighlight === true && bucket === BUCKET_COUNT - 1
          ? PINK_WHITE
          : PINK_STOPS[bucket]!;

      for (let slot = start; slot < stop; slot += 1) {
        const index = order[slot]!;
        const alpha = this.alphas[index]!;
        if (alpha !== currentAlpha) {
          ctx.globalAlpha = alpha;
          currentAlpha = alpha;
        }
        const y = this.ys[index]!;
        const x =
          tearActive && y >= tearTop && y <= tearBottom ? this.xs[index]! + tearShift : this.xs[index]!;
        ctx.fillText(GLYPH_STRINGS[this.glyphs[index]!]!, x, y);
      }
    }

    ctx.globalAlpha = previousAlpha;
  }
}
