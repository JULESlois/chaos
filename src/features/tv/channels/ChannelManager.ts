import type { ChannelContext, TVChannel } from './channel-types';

export interface ChannelManagerOptions {
  width: number;
  height: number;
}

/**
 * Owns the channel canvas and drives exactly one channel at a time.
 *
 * Responsibilities:
 * - one canvas, one 2D context, reused for every channel;
 * - strict enter/exit lifecycle so channels cannot leak state into each other;
 * - per-channel FPS with a global cap;
 * - a dirty flag so the Three.js texture is only uploaded when pixels changed.
 *
 * The manager does NOT own a requestAnimationFrame loop — it is stepped from
 * the Three.js frame loop, so there is never a second competing loop.
 */
export class ChannelManager {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private channels: TVChannel[] = [];
  private activeIndex = -1;
  private context: ChannelContext;

  private accumulator = 0;
  private elapsed = 0;
  private dirty = true;
  private paused = false;
  private fpsCap = 30;

  /** Set while a channel throws, so one bad channel cannot kill the loop. */
  private failed = new Set<string>();

  /** Reused scratch surface for the compress transition — never per-frame. */
  private scratch: HTMLCanvasElement | null = null;
  private scratchCtx: CanvasRenderingContext2D | null = null;

  constructor(options: ChannelManagerOptions) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width;
    this.canvas.height = options.height;

    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Channel canvas 2D context unavailable');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.context = {
      canvas: this.canvas,
      ctx: this.ctx,
      width: options.width,
      height: options.height,
      elapsed: 0,
      pointer: { x: 0.5, y: 0.5 },
      tension: 0.08,
    };

    // Paint the background immediately so the texture is never transparent.
    this.ctx.fillStyle = '#130608';
    this.ctx.fillRect(0, 0, options.width, options.height);
  }

  register(channel: TVChannel): void {
    this.channels.push(channel);
  }

  get channelDescriptors(): { id: string; label: string }[] {
    return this.channels.map((channel) => ({ id: channel.id, label: channel.label }));
  }

  get activeChannel(): TVChannel | null {
    return this.activeIndex >= 0 ? this.channels[this.activeIndex] : null;
  }

  get needsTextureUpload(): boolean {
    return this.dirty;
  }

  /** Called by the renderer after it has uploaded the canvas. */
  markUploaded(): void {
    this.dirty = false;
  }

  setPointer(x: number, y: number): void {
    this.context.pointer.x = x;
    this.context.pointer.y = y;
  }

  setTension(value: number): void {
    this.context.tension = value;
  }

  /**
   * Forwards a click on the glass to the active channel.
   *
   * `u`/`v` arrive as screen-surface UVs from the Three.js raycast; the
   * manager is the only place that knows the canvas resolution, so it does
   * the conversion. Returns true when the channel consumed the hit.
   */
  hit(u: number, v: number): boolean {
    const channel = this.activeChannel;
    if (!channel?.hit || this.failed.has(channel.id)) return false;
    const x = u * this.context.width;
    const y = v * this.context.height;
    let consumed = false;
    this.safely(channel, 'hit', () => {
      consumed = channel.hit!(x, y, this.context) === true;
    });
    if (consumed) this.dirty = true;
    return consumed;
  }

  /** Global frame-rate cap applied on top of each channel's own fps. */
  setFpsCap(fps: number): void {
    this.fpsCap = Math.max(0, fps);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Switches channels, running exit on the old and enter on the new. */
  activate(index: number): void {
    if (index < 0 || index >= this.channels.length) return;
    if (index === this.activeIndex) return;

    const previous = this.activeChannel;
    if (previous) {
      this.safely(previous, 'exit', () => previous.exit(this.context));
    }

    this.activeIndex = index;
    this.elapsed = 0;
    this.context.elapsed = 0;
    this.accumulator = 0;

    const next = this.channels[index];
    this.safely(next, 'enter', () => next.enter(this.context));
    this.dirty = true;
  }

  activateById(id: string): boolean {
    const index = this.channels.findIndex((channel) => channel.id === id);
    if (index < 0) return false;
    this.activate(index);
    return true;
  }

  /**
   * Advances the active channel. Called once per Three.js frame with the
   * real frame delta; internally rate-limited to the channel's own fps.
   */
  step(delta: number): void {
    const channel = this.activeChannel;
    if (!channel || this.paused || this.fpsCap <= 0) return;
    if (this.failed.has(channel.id)) return;

    const targetFps = Math.min(channel.fps, this.fpsCap);
    if (targetFps <= 0) return;

    const interval = 1 / targetFps;
    this.accumulator += Math.min(delta, 0.25);
    if (this.accumulator < interval) return;

    const step = this.accumulator;
    this.accumulator = 0;
    this.elapsed += step;
    this.context.elapsed = this.elapsed;

    this.safely(channel, 'update', () => channel.update(this.context, step));
    this.safely(channel, 'render', () => channel.render(this.context));
    this.dirty = true;
  }

  /**
   * Runs one update+render immediately, ignoring the frame-rate cap.
   *
   * Used when a still frame is needed right now — activating a channel while
   * paused, or grabbing the first frame of the incoming channel so the
   * expand transition has something to expand.
   */
  renderOnce(): void {
    const channel = this.activeChannel;
    if (!channel || this.failed.has(channel.id)) return;
    this.safely(channel, 'update', () => channel.update(this.context, 1 / 60));
    this.safely(channel, 'render', () => channel.render(this.context));
    this.dirty = true;
  }

  /**
   * Freezes the current frame into the scratch surface.
   *
   * Transitions read from this snapshot instead of the live canvas, so
   * repeated application over several frames cannot compound.
   */
  captureFrame(): void {
    const { width, height } = this.context;
    const scratchCtx = this.ensureScratch(width, height);
    if (!scratchCtx) return;
    scratchCtx.drawImage(this.canvas, 0, 0);
  }

  /** Paints the "powered off" state: a collapsing line, then black. */
  renderPowerOff(progress: number): void {
    const { ctx } = this;
    const { width, height } = this.context;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    if (progress < 1) {
      const lineHeight = Math.max(1, (1 - progress) * height * 0.5);
      const alpha = 1 - progress * 0.7;
      const gradient = ctx.createLinearGradient(
        0,
        height / 2 - lineHeight / 2,
        0,
        height / 2 + lineHeight / 2,
      );
      gradient.addColorStop(0, 'rgba(230, 138, 152, 0)');
      gradient.addColorStop(0.5, `rgba(255, 226, 230, ${alpha.toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(230, 138, 152, 0)');
      ctx.fillStyle = gradient;

      const widthScale = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;
      const w = width * widthScale;
      ctx.fillRect((width - w) / 2, height / 2 - lineHeight / 2, w, lineHeight);
    }

    this.dirty = true;
  }

  /** Full-frame static used at the midpoint of a channel change. */
  renderSnow(intensity: number): void {
    const { ctx } = this;
    const { width, height } = this.context;

    ctx.fillStyle = '#130608';
    ctx.fillRect(0, 0, width, height);

    const count = Math.floor(width * height * 0.06 * intensity);
    for (let i = 0; i < count; i += 1) {
      // Snow is monochrome pink, not grey: the green and blue components
      // are fixed fractions of the red one, so the hue cannot drift.
      const value = 40 + Math.random() * 200;
      ctx.fillStyle = `rgba(${value}, ${(value * 0.56) | 0}, ${(value * 0.62) | 0}, 0.85)`;
      ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
    }
    this.dirty = true;
  }

  /**
   * Horizontal displacement of the captured frame.
   *
   * Implemented with drawImage against the scratch surface rather than
   * getImageData/putImageData — pixel readback stalls the pipeline and this
   * runs inside the render loop. Call captureFrame() first.
   */
  renderDisplace(offset: number): void {
    const { ctx } = this;
    const { width, height } = this.context;

    if (!this.scratch) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const bandHeight = Math.max(4, Math.floor(height / 6));
    for (let y = 0; y < height; y += bandHeight) {
      const sliceHeight = Math.min(bandHeight, height - y);
      const shift = Math.round(Math.sin(y * 0.3) * offset);
      ctx.drawImage(
        this.scratch,
        0,
        y,
        width,
        sliceHeight,
        shift,
        y,
        width,
        sliceHeight,
      );
    }
    this.dirty = true;
  }

  private ensureScratch(width: number, height: number): CanvasRenderingContext2D | null {
    if (!this.scratch) {
      this.scratch = document.createElement('canvas');
      this.scratch.width = width;
      this.scratch.height = height;
      this.scratchCtx = this.scratch.getContext('2d', { alpha: false });
    }
    return this.scratchCtx;
  }

  /** Vertical compression of the captured frame toward a bright line. */
  renderCompress(progress: number): void {
    const { ctx } = this;
    const { width, height } = this.context;
    const remaining = Math.max(2, height * (1 - progress));
    const y = (height - remaining) / 2;

    if (!this.scratch) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(this.scratch, 0, 0, width, height, 0, y, width, remaining);

    ctx.fillStyle = `rgba(255, 226, 230, ${(progress * 0.8).toFixed(3)})`;
    ctx.fillRect(0, height / 2 - 1, width, 2);
    this.dirty = true;
  }

  private safely(channel: TVChannel, phase: string, fn: () => void): void {
    try {
      fn();
    } catch (error) {
      console.error(`[channel:${channel.id}] ${phase} failed`, error);
      this.failed.add(channel.id);
      // Isolate the failure: paint an explicit error frame, keep others alive.
      this.ctx.fillStyle = '#130608';
      this.ctx.fillRect(0, 0, this.context.width, this.context.height);
      this.ctx.fillStyle = '#e68a98';
      this.ctx.font = '10px monospace';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(`CHANNEL FAULT: ${channel.id}`, 8, 8);
      this.dirty = true;
    }
  }

  dispose(): void {
    const channel = this.activeChannel;
    if (channel) {
      this.safely(channel, 'exit', () => channel.exit(this.context));
    }
    this.channels = [];
    this.activeIndex = -1;
    this.failed.clear();
    this.canvas.width = 1;
    this.canvas.height = 1;
    if (this.scratch) {
      this.scratch.width = 1;
      this.scratch.height = 1;
      this.scratch = null;
      this.scratchCtx = null;
    }
  }
}
