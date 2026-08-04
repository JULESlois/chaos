import { CHARSETS } from '../charset';
import type { AsciiScene } from '../types';

/**
 * Screen four — CHAOS.
 *
 * Nothing new is added to the field. What breaks is the agreement between the
 * rain and the thing the rain was drawing: columns start reading from earlier
 * frames, phases jump, the mask slides sideways while the characters stay put,
 * regions freeze mid-fall, patches run upward against the field, and the same
 * shoulder appears twice a few columns apart. Louder is not the escalation —
 * *out of sync* is. Past ~0.87 the tension controller collapses every channel,
 * the rain slows to a stop, and the screen hands its own silence to SILENCE.
 *
 * The escalation curve lives in `CHAOS_PRESET`. This screen draws nothing of
 * its own; it exists to name the phase and carry its charset.
 */
export class ChaosScene implements AsciiScene {
  readonly id = 'chaos';
  readonly charset = CHARSETS.chaos;

  enter(): void {
    // Re-entering CHAOS must not restart the break, so nothing is primed.
  }

  update(): void {
    // Parameters only, and they live in CHAOS_PRESET.
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
