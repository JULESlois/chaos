import type { ShapeSource } from './shape-types';
import { SlotState } from './shape-types';
import { hash01 } from '../../../../utils/math';

export class ShapeSlots {
  readonly capacity: number;
  count = 0;

  // Base coordinates for 3D/Grasp dynamics
  readonly baseX: Float32Array;
  readonly baseY: Float32Array;
  readonly baseZ: Float32Array;
  readonly baseDensity: Float32Array;

  // Position & targets
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  readonly currentX: Float32Array;
  readonly currentY: Float32Array;

  // Shape properties
  readonly density: Float32Array;
  readonly edge: Float32Array;
  readonly depth: Float32Array;
  readonly voidValue: Float32Array;

  // Imprint runtime state
  readonly energy: Float32Array;
  readonly glyph: Uint8Array;
  readonly state: Uint8Array;

  // Erosion dynamics
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly releaseAt: Float32Array;

  // Column Spatial Indexing for O(1) column lookups
  gridCols = 0;
  gridRows = 0;
  readonly columnStart: Uint32Array;
  readonly columnCount: Uint16Array;
  readonly sortedIndices: Uint32Array;

  constructor(maxSlots = 4090, maxCols = 256, seed = 2407) {
    this.seed = seed;
    this.capacity = maxSlots;
    this.baseX = new Float32Array(maxSlots);
    this.baseY = new Float32Array(maxSlots);
    this.baseZ = new Float32Array(maxSlots);
    this.baseDensity = new Float32Array(maxSlots);

    this.targetX = new Float32Array(maxSlots);
    this.targetY = new Float32Array(maxSlots);
    this.currentX = new Float32Array(maxSlots);
    this.currentY = new Float32Array(maxSlots);

    this.density = new Float32Array(maxSlots);
    this.edge = new Float32Array(maxSlots);
    this.depth = new Float32Array(maxSlots);
    this.voidValue = new Float32Array(maxSlots);

    this.energy = new Float32Array(maxSlots);
    this.glyph = new Uint8Array(maxSlots);
    this.state = new Uint8Array(maxSlots);

    this.vx = new Float32Array(maxSlots);
    this.vy = new Float32Array(maxSlots);
    this.releaseAt = new Float32Array(maxSlots);

    this.columnStart = new Uint32Array(maxCols);
    this.columnCount = new Uint16Array(maxCols);
    this.sortedIndices = new Uint32Array(maxSlots);
  }

  private readonly seed: number;

  reset(): void {
    this.count = 0;
    this.energy.fill(0);
    this.state.fill(SlotState.EMPTY);
    this.columnStart.fill(0);
    this.columnCount.fill(0);
  }

  loadFromSource(
    source: ShapeSource,
    gridCols: number,
    gridRows: number,
    offsetX = 0,
    offsetY = 0
  ): void {
    this.reset();
    this.gridCols = gridCols;
    this.gridRows = gridRows;

    const points = source.points;
    const n = Math.min(points.length, this.capacity);
    this.count = n;

    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      const tx = Math.round(p.x + offsetX);
      const ty = Math.round(p.y + offsetY);

      this.baseX[i] = tx;
      this.baseY[i] = ty;
      this.baseZ[i] = (p.depth - 0.5) * gridCols * 0.22;
      this.baseDensity[i] = p.density;

      this.targetX[i] = tx;
      this.targetY[i] = ty;
      this.currentX[i] = tx;
      this.currentY[i] = ty;

      this.density[i] = p.density;
      this.edge[i] = p.edge;
      this.depth[i] = p.depth;
      this.voidValue[i] = p.voidValue;

      this.energy[i] = 0;
      // Deterministic per-slot glyph: the field is reproducible from its seed,
      // like everything else in the rain system. No Math.random anywhere.
      this.glyph[i] = 33 + Math.floor(hash01(this.seed ^ (i * 15485863) ^ (tx * 7919) ^ (ty * 104729)) * 90);
      this.state[i] = SlotState.EMPTY;
      this.vx[i] = 0;
      this.vy[i] = 0;

      // Noise release threshold for sand erosion (0..1)
      const nVal = (Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
      this.releaseAt[i] = Math.abs(nVal) * 0.45 + (1 - p.edge) * 0.35 + (ty / gridRows) * 0.2;
    }

    this.buildSpatialIndex(gridCols);
  }

