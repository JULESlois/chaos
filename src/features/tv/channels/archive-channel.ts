import { projects } from '@/content/projects';
import {
  CHANNEL_FONT,
  CHANNEL_PALETTE,
  clearFrame,
  drawScanlines,
  type TVChannel,
} from './channel-types';

const SECONDS_PER_RECORD = 5;

const STATUS_COLOUR: Record<string, string> = {
  verified: CHANNEL_PALETTE.signal,
  partial: CHANNEL_PALETTE.warning,
  corrupted: CHANNEL_PALETTE.danger,
  classified: CHANNEL_PALETTE.mid,
};

/**
 * CH-02 — archive broadcast.
 * Cycles through the same project data the DOM archive renders.
 */
export function createArchiveChannel(): TVChannel {
  let index = 0;
  let timer = 0;

  return {
    id: 'ch-02',
    label: 'CH-02 · ARCHIVE',
    fps: 15,

    enter() {
      index = 0;
      timer = 0;
    },

    update(_context, delta) {
      timer += delta;
      if (timer >= SECONDS_PER_RECORD) {
        timer = 0;
        index = (index + 1) % projects.length;
      }
    },

    render(context) {
      const { ctx, width, height, elapsed } = context;
      clearFrame(ctx, width, height);
      ctx.font = `${CHANNEL_FONT.size}px ${CHANNEL_FONT.family}`;
      ctx.textBaseline = 'top';

      const record = projects[index];
      const line = CHANNEL_FONT.lineHeight;
      let y = 14;

      // Header bar.
      ctx.fillStyle = CHANNEL_PALETTE.dim;
      ctx.fillRect(0, 0, width, 10);
      ctx.fillStyle = CHANNEL_PALETTE.background;
      ctx.fillText('ARCHIVE BROADCAST', 6, 0);
      ctx.fillText(
        `${String(index + 1).padStart(2, '0')}/${String(projects.length).padStart(2, '0')}`,
        width - 40,
        0,
      );

      ctx.fillStyle = CHANNEL_PALETTE.signal;
      ctx.fillText(record.id, 8, y);
      y += line;

      // Title, wrapped to the canvas width.
      ctx.fillStyle = CHANNEL_PALETTE.text;
      const maxChars = Math.floor((width - 16) / 6);
      const words = record.title.split(' ');
      let current = '';
      for (const word of words) {
        if ((current + word).length > maxChars) {
          ctx.fillText(current, 8, y);
          y += line;
          current = '';
        }
        current += `${word} `;
      }
      if (current.trim()) {
        ctx.fillText(current.trim(), 8, y);
        y += line;
      }

      y += 6;
      ctx.fillStyle = CHANNEL_PALETTE.mid;
      ctx.fillText(`TYPE: ${record.type}`, 8, y);
      y += line;
      ctx.fillText(`YEAR: ${record.year}`, 8, y);
      y += line;
      ctx.fillText(`INTEGRITY: ${record.integrity}%`, 8, y);
      y += line;

      ctx.fillStyle = STATUS_COLOUR[record.status] ?? CHANNEL_PALETTE.text;
      ctx.fillText(`STATUS: ${record.status.toUpperCase()}`, 8, y);
      y += line + 4;

      // Integrity bar.
      const barWidth = width - 16;
      ctx.fillStyle = CHANNEL_PALETTE.dim;
      ctx.fillRect(8, y, barWidth, 4);
      ctx.fillStyle = STATUS_COLOUR[record.status] ?? CHANNEL_PALETTE.signal;
      ctx.fillRect(8, y, (barWidth * record.integrity) / 100, 4);
      y += 14;

      // Stack tags.
      ctx.fillStyle = CHANNEL_PALETTE.mid;
      ctx.fillText(record.technologies.slice(0, 3).join(' / '), 8, y);

      // Progress ticker along the bottom.
      const progress = timer / SECONDS_PER_RECORD;
      ctx.fillStyle = CHANNEL_PALETTE.dim;
      ctx.fillRect(0, height - 3, width, 3);
      ctx.fillStyle = CHANNEL_PALETTE.signal;
      ctx.fillRect(0, height - 3, width * progress, 3);

      // Recording indicator.
      if (Math.floor(elapsed * 1.5) % 2 === 0) {
        ctx.fillStyle = CHANNEL_PALETTE.danger;
        ctx.beginPath();
        ctx.arc(width - 12, height - 14, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      drawScanlines(ctx, width, height);
    },

    exit() {
      timer = 0;
    },
  };
}
