import type { ShapeSlots } from './shape-slots';
import type { ShapeTransitionState } from './shape-types';
import { SlotState } from './shape-types';
import type { RainGlyphSample } from '../rain-types';
import { hash01 } from '../../../../utils/math';

export class ShapeImprint {
  captureRadius = 1.2; // in row grid units

  /** Deterministic frame counter — every random-looking choice is hash-sampled. */
  private frame = 0;

  depositRainGlyphs(
    slots: ShapeSlots,
    glyphs: RainGlyphSample[],
    transition: ShapeTransitionState,
    delta: number
  ): void {
    this.frame += 1;
    if (transition.imprintStrength <= 0.001 || slots.count === 0) {
      return;
    }

    const { imprintStrength, edgeCapture } = transition;

    // Process each visible falling rain character
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const col = Math.round(g.column);

      // Check column and adjacent columns (col-1 to col+1)
      slots.forEachInColumns(col - 1, col + 1, (slotIdx) => {
        // Skip releasing slots
        if (slots.state[slotIdx] === SlotState.RELEASING) return;

        // Skip void regions
        if (slots.voidValue[slotIdx] > 0.8) return;

        const targetY = slots.targetY[slotIdx];
        const distY = Math.abs(g.row - targetY);

        if (distY <= this.captureRadius) {
          const proximity = 1.0 - distY / this.captureRadius;
          const slotEdge = slots.edge[slotIdx];

          // Priority accumulation for edge slots during early imprinting
          const edgeFactor = 0.35 + 0.65 * slotEdge * edgeCapture;
          const deposit =
            g.alpha *
            slots.density[slotIdx] *
            imprintStrength *
            proximity *
            edgeFactor *
            0.6;

          const oldEnergy = slots.energy[slotIdx];
          const newEnergy = Math.min(1.0, oldEnergy + deposit);
          slots.energy[slotIdx] = newEnergy;

          // Update state to IMPRINTING or STABLE
          if (newEnergy >= 0.75) {
            slots.state[slotIdx] = SlotState.STABLE;
          } else if (newEnergy > 0.1) {
            slots.state[slotIdx] = SlotState.IMPRINTING;
          }

          // Refresh slot glyph periodically from passing rain
          if (oldEnergy < 0.2 || hash01(slotIdx * 104729 + this.frame * 7919) < 0.15) {
            slots.glyph[slotIdx] = g.glyph;
          }
        }
      });
    }

    // Natural phosphor decay for non-refreshed slots to keep live breathing
    const decayRate = 0.18 * (1.0 - transition.mutationLock);
    for (let i = 0; i < slots.count; i++) {
      if (slots.state[i] !== SlotState.RELEASING && slots.energy[i] > 0) {
        slots.energy[i] = Math.max(0, slots.energy[i] - decayRate * delta);
        if (slots.energy[i] < 0.05 && slots.state[i] !== SlotState.RELEASING) {
          slots.state[i] = SlotState.EMPTY;
        }
      }
    }
  }
}
