import { useEffect, useRef } from 'react';
import { createRng } from '@/utils/math';
import type { ProjectEvidence } from '@/types/content';

/**
 * Procedural placeholder for project imagery.
 *
 * The brief forbids referencing art assets that do not exist, so evidence
 * frames are drawn deterministically from a seed. Swap this component for an
 * <img> once real screenshots are available.
 */
function drawEvidence(
  canvas: HTMLCanvasElement,
  seed: number,
  width: number,
  height: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = '100%';
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rng = createRng(seed);

  ctx.fillStyle = '#0a0d0a';
  ctx.fillRect(0, 0, width, height);

  // Baseline grid.
  ctx.strokeStyle = 'rgba(198, 208, 194, 0.07)';
  ctx.lineWidth = 1;
  const step = 16;
  ctx.beginPath();
  for (let x = 0; x <= width; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 0; y <= height; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  // Data trace.
  ctx.strokeStyle = 'rgba(139, 255, 120, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const points = 48;
  for (let i = 0; i <= points; i += 1) {
    const t = i / points;
    const x = t * width;
    const wave =
      Math.sin(t * Math.PI * 3 + seed * 0.01) * 0.22 +
      Math.sin(t * Math.PI * 7.3 + seed * 0.03) * 0.1 +
      (rng() - 0.5) * 0.08;
    const y = height * (0.5 - wave);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Scatter blocks.
  ctx.fillStyle = 'rgba(198, 208, 194, 0.14)';
  const blocks = 6 + Math.floor(rng() * 6);
  for (let i = 0; i < blocks; i += 1) {
    const w = 6 + rng() * 26;
    const h = 3 + rng() * 10;
    ctx.fillRect(rng() * (width - w), rng() * (height - h), w, h);
  }

  // Corner registration marks.
  ctx.strokeStyle = 'rgba(139, 255, 120, 0.4)';
  ctx.lineWidth = 1;
  const m = 8;
  const arms = [
    [m, m, 1, 1],
    [width - m, m, -1, 1],
    [m, height - m, 1, -1],
    [width - m, height - m, -1, -1],
  ] as const;
  for (const [cx, cy, dx, dy] of arms) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * 6);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * 6, cy);
    ctx.stroke();
  }

  // Scanline overlay.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }
}

export function EvidenceFigure({
  evidence,
}: {
  evidence: ProjectEvidence;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    const render = (): void => {
      const width = canvas.parentElement?.clientWidth ?? 320;
      drawEvidence(canvas, evidence.seed, width, 150);
    };

    render();

    const onResize = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(onResize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [evidence.seed]);

  return (
    <figure className="evidence">
      <canvas ref={canvasRef} role="img" aria-label={evidence.alt} />
      <figcaption>{evidence.caption}</figcaption>
    </figure>
  );
}
