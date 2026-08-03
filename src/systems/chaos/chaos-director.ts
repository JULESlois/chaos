import { clamp01 } from '@/utils/math';
import { signalBus } from '@/utils/signal-bus';
import { DEFAULT_BUDGET } from './chaos-events';
import { chaosReducer, createInitialChaosState } from './chaos-reducer';
import type { ChaosEventId, ChaosState, EntropyInputs } from './types';

/**
 * Owns the chaos state outside React.
 *
 * Telemetry arrives at pointer/scroll frequency and the state ticks on an
 * interval — neither may cause a React render, so subscribers are notified
 * explicitly and the React layer throttles what it consumes.
 */
export class ChaosDirector {
  private state: ChaosState;
  private listeners = new Set<(state: ChaosState) => void>();

  private pointerVelocity = 0;
  private scrollVelocity = 0;
  private routeDepth = 0;
  private anomalyBoost = 0;
  private lastInputAt = 0;

  private rafId: number | null = null;
  private lastTick = 0;
  private running = false;
  private now: () => number;

  /** Tick at 10Hz — the director does not need frame precision. */
  private static readonly TICK_INTERVAL_MS = 100;
  private accumulator = 0;

  constructor(options: { stabilised?: boolean; now?: () => number } = {}) {
    this.now = options.now ?? (() => performance.now());
    this.state = createInitialChaosState(options.stabilised ?? false);
    this.lastInputAt = this.now();
  }

  getState(): ChaosState {
    return this.state;
  }

  subscribe(listener: (state: ChaosState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: ChaosState): void {
    if (next === this.state) return;

    const previous = this.state;
    this.state = next;

    // Publish newly started events on the bus.
    if (next.active !== previous.active) {
      for (const event of next.active) {
        const existed = previous.active.some(
          (candidate) =>
            candidate.id === event.id && candidate.startedAt === event.startedAt,
        );
        if (!existed) {
          signalBus.emit('chaos:event', {
            id: event.id,
            magnitude: event.magnitude,
          });
        }
      }
    }

    if (next.signalState !== previous.signalState) {
      signalBus.emit('chaos:state', {
        state: next.signalState,
        entropy: next.entropy,
      });
    }

    for (const listener of this.listeners) {
      listener(next);
    }
  }

  /** Normalised pointer speed, 0–1. Called from a passive pointer listener. */
  reportPointerVelocity(value: number): void {
    this.pointerVelocity = clamp01(value);
    this.lastInputAt = this.now();
  }

  /** Normalised scroll speed, 0–1. Called from a passive scroll listener. */
  reportScrollVelocity(value: number): void {
    this.scrollVelocity = clamp01(value);
    this.lastInputAt = this.now();
  }

  reportRouteDepth(depth: number): void {
    this.routeDepth = Math.max(0, depth);
  }

  /** Narrative triggers add a decaying boost to the entropy target. */
  boost(amount: number): void {
    this.anomalyBoost = clamp01(this.anomalyBoost + amount);
    this.setState(chaosReducer(this.state, { type: 'boost', amount }, this.options()));
  }

  forceEvent(id: ChaosEventId): boolean {
    if (this.state.stabilised) return false;
    const next = chaosReducer(
      this.state,
      { type: 'force-event', id, now: this.now() },
      this.options(),
    );
    if (next === this.state) return false;
    this.setState(next);
    return true;
  }

  setStabilised(enabled: boolean): void {
    this.setState(
      chaosReducer(
        this.state,
        { type: 'set-stabilised', enabled, now: this.now() },
        this.options(),
      ),
    );
    signalBus.emit('system:stabilise', { enabled });
  }

  private options() {
    return { budget: DEFAULT_BUDGET };
  }

  private currentInputs(now: number): EntropyInputs {
    return {
      pointerVelocity: this.pointerVelocity,
      scrollVelocity: this.scrollVelocity,
      routeDepth: this.routeDepth,
      idleDuration: (now - this.lastInputAt) / 1000,
      anomalyBoost: this.anomalyBoost,
    };
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = this.now();
    const deltaMs = Math.min(250, now - this.lastTick);
    this.lastTick = now;
    this.accumulator += deltaMs;

    if (this.accumulator >= ChaosDirector.TICK_INTERVAL_MS) {
      const delta = this.accumulator / 1000;
      this.accumulator = 0;

      // Telemetry decays so a single fast gesture does not hold entropy high.
      this.pointerVelocity *= Math.exp(-3.2 * delta);
      this.scrollVelocity *= Math.exp(-2.4 * delta);
      this.anomalyBoost *= Math.exp(-0.35 * delta);
      if (this.pointerVelocity < 0.001) this.pointerVelocity = 0;
      if (this.scrollVelocity < 0.001) this.scrollVelocity = 0;
      if (this.anomalyBoost < 0.001) this.anomalyBoost = 0;

      this.setState(
        chaosReducer(
          this.state,
          { type: 'tick', now, delta, inputs: this.currentInputs(now) },
          this.options(),
        ),
      );
    } else if (this.state.active.length > 0) {
      this.setState(
        chaosReducer(this.state, { type: 'clear-expired', now }, this.options()),
      );
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  start(): void {
    if (this.running || typeof requestAnimationFrame === 'undefined') return;
    this.running = true;
    this.lastTick = this.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }
}
