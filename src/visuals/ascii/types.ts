import type { ExperienceState } from '@/experience/experience-store';
import type { SceneId } from '@/experience/phases';
import type { EventEnvelopes } from '@/systems/tension/tension-events';
import type { VisualTension } from '@/systems/tension/tension';
import type { GlyphPainter } from './GlyphPainter';

/** 0 full, 1 reduced, 2 minimal. Derived from device capabilities. */
export type QualityTier = 0 | 1 | 2;

export interface AsciiViewport {
  /** CSS pixels. */
  width: number;
  height: number;
  /** Backing-store scale. Capped at 1.5, and at 1 on narrow viewports. */
  dpr: number;
  /** Nominal character cell, in CSS pixels. Free layers ignore the grid. */
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  /** Nominal grid dimensions. `cols * rows` is not the character budget. */
  cols: number;
  rows: number;
}

export interface PointerState {
  /** Normalised position, 0–1 across the viewport. */
  x: number;
  y: number;
  /** Normalised velocity, per second. */
  vx: number;
  vy: number;
  /** Damped speed, roughly 0–1 for ordinary movement. */
  speed: number;
  /** False until the reader moves a pointer, and on touch devices at rest. */
  active: boolean;
  /** Seconds since the pointer last moved. Masks reform once this is high. */
  idle: number;
}

/**
 * Everything a scene or layer is allowed to see.
 *
 * Handed to `update`/`render` as a single frozen-by-convention object that is
 * reused every frame. Layers must read from it and never retain it.
 */
export interface AsciiRuntime {
  readonly ctx: CanvasRenderingContext2D;
  readonly view: AsciiViewport;
  readonly pointer: Readonly<PointerState>;
  readonly experience: Readonly<ExperienceState>;
  readonly tension: Readonly<VisualTension>;
  readonly events: Readonly<EventEnvelopes>;
  /** True when the reader asked the OS to minimise motion. */
  readonly reducedMotion: boolean;
  readonly painter: GlyphPainter;
  /** Seconds since the engine started. Monotonic, pauses with the page. */
  readonly time: number;
  /** Seconds since the previous frame, clamped. */
  readonly delta: number;
  /** Characters this scene may draw this frame. Already density-scaled. */
  readonly budget: number;
  readonly quality: QualityTier;
}

export interface AsciiLayer {
  readonly id: string;
  resize(view: AsciiViewport): void;
  dispose(): void;
}

/** A layer that contributes glyphs to the painter. */
export interface DrawLayer extends AsciiLayer {
  draw(runtime: AsciiRuntime): void;
}

/** A layer that wraps the frame — feedback and ghosting work this way. */
export interface FrameLayer extends AsciiLayer {
  /** Runs before any glyph is drawn. */
  before(runtime: AsciiRuntime): void;
  /** Runs after the painter has flushed. */
  after(runtime: AsciiRuntime): void;
}

/**
 * One of the five screens the stage can be showing.
 *
 * Scenes own their simulation state and their character budget. They are
 * constructed once and reused: `enter` and `exit` mark the boundaries, and a
 * scene must be able to survive being entered again later.
 */
export interface AsciiScene {
  readonly id: SceneId;
  /** Restricted alphabet, as indices into the global glyph table. */
  readonly charset: Uint8Array;
  enter(runtime: AsciiRuntime, from: SceneId | null): void;
  update(runtime: AsciiRuntime): void;
  render(runtime: AsciiRuntime): void;
  exit(runtime: AsciiRuntime, to: SceneId | null): void;
  resize(view: AsciiViewport): void;
  dispose(): void;
}
