export interface ChannelContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Seconds since this channel was entered. */
  elapsed: number;
  pointer: {
    x: number;
    y: number;
  };
  entropy: number;
}

export interface TVChannel {
  id: string;
  label: string;
  /** Preferred update rate. The manager may run it slower. */
  fps: number;

  enter(context: ChannelContext): void;
  update(context: ChannelContext, delta: number): void;
  render(context: ChannelContext): void;
  exit(context: ChannelContext): void;
}

/** Shared palette so all channels read as the same broadcast system. */
export const CHANNEL_PALETTE = {
  background: '#080b08',
  dim: '#2c3a2b',
  mid: '#6f8a6a',
  text: '#c6d0c2',
  signal: '#8bff78',
  warning: '#ffb454',
  danger: '#e44f4f',
} as const;

/** Monospace metrics used by the text-drawing channels. */
export const CHANNEL_FONT = {
  family: 'monospace',
  size: 10,
  lineHeight: 12,
} as const;

export function drawScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha = 0.16,
): void {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = 0; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1);
  }
}

export function clearFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colour: string = CHANNEL_PALETTE.background,
): void {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);
}

/** Draws left-aligned monospace text at a character grid position. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  column: number,
  row: number,
  colour: string = CHANNEL_PALETTE.text,
): void {
  ctx.fillStyle = colour;
  ctx.fillText(text, 8 + column * 6, 10 + row * CHANNEL_FONT.lineHeight);
}
