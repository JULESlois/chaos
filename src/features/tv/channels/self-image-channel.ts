import { clamp01, hash01 } from '../../../utils/math';
import { applyChannelFont, drawChannelHeader } from './channel-text';
import { CHANNEL_PALETTE, clearFrame, drawScanlines, type ChannelContext, type TVChannel } from './channel-types';

/**
 * CH-04 · SELF IMAGE — the receiver looking at itself.
 *
 * The channel draws the room the television stands in, including the
 * television, and inside that television's screen it draws the same thing
 * again, five times down. This is the only "horror" mechanism that is
 * literally true rather than suggested: the page really does contain a
 * picture of itself.
 *
 * The recursion is bounded and cheap — flat rectangles, no texture reads,
 * no second canvas. Depth is capped, and each level is drawn at a fraction
 * of the size of the last, so total fill is roughly one and a half screens.
 */

const MAX_DEPTH = 5;
/** Below this many pixels wide a nested screen is not worth drawing. */
const MIN_SIZE = 6;

interface Nest {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws one television and returns the rect of its screen, which is where
 * the next level down goes.
 */
function drawSet(
  ctx: CanvasRenderingContext2D,
  frame: Nest,
  depth: number,
  elapsed: number,
): Nest | null {
  const { x, y, width, height } = frame;

  // Room floor and back wall: the depth cue that makes the nesting read as
  // a room inside a screen rather than a set of concentric rectangles.
  const horizon = y + height * 0.72;
  ctx.fillStyle = CHANNEL_PALETTE.background;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = depth === 0 ? '#0d0406' : CHANNEL_PALETTE.background;
  ctx.fillRect(x, horizon, width, y + height - horizon);
  ctx.fillStyle = CHANNEL_PALETTE.dim;
  ctx.fillRect(x, horizon, width, 1);

  // Cabinet.
  const cabinetWidth = width * 0.56;
  const cabinetHeight = height * 0.46;
  const cabinetX = x + (width - cabinetWidth) / 2;
  const cabinetY = horizon - cabinetHeight;

  ctx.fillStyle = depth % 2 === 0 ? CHANNEL_PALETTE.dim : '#2a0d13';
  ctx.fillRect(cabinetX, cabinetY, cabinetWidth, cabinetHeight);
  ctx.fillStyle = CHANNEL_PALETTE.low;
  ctx.fillRect(cabinetX, cabinetY, cabinetWidth, 1);

  // Legs, only while they are more than a pixel.
  const legHeight = height * 0.05;
  if (legHeight >= 1) {
    ctx.fillStyle = CHANNEL_PALETTE.dim;
    ctx.fillRect(cabinetX + cabinetWidth * 0.14, horizon, 2, legHeight);
    ctx.fillRect(cabinetX + cabinetWidth * 0.82, horizon, 2, legHeight);
  }

  // Screen inset.
  const screenWidth = cabinetWidth * 0.7;
  const screenHeight = cabinetHeight * 0.68;
  const screenX = cabinetX + cabinetWidth * 0.06;
  const screenY = cabinetY + (cabinetHeight - screenHeight) / 2;

  ctx.fillStyle = '#070203';
  ctx.fillRect(screenX, screenY, screenWidth, screenHeight);

  // Two control knobs on the right of the cabinet.
  const knobRadius = Math.max(0.5, cabinetWidth * 0.035);
  if (knobRadius >= 1) {
    ctx.fillStyle = CHANNEL_PALETTE.low;
    const knobX = cabinetX + cabinetWidth * 0.87;
    ctx.beginPath();
    ctx.arc(knobX, cabinetY + cabinetHeight * 0.36, knobRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(knobX, cabinetY + cabinetHeight * 0.62, knobRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // The glow the set throws onto its own floor. Deeper sets glow less,
  // which is what stops the nest from turning into a bright hole.
  const glow = 0.16 / (depth + 1);
  const gradient = ctx.createLinearGradient(0, horizon, 0, horizon + height * 0.12);
  gradient.addColorStop(0, `rgba(230, 138, 152, ${glow.toFixed(3)})`);
  gradient.addColorStop(1, 'rgba(230, 138, 152, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(cabinetX - width * 0.08, horizon, cabinetWidth + width * 0.16, height * 0.12);

  if (screenWidth < MIN_SIZE || screenHeight < MIN_SIZE) return null;

  // Each level lags the one outside it. The innermost set is showing what
  // the outermost showed a moment ago.
  void elapsed;
  return { x: screenX, y: screenY, width: screenWidth, height: screenHeight };
}

export function createSelfImageChannel(): TVChannel {
  return {
    id: 'ch-04',
    label: 'CH-04 · SELF IMAGE',
    fps: 15,

    enter() {},

    update() {},

    render(context: ChannelContext) {
      const { ctx, width, height, elapsed, tension } = context;
      applyChannelFont(ctx);
      clearFrame(ctx, width, height);

      let frame: Nest | null = { x: 0, y: 15, width, height: height - 15 };
      let depth = 0;

      while (frame && depth < MAX_DEPTH) {
        frame = drawSet(ctx, frame, depth, elapsed - depth * 0.4);
        depth += 1;
      }

      // The deepest visible screen is not empty — it holds a single lit
      // pixel that drifts. Whether it is a reflection or a fourth set too
      // small to draw is left open.
      if (frame) {
        const drift = hash01(Math.floor(elapsed * 2)) - 0.5;
        ctx.fillStyle = CHANNEL_PALETTE.bright;
        ctx.fillRect(
          frame.x + frame.width * (0.5 + drift * 0.4),
          frame.y + frame.height * 0.5,
          1,
          1,
        );
      }

      // Under tension the nest loses register: one level slides sideways.
      if (tension > 0.2) {
        const slip = clamp01((tension - 0.2) / 0.8);
        const level = 1 + Math.floor(hash01(Math.floor(elapsed)) * 3);
        const band = (height - 15) / (level + 2);
        const bandY = 15 + band * level;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(107, 41, 51, ${(slip * 0.3).toFixed(3)})`;
        ctx.fillRect(0, bandY, width, band * 0.5);
        ctx.restore();
      }

      drawChannelHeader(ctx, width, 'CH-04 · SELF IMAGE', tension);
      drawScanlines(ctx, width, height, 0.18);
    },

    exit() {},
  };
}
