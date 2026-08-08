import type { ShapeSource, ShapeTargetPoint } from '../shape-types';

export function createTextSource(
  text: string,
  targetCols: number,
  targetRows: number,
  fontFamily = 'monospace'
): ShapeSource {
  let points: ShapeTargetPoint[] = [];

  // Use offscreen canvas for text rasterization
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const width = targetCols * 2;
    const height = targetRows * 2;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const len = text.length || 1;
      const fontByHeight = height * 0.6;
      const fontByWidth = (width * 0.85) / (len * 0.6);
      const fontSize = Math.max(12, Math.floor(Math.min(fontByHeight, fontByWidth)));

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, height / 2);

      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      for (let r = 0; r < targetRows; r++) {
        for (let c = 0; c < targetCols; c++) {
          const px = Math.floor((c + 0.5) * 2);
          const py = Math.floor((r + 0.5) * 2);
          const idx = (py * width + px) * 4;
          const alpha = data[idx]! / 255;

          if (alpha > 0.15) {
            // Compute edge simple differential
            const leftIdx = Math.max(0, idx - 8);
            const rightIdx = Math.min(data.length - 4, idx + 8);
            const topIdx = Math.max(0, idx - width * 8);
            const bottomIdx = Math.min(data.length - 4, idx + width * 8);

            const dx = Math.abs(data[leftIdx]! - data[rightIdx]!) / 255;
            const dy = Math.abs(data[topIdx]! - data[bottomIdx]!) / 255;
            const edge = Math.min(1, Math.sqrt(dx * dx + dy * dy) + (alpha < 0.85 ? 0.6 : 0));

            points.push({
              x: c,
              y: r,
              density: alpha,
              edge: edge,
              depth: 0.5,
              voidValue: 0,
            });
          }
        }
      }
    }
  }

  // Fallback if canvas environment unavailable or empty
  if (points.length === 0) {
    const len = text.length;
    const startX = Math.floor((targetCols - len * 3) / 2);
    const startY = Math.floor(targetRows / 2);
    for (let i = 0; i < len; i++) {
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 4; dy++) {
          points.push({
            x: startX + i * 3 + dx,
            y: startY + dy,
            density: 0.9,
            edge: dx === 0 || dy === 0 ? 1 : 0.4,
            depth: 0.5,
            voidValue: 0,
          });
        }
      }
    }
  }

  // Auto-center points in grid
  if (points.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const actualCenterX = (minX + maxX) / 2;
    const actualCenterY = (minY + maxY) / 2;
    const targetCenterX = (targetCols - 1) / 2;
    const targetCenterY = (targetRows - 1) / 2;

    const shiftX = Math.round(targetCenterX - actualCenterX);
    const shiftY = Math.round(targetCenterY - actualCenterY);

    if (shiftX !== 0 || shiftY !== 0) {
      for (let i = 0; i < points.length; i++) {
        points[i]!.x += shiftX;
        points[i]!.y += shiftY;
      }
      points = points.filter(
        (p) => p.x >= 0 && p.x < targetCols && p.y >= 0 && p.y < targetRows
      );
    }
  }

  return {
    id: `text-${text}`,
    width: targetCols,
    height: targetRows,
    points,
  };
}
