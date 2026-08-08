import { describe, it, expect } from 'vitest';
import { ShapeField } from './shape-field';
import { getShapeSource } from './shape-source';
import { SlotState } from './shape-types';
import type { RainGlyphSample } from '../rain-types';

describe('Phosphor Imprint System', () => {
  it('accumulates energy when rain glyphs pass through shape slots', () => {
    const field = new ShapeField(512);
    const source = getShapeSource('text', 'TEST', 40, 30);
    field.loadSource(source, 40, 30);

    const initialEnergy = field.slots.energy[0];
    expect(initialEnergy).toBe(0);

    // Create a passing rain glyph sample matching slot 0
    const targetX = field.slots.targetX[0];
    const targetY = field.slots.targetY[0];

    const glyphs: RainGlyphSample[] = [
      {
        x: targetX * 13,
        y: targetY * 13,
        column: targetX,
        row: targetY,
        trailIndex: 0,
        glyph: 65,
        brightness: 1.0,
        alpha: 1.0,
        size: 13,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        maskValue: 1,
        edgeValue: 1,
        depthValue: 0.5,
      },
    ];

    // Update with progress at imprinting phase (e.g. 0.45)
    field.transition.jumpTo(0.45);
    field.update(0.45, 0.016, glyphs, 40, 30);

    expect(field.slots.energy[0]).toBeGreaterThan(0);
  });

  it('triggers erosion and releases falling sand particles near end of transition', () => {
    const field = new ShapeField(512);
    const source = getShapeSource('text', 'CHAOS', 40, 30);
    field.loadSource(source, 40, 30);

    // Populate slots with full energy
    for (let i = 0; i < field.slots.count; i++) {
      field.slots.energy[i] = 1.0;
      field.slots.state[i] = SlotState.STABLE;
      field.slots.releaseAt[i] = 0.2; // threshold for early release
    }

    // Update at eroding phase (e.g. 0.92)
    field.transition.jumpTo(0.92);
    field.update(0.92, 0.05, [], 40, 30);

    let releasingCount = 0;
    for (let i = 0; i < field.slots.count; i++) {
      if (field.slots.state[i] === SlotState.RELEASING) {
        releasingCount++;
      }
    }

    expect(releasingCount).toBeGreaterThan(0);
  });

  it('centers text shape source points inside grid', () => {
    const cols = 60;
    const rows = 40;
    const source = getShapeSource('text', 'NODE 07', cols, rows);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of source.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    expect(Math.abs(centerX - (cols - 1) / 2)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(centerY - (rows - 1) / 2)).toBeLessThanOrEqual(1.5);
  });

  it('applies pseudo-3D rotation to face shape slots', () => {
    const cols = 60;
    const rows = 40;
    const field = new ShapeField(512);
    const source = getShapeSource('face', 'NODE 07', cols, rows);
    field.loadSource(source, cols, rows);

    const initialPositions = Array.from(field.slots.currentX);

    // Apply 3D rotation
    field.slots.applyPseudoRotation(0.5, cols * 0.5, rows * 0.45);

    const hasChanged = field.slots.targetX.some((tx, idx) => tx !== initialPositions[idx]);
    expect(hasChanged).toBe(true);
  });

  it('applies grasping motion to hand shape slots', () => {
    const cols = 60;
    const rows = 40;
    const field = new ShapeField(512);
    const source = getShapeSource('hand', 'NODE 07', cols, rows);
    field.loadSource(source, cols, rows);

    const initialY = field.slots.currentY[0]!;

    // Apply grasp motion
    field.slots.applyGraspMotion(0.8, cols * 0.52, rows * 0.88);

    expect(field.slots.targetY[0]).not.toBe(initialY);
  });

  it('correctly reports slot occupancy for grid cells to prevent overlap with rain', () => {
    const cols = 60;
    const rows = 40;
    const field = new ShapeField(512);
    const source = getShapeSource('text', 'NODE 07', cols, rows);
    field.loadSource(source, cols, rows);

    const firstX = Math.round(field.slots.currentX[0]!);
    const firstY = Math.round(field.slots.currentY[0]!);

    expect(field.slots.isOccupiedAt(firstX, firstY)).toBe(true);
    expect(field.slots.isOccupiedAt(0, 0)).toBe(false);
  });

  it('is deterministic: same seed produces identical slots and identical updates', () => {
    const build = () => {
      const field = new ShapeField(512, 777);
      const source = getShapeSource('text', 'NODE 07', 40, 30);
      field.loadSource(source, 40, 30);
      return field;
    };

    const a = build();
    const b = build();

    expect(Array.from(a.slots.glyph)).toEqual(Array.from(b.slots.glyph));
    expect(Array.from(a.slots.releaseAt)).toEqual(Array.from(b.slots.releaseAt));

    const firstX = a.slots.targetX[0]!;
    const firstY = a.slots.targetY[0]!;
    const glyphs: RainGlyphSample[] = [
      {
        x: firstX * 13,
        y: firstY * 13,
        column: firstX,
        row: firstY,
        trailIndex: 0,
        glyph: 65,
        brightness: 1.0,
        alpha: 1.0,
        size: 13,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        maskValue: 1,
        edgeValue: 1,
        depthValue: 0.5,
      },
    ];

    // Walk the whole timeline so imprinting, holding and erosion all run.
    for (let step = 0; step < 120; step += 1) {
      const progress = Math.min(1, step / 100);
      a.update(progress, 0.016, glyphs, 40, 30);
      b.update(progress, 0.016, glyphs, 40, 30);
    }

    expect(Array.from(a.slots.energy)).toEqual(Array.from(b.slots.energy));
    expect(Array.from(a.slots.state)).toEqual(Array.from(b.slots.state));
    expect(Array.from(a.slots.glyph)).toEqual(Array.from(b.slots.glyph));
    expect(Array.from(a.slots.currentX)).toEqual(Array.from(b.slots.currentX));
    expect(Array.from(a.slots.currentY)).toEqual(Array.from(b.slots.currentY));
  });
});
