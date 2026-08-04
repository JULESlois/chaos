import { hashUnit } from '../../../../utils/math';

export function sampleBootFault(
  time: number,
  column: number,
  seed: number,
  totalCols: number
) {
  let alphaMod = 1;
  let brightMod = 1;
  let shiftX = 0;
  let shiftY = 0;
  let duplicate = false;
  let scramble = false;

  // Check two overlapping slots to ensure we don't miss faults on boundaries
  for (let s = 0; s < 2; s++) {
    const slotDuration = s === 0 ? 0.9 : 4.5;
    const slot = Math.floor(time / slotDuration);
    const slotSeed = hashUnit(seed ^ slot ^ (s * 997));
    
    if (slotSeed < 0.6) {
      const faultStart = slot * slotDuration + hashUnit(slotSeed ^ 1) * (slotDuration * 0.8);
      let duration = 0.04 + hashUnit(slotSeed ^ 3) * 0.14;
      
      if (time >= faultStart && time < faultStart + duration) {
        const typeRand = hashUnit(slotSeed ^ 2);
        let type = 'segment-blackout';
        if (typeRand < 0.2) type = 'segment-shift';
        else if (typeRand < 0.4) type = 'duplicate-line';
        else if (typeRand < 0.6) type = 'brightness-pulse';
        else if (typeRand < 0.8) type = 'glyph-scramble';
        else type = 'sync-tear';

        let colStart = Math.floor(hashUnit(slotSeed ^ 4) * totalCols);
        let colLen = 3 + Math.floor(hashUnit(slotSeed ^ 5) * 11);

        if (type === 'sync-tear') {
          colStart = 0;
          colLen = totalCols;
          duration = Math.min(duration, 0.12);
        }

        if (column >= colStart && column <= colStart + colLen) {
          if (type === 'segment-blackout') {
            alphaMod = 0;
          } else if (type === 'segment-shift') {
            shiftX = (hashUnit(slotSeed ^ 6) > 0.5 ? 1 : -1) * (1 + Math.floor(hashUnit(slotSeed ^ 7) * 3));
          } else if (type === 'duplicate-line') {
            duplicate = true;
            shiftY = 2 + Math.floor(hashUnit(slotSeed ^ 8) * 6);
          } else if (type === 'brightness-pulse') {
            brightMod = 3.0;
          } else if (type === 'glyph-scramble') {
            scramble = true;
          } else if (type === 'sync-tear') {
            shiftX = (hashUnit(slotSeed ^ 9) > 0.5 ? 1 : -1) * (1 + Math.floor(hashUnit(slotSeed ^ 10) * 5));
          }
        }
      }
    }
  }

  return { alphaMod, brightMod, shiftX, shiftY, duplicate, scramble };
}
