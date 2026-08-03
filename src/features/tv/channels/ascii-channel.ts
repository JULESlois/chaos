import { clamp01, lerp, valueNoise2D } from '@/utils/math';
import {
  CHANNEL_FONT,
  CHANNEL_PALETTE,
  clearFrame,
  drawScanlines,
  type TVChannel,
} from './channel-types';

const RAMP = ' .:-=+*#%@';
const COLS = 44;
const ROWS = 20;

/**
 * CH-01 — the observer.
 *
 * Draws an abstract face from characters. It tracks the pointer with a lag,
 * keeps looking after the pointer stops, and occasionally moves *before* the
 * pointer does. No camera, no permissions — the gaze target is derived purely
 * from the local pointer position.
 */
export function createAsciiChannel(): TVChannel {
  let gazeX = 0;
  let gazeY = 0;
  let targetX = 0;
  let targetY = 0;
  let blink = 0;
  let nextBlinkAt = 2.5;
  let anticipation = 0;
  let nextAnticipationAt = 7;

  const field = new Float32Array(COLS * ROWS);

  return {
    id: 'ch-01',
    label: 'CH-01 · OBSERVER',
    fps: 24,

    enter() {
      gazeX = 0;
      gazeY = 0;
      blink = 0;
      nextBlinkAt = 2.5;
      anticipation = 0;
      nextAnticipationAt = 7;
      field.fill(0);
    },

    update(context, delta) {
      const { pointer, elapsed } = context;

      targetX = (pointer.x - 0.5) * 2;
      targetY = (pointer.y - 0.5) * 2;

      // Occasionally the observer looks somewhere before the pointer arrives.
      if (elapsed > nextAnticipationAt) {
        anticipation = 1;
        nextAnticipationAt = elapsed + 9 + Math.sin(elapsed) * 4;
      }
      anticipation = Math.max(0, anticipation - delta * 0.7);

      const leadX = anticipation > 0 ? targetX + Math.sin(elapsed * 2.3) * 0.8 : targetX;
      const leadY = anticipation > 0 ? targetY + Math.cos(elapsed * 1.7) * 0.4 : targetY;

      // Deliberately slow damping: the gaze keeps travelling after you stop.
      const factor = 1 - Math.exp(-1.6 * delta);
      gazeX = lerp(gazeX, clamp01((leadX + 1) / 2) * 2 - 1, factor);
      gazeY = lerp(gazeY, clamp01((leadY + 1) / 2) * 2 - 1, factor);

      if (elapsed > nextBlinkAt) {
        blink = 1;
        nextBlinkAt = elapsed + 3 + Math.abs(Math.sin(elapsed * 1.3)) * 4;
      }
      blink = Math.max(0, blink - delta * 4.5);
    },

    render(context) {
      const { ctx, width, height, elapsed, entropy } = context;
      clearFrame(ctx, width, height);
      ctx.font = `${CHANNEL_FONT.size}px ${CHANNEL_FONT.family}`;
      ctx.textBaseline = 'top';

      const cellW = width / COLS;
      const cellH = height / ROWS;

      const eyeOffsetX = gazeX * 2.4;
      const eyeOffsetY = gazeY * 1.4;
      const openness = 1 - blink;

      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const nx = (col / COLS - 0.5) * 2;
          const ny = (row / ROWS - 0.5) * 2;

          // Head: a soft ellipse.
          const head = 1 - clamp01(Math.hypot(nx / 0.72, ny / 0.92));
          let value = head * 0.55;

          // Eyes.
          const eyeY = ny + 0.18 - eyeOffsetY * 0.06;
          const eyeL = Math.hypot((nx + 0.3 - eyeOffsetX * 0.05) / 0.16, eyeY / 0.1);
          const eyeR = Math.hypot((nx - 0.3 - eyeOffsetX * 0.05) / 0.16, eyeY / 0.1);
          const eye = Math.min(eyeL, eyeR);
          if (eye < 1) {
            value = eye < 0.45 * openness ? 0.05 : 0.95;
          }

          // Mouth: a thin line that widens with entropy.
          const mouth = Math.hypot(nx / (0.28 + entropy * 0.1), (ny - 0.42) / 0.05);
          if (mouth < 1) value = Math.max(value, 0.75);

          // Ambient drift so the image never sits perfectly still.
          value += valueNoise2D(col * 0.3 + elapsed * 0.4, row * 0.3) * 0.14;
          value += entropy * 0.1;

          const index = row * COLS + col;
          field[index] = clamp01(value);

          const rampIndex = Math.min(
            RAMP.length - 1,
            Math.floor(field[index] * RAMP.length),
          );
          const glyph = RAMP[rampIndex];
          if (glyph === ' ') continue;

          ctx.fillStyle =
            field[index] > 0.85
              ? CHANNEL_PALETTE.signal
              : field[index] > 0.6
                ? CHANNEL_PALETTE.text
                : CHANNEL_PALETTE.dim;
          ctx.fillText(glyph, col * cellW, row * cellH);
        }
      }

      ctx.fillStyle = CHANNEL_PALETTE.mid;
      ctx.fillText('CH-01 OBSERVER', 8, height - 14);

      drawScanlines(ctx, width, height);
    },

    exit() {
      field.fill(0);
    },
  };
}