  applyPseudoRotation(angle: number, centerX: number, centerY: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let i = 0; i < this.count; i++) {
      const rx = this.baseX[i]! - centerX;
      const ry = this.baseY[i]! - centerY;
      const rz = this.baseZ[i]!;

      // 3D rotation around Y-axis
      const rx2 = rx * cos + rz * sin;
      const rz2 = -rx * sin + rz * cos;

      // Perspective projection onto discrete grid cell frame
      const perspective = 1 + rz2 * (0.012 / Math.max(1, this.gridCols * 0.02));
      const gx = Math.round(centerX + rx2 * perspective);
      const gy = Math.round(centerY + ry * perspective);

      // Snap strictly to discrete grid coordinates
      this.targetX[i] = gx;
      this.targetY[i] = gy;
      this.currentX[i] = gx;
      this.currentY[i] = gy;

      const lightFactor = Math.max(0.2, Math.min(1.0, 0.6 + (rx2 * cos + rz2 * sin) / Math.max(1, this.gridCols * 0.2)));
      this.density[i] = this.baseDensity[i]! * lightFactor;
      this.depth[i] = Math.max(0, Math.min(1.0, 0.5 + (rz2 / Math.max(1, this.gridCols * 0.2)) * 0.5));
    }

    this.buildSpatialIndex(this.gridCols);
  }

  applyGraspMotion(graspFactor: number, wristX: number, wristY: number): void {
    for (let i = 0; i < this.count; i++) {
      const bx = this.baseX[i]!;
      const by = this.baseY[i]!;

      const dx = bx - wristX;
      const dy = by - wristY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Distance from wrist dictates finger curl strength
      const fingerRatio = Math.max(0, (wristY - by) / Math.max(1, this.gridRows * 0.6));
      const curlAmount = graspFactor * fingerRatio;

      // Curl towards palm center
      const angleOffset = Math.sin(fingerRatio * Math.PI) * curlAmount * 0.55;
      const newDist = dist * (1 - curlAmount * 0.32);

      const currentAngle = Math.atan2(dy, dx) - angleOffset;
      const gx = Math.round(wristX + Math.cos(currentAngle) * newDist);
      const gy = Math.round(wristY + Math.sin(currentAngle) * newDist);

      // Snap strictly to discrete grid coordinates
      this.targetX[i] = gx;
      this.targetY[i] = gy;
      this.currentX[i] = gx;
      this.currentY[i] = gy;
    }

    this.buildSpatialIndex(this.gridCols);
  }

  buildSpatialIndex(gridCols: number): void {
    this.columnStart.fill(0);
    this.columnCount.fill(0);

    // Count slots per column
    for (let i = 0; i < this.count; i++) {
      const col = Math.max(0, Math.min(gridCols - 1, Math.floor(this.targetX[i])));
      this.columnCount[col]++;
    }

    // Compute column starts
    let start = 0;
    for (let c = 0; c < gridCols; c++) {
      this.columnStart[c] = start;
      start += this.columnCount[c];
    }

    // Temporary offset array for placing indices
    const currentPos = new Uint32Array(this.columnStart);

    for (let i = 0; i < this.count; i++) {
      const col = Math.max(0, Math.min(gridCols - 1, Math.floor(this.targetX[i])));
      const pos = currentPos[col]++;
      this.sortedIndices[pos] = i;
    }
  }

  forEachInColumns(
    colMin: number,
    colMax: number,
    callback: (slotIndex: number) => void
  ): void {
    const cMin = Math.max(0, colMin);
    const cMax = Math.min(this.gridCols - 1, colMax);

    for (let c = cMin; c <= cMax; c++) {
      const start = this.columnStart[c];
      const count = this.columnCount[c];
      for (let i = 0; i < count; i++) {
        callback(this.sortedIndices[start + i]);
      }
    }
  }

  isOccupiedAt(col: number, row: number): boolean {
    if (this.count === 0 || col < 0 || col >= this.gridCols) return false;
    const start = this.columnStart[col];
    const count = this.columnCount[col];
    for (let i = 0; i < count; i++) {
      const idx = this.sortedIndices[start + i];
      if (idx < this.count) {
        const sy = Math.round(this.currentY[idx]);
        if (sy === row) {
          return true;
        }
      }
    }
    return false;
  }
}
