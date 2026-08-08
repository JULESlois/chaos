import { ShapeSlots } from './shape-slots';
import type { ShapeSource, ShapeTransitionState } from './shape-types';
import { ShapeImprint } from './shape-imprint';
import { ShapeErosion } from './shape-erosion';
import { ShapeTransitionController } from './shape-transition';
import type { RainGlyphSample, FormWeights } from '../rain-types';
import { getShapeSource } from './shape-source';

export class ShapeField {
  readonly slots: ShapeSlots;
  readonly imprint: ShapeImprint;
  readonly erosion: ShapeErosion;
  readonly transition: ShapeTransitionController;

  private activeSource: ShapeSource | null = null;
  private activeMode: 'text' | 'face' | 'hand' = 'text';

  constructor(maxSlots = 4096, seed = 2407) {
    this.slots = new ShapeSlots(maxSlots, 256, seed);
    this.imprint = new ShapeImprint();
    this.erosion = new ShapeErosion();
    this.transition = new ShapeTransitionController();
  }

  loadSource(
    source: ShapeSource,
    gridCols: number,
    gridRows: number,
    offsetX = 0,
    offsetY = 0
  ): void {
    this.activeSource = source;
    if (source.id.startsWith('face')) {
      this.activeMode = 'face';
    } else if (source.id.startsWith('hand')) {
      this.activeMode = 'hand';
    } else {
      this.activeMode = 'text';
    }
    this.slots.loadFromSource(source, gridCols, gridRows, offsetX, offsetY);
  }

  getActiveSource(): ShapeSource | null {
    return this.activeSource;
  }

  update(
    progress: number,
    delta: number,
    rainGlyphs: RainGlyphSample[],
    gridCols: number,
    gridRows: number,
    formWeights?: FormWeights,
    time = 0
  ): Readonly<ShapeTransitionState> {
    // 1. Switch active mode based on formWeights
    if (formWeights) {
      let targetMode: 'text' | 'face' | 'hand' = 'text';
      if (formWeights.hand > 0.35 && formWeights.hand >= formWeights.face) {
        targetMode = 'hand';
      } else if (formWeights.face > 0.35 && formWeights.face >= formWeights.hand) {
        targetMode = 'face';
      }

      if (targetMode !== this.activeMode) {
        this.loadSource(
          getShapeSource(targetMode, 'NODE 07', gridCols, gridRows),
          gridCols,
          gridRows
        );
      }
    }

    // 2. Apply active dynamic transformations
    if (this.activeMode === 'face' && this.slots.count > 0) {
      const angle = Math.sin(time * 0.9 + progress * Math.PI) * 0.45;
      this.slots.applyPseudoRotation(angle, gridCols * 0.5, gridRows * 0.45);
    } else if (this.activeMode === 'hand' && this.slots.count > 0) {
      const graspFactor = 0.5 + 0.5 * Math.sin(time * 1.6 + progress * Math.PI * 2);
      this.slots.applyGraspMotion(graspFactor, gridCols * 0.52, gridRows * 0.88);
    }

    // 3. Update transition, rain imprint deposition, and sand erosion dynamics
    const state = this.transition.update(progress, delta);

    if (this.slots.count > 0) {
      this.imprint.depositRainGlyphs(this.slots, rainGlyphs, state, delta);
      this.erosion.updateErosion(this.slots, state, delta, gridRows);
    }

    return state;
  }
}
