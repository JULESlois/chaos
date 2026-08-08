export type ShapePhase =
  | 'rain'
  | 'premonition'
  | 'imprinting'
  | 'holding'
  | 'eroding'
  | 'released';

export const SlotState = {
  EMPTY: 0,
  IMPRINTING: 1,
  STABLE: 2,
  RELEASING: 3,
} as const;

export type SlotState = (typeof SlotState)[keyof typeof SlotState];

export interface ShapeTargetPoint {
  x: number; // grid column (float)
  y: number; // grid row (float)
  density: number;
  edge: number;
  depth: number;
  voidValue: number;
}

export interface ShapeSource {
  id: string;
  width: number;
  height: number;
  points: ShapeTargetPoint[];
}

export interface ShapeTransitionState {
  phase: ShapePhase;
  intent: number; // 0..1 overall target strength
  imprintStrength: number;
  edgeCapture: number;
  interiorCapture: number;
  mutationLock: number;
  erosion: number;
  gravity: number;
}
