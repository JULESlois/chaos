import { clamp01, createRng, damp, lerp } from '@/utils/math';
import { glyphFor } from '../charset';
import { bucketFor } from '../palette';
import type { MaskField } from '../fields/mask-field';
import type { AsciiRuntime, AsciiViewport, DrawLayer } from '../types';

/** Fraction of the shorter viewport edge the mask is drawn at. */
const MASK_SCALE = 0.82;
/** Radius in pixels within which the pointer pulls a shape apart. */
const DISTURB_RADIUS = 170;

/**
 * Layer C — the attractor.
 *
 * Characters are given a target inside a mask and eased toward it. Coherence
 * decides how much of that target they actually honour: at 1 the shape is
 * whole, at 0 every character has drifted back to its own idle orbit.
 *
 * Three behaviours fall out of this arrangement rather than being special
 * cased:
 *
 *   - Moving the pointer near the shape locally suppresses coherence, so the
 *     shape comes apart exactly where the reader reaches for it.
 *   - Holding still lets coherence climb, so the shape assembles when it is
 *     not being looked at directly.
 *   - Scrolling back up swaps each character's target for a shuffled one, so
 *     the shape rebuilds itself in the wrong order — recognisably the same
 *     silhouette, visibly not the same assembly.
 */
export class MaskLayer implements DrawLayer {
  readonly id = 'mask';

  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly idle: Float32Array;
  private readonly permutation: Uint16Array;
  private readonly seeds: Float32Array;

  readonly capacity: number;
  private readonly charset: Uint8Array;

  private mask: MaskField | null = null;
  private width = 1;
  private height = 1;
  private active = 0;
  private initialised = false;

  constructor(capacity: number, charset: Uint8Array, seed = 0x6a_11_c3) {
    this.capacity = capacity;
    this.charset = charset;
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.idle = new Float32Array(capacity * 2);
    this.seeds = new Float32Array(capacity);
    this.permutation = new Uint16Array(capacity);

    const rng = createRng(seed);
    for (let index = 0; index < capacity; index += 1) {
      this.idle[index * 2] = rng();
      this.idle[index * 2 + 1] = rng();
      this.seeds[index] = rng();
      this.permutation[index] = index;
    }

    // Fisher–Yates on the seeded stream: the "wrong order" is wrong the same
    // way every time, which makes it feel authored rather than glitchy.
    for (let index = capacity - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      const held = this.permutation[index]!;
      this.permutation[index] = this.permutation[swap]!;
      this.permutation[swap] = held;
    }
  }

  resize(view: AsciiViewport): void {
    this.width = view.width;
    this.height = view.height;
    if (!this.initialised) {
      for (let index = 0; index < this.capacity; index += 1) {
        this.xs[index] = this.idle[index * 2]! * view.width;
        this.ys[index] = this.idle[index * 2 + 1]! * view.height;
      }
      this.initialised = true;
    }
  }

  setMask(mask: MaskField | null): void {
    this.mask = mask;
  }

  setActive(count: number): void {
    this.active = Math.max(0, Math.min(this.capacity, Math.floor(count)));
  }

  /** Scatters every character back to its idle orbit. Used on scene exit. */
  scatter(): void {
    for (let index = 0; index < this.capacity; index += 1) {
      this.xs[index] = this.idle[index * 2]! * this.width;
      this.ys[index] = this.idle[index * 2 + 1]! * this.height;
    }
  }

  update(runtime: AsciiRuntime): void {
    const mask = this.mask;
    if (!mask || mask.count === 0 || this.active === 0) return;

    const { pointer, tension, experience, delta, time } = runtime;
    const size = Math.min(this.width, this.height) * MASK_SCALE;
    const centreX = this.width * 0.5;
    const centreY = this.height * 0.5;
    const pointerX = pointer.x * this.width;
    const pointerY = pointer.y * this.height;
    const disturbSquared = DISTURB_RADIUS * DISTURB_RADIUS;

    const reversed = experience.scrollDirection < 0;
    const coherence = tension.maskCoherence;
    const follow = damp(2.4 + coherence * 3.2, delta);

    for (let index = 0; index < this.active; index += 1) {
      const targetSlot = (reversed ? this.permutation[index]! : index) % mask.count;
      const targetX = centreX + mask.points[targetSlot * 2]! * size;
      const targetY = centreY + mask.points[targetSlot * 2 + 1]! * size;

      const seed = this.seeds[index]!;
      // Idle orbit: a slow lissajous so scattered characters still drift.
      const orbitX =
        (this.idle[index * 2]! + Math.sin(time * 0.19 + seed * 31) * 0.04) * this.width;
      const orbitY =
        (this.idle[index * 2 + 1]! + Math.cos(time * 0.23 + seed * 17) * 0.04) * this.height;

      let local = coherence;

      const dx = this.xs[index]! - pointerX;
      const dy = this.ys[index]! - pointerY;
      const distanceSquared = dx * dx + dy * dy;
      if (pointer.active && distanceSquared < disturbSquared) {
        const proximity = 1 - distanceSquared / disturbSquared;
        local *= 1 - proximity * proximity * (0.55 + pointer.speed * 0.45);
      }

      const goalX = lerp(orbitX, targetX, local);
      const goalY = lerp(orbitY, targetY, local);

      this.xs[index] = lerp(this.xs[index]!, goalX, follow);
      this.ys[index] = lerp(this.ys[index]!, goalY, follow);
    }
  }

  draw(runtime: AsciiRuntime): void {
    const mask = this.mask;
    if (!mask || mask.count === 0 || this.active === 0) return;

    const { painter, tension } = runtime;
    const ceiling = tension.lightIntensity;
    const coherence = tension.maskCoherence;

    for (let index = 0; index < this.active; index += 1) {
      const slot = index % mask.count;
      // Outline characters are brighter than fill characters, and the whole
      // shape dims as it loses coherence.
      const edge = mask.edge[slot]!;
      const intensity = clamp01((0.22 + edge * 0.62) * (0.35 + coherence * 0.8));
      if (intensity <= 0.05) continue;

      painter.push(
        this.xs[index]!,
        this.ys[index]!,
        glyphFor(this.charset, intensity),
        bucketFor(intensity, ceiling),
      );
    }
  }

  dispose(): void {
    this.mask = null;
    this.active = 0;
  }
}
