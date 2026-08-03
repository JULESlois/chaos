/**
 * A mask is nothing but a signed distance function in a [-0.5, 0.5] square.
 *
 * Keeping the contract this small is what allows the FORM screen to treat all
 * three shapes identically: it never asks what a mask is, only how far a given
 * point is from the inside of it.
 */
export interface MaskShape {
  readonly id: string;
  /** Negative inside, positive outside, in mask-local units. */
  distance(x: number, y: number): number;
}
