import { valueNoise2D } from '@/utils/math';
import {
  CHANNEL_FONT,
  CHANNEL_PALETTE,
  drawScanlines,
  type TVChannel,
} from './channel-types';

const PARTICLE_COUNT = 220;

/**
 * CH-03 — abstract visual experiment: a flow field with a feedback trail.
 *
 * Particles live in pre-allocated typed arrays. The trail comes from drawing a
 * translucent rectangle over the previous frame rather than clearing it, which
 * costs one fill instead of a second buffer.
 */
export function createSignalChannel(): TVChannel {
  const xs = new Float32Array(PARTICLE_COUNT);
  const ys = new Float32Array(PARTICLE_COUNT);
  const ages = new Float32Array(PARTICLE_COUNT);
  const speeds = new Float32Array(PARTICLE_COUNT);
  let initialised = false;

  function reseed(index: number, width: number, height: number): void {
    xs[index] = Math.random() * width;
    ys[index] = Math.random() * height;
    ages[index] = 0;
    speeds[index] = 12 + Math.random() * 26;
  }

  return {
    id: 'ch-03',
    label: 'CH-03 · FLOW',
    fps: 30,

    enter(context) {
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        reseed(i, context.width, context.height);
        ages[i] = Math.random() * 3;
      }
      initialised = true;
      // Start from a clean field.
      context.ctx.fillStyle = CHANNEL_PALETTE.background;
      context.ctx.fillRect(0, 0, context.width, context.height);
    },

    update(context, delta) {
      if (!initialised) return;
      const { width, height, elapsed, entropy } = context;
      const turbulence = 1 + entropy * 2.2;

      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        // Sample the field for a direction; scale to angle.
        const angle =
          valueNoise2D(
            xs[i] * 0.012 + elapsed * 0.08,
            ys[i] * 0.012 - elapsed * 0.05,
          ) *
          Math.PI *
          4 *
          turbulence;

        xs[i] += Math.cos(angle) * speeds[i] * delta;
        ys[i] += Math.sin(angle) * speeds[i] * delta;
        ages[i] += delta;

        if (
          ages[i] > 4 ||
          xs[i] < -4 ||
          xs[i] > width + 4 ||
          ys[i] < -4 ||
          ys[i] > height + 4
        ) {
          reseed(i, width, height);
        }
      }
    },

    render(context) {
      const { ctx, width, height, elapsed, entropy } = context;

      // Feedback fade instead of a hard clear — this is the trail.
      ctx.fillStyle = 'rgba(8, 11, 8, 0.22)';
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const life = 1 - ages[i] / 4;
        if (life <= 0) continue;
        const alpha = life * 0.55;
        ctx.fillStyle =
          life > 0.7
            ? `rgba(139, 255, 120, ${alpha.toFixed(3)})`
            : `rgba(150, 175, 145, ${alpha.toFixed(3)})`;
        ctx.fillRect(xs[i], ys[i], 1.4, 1.4);
      }

      // Horizontal waveform across the lower third.
      ctx.strokeStyle = 'rgba(139, 255, 120, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const baseY = height * 0.82;
      for (let x = 0; x <= width; x += 3) {
        const t = x / width;
        const amplitude = 6 + entropy * 14;
        const y =
          baseY +
          Math.sin(t * Math.PI * 6 + elapsed * 3) * amplitude * 0.5 +
          (valueNoise2D(t * 12, elapsed * 2) - 0.5) * amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.font = `${CHANNEL_FONT.size}px ${CHANNEL_FONT.family}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = CHANNEL_PALETTE.mid;
      ctx.fillText('FLOW FIELD // NO SOURCE', 8, 6);
      ctx.fillText(`E:${entropy.toFixed(2)}`, width - 46, 6);

      drawScanlines(ctx, width, height, 0.12);
    },

    exit() {
      initialised = false;
    },
  };
}
