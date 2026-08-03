import { CHANNEL_FONT, CHANNEL_PALETTE, drawText } from './channel-types';

/**
 * Applies the shared monospace metrics.
 *
 * Every channel calls this at the top of render: the 2D context is shared
 * between all channels, so whatever the previous one left behind is still
 * set. Assuming a clean context is how channels start bleeding into each
 * other.
 */
export function applyChannelFont(ctx: CanvasRenderingContext2D): void {
  ctx.font = `${CHANNEL_FONT.size}px ${CHANNEL_FONT.family}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
}

/**
 * Progressive character reveal, shared by the text channels.
 *
 * The reveal is time-based rather than frame-based so it runs at the same
 * speed whether the manager is giving the channel 24fps or 8fps under load.
 */
export class TypedBlock {
  private lines: readonly string[] = [];
  private revealed = 0;
  private total = 0;

  /** Characters per second. */
  speed = 46;

  setLines(lines: readonly string[]): void {
    this.lines = lines;
    this.total = lines.reduce((sum, line) => sum + line.length, 0);
    this.revealed = 0;
  }

  reset(): void {
    this.revealed = 0;
  }

  /** Skips the animation — used when a channel is re-entered. */
  complete(): void {
    this.revealed = this.total;
  }

  get finished(): boolean {
    return this.revealed >= this.total;
  }

  update(delta: number): void {
    if (this.revealed >= this.total) return;
    this.revealed = Math.min(this.total, this.revealed + this.speed * delta);
  }

  /**
   * Draws the revealed portion starting at `row`.
   *
   * @returns the first row below the block, so callers can stack sections
   *          without hard-coding offsets.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    column: number,
    row: number,
    colour: string = CHANNEL_PALETTE.text,
  ): number {
    let budget = Math.floor(this.revealed);
    let cursor = row;

    for (const line of this.lines) {
      const visible = line.length > budget ? line.slice(0, Math.max(0, budget)) : line;
      if (visible.length > 0) drawText(ctx, visible, column, cursor, colour);
      cursor += 1;
      budget -= line.length;
      if (budget <= 0) break;
    }

    return cursor;
  }
}

/**
 * A block cursor that blinks on a fixed period.
 *
 * Driven by elapsed time rather than a counter so it stays in phase when
 * frames are dropped.
 */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  column: number,
  row: number,
  elapsed: number,
  colour: string = CHANNEL_PALETTE.bright,
): void {
  if (elapsed % 1.06 > 0.58) return;
  ctx.fillStyle = colour;
  ctx.fillRect(8 + column * 6, 11 + row * CHANNEL_FONT.lineHeight, 5, 8);
}

/**
 * Header strip drawn by every legible channel.
 *
 * Gives the set a consistent broadcast identity, and — more usefully —
 * tells the reader which channel they are on without a DOM label under
 * the television.
 */
export function drawChannelHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  label: string,
  tension: number,
): void {
  ctx.fillStyle = CHANNEL_PALETTE.dim;
  ctx.fillRect(0, 0, width, 15);
  drawText(ctx, label, 0, 0, CHANNEL_PALETTE.bright);

  // Signal-integrity ticks on the right: the only place tension is legible
  // inside the television, and it never spells out a warning.
  const ticks = 8;
  const lit = Math.round((1 - tension) * ticks);
  for (let i = 0; i < ticks; i += 1) {
    ctx.fillStyle = i < lit ? CHANNEL_PALETTE.mid : CHANNEL_PALETTE.low;
    ctx.fillRect(width - 10 - i * 5, 5, 3, 5);
  }
}
