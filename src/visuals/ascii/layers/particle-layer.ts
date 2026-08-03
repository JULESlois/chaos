import { createRng } from '@/utils/math';
import { glyphFor } from '../charset';
import { bucketFor } from '../palette';
import type { Vec2 } from '../fields/pointer-field';
import type { AsciiRuntime, AsciiViewport, DrawLayer } from '../types';

/** Supplies a velocity in normalised viewport units per second. */
export interface VelocitySource {
  velocity(out: Vec2, nx: number, ny: number, runtime: AsciiRuntime): void;
}

/**
 * Layer B — free-moving characters.
 *
 * These are not on the grid. They hold fractional positions and are advected
 * by whatever velocity source the scene supplies, which is what breaks the
 * terminal illusion and makes the field read as a medium rather than a text
 * buffer.
 *
 * All state lives in parallel `Float32Array`s allocated once at capacity.
 * Particles are never created or destroyed at runtime — one that dies is
 * rewound in place — so the layer allocates nothing after construction and
 * produces no garbage for the collector to trip over mid-scroll.
 */
export class ParticleLayer implements DrawLayer {
  readonly id = 'particle';

  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly ages: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly seeds: Float32Array;
  private readonly velocity: Vec2 = { x: 0, y: 0 };
  private readonly rng: () => number;

  readonly capacity: number;
  private readonly charset: Uint8Array;

  private width = 1;
  private height = 1;
  private active: number;

  constructor(capacity: number, charset: Uint8Array, seed = 0x3f_2a_11) {
    this.capacity = capacity;
    this.charset = charset;
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.ages = new Float32Array(capacity);
    this.lifetimes = new Float32Array(capacity);
    this.seeds = new Float32Array(capacity);
    this.rng = createRng(seed);
    this.active = capacity;

    for (let index = 0; index < capacity; index += 1) {
      this.respawn(index, true);
    }
  }

  resize(view: AsciiViewport): void {
    this.width = view.width;
    this.height = view.height;
  }

  /** Number of particles simulated this frame. Clamped to capacity. */
  setActive(count: number): void {
    this.active = Math.max(0, Math.min(this.capacity, Math.floor(count)));
  }

  get activeCount(): number {
    return this.active;
  }

  private respawn(index: number, initial: boolean): void {
    const rng = this.rng;
    this.xs[index] = rng();
    this.ys[index] = rng();
    this.lifetimes[index] = 3 + rng() * 7;
    // On the first fill, stagger the ages so the whole population does not
    // expire on the same frame a few seconds after load.
    this.ages[index] = initial ? rng() * this.lifetimes[index]! : 0;
    this.seeds[index] = rng();
  }

  update(runtime: AsciiRuntime, source: VelocitySource): void {
    const delta = runtime.delta;
    const { xs, ys, ages, lifetimes, velocity } = this;

    for (let index = 0; index < this.active; index += 1) {
      const nx = xs[index]!;
      const ny = ys[index]!;

      source.velocity(velocity, nx, ny, runtime);

      let x = nx + velocity.x * delta;
      let y = ny + velocity.y * delta;

      // Wrapping rather than clamping: a particle that leaves the right edge
      // is the same particle arriving at the left, so the population is
      // constant and the field never thins at the trailing edge.
      if (x < 0) x += 1;
      else if (x >= 1) x -= 1;
      if (y < 0) y += 1;
      else if (y >= 1) y -= 1;

      xs[index] = x;
      ys[index] = y;

      const age = ages[index]! + delta;
      if (age >= lifetimes[index]!) {
        this.respawn(index, false);
      } else {
        ages[index] = age;
      }
    }
  }

  draw(runtime: AsciiRuntime): void {
    const { painter, tension } = runtime;
    const ceiling = tension.lightIntensity;
    const { xs, ys, ages, lifetimes, seeds } = this;
    const width = this.width;
    const height = this.height;

    for (let index = 0; index < this.active; index += 1) {
      const life = ages[index]! / lifetimes[index]!;
      // Fade in over the first tenth of life and out over the last third, so
      // recycled particles never pop.
      const envelope = Math.min(1, life * 10) * Math.min(1, (1 - life) * 3);
      if (envelope <= 0.02) continue;

      const intensity = envelope * (0.35 + seeds[index]! * 0.65);
      painter.push(
        xs[index]! * width,
        ys[index]! * height,
        glyphFor(this.charset, intensity),
        bucketFor(intensity, ceiling),
      );
    }
  }

  dispose(): void {
    this.active = 0;
  }
}
