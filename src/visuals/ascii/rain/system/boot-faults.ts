import { hash01 as hashUnit } from '../../../../utils/math';

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

  // Deterministic timeline
  if (time > 0.35 && time < 0.45) {
    // 0.35s: 右侧约 8 个格点短暂错位
    const rightCol = Math.floor(cols * 0.7);
    if (column >= rightCol && column < rightCol + 8) {
      result.shiftY = -2;
      result.scramble = true;
    }
  } else if (time > 0.75 && time < 0.9) {
    // 0.75s: 一条亮脉冲从左向右通过
    const p = (time - 0.75) / 0.15;
    const centerCol = p * cols;
    if (Math.abs(column - centerCol) < 5) {
      result.brightMod = 3;
      result.alphaMod = 1.5;
    }
  } else if (time > 1.15 && time < 1.21) {
    // 1.15s: 中部发生 60ms 黑段
    const midStart = Math.floor(cols * 0.4);
    const midEnd = Math.floor(cols * 0.6);
    if (column >= midStart && column <= midEnd) {
      result.alphaMod = 0;
    }
  } else if (time > 1.55 && time < 1.65) {
    // 1.55s: 出现一条上下偏移 4px 的短暂重复线
    const start = Math.floor(cols * 0.2);
    const end = Math.floor(cols * 0.8);
    if (column >= start && column <= end) {
      result.duplicate = true;
      result.shiftY = 4;
    }
  } else if (time > 2.0) {
    // 随后进入低频随机故障循环
    const randomTime = time - 2.0;
    const faultTick = Math.floor(randomTime / 1.2);
    const faultSeed = hashUnit(seed ^ faultTick);

    if (faultSeed > 0.85) {
      const faultType = hashUnit(faultSeed ^ 3) * 6;
      const colStart = Math.floor(hashUnit(faultSeed ^ 7) * cols);
      const colEnd = colStart + Math.floor(hashUnit(faultSeed ^ 11) * 14 + 3);
      
      // Are we in the affected segment?
      if (column >= colStart && column <= colEnd) {
        if (faultType < 1) {
          result.alphaMod = 0;
        } else if (faultType < 2) {
          result.shiftX = (hashUnit(faultSeed ^ 13) > 0.5 ? 1 : -1) * Math.floor(hashUnit(faultSeed ^ 17) * 3 + 1);
        } else if (faultType < 3) {
          result.duplicate = true;
          result.shiftY = Math.floor(hashUnit(faultSeed ^ 19) * 6 + 2);
        } else if (faultType < 4) {
          result.brightMod = 3;
        } else if (faultType < 5) {
          result.scramble = true;
        } else {
          result.shiftY = (hashUnit(faultSeed ^ 23) > 0.5 ? 1 : -1) * Math.floor(hashUnit(faultSeed ^ 29) * 4 + 1);
        }
      }
    }
  }

  return result;
}
