import { hashUnit } from '../../../../utils/math';

export interface BootFault {
  alphaMod: number;
  brightMod: number;
  shiftX: number;
  shiftY: number;
  duplicate: boolean;
  scramble: boolean;
}

export function sampleBootFault(
  time: number,
  column: number,
  seed: number,
  cols: number
): BootFault {
  const result: BootFault = {
    alphaMod: 1,
    brightMod: 1,
    shiftX: 0,
    shiftY: 0,
    duplicate: false,
    scramble: false,
  };

  // Very rudimentary fault scheduler
  const faultTick = Math.floor(time / 0.8);
  const faultSeed = hashUnit(seed ^ faultTick);

  if (faultSeed > 0.85) {
    const faultType = hashUnit(faultSeed ^ 3) * 6;
    const colStart = Math.floor(hashUnit(faultSeed ^ 7) * cols);
    const colEnd = colStart + Math.floor(hashUnit(faultSeed ^ 11) * 14 + 3);
    
    // Are we in the affected segment?
    if (column >= colStart && column <= colEnd) {
      if (faultType < 1) {
        // segment-blackout
        result.alphaMod = 0;
      } else if (faultType < 2) {
        // segment-shift
        result.shiftX = (hashUnit(faultSeed ^ 13) > 0.5 ? 1 : -1) * Math.floor(hashUnit(faultSeed ^ 17) * 3 + 1);
      } else if (faultType < 3) {
        // duplicate-line
        result.duplicate = true;
        result.shiftY = Math.floor(hashUnit(faultSeed ^ 19) * 6 + 2);
      } else if (faultType < 4) {
        // brightness-pulse
        result.brightMod = 3;
      } else if (faultType < 5) {
        // glyph-scramble
        result.scramble = true;
      } else {
        // sync-tear
        result.shiftY = (hashUnit(faultSeed ^ 23) > 0.5 ? 1 : -1) * Math.floor(hashUnit(faultSeed ^ 29) * 4 + 1);
      }
    }
  }

  return result;
}
