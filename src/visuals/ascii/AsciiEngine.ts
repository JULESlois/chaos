import type { ExperienceStore } from '@/experience/experience-store';
import { isStill } from '@/experience/experience-store';
import type { SceneId } from '@/experience/phases';
import type { TensionController } from '@/systems/tension/tension';
import { clamp, clamp01, damp, lerp } from '@/utils/math';
import { signalBus } from '@/utils/signal-bus';
import { GlyphPainter } from './GlyphPainter';
import { VOID } from './palette';
import { FeedbackLayer } from './layers/feedback-layer';
import { GhostLayer } from './layers/ghost-layer';
import { ChaosScene } from './scenes/chaos-scene';
import { CurrentScene } from './scenes/current-scene';
import { FormScene } from './scenes/form-scene';
import { SilenceScene } from './scenes/silence-scene';
import { VoidScene } from './scenes/void-scene';
import type {
  AsciiRuntime,
  AsciiScene,
  AsciiViewport,
  PointerState,
  QualityTier,
} from './types';

const CANVAS_FONT =
  "'IBM Plex Mono', 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

/** Character ceilings per quality tier. Mobile always lands on tier 2. */
const BUDGETS: Record<QualityTier, number> = { 0: 7000, 1: 4200, 2: 2200 };
const TARGET_FPS: Record<QualityTier, number> = { 0: 60, 1: 45, 2: 30 };

/** Seconds a scene crossfade takes. */
const TRANSITION_TIME = 0.55;
/** Frame budget above which the engine starts thinning the field. */
const SLOW_FRAME_MS = 26;

export interface AsciiEngineOptions {
  canvas: HTMLCanvasElement;
  store: ExperienceStore;
  tension: TensionController;
  quality: QualityTier;
  maxDpr: number;
  reducedMotion: boolean;
}

/**
 * The single animation loop for the whole page.
 *
 * Everything visual outside the television happens here: one canvas, one
 * `requestAnimationFrame`, one pass over the character budget. React mounts
 * this and then stays out of the way — no state is set per frame, so a scroll
 * from top to bottom of the document causes zero component renders.
 *
 * Responsibilities, in the order they run each frame:
 *   1. clamp the delta and advance the experience store
 *   2. integrate pointer velocity
 *   3. ask the tension controller for this frame's seven numbers
 *   4. let the feedback layer lay down the background
 *   5. update and render the active scene (or two, mid-transition)
 *   6. capture and replay the ghost
 *   7. flush the painter, applying any tear
 *   8. hand the finished frame back to the feedback buffer
 */
