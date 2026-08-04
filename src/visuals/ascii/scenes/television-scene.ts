import { CHARSETS } from '../charset';
import type { AsciiScene } from '../types';

/**
 * Screen six — TELEVISION.
 *
 * The camera pulls out of the glass here, and the field must survive the trip.
 * If the rain stopped, restarted, or reseeded at the moment of the reveal, the
 * whole point would be lost: the reader has to recognise that what is now
 * playing inside a small object in a room is the *same broadcast* they have
 * been standing inside for five screens.
 *
 * That is now structural rather than aspirational. There is one field for the
 * whole visit, owned by the engine, and this screen cannot restart it because
 * it does not have one — it contributes `TELEVISION_PRESET` and nothing else.
 */
export class TelevisionScene implements AsciiScene {
  readonly id = 'television';
  readonly charset = CHARSETS.silence;

  enter(): void {
    // The signal resumes; it is not started.
  }

  update(): void {
    // Parameters only, and they live in TELEVISION_PRESET.
  }

  render(): void {
    // No overlay. The engine has already drawn the rain.
  }

  exit(): void {
    // Scrolling back into SILENCE finds the field where it was left.
  }

  resize(): void {
    // The engine resizes the shared field.
  }

  dispose(): void {
    // Nothing owned.
  }
}
