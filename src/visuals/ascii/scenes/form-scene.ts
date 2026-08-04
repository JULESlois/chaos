import { CHARSETS } from '../charset';
import type { AsciiScene } from '../types';

/**
 * Screen three — FORM.
 *
 * The code rain keeps falling. What changes is only how it falls: through the
 * face mask it slows and brightens in the cheeks, goes dark in the eye socket;
 * through the figure mask the shoulders read as a band of slow, dense rain;
 * through the hand mask the fingers are edges of fast rain with void between
 * them. The three masks overlap in time, so the half-face is still dissolving
 * when the shoulders arrive and the fingers are already at the edge — forms
 * bleeding into one another, never a clean cut from one silhouette to the next.
 *
 * That schedule lives in `FORM_PRESET`, not here. This screen draws nothing of
 * its own: the rain belongs to the engine, and FORM is a set of parameters
 * handed to it. The class remains because the phase still needs an identity, a
 * charset and enter/exit boundaries.
 */
export class FormScene implements AsciiScene {
  readonly id = 'form';
  readonly charset = CHARSETS.form;

  enter(): void {
    // The field is already running and must not be touched on entry.
  }

  update(): void {
    // Parameters only, and they live in FORM_PRESET.
  }

  render(): void {
    // No overlay. The engine has already drawn the rain.
  }

  exit(): void {
    // Nothing retained.
  }

  resize(): void {
    // The engine resizes the shared field.
  }

  dispose(): void {
    // Nothing owned.
  }
}
