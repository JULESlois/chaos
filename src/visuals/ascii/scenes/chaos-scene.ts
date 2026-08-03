import { clamp01, hash01, valueNoise2D } from '@/utils/math';
import { CHARSETS } from '../charset';
import { FlowField, type FlowParameters } from '../fields/flow-field';
import type { Vec2 } from '../fields/pointer-field';
import { GridLayer } from '../layers/grid-layer';
import { ParticleLayer, type VelocitySource } from '../layers/particle-layer';
import type { AsciiRuntime, AsciiScene, AsciiViewport } from '../types';

/** Fixed seed for the column and glyph corruption. Never `Math.random`. */
const CORRUPTION_SEED = 0x0c_ba_05;

/**
 * Screen four — CHAOS.
 *
 * The controlled part of controlled chaos lives in two places. The *shape* of
 * the escalation is authored: the tension controller runs a fixed timeline of
 * failures keyed to scroll position, so the same scroll always breaks the same
 * way. The *texture* of each failure is seeded: which columns die and which
 * characters are substituted come from `hash01` on a fixed seed, never from
 * `Math.random`, so two visits are identical and a screenshot is reproducible.
 *
 * The reader's scroll and pointer speed modulate intensity only. They can make
 * a failure worse; they cannot invent one, skip one, or change its order.
 *
 * The screen does not end on its loudest frame. Past ~0.87 the tension
 * controller collapses every channel toward zero within a tenth of the screen,
 * so the field stops mid-escalation. The silence is the point.
 */
export class ChaosScene implements AsciiScene, VelocitySource {
  readonly id = 'chaos';
  readonly charset = CHARSETS.chaos;

  private readonly flow = new FlowField();
  private readonly particles: ParticleLayer;
  private readonly grid: GridLayer;

  private readonly params: FlowParameters = {
    time: 0,
    distortion: 0,
    scrollVelocity: 0,
    scrollDirection: 0,
    scale: 6,
  };

  constructor(particleCapacity: number) {
    this.particles = new ParticleLayer(particleCapacity, this.charset, 0x9d_3a_71);
    this.grid = new GridLayer(
      (nx, ny, runtime) => this.substrate(nx, ny, runtime),
      this.charset,
      0.12,
    );

    this.grid.columnGate = (col, runtime) => this.columnGate(col, runtime);
    this.grid.glyphOverride = (glyph, col, row, runtime) =>
      this.substitute(glyph, col, row, runtime);
  }

  private substrate(nx: number, ny: number, runtime: AsciiRuntime): number {
    const t = runtime.time * 0.12;
    const coarse = valueNoise2D(nx * 4 + t, ny * 4 - t);
    const fine = valueNoise2D(nx * 17 - t * 2.1, ny * 17 + t * 1.7);
    const turbulence = runtime.tension.flowDistortion;
    const combined = coarse * (1 - turbulence * 0.5) + fine * turbulence * 0.9;
    return clamp01((combined - 0.42) * 1.9 * runtime.tension.density);
  }

  /**
   * Dead columns.
   *
   * A column is chosen by hashing its index against the fixed seed. As the
   * envelope rises the acceptance threshold rises with it, so columns die in a
   * stable order — the same ones every time, just more of them.
   */
  private columnGate(col: number, runtime: AsciiRuntime): number {
    const envelope = runtime.events['dead-column'];
    if (envelope <= 0) return 1;
    const roll = hash01(CORRUPTION_SEED ^ (col * 2654435761));
    if (roll > envelope * 0.55) return 1;
    // Not a hard cut: a dying column flickers before it goes.
    const flicker = hash01(CORRUPTION_SEED ^ (col * 40503) ^ ((runtime.time * 12) | 0));
    return flicker < 0.25 ? 0.35 : 0;
  }

  /**
   * Glyph substitution.
   *
   * Characters are replaced with other characters from the same alphabet. The
   * field keeps its density and its texture and loses only its coherence,
   * which reads as corruption rather than as decoration.
   */
  private substitute(glyph: number, col: number, row: number, runtime: AsciiRuntime): number {
    const envelope = runtime.events['glyph-substitution'];
    if (envelope <= 0) return glyph;

    const cell = col * 73856093 + row * 19349663;
    const roll = hash01(CORRUPTION_SEED ^ cell ^ ((runtime.time * 6) | 0));
    if (roll > envelope * 0.4) return glyph;

    const pick = hash01(CORRUPTION_SEED ^ (cell * 83492791));
    const set = this.charset;
    return set[Math.min(set.length - 1, (pick * set.length) | 0)]!;
  }

  velocity(out: Vec2, nx: number, ny: number, runtime: AsciiRuntime): void {
    this.flow.sample(out, nx, ny, runtime.pointer, this.params);
  }

  enter(runtime: AsciiRuntime): void {
    this.particles.setActive(Math.floor(runtime.budget * 0.4));
  }

  update(runtime: AsciiRuntime): void {
    const params = this.params;
    params.time = runtime.time * (1 + runtime.tension.flowDistortion * 1.6);
    params.distortion = runtime.tension.flowDistortion;
    params.scrollVelocity = runtime.experience.scrollVelocity;
    params.scrollDirection = runtime.experience.scrollDirection;
    params.scale = 6 + runtime.tension.flowDistortion * 8;

    // The ghost layer replays up to two extra copies of whatever is queued, so
    // the live pass is deliberately kept to a fraction of the budget — three
    // time-offset layers, one budget between them.
    this.particles.setActive(Math.floor(runtime.budget * 0.4));
    this.particles.update(runtime, this);
  }

  render(runtime: AsciiRuntime): void {
    this.grid.draw(runtime);
    this.particles.draw(runtime);
  }

  exit(): void {
    this.particles.setActive(0);
  }

  resize(view: AsciiViewport): void {
    this.particles.resize(view);
    this.grid.resize(view);
  }

  dispose(): void {
    this.particles.dispose();
    this.grid.dispose();
  }
}
