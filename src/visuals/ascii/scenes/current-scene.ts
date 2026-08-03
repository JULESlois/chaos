import { clamp01, valueNoise2D } from '@/utils/math';
import { CHARSETS } from '../charset';
import { FlowField, type FlowParameters } from '../fields/flow-field';
import type { Vec2 } from '../fields/pointer-field';
import { GridLayer } from '../layers/grid-layer';
import { ParticleLayer, type VelocitySource } from '../layers/particle-layer';
import type { AsciiRuntime, AsciiScene, AsciiViewport } from '../types';

/**
 * Screen two — CURRENT.
 *
 * The field starts moving. A free particle population is advected through the
 * combined flow field while a faint grid stays behind it, so the reader sees
 * motion *against* a static reference rather than motion in a vacuum.
 *
 * This is the screen where the pointer first has consequences: the cursor
 * displaces the medium and drags a wake behind it. The response is immediate
 * but incomplete — the field never fully clears around the pointer, and it
 * takes a moment to close again after the pointer leaves.
 */
export class CurrentScene implements AsciiScene, VelocitySource {
  readonly id = 'current';
  readonly charset = CHARSETS.current;

  private readonly flow = new FlowField();
  private readonly particles: ParticleLayer;
  private readonly grid: GridLayer;

  private readonly params: FlowParameters = {
    time: 0,
    distortion: 0,
    scrollVelocity: 0,
    scrollDirection: 0,
    scale: 3.4,
  };

  constructor(particleCapacity: number) {
    this.particles = new ParticleLayer(particleCapacity, this.charset);
    this.grid = new GridLayer(
      (nx, ny, runtime) => this.substrate(nx, ny, runtime),
      this.charset,
      0.14,
    );
  }

  private substrate(nx: number, ny: number, runtime: AsciiRuntime): number {
    const t = runtime.time * 0.03;
    const noise = valueNoise2D(nx * 3 - t, ny * 3 + t);
    return clamp01((noise - 0.55) * 1.6 * runtime.tension.density);
  }

  velocity(out: Vec2, nx: number, ny: number, runtime: AsciiRuntime): void {
    this.flow.sample(out, nx, ny, runtime.pointer, this.params);
  }

  enter(runtime: AsciiRuntime): void {
    this.particles.setActive(this.budgetFor(runtime));
  }

  update(runtime: AsciiRuntime): void {
    const params = this.params;
    params.time = runtime.time;
    params.distortion = runtime.tension.flowDistortion;
    params.scrollVelocity = runtime.experience.scrollVelocity;
    params.scrollDirection = runtime.experience.scrollDirection;
    // Turbulence gets finer as the screen progresses, so the current breaks up
    // rather than simply speeding up.
    params.scale = 3.4 + runtime.experience.localProgress * 2.6;

    this.particles.setActive(this.budgetFor(runtime));
    this.particles.update(runtime, this);
  }

  render(runtime: AsciiRuntime): void {
    this.grid.draw(runtime);
    this.particles.draw(runtime);
  }

  exit(): void {
    // The particle population is left in place; re-entering the screen should
    // find the current where it was, not restarted.
  }

  resize(view: AsciiViewport): void {
    this.particles.resize(view);
    this.grid.resize(view);
  }

  dispose(): void {
    this.particles.dispose();
    this.grid.dispose();
  }

  /** Two thirds of the frame's budget goes to particles, one third to grid. */
  private budgetFor(runtime: AsciiRuntime): number {
    return Math.floor(runtime.budget * 0.66);
  }
}
