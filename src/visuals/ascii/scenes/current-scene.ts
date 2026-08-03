import { CHARSETS } from '../charset';
import { FlowRenderer, defaultLayerIntensity, type FlowRenderConfig } from '../flow/flow-renderer';
import type { AsciiRuntime, AsciiScene, AsciiViewport } from '../types';

/**
 * Screen two — CURRENT.
 *
 * The old implementation advected a free particle population through a noise
 * field behind a faint grid: it read as a particle-system demo, not a picture.
 * This screen is now a composition. A handful of hand-placed Bézier ribbons
 * decide where every glyph goes; the characters are placed along those curves,
 * rotated to the tangent, stretched by their speed, and layered by depth. The
 * result is a still poster — a diagonal band, an off-centre focus, a lot of
 * deliberate black — that only breathes once the reader is looking.
 */
export class CurrentScene implements AsciiScene {
  readonly id = 'current';
  readonly charset = CHARSETS.current;

  /** Fixed seed so the authored composition is the same every visit. */
  private static readonly SEED = 1204;

  private readonly flow: FlowRenderer;

  constructor() {
    this.flow = new FlowRenderer(this.charset);
  }

  enter(runtime: AsciiRuntime): void {
    this.flow.resize(runtime.view);
  }

  update(): void {
    // The flow is fully derived from the frame config in render(); there is no
    // state to integrate here.
  }

  render(runtime: AsciiRuntime): void {
    const view = runtime.view;
    const reduced = runtime.reducedMotion;

    const config: FlowRenderConfig = {
      width: view.width,
      height: view.height,
      dpr: view.dpr,
      // Reduced motion freezes the poster at a stable, legible moment.
      time: reduced ? 6 : runtime.time,
      progress: runtime.experience.localProgress,
      seed: CurrentScene.SEED,
      quality: runtime.quality,
      pointer: {
        x: runtime.pointer.x,
        y: runtime.pointer.y,
        active: runtime.pointer.active && !reduced,
      },
      scrollVelocity: runtime.experience.scrollVelocity,
      density: 1,
      sizeScale: 1,
      layerIntensity: defaultLayerIntensity(),
      debug: false,
      delta: runtime.delta,
    };

    this.flow.render(runtime.ctx, view, config);
  }

  exit(): void {
    // The flow population is left in place so re-entering finds the band where
    // it was, not re-seeded from scratch.
  }

  resize(view: AsciiViewport): void {
    this.flow.resize(view);
  }

  dispose(): void {
    this.flow.dispose();
  }
}
