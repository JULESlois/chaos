import { clamp01, createRng, smoothstep } from '@/utils/math';
import { CHARSETS, glyphFor } from '../charset';
import { bucketFor } from '../palette';
import type { AsciiRuntime, AsciiScene, AsciiViewport } from '../types';

/** How many depth marks the corridor is built from. Small by design. */
const MARK_COUNT = 900;
/** Near and far clip, in arbitrary depth units. */
const NEAR = 0.35;
const FAR = 9;

/**
 * Screen five — SILENCE.
 *
 * After the chaos screen stops mid-sentence, this one gives the reader
 * somewhere to stand. A very low density of characters recedes toward a
 * vanishing point slightly below centre, and a single dim pink light sits at
 * the far end of it.
 *
 * That light is the television, seen from across the room before the room
 * exists. By the end of this screen the WebGL scene behind it has been asked
 * to warm up, so the transition into the epilogue is a continuation of a
 * movement the reader is already making rather than a new thing appearing.
 *
 * The perspective is done by hand — a divide, not a matrix. There is no camera
 * here and no second renderer; it is the same 2D canvas and the same painter.
 */
export class SilenceScene implements AsciiScene {
  readonly id = 'silence';
  readonly charset = CHARSETS.silence;

  /** Interleaved x,y offsets from the vanishing point, in depth-unit space. */
  private readonly offsets: Float32Array;
  private readonly depths: Float32Array;
  private readonly seeds: Float32Array;

  private width = 1;
  private height = 1;

  constructor(seed = 0x5_11_e0) {
    this.offsets = new Float32Array(MARK_COUNT * 2);
    this.depths = new Float32Array(MARK_COUNT);
    this.seeds = new Float32Array(MARK_COUNT);

    const rng = createRng(seed);
    for (let index = 0; index < MARK_COUNT; index += 1) {
      // Marks are scattered on a ring so the centre of the corridor stays
      // empty; that emptiness is what the distant light needs to be visible.
      const angle = rng() * Math.PI * 2;
      const radius = 0.35 + rng() * 1.5;
      this.offsets[index * 2] = Math.cos(angle) * radius;
      this.offsets[index * 2 + 1] = Math.sin(angle) * radius * 0.62;
      this.depths[index] = NEAR + rng() * (FAR - NEAR);
      this.seeds[index] = rng();
    }
  }

  enter(): void {
    // Depth state is time-derived; nothing to prime.
  }

  update(): void {
    // The corridor moves as a function of elapsed time in `render`, so there
    // is no per-frame simulation to advance and nothing to fall out of sync.
  }

  render(runtime: AsciiRuntime): void {
    const { painter, tension, experience } = runtime;
    const local = experience.localProgress;
    const ceiling = tension.lightIntensity;

    const vanishX = this.width * 0.5;
    const vanishY = this.height * 0.52;
    // Focal length in pixels; wider viewports get a longer corridor.
    const focal = Math.min(this.width, this.height) * 0.55;

    // Drift toward the vanishing point accelerates through the screen, so the
    // approach speeds up exactly as the television comes into view.
    const travel = runtime.time * (0.25 + local * 0.5);
    const budget = Math.min(MARK_COUNT, Math.max(0, Math.floor(runtime.budget)));

    for (let index = 0; index < budget; index += 1) {
      // Cycling the depth keeps the corridor infinite without respawning.
      const span = FAR - NEAR;
      let depth = this.depths[index]! - travel;
      depth = NEAR + (((depth - NEAR) % span) + span) % span;

      const scale = focal / depth;
      const x = vanishX + this.offsets[index * 2]! * scale;
      const y = vanishY + this.offsets[index * 2 + 1]! * scale;

      if (x < -20 || x > this.width + 20 || y < -20 || y > this.height + 20) continue;

      // Near marks are bright, far marks fade into the vanishing point.
      const depthFade = 1 - smoothstep(NEAR, FAR * 0.8, depth);
      const intensity = clamp01(depthFade * (0.3 + this.seeds[index]! * 0.5) * tension.density * 5);
      if (intensity <= 0.06) continue;

      painter.push(x, y, glyphFor(this.charset, intensity), bucketFor(intensity, ceiling));
    }

    this.renderDistantLight(runtime, vanishX, vanishY, local);
  }

  /**
   * The light at the end.
   *
   * A tight cluster of the brightest glyphs at the vanishing point, growing
   * through the screen. It is drawn with the painter rather than as a radial
   * gradient so that it is unambiguously made of the same characters as
   * everything else — the television is not a different medium, it is what the
   * field resolves into.
   */
  private renderDistantLight(
    runtime: AsciiRuntime,
    vanishX: number,
    vanishY: number,
    local: number,
  ): void {
    const bloom = smoothstep(0.25, 1, local);
    if (bloom <= 0.01) return;

    const { painter, tension } = runtime;
    const radius = Math.min(this.width, this.height) * (0.012 + bloom * 0.05);
    const rings = 3;

    for (let ring = 0; ring < rings; ring += 1) {
      const ringRadius = radius * ((ring + 1) / rings);
      const count = 6 + ring * 8;
      const spin = runtime.time * 0.12 * (ring % 2 === 0 ? 1 : -1);
      const intensity = clamp01(bloom * (1 - ring / rings) * 1.1);

      for (let step = 0; step < count; step += 1) {
        const angle = spin + (step / count) * Math.PI * 2;
        painter.push(
          vanishX + Math.cos(angle) * ringRadius,
          vanishY + Math.sin(angle) * ringRadius * 0.62,
          glyphFor(this.charset, intensity),
          bucketFor(intensity, tension.lightIntensity),
        );
      }
    }
  }

  exit(): void {
    // Nothing retained.
  }

  resize(view: AsciiViewport): void {
    this.width = view.width;
    this.height = view.height;
  }

  dispose(): void {
    // All state is in typed arrays owned by this instance.
  }
}
