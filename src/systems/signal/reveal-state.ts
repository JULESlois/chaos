/**
 * Where the television's screen is, on the page, right now.
 *
 * The reveal is a single move — the camera backs out of the picture until the
 * object holding it is visible — and it is performed by two renderers in turn:
 * the 2D field, which is what the reader has been watching all along, and the
 * WebGL set, which is where they end up. If those two disagree about the size
 * or position of the picture by even a few pixels at the moment they trade
 * places, the handoff reads as a cut and the conceit collapses.
 *
 * They trade places before the camera moves. While the camera is still inside
 * the picture the screen plane spans the viewport exactly, so the WebGL frame
 * and the 2D frame beneath it are the same image at the same size; the fade
 * between them has nothing to give away. The field never scales, never
 * converges onto a rectangle, and never stops — it is the signal, and the
 * television is now the thing showing it.
 *
 * `progress` is the camera's own progress, not the reader's scroll: it stays
 * at 0 through the crossfade and only then begins. Everything that has to look
 * like a consequence of the camera moving — the CRT curvature leaking in, the
 * buttons becoming live — reads this rather than the scroll.
 *
 * The rectangle is published for anyone who needs to know where the picture
 * landed. Nothing has to consume it for the reveal to work, which is the
 * point: it is a measurement of the invariant, available to assert against.
 *
 * `handoff` is the crossfade: 0 = the reader is seeing the 2D field, 1 = the
 * WebGL set is carrying the picture.
 */
export interface RevealState {
  /** True once a camera is publishing. False on the DOM fallback path. */
  active: boolean;
  /** 0 = inside the signal, 1 = settled in the room. */
  progress: number;
  targetProgress: number;
  smoothedProgress: number;
  pathProgress: number;
  canvasOpacity: number;
  /** Projected screen rect, in CSS pixels, relative to the viewport. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Projected cabinet bounds in CSS pixels. */
  cabinetX: number;
  cabinetY: number;
  cabinetWidth: number;
  cabinetHeight: number;
  /** 0 = the 2D field is visible, 1 = the WebGL set is. */
  handoff: number;
}

/** Single mutable record. Written by the camera, read by the field. */
export const revealState: RevealState = {
  active: false,
  progress: 0,
  targetProgress: 0,
  smoothedProgress: 0,
  pathProgress: 0,
  canvasOpacity: 0,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  cabinetX: 0,
  cabinetY: 0,
  cabinetWidth: 0,
  cabinetHeight: 0,
  handoff: 0,
};

/**
 * How much of the television's own optics — barrel curvature, scanlines,
 * vignette — the picture is currently wearing.
 *
 * Two things draw them and they must never both be at full strength: the
 * silence screen fakes them in 2D so the frame arrives before the object it
 * belongs to, and the CRT shader draws them for real once the set exists. This
 * is the one curve they share, so the fake fades out on exactly the schedule
 * the real one fades in and no frame is ever scanlined twice.
 *
 * Zero when no camera is publishing, which is the DOM-television fallback:
 * there the 2D leak is the only glass there is, and it stays.
 */
export function glassStrength(): number {
  if (!revealState.active) return 0;
  const t = Math.min(1, Math.max(0, (revealState.progress - 0.02) / 0.53));
  return t * t * (3 - 2 * t);
}

export function resetRevealState(): void {
  revealState.active = false;
  revealState.progress = 0;
  revealState.targetProgress = 0;
  revealState.smoothedProgress = 0;
  revealState.pathProgress = 0;
  revealState.canvasOpacity = 0;
  revealState.x = 0;
  revealState.y = 0;
  revealState.width = 0;
  revealState.height = 0;
  revealState.cabinetX = 0;
  revealState.cabinetY = 0;
  revealState.cabinetWidth = 0;
  revealState.cabinetHeight = 0;
  revealState.handoff = 0;
}
