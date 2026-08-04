import { hashUnit } from '../../../../utils/math';

export type TrajectoryType =
  | 'straight'
  | 'drift'
  | 'sine'
  | 'kink'
  | 'hook'
  | 'broken'
  | 'reverse-fragment';

export function getTrajectoryType(seed: number, column: number): TrajectoryType {
  const r = hashUnit(seed ^ (column * 313));
  if (r < 0.38) return 'straight';
  if (r < 0.60) return 'drift';
  if (r < 0.74) return 'sine';
  if (r < 0.84) return 'kink';
  if (r < 0.91) return 'hook';
  if (r < 0.97) return 'broken';
  return 'reverse-fragment';
}

export function sampleTrajectory(
  type: TrajectoryType,
  trailU: number,
  time: number,
  
  distortion: number,
  anomaly: number,
  seed: number,
  column: number,
  cell: number
): number {
  if (distortion <= 0.001) {
    return 0; // Pure straight when no distortion
  }
  
  // Anomaly scales the chance of using the non-straight types, 
  // but since type is already chosen, we can just blend the output to straight
  // if anomaly is low. Or we can just use anomaly to scale the amplitude of complex types.
  
  const amp = hashUnit(seed ^ column ^ 11) * 2.0 + 0.5;
  const freq = hashUnit(seed ^ column ^ 13) * 3 + 1;
  const phase = hashUnit(seed ^ column ^ 17) * Math.PI * 2;
  
  let xOffset = 0;
  
  // If anomaly is 0, we fall back to straight behavior for everything
  const effectiveType = (hashUnit(seed ^ column ^ 101) < anomaly) ? type : 'straight';

  switch (effectiveType) {
    case 'straight':
      // Slightly jittery but mostly straight
      xOffset = Math.sin(time * 0.5 + phase) * 0.2 * cell;
      break;
      
    case 'drift':
      // Whole stream slowly drifts to one side
      xOffset = Math.sin(time * freq * 0.2 + phase) * amp * cell * 2;
      break;

    case 'sine':
      xOffset = Math.sin(trailU * freq * 2 + time * freq + phase) * amp * cell * 1.5;
      break;

    case 'kink': {
      // Abrupt angle at a specific point
      const kinkPoint = hashUnit(seed ^ column ^ 19);
      if (trailU > kinkPoint) {
        xOffset = (trailU - kinkPoint) * amp * cell * 3 * (hashUnit(seed ^ column ^ 23) > 0.5 ? 1 : -1);
      }
      break;
    }

    case 'hook':
      if (trailU > 0.7) { // tail hook
        xOffset = (trailU - 0.7) * 3 * amp * cell * (hashUnit(seed ^ column ^ 29) > 0.5 ? 1 : -1);
      }
      break;

    case 'broken': {
      // Segmented
      const breakPoint1 = 0.33 + hashUnit(seed ^ column ^ 31) * 0.1;
      const breakPoint2 = 0.66 + hashUnit(seed ^ column ^ 37) * 0.1;
      if (trailU > breakPoint2) {
        xOffset = amp * cell * 2;
      } else if (trailU > breakPoint1) {
        xOffset = -amp * cell * 1.5;
      }
      break;
    }

    case 'reverse-fragment':
      // Only a short fragment has an offset
      if (trailU > 0.4 && trailU < 0.6) {
        xOffset = Math.sin(time * freq * 2 + phase) * amp * cell * 2;
      }
      break;
  }

  return xOffset * distortion;
}
