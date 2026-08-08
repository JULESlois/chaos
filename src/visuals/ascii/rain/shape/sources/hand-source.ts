import type { ShapeSource, ShapeTargetPoint } from '../shape-types';

export function createHandSource(targetCols: number, targetRows: number): ShapeSource {
  const points: ShapeTargetPoint[] = [];
  const centerX = targetCols * 0.52;
  const bottomY = targetRows * 0.88;

  // 5 fingers: Thumb (-0.38), Index (-0.16), Middle (0.02), Ring (0.20), Pinky (0.36)
  const fingerOffsets = [-0.38, -0.16, 0.02, 0.20, 0.36];
  const fingerHeights = [0.32, 0.56, 0.62, 0.54, 0.42]; // height from wrist relative to targetRows

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < targetCols; c++) {
      const relX = (c - centerX) / (targetCols * 0.38);
      const relY = (bottomY - r) / (targetRows * 0.65);

      // Palm base extending from bottom-right edge
      let inHand = relY >= 0 && relY <= 0.32 && relX >= -0.38 && relX <= 0.42;
      let isFingertip = false;
      let isEdge = Math.abs(relX) > 0.32 || relY < 0.04;
      let activeFingerIndex = -1;

      // Check fingers
      for (let i = 0; i < fingerOffsets.length; i++) {
        const fX = fingerOffsets[i]!;
        const fH = fingerHeights[i]!;
        const width = i === 0 ? 0.08 : 0.055; // Thumb is wider

        if (Math.abs(relX - fX) < width && relY >= 0.28 && relY <= fH) {
          inHand = true;
          activeFingerIndex = i;
          if (Math.abs(relY - fH) < 0.06) {
            isFingertip = true;
          }
          if (Math.abs(relX - fX) > width * 0.65) {
            isEdge = true;
          }
        }
      }

      if (inHand) {
        // Finger tip and edge highlight for phosphor imprinting
        const depthVal = activeFingerIndex >= 0 ? 0.4 + (relY * 0.5) : 0.3;
        points.push({
          x: c,
          y: r,
          density: isFingertip ? 1.0 : isEdge ? 0.85 : 0.65,
          edge: isFingertip || isEdge ? 0.95 : 0.25,
          depth: depthVal,
          voidValue: 0,
        });
      }
    }
  }

  return {
    id: 'hand-mask',
    width: targetCols,
    height: targetRows,
    points,
  };
}

