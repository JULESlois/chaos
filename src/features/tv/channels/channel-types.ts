export interface ChannelContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Seconds since this channel was entered. */
  elapsed: number;
  pointer: {
    /** Normalised position on the screen surface, or -1 when off-screen. */
    x: number;
    y: number;
  };
  /** Visual tension, 0–1, forwarded from the tension controller. */
  tension: number;
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

  /**
   * Optional click handling, in canvas pixels.
   *
   * This is how the contact channel opens links: the reader clicks the glass,
   * the screen mesh converts the hit into a UV, and the channel decides
   * whether anything was there. There are no DOM buttons over the television —
   * a floating anchor tag would break the illusion that the screen is an
   * object in a room rather than a picture of one.
   */
  hit?(x: number, y: number, context: ChannelContext): boolean;
}

/**
 * Shared palette so every channel reads as the same broadcast system.
 * Mirrors the pink ladder in `src/styles/tokens.css`.
 */
export const CHANNEL_PALETTE = {
  background: '#130608',
  dim: '#321016',
  low: '#6b2933',
  mid: '#b75a69',
  text: '#e68a98',
  bright: '#ffc0c9',
  white: '#ffe2e6',
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

/** Pixel bounds of a text row, used for click targets. */
export function rowBounds(
  row: number,
  width: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: 4,
    y: 4 + row * CHANNEL_FONT.lineHeight,
    width: width - 8,
    height: CHANNEL_FONT.lineHeight,
  };
}
