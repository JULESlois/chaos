import type { ShapeSlots } from './shape-slots';
import type { ShapeTransitionState } from './shape-types';
import { SlotState } from './shape-types';
import { hash01 } from '../../../../utils/math';

export class ShapeErosion {
  /** Deterministic frame counter — sand release and glyph mutation are hash-sampled. */
  private frame = 0;

  updateErosion(
    slots: ShapeSlots,
    transition: ShapeTransitionState,
    delta: number,
    gridRows: number
  ): void {
    this.frame += 1;
    const { erosion, gravity } = transition;

    // 1. Trigger releasing based on current erosion progress threshold
    if (erosion > 0) {
      for (let i = 0; i < slots.count; i++) {
        if (slots.state[i] !== SlotState.RELEASING && slots.state[i] !== SlotState.EMPTY) {
          if (slots.releaseAt[i] <= erosion) {
            slots.state[i] = SlotState.RELEASING;
            const angle = (hash01(i * 1597 + this.frame) - 0.5) * 0.8;
            slots.vx[i] = Math.sin(angle) * 3.0;
            slots.vy[i] = 4.0 + hash01(i * 3571 + this.frame * 17) * 6.0;
          }
        }
      }
    }

    // 2. Animate releasing sand particles
    const fallGravity = (gravity > 0 ? gravity : 18.0) * 1.5;
    const decay = Math.exp(-2.5 * delta);

    for (let i = 0; i < slots.count; i++) {
      if (slots.state[i] === SlotState.RELEASING) {
        slots.vy[i] += fallGravity * delta;
        slots.currentX[i] += slots.vx[i] * delta;
        slots.currentY[i] += slots.vy[i] * delta;
        slots.energy[i] *= decay;

        // Mutate falling glyph occasionally
        if (hash01(i * 48611 + this.frame * 31) < 0.2) {
          slots.glyph[i] = 33 + Math.floor(hash01(i * 48611 + this.frame * 31 + 1) * 90);
        }

        // Destroy when reaching bottom or faded
        if (slots.currentY[i] > gridRows + 2 || slots.energy[i] < 0.02) {
          slots.state[i] = SlotState.EMPTY;
          slots.energy[i] = 0;
        }
      }
    }
  }
}