export class AsciiEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly store: ExperienceStore;
  private readonly tension: TensionController;
  private readonly painter: GlyphPainter;
  private readonly feedback = new FeedbackLayer();
  private readonly ghost: GhostLayer;
  private readonly scenes: Map<SceneId, AsciiScene>;
  private readonly maxDpr: number;
  private readonly reducedMotion: boolean;
  private readonly baseBudget: number;
  private readonly targetFps: number;

  private readonly view: AsciiViewport = {
    width: 1,
    height: 1,
    dpr: 1,
    cellWidth: 8,
    cellHeight: 15,
    fontSize: 13,
    cols: 1,
    rows: 1,
  };

  private readonly pointer: PointerState = {
    x: 0.5,
    y: 0.5,
    vx: 0,
    vy: 0,
    speed: 0,
    active: false,
    idle: 999,
  };

  private readonly runtime: AsciiRuntime;

  private frame = 0;
  private running = false;
  private disposed = false;
  private lastTimestamp = 0;
  private accumulator = 0;
  private elapsed = 0;
  private frameCost = 16;
  private qualityScale = 1;

  private activeScene: AsciiScene;
  private outgoingScene: AsciiScene | null = null;
  private transition = 1;

  private absorbRect: DOMRect | null = null;
  private absorbAmount = 0;

  private observer: ResizeObserver | null = null;
  private readonly teardown: Array<() => void> = [];

  constructor(options: AsciiEngineOptions) {
    const context = options.canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('[ascii] 2D canvas context is unavailable');
    }

    this.canvas = options.canvas;
    this.ctx = context;
    this.store = options.store;
    this.tension = options.tension;
    this.maxDpr = Math.min(options.maxDpr, 1.5);
    this.reducedMotion = options.reducedMotion;

    this.baseBudget = BUDGETS[options.quality];
    this.targetFps = options.reducedMotion ? 24 : TARGET_FPS[options.quality];
    this.painter = new GlyphPainter(this.baseBudget * 2);
    this.ghost = new GhostLayer(this.baseBudget);

    // Scene populations are sized off the budget, so a low tier device builds
    // smaller arrays rather than building large ones and under-using them.
    const populationScale = this.baseBudget / BUDGETS[0];
    this.scenes = new Map<SceneId, AsciiScene>([
      ['void', new VoidScene()],
      ['current', new CurrentScene()],
      ['form', new FormScene(Math.round(3600 * populationScale))],
      ['chaos', new ChaosScene(Math.round(3000 * populationScale))],
      ['silence', new SilenceScene()],
    ]);

    this.activeScene = this.scenes.get('void')!;

    this.runtime = {
      ctx: this.ctx,
      view: this.view,
      pointer: this.pointer,
      experience: this.store.current,
      tension: this.tension.current,
      events: this.tension.events,
      reducedMotion: this.reducedMotion,
      painter: this.painter,
      time: 0,
      delta: 0,
      budget: this.baseBudget,
      quality: options.quality,
    } as AsciiRuntime;

    this.installInput();
    this.installResize();
    this.installVisibility();
    this.installTelevisionBridge();
    this.measure();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Characters the current frame is allowed. Exposed for tests. */
  get currentBudget(): number {
    return this.runtime.budget;
  }

  /** Glyphs the painter had to discard last frame. Should always be zero. */
  get painterOverflow(): number {
    return this.painter.overflow;
  }

  get viewport(): Readonly<AsciiViewport> {
    return this.view;
  }

  get activeSceneId(): SceneId {
    return this.activeScene.id;
  }

  get isTransitioning(): boolean {
    return this.outgoingScene !== null;
  }

  /** True once the television has asked the field to converge onto it. */
  get absorbing(): boolean {
    return this.absorbAmount > 0.01 && this.absorbRect !== null;
  }

  /** The scene instance for a screen, so tests can watch its lifecycle. */
  sceneFor(id: SceneId): AsciiScene | undefined {
    return this.scenes.get(id);
  }

  /** Re-reads the canvas box. Normally driven by the ResizeObserver. */
  remeasure(): void {
    this.measure();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    for (const undo of this.teardown) undo();
    this.teardown.length = 0;

    this.observer?.disconnect();
    this.observer = null;

    for (const scene of this.scenes.values()) scene.dispose();
    this.scenes.clear();

    this.feedback.dispose();
    this.ghost.dispose();
    this.tension.reset();
  }

  // ── input ──────────────────────────────────────────────────────

  private installInput(): void {
    const onPointerMove = (event: PointerEvent): void => {
      const width = this.view.width || 1;
      const height = this.view.height || 1;
      const x = clamp01(event.clientX / width);
      const y = clamp01(event.clientY / height);

      // Velocity is derived here and damped in the frame loop, so a burst of
      // pointer events between two frames cannot spike the field.
      this.pointer.vx += (x - this.pointer.x) * 8;
      this.pointer.vy += (y - this.pointer.y) * 8;
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.active = true;
      this.pointer.idle = 0;
    };

    const onPointerLeave = (): void => {
      this.pointer.active = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });

    this.teardown.push(() => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
    });
  }

  private installResize(): void {
    if (typeof ResizeObserver === 'undefined') {
      const onResize = (): void => this.measure();
      window.addEventListener('resize', onResize, { passive: true });
      this.teardown.push(() => window.removeEventListener('resize', onResize));
      return;
    }

    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(this.canvas);
  }

  private installVisibility(): void {
    const onVisibility = (): void => {
      if (document.hidden) this.stop();
      else this.start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.teardown.push(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  /**
   * The television asks the field to converge onto its screen. Rather than
   * moving every character individually, the whole flush is transformed into
   * the target rectangle — the field is not travelling to the screen, it is
   * becoming the screen.
   */
  private installTelevisionBridge(): void {
    const offAbsorb = signalBus.on('tv:absorb', ({ rect }) => {
      this.absorbRect = rect;
    });
    const offRelease = signalBus.on('tv:release', () => {
      this.absorbRect = null;
    });
    this.teardown.push(offAbsorb, offRelease);
  }

  // ── layout ─────────────────────────────────────────────────────

  private measure(): void {
    if (this.disposed) return;

    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const narrow = width < 768;
    const dpr = Math.min(narrow ? 1 : this.maxDpr, window.devicePixelRatio || 1);

    // Larger cells on small screens: fewer characters, each still legible.
    const fontSize = narrow ? 15 : 13;
    const cellWidth = fontSize * 0.62;
    const cellHeight = fontSize * 1.16;

    const view = this.view;
    view.width = width;
    view.height = height;
    view.dpr = dpr;
    view.fontSize = fontSize;
    view.cellWidth = cellWidth;
    view.cellHeight = cellHeight;
    view.cols = Math.max(1, Math.floor(width / cellWidth));
    view.rows = Math.max(1, Math.floor(height / cellHeight));

    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;

    this.applyContextState();

    this.feedback.resize(view);
    this.ghost.resize(view);
    for (const scene of this.scenes.values()) scene.resize(view);
  }

  /** Re-applied after every resize; canvas resizing resets context state. */
  private applyContextState(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
    ctx.font = `${this.view.fontSize}px ${CANVAS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, this.view.width, this.view.height);
  }

  // ── frame ──────────────────────────────────────────────────────

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);

    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      return;
    }

    const rawDelta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Frame-rate cap. Accumulating the remainder rather than resetting it
    // keeps the effective rate at the target instead of quantising to a
    // divisor of the display refresh.
    const interval = 1000 / this.targetFps;
    this.accumulator += rawDelta;
    if (this.accumulator < interval) return;
    const delta = Math.min(this.accumulator, 100) / 1000;
    this.accumulator = Math.min(this.accumulator - interval, interval);

    const started = performance.now();
    this.render(delta);
    // Rolling average of the frame cost, used to thin the field on devices
    // that cannot keep up with their own tier.
    this.frameCost = lerp(this.frameCost, performance.now() - started, 0.1);
  };

  private render(delta: number): void {
    const store = this.store;
    store.update(delta);
    this.elapsed += delta;

    this.integratePointer(delta);

    const experience = store.current;
    const tension = this.tension.update(
      {
        sceneId: experience.sceneId,
        localProgress: experience.localProgress,
        scrollVelocity: experience.scrollVelocity,
        pointerSpeed: this.pointer.speed,
        still: isStill(experience) && this.pointer.idle > 0.6,
      },
      delta,
    );

    this.updateQualityScale(delta);
    this.routeScene(experience.sceneId);

    const runtime = this.runtime as {
      -readonly [K in keyof AsciiRuntime]: AsciiRuntime[K];
    };
    runtime.time = this.elapsed;
    runtime.delta = delta;

    // The television epilogue owns the screen; the field yields to it.
    const absorbTarget = this.absorbRect ? 1 : 0;
    this.absorbAmount = lerp(this.absorbAmount, absorbTarget, damp(3.2, delta));

    const fullBudget = Math.floor(
      this.baseBudget * this.qualityScale * clamp01(0.15 + tension.density),
    );

    this.feedback.before(this.runtime);
    this.painter.reset();

    if (this.outgoingScene && this.transition < 1) {
      runtime.budget = Math.floor(fullBudget * (1 - this.transition));
      this.outgoingScene.update(this.runtime);
      this.outgoingScene.render(this.runtime);

      runtime.budget = Math.floor(fullBudget * this.transition);
      this.activeScene.update(this.runtime);
      this.activeScene.render(this.runtime);

      this.transition = Math.min(1, this.transition + delta / TRANSITION_TIME);
      if (this.transition >= 1) {
        this.outgoingScene.exit(this.runtime, this.activeScene.id);
        this.outgoingScene = null;
      }
    } else {
      runtime.budget = fullBudget;
      this.activeScene.update(this.runtime);
      this.activeScene.render(this.runtime);
    }

    this.ghost.capture(this.painter);
    this.ghost.replay(this.runtime);

    this.flush(tension.tearAmount);
    this.feedback.after(this.runtime);
  }

  private flush(tear: number): void {
    const ctx = this.ctx;
    const absorbing = this.absorbAmount > 0.001 && this.absorbRect !== null;

    if (absorbing) {
      const rect = this.absorbRect!;
      const t = this.absorbAmount;
      const scaleX = lerp(1, rect.width / Math.max(1, this.view.width), t);
      const scaleY = lerp(1, rect.height / Math.max(1, this.view.height), t);
      ctx.save();
      ctx.translate(lerp(0, rect.left, t), lerp(0, rect.top, t));
      ctx.scale(scaleX, scaleY);
    }

    const tearHeight = tear > 0.02 ? this.view.height * (0.04 + tear * 0.1) : 0;
    this.painter.flush(ctx, {
      tearCentre: tearHeight > 0 ? this.tearCentre() : -1,
      tearHeight,
      tearShift: tearHeight > 0 ? this.view.width * 0.16 * tear : 0,
      allowHighlight: !this.reducedMotion,
    });

    if (absorbing) ctx.restore();
  }

  /**
   * Where the tear sits. Derived from elapsed time rather than a random draw
   * so that the band walks down the screen instead of jumping around it.
   */
  private tearCentre(): number {
    const cycle = (this.elapsed * 0.35) % 1;
    return cycle * this.view.height;
  }

  private integratePointer(delta: number): void {
    const pointer = this.pointer;
    const decay = damp(6, delta);
    pointer.vx = lerp(pointer.vx, 0, decay);
    pointer.vy = lerp(pointer.vy, 0, decay);
    pointer.speed = clamp(Math.hypot(pointer.vx, pointer.vy), 0, 2);
    pointer.idle += delta;
    if (pointer.idle > 3) pointer.active = false;
  }

  /**
   * Adaptive quality.
   *
   * If frames are consistently costing more than the budget allows, the
   * character count is scaled down until they are not. It recovers slowly, so
   * a single expensive frame does not start an oscillation between tiers.
   */
  private updateQualityScale(delta: number): void {
    const target = this.frameCost > SLOW_FRAME_MS ? 0.55 : 1;
    const speed = target < this.qualityScale ? 2.5 : 0.35;
    this.qualityScale = lerp(this.qualityScale, target, damp(speed, delta));
  }

  private routeScene(sceneId: SceneId): void {
    // The television screen has no ASCII scene of its own; the field simply
    // keeps rendering whatever silence left behind while it is absorbed.
    const next = this.scenes.get(sceneId) ?? this.scenes.get('silence')!;
    if (next === this.activeScene) return;

    // A change during an unfinished transition retires the old outgoing scene
    // immediately rather than stacking a third one.
    if (this.outgoingScene && this.outgoingScene !== next) {
      this.outgoingScene.exit(this.runtime, next.id);
    }

    this.outgoingScene = this.activeScene;
    this.activeScene = next;
    this.transition = 0;
    this.ghost.clear();
    next.enter(this.runtime, this.outgoingScene.id);
  }
}
