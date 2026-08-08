import type { ShapeSource, ShapeTargetPoint } from '../shape-types';

export function createFaceSource(targetCols: number, targetRows: number): ShapeSource {
  const points: ShapeTargetPoint[] = [];
  const centerX = targetCols * 0.5;
  const centerY = targetRows * 0.45;
  const radiusX = targetCols * 0.26;
  const radiusY = targetRows * 0.38;

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < targetCols; c++) {
      const dx = (c - centerX) / radiusX;
      const dy = (r - centerY) / radiusY;
      const distSq = dx * dx + dy * dy;

      if (distSq <= 1.0) {
        // Half-face emphasis: right side of the face (dx >= -0.3) is main lit half
        const halfFaceMask = dx >= -0.35 ? 1.0 : Math.max(0, 1.0 + (dx + 0.35) * 4);
        if (halfFaceMask <= 0.05) continue;

        // Eye sockets (void region)
        const leftEyeSq =
          Math.pow((c - (centerX - radiusX * 0.38)) / (radiusX * 0.22), 2) +
          Math.pow((r - (centerY - radiusY * 0.15)) / (radiusY * 0.18), 2);
        const rightEyeSq =
          Math.pow((c - (centerX + radiusX * 0.38)) / (radiusX * 0.22), 2) +
          Math.pow((r - (centerY - radiusY * 0.15)) / (radiusY * 0.18), 2);

        const isEye = leftEyeSq < 0.6 || rightEyeSq < 0.6;
        const voidVal = isEye ? 1.0 : 0.0;

        // Nose bridge protrusion
        const isNoseBridge =
          Math.abs(c - (centerX + radiusX * 0.05)) < radiusX * 0.12 &&
          r >= centerY - radiusY * 0.2 &&
          r <= centerY + radiusY * 0.25;

        // Cheekbone ridge
        const isCheek =
          dx > 0.1 && dx < 0.6 && dy > -0.1 && dy < 0.3;

        // Lip contour
        const isLip =
          Math.abs(c - (centerX + radiusX * 0.05)) < radiusX * 0.28 &&
          r >= centerY + radiusY * 0.32 &&
          r <= centerY + radiusY * 0.48;

        // Jaw and contour edges
        const isEdge = distSq > 0.68 || isNoseBridge || isLip;

        // 3D depth computation for pseudo rotation
        const baseZ = Math.sqrt(Math.max(0, 1.0 - distSq)) * radiusX * 0.8;
        let zProtrusion = baseZ;
        if (isNoseBridge) zProtrusion += radiusX * 0.45;
        if (isCheek) zProtrusion += radiusX * 0.25;
        if (isEye) zProtrusion -= radiusX * 0.35;
        if (isLip) zProtrusion += radiusX * 0.2;

        const normalizedDepth = Math.max(0, Math.min(1.0, 0.5 + (zProtrusion / (radiusX * 1.5)) * 0.5));

        if (!isEye) {
          points.push({
            x: c,
            y: r,
            density: (isNoseBridge ? 1.0 : Math.max(0.3, 1.0 - distSq * 0.4)) * halfFaceMask,
            edge: isEdge ? 0.95 : 0.2,
            depth: normalizedDepth,
            voidValue: voidVal,
          });
        }
      }
    }
  }

  return {
    id: 'face-mask',
    width: targetCols,
    height: targetRows,
    points,
  };
}

