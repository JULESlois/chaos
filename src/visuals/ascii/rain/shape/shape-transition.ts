import type { ShapePhase, ShapeTransitionState } from './shape-types';

export class ShapeTransitionController {
  private currentProgress = 0;
  private state: ShapeTransitionState = {
    phase: 'rain',
    intent: 0,
    imprintStrength: 0,
    edgeCapture: 0,
    interiorCapture: 0,
    mutationLock: 0,
    erosion: 0,
    gravity: 0,
  };

  reset(progress = 0): void {
    this.currentProgress = progress;
    this.state.imprintStrength = 0;
    this.state.edgeCapture = 0;
    this.state.interiorCapture = 0;
    this.state.mutationLock = 0;
    this.state.erosion = 0;
    this.state.gravity = 0;
  }

  jumpTo(progress: number): Readonly<ShapeTransitionState> {
    this.currentProgress = progress;
    return this.update(progress, 10.0); // instant convergence using large delta
  }

  getState(): Readonly<ShapeTransitionState> {
    return this.state;
  }

  update(progress: number, delta: number): Readonly<ShapeTransitionState> {
    // Damped progress interpolation for smooth visual transitions
    const stiffness = 8.0;
    this.currentProgress += (progress - this.currentProgress) * (1 - Math.exp(-stiffness * delta));
    const p = Math.max(0, Math.min(1, this.currentProgress));

    // Determine target phase based on progress timeline
    let targetPhase: ShapePhase = 'rain';
    if (p <= 0.05) {
      targetPhase = 'rain';
    } else if (p <= 0.22) {
      targetPhase = 'premonition';
    } else if (p <= 0.65) {
      targetPhase = 'imprinting';
    } else if (p <= 0.85) {
      targetPhase = 'holding';
    } else if (p < 0.99) {
      targetPhase = 'eroding';
    } else {
      targetPhase = 'released';
    }

    this.state.phase = targetPhase;

    // Compute target values per timeline
    let targetImprint = 0;
    let targetEdge = 0;
    let targetInterior = 0;
    let targetLock = 0;
    let targetErosion = 0;
    let targetGravity = 0;

    switch (targetPhase) {
      case 'rain':
        targetImprint = 0;
        break;
      case 'premonition':
        targetImprint = (p - 0.05) / 0.17 * 0.2;
        targetEdge = 0.5;
        break;
      case 'imprinting':
        targetImprint = 0.2 + (p - 0.22) / 0.43 * 0.8;
        targetEdge = 1.0;
        targetInterior = (p - 0.35) / 0.3;
        targetLock = 0.5;
        break;
      case 'holding':
        targetImprint = 1.0;
        targetEdge = 1.0;
        targetInterior = 1.0;
        targetLock = 0.85;
        break;
      case 'eroding':
        targetImprint = 1.0 - (p - 0.85) / 0.14 * 0.7;
        targetErosion = (p - 0.85) / 0.14;
        targetGravity = 15.0;
        targetLock = 0.1;
        break;
      case 'released':
        targetImprint = 0;
        targetErosion = 1.0;
        targetGravity = 25.0;
        break;
    }

    // Apply smooth exponential damping to parameters
    const damp = (curr: number, target: number, speed = 10.0) =>
      curr + (target - curr) * (1 - Math.exp(-speed * delta));

    this.state.intent = p;
    this.state.imprintStrength = damp(this.state.imprintStrength, targetImprint);
    this.state.edgeCapture = damp(this.state.edgeCapture, Math.max(0, targetEdge));
    this.state.interiorCapture = damp(this.state.interiorCapture, Math.max(0, targetInterior));
    this.state.mutationLock = damp(this.state.mutationLock, Math.max(0, targetLock));
    this.state.erosion = damp(this.state.erosion, Math.max(0, targetErosion));
    this.state.gravity = damp(this.state.gravity, targetGravity);

    return this.state;
  }
}
