import { CHARSETS } from '../charset';
import { FlowRenderer } from '../flow/flow-renderer';
import type { AsciiRuntime, AsciiScene } from '../types';

/**
 * Screen two — CURRENT, reimagined as a living field of code rain.
 *
 * The previous Ribbon poster is demoted to a faint diagonal accent: a thin
 * band of large, slow characters drifting along one Bézier curve, never dense
 * enough to compete with the rain. The rain is the subject — a continuous,
 * uneven downpour of directional marks that establishes the vocabulary the
 * later screens will bend into faces, figures and hands.
 *
 * The rain itself belongs to the engine (`CURRENT_PRESET` says what this
 * screen wants of it). All that is left here is the ribbon, drawn on top.
 */
export class CurrentScene implements AsciiScene {
  readonly id = 'current';
  readonly charset = CHARSETS.current;

  private readonly ribbon: FlowRenderer;

  constructor() {
    this.ribbon = new FlowRenderer(this.charset);
  }

  enter(): void {
    // The shared field is already running.
  }

  update(): void {
    // Rain parameters live in CURRENT_PRESET.
  }

  render(_runtime: AsciiRuntime): void {
    // Faint ribbon accent removed.
    // The engine's rain field handles the full visualization.
  }

  exit(): void {
    // Nothing retained; the field is not this screen's to leave behind.
  }

  resize(): void {
    // The engine resizes the shared field; the ribbon reads the viewport per
    // frame and holds nothing sized.
  }

  dispose(): void {
    this.ribbon.dispose();
  }
}
